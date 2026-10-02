# Preparing monthly CSV inputs

`scripts/split_bank_exports.py` preserves supplied originals and splits recognized bank CSV layouts into calendar-month files inside a private batch. It is a file preparation utility, not the application's importer or ledger.

Use your own bank exports as input, and choose a start date and an exclusive end date for each batch. Browser export automation remains unverified after browser-control failures; manual exports are the current intake route.

Supported layouts are EQ's Transfer date/Description/Amount/Balance, PC's Description/Type/Card Holder Name/Date/Time/Amount, and Simplii's Date/Transaction Details/Funds Out/Funds In. CSV values and header whitespace are preserved. EQ dates use YYYY-MM-DD; PC and Simplii dates use MM/DD/YYYY. No timezone conversion is inferred from PC's unzoned time field. Export-date buckets need validation before claiming local-time monthly spending totals.

Example using synthetic filenames:

```powershell
python scripts/split_bank_exports.py private/inbox/example.csv --destination private/imports --start 2026-01-01 --end-exclusive 2026-09-01
python -m unittest discover -s tests -p test_split_bank_exports.py
```

A content-derived batch directory contains exact source bytes in originals/, nonempty per-account CSVs in monthly/YYYY-MM/, and manifest.json. The manifest maps output rows to source CSV records, reports excluded records, reconciles monetary columns, and stores hashes. CSV record numbering includes the header and is independent of physical lines inside quoted values. Output is UTF-8 with BOM and CRLF line endings.

Unknown schemas, invalid dates, malformed rows, duplicate input files, and changed batch contents cause errors. Equal-looking transactions within one source are retained. Same-input runs reuse a batch without appending. This does not resolve duplicate or overlapping transactions across distinct exports, establish complete bank coverage, or categorize financial purposes.

Tests exercise exact date cutoffs, literal timestamp preservation, quoted fields, duplicate-looking rows, unchanged source bytes, repeat-run behavior, invalid-date rejection, and Simplii's header whitespace. Real data, manifests, and reconciliation results stay outside version control under private/.
