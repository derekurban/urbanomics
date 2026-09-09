# Desktop imports

The first operational milestone is a local Electron application. React renders the import desk, account choices, transaction browser, and archive. Electron owns file access and SQLite. The renderer has no Node access and calls a narrow sandboxed preload bridge. Production web requests, new windows, and permission requests are denied. No financial data is sent to a service.

## Workflow

1. Drop files or a folder, or use the native picker. Only top-level CSVs are imported from a folder; subfolders and other formats are skipped. Limit: 250 files per batch, 20 MB per file, UTF-8.
2. Preserve each original byte-for-byte under its SHA-256 digest and create an app-owned intake copy. Malformed files remain visible with a reason; no partial rows are accepted from them.
3. Recognize the bank schema. Bind an unfamiliar export to a named account. Account names and rules are private. Remembered patterns remove a terminal `_initial` or `_YYYY-MM` (hyphens also supported); ambiguous rules ask again. Mastercard and deposit accounts share PC's schema and must be assigned separately.
4. Filter by the selected range of completed calendar months. Keep all excluded rows in the source archive. The initial default is January 2026 through the last completed month; a workspace can select just one month.
5. Resolve possible overlaps, then commit accepted transaction identities, source observations, import receipt, and full affected-month snapshots in one SQLite transaction.
6. Publish immutable snapshot files. Only after that succeeds, remove this job's app-owned intake copy and mark it complete. Downloads originals are untouched.

The range is deliberately fixed until changed, so opening the app next month does not silently expand imports. To backfill, extend the range and re-drop the original. Narrowing the range filters the monthly navigation; it does not erase previously accepted transactions or archives.

## Money, dates, and provenance

Money is stored as integer CAD cents. The three supported schemas have no currency column; CAD is an explicit adapter assumption for these Canadian domestic exports. Do not use these adapters for foreign-currency accounts. Imported signs are retained. Credit-card payments and transfers are cash movements pending classification; the app does not label them earned income or calculate spending totals.

EQ uses ISO calendar dates, signed amounts and balances. PC uses US month/day/year dates, twelve-hour times, types and cardholder names. Simplii uses month/day/year dates and separate funds-out/funds-in columns. Strict validation rejects impossible dates, invalid amounts, both populated Simplii movement columns, and malformed CSVs. Source records count CSV records including the header (quoted multiline fields remain one record); internal blank records are rejected.

Month assignment uses the calendar date written by the bank. No timezone correction is inferred. PC's exported date/time may differ from the local banking screen, so month coverage at boundaries still needs comparison with statements. Presence of activity does not prove complete account or month coverage.

Every accepted transaction has a persistent random ID. Source observations link its account, original file hash, and CSV record. The source inspector retains original cells alongside normalized values.

## Deduplication rules

- Same source hash + account + source record: match the previous transaction automatically.
- Same account, scope, and full export content after normalized row reordering: match automatically, preserving the count of identical rows. This treats a byte-identical or reordered-equivalent export assigned to the same account as a repeat.
- Different overlapping files: exact normalized row fingerprints identify candidates, not proof. The user chooses existing transactions or additional payments. A match pairs at most the smaller number of incoming and existing copies; any excess incoming copies are added.
- Different accounts never share transaction identities. A known original file routes to its previous account; do not reuse an account's established filename pattern for a different account.
- Previously accepted rows are never removed by a partial export. Existing snapshots and transaction IDs survive later imports.

Fingerprints include exported date, time, description, type, holder, signed amount, balance where available, and currency. Changed descriptions, dates or balances are not fuzzy-matched in this milestone. Correcting an account assignment after acceptance, merging transactions, mixed match/add counts within a single identical-row candidate, and transfer pairing need a future review workflow. Match decisions and receipts remain local.

## Storage and recovery

```text
private workspace/
  urbanomics.sqlite          # settings, accounts, rules, jobs, ledger, provenance, snapshots
  inbox/<job-id>.csv         # unresolved or not-yet-published intake copies
  archive/sources/<sha>.csv  # exact immutable original files
  archive/snapshots/YYYY-MM/rNNNN-<id>.json
  archive/snapshots/YYYY-MM/rNNNN-<id>.csv
  electron/                 # Chromium workspace cache
  logs/
```

Development defaults to the repository's ignored `private/desktop/`. Packaged builds default to `%APPDATA%/Urbanomics/private/`; an explicit `URBANOMICS_DATA_DIR` overrides either. Packaging includes only application code, built renderer assets, and production dependencies. Private files and validation screenshots are excluded. Local storage is plaintext; rely on the computer's own account and disk protections.

SQLite uses WAL and FULL synchronous commits. Snapshot content is committed with the ledger, then exported via temporary files and atomic rename. Existing archive content must compare byte-for-byte before it is reused. Changed month revisions are never overwritten. An exact repeat creates a receipt without another revision. New source links are retained in the database; an old snapshot's provenance remains as captured at that revision.

If snapshot publication fails after the database commit, the job stays `finalizing` and its intake copy remains. Startup or Retry republishes from the committed database without inserting transactions again. An integrity mismatch is surfaced and never silently overwritten. Recovery does not claim to repair damaged storage. For a complete manual backup, close the app and copy the whole private workspace; snapshot CSVs alone are not a restorable backup of account rules and provenance. Automated backup/restore is not implemented.

## Verification

`npm test` covers all adapters, exact cents, malformed files, repeat and reordered exports, duplicate multiplicity, partial overlaps, explicit extra payments, separate accounts, ambiguous routing, date range/backfill, preserved originals, immutable revisions, database rollback, interrupted publication and restart recovery, and folder filtering.

`npm run test:desktop` launches the real Electron application with isolated synthetic data. It exercises UI account creation, native picker response, the drop handler with browser-native File objects, month search, source inspection, repeat imports, network/Node isolation, and close/reopen persistence. The OS picker response is stubbed; this does not automate the OS-level drag gesture itself. Screenshots and test workspaces remain ignored under `private/validation/`.

The next milestone carries the accepted tag/category/group workflow into this durable transaction model, followed by transfer and repayment review. No synthetic categorization or repayment decisions are applied to real imports.
