"""Prepare monthly bank CSV inputs without changing source values or dropping duplicates.

This is file preparation, not ledger ingestion or transaction identity matching.
Only explicit, recognized schemas are accepted. Dates retain the bank's calendar
representation; timezone conversion is intentionally not inferred.
"""
import argparse
import csv
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load_export(path):
    raw = path.read_bytes()
    text = raw.decode('utf-8-sig')
    table = list(csv.reader(io.StringIO(text, newline=''), strict=True))
    if not table:
        raise ValueError(f'{path.name}: empty file')
    header = table[0]
    names = [name.strip() for name in header]
    if names == ['Transfer date', 'Description', 'Amount', 'Balance']:
        kind, date_index, date_format, money_indices = 'eq', 0, '%Y-%m-%d', [2, 3]
    elif names == ['Description', 'Type', 'Card Holder Name', 'Date', 'Time', 'Amount']:
        kind, date_index, date_format, money_indices = 'pc', 3, '%m/%d/%Y', [5]
    elif names == ['Date', 'Transaction Details', 'Funds Out', 'Funds In']:
        kind, date_index, date_format, money_indices = 'simplii', 0, '%m/%d/%Y', [2, 3]
    else:
        raise ValueError(f'{path.name}: unsupported column layout')
    records = []
    for number, row in enumerate(table[1:], 2):
        if len(row) != len(header):
            raise ValueError(f'{path.name}: CSV record {number} has wrong column count')
        value = row[date_index].strip()
        expected = r'\d{4}-\d{2}-\d{2}' if kind == 'eq' else r'\d{2}/\d{2}/\d{4}'
        if not re.fullmatch(expected, value):
            raise ValueError(f'{path.name}: invalid date at CSV record {number}')
        parsed = datetime.strptime(value, date_format).date()
        # Validate monetary data for reconciliation; do not rewrite its strings.
        for index in money_indices:
            money(row[index])
        records.append((number, parsed, row))
    return dict(path=path, raw=raw, sha256=digest(raw), header=header,
                kind=kind, date_index=date_index, money_indices=money_indices,
                records=records)


def money(value):
    value = value.strip().replace('$', '').replace(',', '')
    amount = Decimal(value or '0')
    if not amount.is_finite() or amount != amount.quantize(Decimal('0.01')):
        raise ValueError('Invalid or sub-cent monetary value')
    return amount


def csv_bytes(header, rows):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\r\n')
    writer.writerow(header)
    writer.writerows(rows)
    return stream.getvalue().encode('utf-8-sig')


def write_once(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f'Refusing to overwrite different contents: {path}')
        return
    with path.open('xb') as stream:
        stream.write(data)


def prepare(paths, destination, start, end):
    if start >= end:
        raise ValueError('Start must precede the exclusive end date')
    exports = [load_export(Path(path)) for path in paths]
    if not exports or len({e['path'].name.lower() for e in exports}) != len(exports):
        raise ValueError('Provide exports with distinct filenames')
    if len({e['sha256'] for e in exports}) != len(exports):
        raise ValueError('Identical source files supplied twice; resolve before preparing')
    identity = {'start': start.isoformat(), 'end_exclusive': end.isoformat(),
                'sources': sorted((e['path'].name, e['sha256']) for e in exports),
                'version': 1}
    batch_id = digest(json.dumps(identity, sort_keys=True).encode())[:16]
    root = Path(destination) / batch_id
    manifest = {**identity, 'batch_id': batch_id, 'date_basis': 'Exported calendar date; no timezone conversion',
                'coverage': 'Rows present in supplied files only; missing activity is not proof of inactivity',
                'sources': [], 'monthly_files': [], 'retained_rows': 0, 'excluded_rows': 0}
    planned = {}
    for export in exports:
        name = export['path'].name
        records = export['records']
        included = [r for r in records if start <= r[1] < end]
        excluded = [r for r in records if not start <= r[1] < end]
        assert len(included) + len(excluded) == len(records)
        planned[f'originals/{name}'] = export['raw']
        groups = defaultdict(list)
        for record in included:
            groups[record[1].strftime('%Y-%m')].append(record)
        for month, group in sorted(groups.items()):
            relative = f'monthly/{month}/{name.removesuffix("_initial.csv")}_{month}.csv'
            rows = [r[2] for r in group]
            data = csv_bytes(export['header'], rows)
            roundtrip = list(csv.reader(io.StringIO(data.decode('utf-8-sig'), newline='')))
            assert roundtrip == [export['header']] + rows
            planned[relative] = data
            manifest['monthly_files'].append({'path': relative, 'source_file': name,
                'source_sha256': export['sha256'], 'sha256': digest(data), 'month': month,
                'rows': len(group), 'source_csv_record_numbers': [r[0] for r in group],
                'first_date': min(r[1] for r in group).isoformat(),
                'last_date': max(r[1] for r in group).isoformat()})
        controls = {}
        for index in export['money_indices']:
            original = sum((money(r[2][index]) for r in records), Decimal(0))
            retained = sum((money(r[2][index]) for r in included), Decimal(0))
            removed = sum((money(r[2][index]) for r in excluded), Decimal(0))
            assert original == retained + removed
            controls[export['header'][index].strip()] = {
                'source_column_sum': str(original), 'retained_column_sum': str(retained),
                'excluded_column_sum': str(removed)}
        manifest['sources'].append({'file': name, 'sha256': export['sha256'],
            'schema': export['kind'], 'date_column': export['header'][export['date_index']],
            'rows': len(records), 'retained': len(included), 'excluded': len(excluded),
            'months': dict(sorted(Counter(r[1].strftime('%Y-%m') for r in records).items())),
            'exact_duplicate_rows_preserved': len(records)-len(set(tuple(r[2]) for r in records)),
            'excluded_csv_record_numbers': [r[0] for r in excluded],
            'column_reconciliation_not_spending_totals': controls})
        manifest['retained_rows'] += len(included)
        manifest['excluded_rows'] += len(excluded)
    # Check every target before writing. Repeating the same batch is a no-op.
    planned['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    for relative, data in planned.items():
        target = root / relative
        if target.exists() and target.read_bytes() != data:
            raise ValueError(f'Existing batch has changed: {target}')
    for relative, data in planned.items():
        write_once(root / relative, data)
    for relative, data in planned.items():
        assert (root / relative).read_bytes() == data
    for export in exports:
        assert export['path'].read_bytes() == export['raw'], 'Source changed during preparation'
    return root, manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--start', type=date.fromisoformat, required=True)
    parser.add_argument('--end-exclusive', type=date.fromisoformat, required=True)
    args = parser.parse_args()
    root, manifest = prepare(args.files, args.destination, args.start, args.end_exclusive)
    print(json.dumps({'batch': str(root), 'retained': manifest['retained_rows'],
        'excluded': manifest['excluded_rows'], 'monthly_files': len(manifest['monthly_files'])}))
