import importlib.util
import tempfile
import unittest
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location('split', Path(__file__).parents[1] / 'scripts/split_bank_exports.py')
split = importlib.util.module_from_spec(spec)
spec.loader.exec_module(split)


class MonthlyPreparationTests(unittest.TestCase):
    def test_boundaries_duplicates_and_repeat_run(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'synthetic.csv'
            header = ['Transfer date', 'Description', 'Amount', 'Balance']
            rows = [['2025-12-31', 'Before', '$1.00', '$1.00'],
                    ['2026-01-01', 'A, quoted merchant', '-$2.01', '$3.00'],
                    ['2026-08-31', 'Identical legitimate payment', '$4.50', '$7.50'],
                    ['2026-08-31', 'Identical legitimate payment', '$4.50', '$7.50'],
                    ['2026-09-01', 'Excluded', '-$1.00', '$6.50']]
            original = split.csv_bytes(header, rows)
            source.write_bytes(original)
            args = ([source], root / 'private', date(2026, 1, 1), date(2026, 9, 1))
            batch, manifest = split.prepare(*args)
            self.assertEqual((manifest['retained_rows'], manifest['excluded_rows']), (3, 2))
            self.assertEqual(manifest['sources'][0]['exact_duplicate_rows_preserved'], 1)
            self.assertEqual([x['rows'] for x in manifest['monthly_files']], [1, 2])
            before = {p.relative_to(batch): p.read_bytes() for p in batch.rglob('*') if p.is_file()}
            self.assertEqual(split.prepare(*args)[0], batch)
            self.assertEqual(before, {p.relative_to(batch): p.read_bytes() for p in batch.rglob('*') if p.is_file()})
            self.assertEqual(source.read_bytes(), original)

    def test_invalid_date_fails_without_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'synthetic.csv'
            source.write_text('Transfer date,Description,Amount,Balance\n2026-02-30,Invalid,$1,$1\n')
            with self.assertRaises(ValueError):
                split.prepare([source], root / 'private', date(2026, 1, 1), date(2026, 9, 1))
            self.assertFalse((root / 'private').exists())

    def test_pc_export_dates_and_simplii_whitespace_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pc = root / 'pc.csv'
            pc.write_text('Description,Type,Card Holder Name,Date,Time,Amount\nExample,PURCHASE,TEST,09/01/2026,12:05 AM,-12.34\n')
            bank = root / 'bank.csv'
            bank.write_text('Date, Transaction Details, Funds Out, Funds In \n08/31/2026, EXAMPLE,,15.00\n')
            batch, manifest = split.prepare([pc, bank], root / 'private', date(2026, 1, 1), date(2026, 9, 1))
            self.assertEqual((manifest['retained_rows'], manifest['excluded_rows']), (1, 1))
            self.assertEqual(len(manifest['monthly_files']), 1)
            prepared = split.load_export(batch / manifest['monthly_files'][0]['path'])
            self.assertEqual(prepared['header'], ['Date', ' Transaction Details', ' Funds Out', ' Funds In '])
            self.assertEqual(prepared['records'][0][2][1], ' EXAMPLE')


if __name__ == '__main__':
    unittest.main()
