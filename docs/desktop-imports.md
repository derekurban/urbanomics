# Desktop imports

The application has a single Snapshots page with a rolling 12-month calendar, Dropbox queue, processing feedback and latest-run results. Upload history and archive inspection open in native HTML dialogs, with keyboard focus containment and Escape dismissal. Accounts have editable names, colors and filename-prefix regex rules. React renders this alongside the transaction browser. Electron owns file access and SQLite. The renderer has no Node access and calls a narrow sandboxed preload bridge. Production web requests, new windows, and permission requests are denied. No financial data is sent to a service.

## Workflow

1. Drop files or a folder, or use the native picker. Only top-level CSVs are imported from a folder; subfolders and other formats are skipped. Limit: 250 files per batch, 20 MB per file, UTF-8.
2. Copy selected files into the private `dropbox/` directory with readable filenames, preserving collisions with numbered suffixes. Preserve each original byte-for-byte under its SHA-256 digest and create an internal job intake copy. Recognized files with a resolved account process automatically after upload. Malformed files remain visible with a reason; no partial rows are accepted from them.
3. Recognize the bank schema. Bind an unfamiliar export to a named account. Optional account prefix regexes match the beginning of filenames, case-insensitively, using RE2 via `re2-wasm` to avoid pathological backtracking. Maximum 256 characters; no slash delimiters, lookarounds or backreferences. The filename tester uses the same engine. Legacy remembered patterns still remove a terminal `_initial` or `_YYYY-MM` (hyphens also supported). Union matching account IDs across both rule types; ambiguity asks again. Known source hashes retain their previously accepted account. Saving account settings rechecks unassigned files but leaves already assigned files and ledger records intact. Mastercard and deposit accounts share PC's schema and must be assigned separately.
4. Use the date on every valid CSV row to select its month. No month picker or advanced range is required; current-month rows are included too. Legacy range settings are retained privately but ignored for new imports.
5. Process recognized, routed files automatically. Account assignment also starts that file’s import. Match exact duplicate rows one-for-one, then commit transaction identities, source observations, import receipt and affected-month snapshots in one SQLite transaction. Unrelated staged files are left pending. Ambiguous accounts and malformed exports remain in Dropbox for attention.
6. Publish immutable snapshot files. Only after that succeeds, remove this job's internal intake and Dropbox copies and mark it complete. Downloads originals are untouched. Cleanup checks the current Dropbox bytes against the staged hash so a file edited after staging is retained.

Open folder, Open archive, Open month folder, Show original and Show file act on real local paths. Files manually added to Dropbox are discovered on startup, app focus, Refresh and Process; they remain staged until Process, which is also the fallback for interrupted or previously queued uploads. Refresh also retries archive publication. Clear intake copies requires an inline confirmation, archives newly discovered supported CSVs before dismissing jobs, and refuses to clear a file whose archived original is missing or damaged. It preserves finalizing jobs, saved snapshots, non-CSV files, subfolders, oversized files and Downloads originals. Completed, failed and dismissed uploads remain visible in history; the original-file list counts unique source hashes rather than receipts.

Processing yields between files and sends actual file-count progress over IPC. Other mutations wait until processing finishes. The animation respects reduced-motion preferences. A completed batch saves its timestamp, per-file statuses, completed count, added/matched/excluded rows, changed months and remaining queue count in private settings. Counts include only completed files; pending archive publication remains visible in the queue. This is a historical latest-run summary, not the current queue count. An interrupted run can recover each committed job; the batch summary itself is written only when the run finishes. New receipts record transaction-date routing; older import scopes and excluded counts remain historical evidence.

Re-uploading an older original fills rows previously excluded by a month filter, while matching already accepted rows back to their original identities. Opening the app does not automatically backfill archived files. Monthly navigation retains all imported months, and the 12-month calendar ends at the later of the latest imported month and last completed month.

## Money, dates, and provenance

Money is stored as integer CAD cents. The three supported schemas have no currency column; CAD is an explicit adapter assumption for these Canadian domestic exports. Do not use these adapters for foreign-currency accounts. Imported signs are retained. Credit-card payments and transfers are cash movements pending classification; the app does not label them earned income or calculate spending totals.

EQ uses ISO calendar dates, signed amounts and balances. PC uses US month/day/year dates, twelve-hour times, types and cardholder names. Simplii uses month/day/year dates and separate funds-out/funds-in columns. Strict validation rejects impossible dates, invalid amounts, both populated Simplii movement columns, and malformed CSVs. Source records count CSV records including the header (quoted multiline fields remain one record); internal blank records are rejected.

Month assignment uses the calendar date written by the bank. No timezone correction is inferred. PC's exported date/time may differ from the local banking screen, so month coverage at boundaries still needs comparison with statements. Presence of activity does not prove complete account or month coverage.

Every accepted transaction has a persistent random ID. Source observations link its account, original file hash, and CSV record. The source inspector retains original cells alongside normalized values.

## Deduplication rules

- Same source hash + account + source record: match the previous transaction automatically.
- Same-account exact normalized fingerprints in reordered or overlapping exports match automatically. Reserve transactions already matched through source provenance, then pair at most the smaller number of remaining incoming and existing copies; excess incoming copies are added. Multiple identical rows within a file retain their multiplicity.
- Exact fields cannot distinguish unrelated payments with identical details across different exports. For that exception, files staged through Dropbox/Refresh offer Review matches and an explicit keep-as-additional override before processing. The automatic default treats exact overlaps as repeat observations.
- Different accounts never share transaction identities. A known original file routes to its previous account; do not reuse an account's established filename pattern for a different account.
- Previously accepted rows are never removed by a partial export. Existing snapshots and transaction IDs survive later imports.

Fingerprints include exported date, time, description, type, holder, signed amount, balance where available, and currency. Changed descriptions, dates or balances are not fuzzy-matched in this milestone. Correcting an account assignment after acceptance, merging transactions, and mixed match/add counts within a single identical-row candidate need a future workflow. Explicit transfer pairing and persistent organization are available in [Review](desktop-review.md). Match decisions and receipts remain local.

## Account deletion

Schema version 4 adds a nullable deletion timestamp. Deleting an account is an atomic, recoverable removal from active account lists, current transaction queries, monthly navigation and filename routing. Ledger rows, source observations, import receipts and immutable snapshots remain unchanged. Archive inspection includes deleted accounts with a label, and upload history keeps their name/color. Account cards offer Restore under Deleted accounts. Restoring revives the original identity, ledger rows and routing rules; it does not reimport or duplicate transactions.

Waiting uploads are unassigned in the same transaction as deletion and need review. A known original from a deleted account does not fall through to another account’s prefix rule. A finalizing import prevents deletion until archive recovery finishes. No source or snapshot files are deleted, and this feature does not promise permanent erasure.

## Storage and recovery

```text
private workspace/
  urbanomics.sqlite          # settings, accounts, rules, jobs, ledger, provenance, snapshots
  dropbox/<export-name>.csv   # app-owned intake copies; discovered files can remain staged
  inbox/<job-id>.csv         # unresolved or not-yet-published intake copies
  archive/sources/<sha>.csv  # exact immutable original files
  archive/snapshots/YYYY-MM/rNNNN-<id>.json
  archive/snapshots/YYYY-MM/rNNNN-<id>.csv
  electron/                 # Chromium workspace cache
  logs/
```

Development defaults to the repository's ignored `private/desktop/`. Packaged builds default to `%APPDATA%/Urbanomics/private/`; an explicit `URBANOMICS_DATA_DIR` overrides either. Packaging includes only application code, built renderer assets, and production dependencies. Private files and validation screenshots are excluded. Local storage is plaintext; rely on the computer's own account and disk protections.

SQLite uses WAL and FULL synchronous commits. Snapshot content is committed with the ledger, then exported via temporary files and atomic rename. Existing archive content must compare byte-for-byte before it is reused. Changed month revisions are never overwritten. An exact repeat creates a receipt without another revision. New source links are retained in the database; an old snapshot's provenance remains as captured at that revision.

Schema version 3 adds account colors and optional prefix regexes; existing accounts receive distinct palette colors. Migration and renaming do not rewrite ledger rows or immutable snapshots. The snapshot map derives an account version index from existing immutable snapshots: an account gets a new version only when its accepted transaction-ID set changes. A save for another account does not increment it. The calendar shows the last 12 completed months independent of the import range, using account-colored squares for presence and hover/focus summaries. Revision numbers are omitted from this view. Inspect snapshot opens that exact archived month filtered to the selected account. Empty cells mean no imported snapshot, not an inactive or fully covered account. The Archive dialog shows one current snapshot per account/month on a single row, choosing the latest account save. Later imports update that entry. Original files sit inside a collapsed disclosure. Older immutable revisions remain on disk for audit purposes, without a version picker in the UI. Dialog headers remain fixed above an inset scroll area, keeping scrollbars away from rounded corners. Refresh feedback is a temporary fixed snackbar. Finished processing opens a results dialog, with a short confetti burst for completed runs and a review message when files remain; Latest results reopens the historical summary. Historical snapshot contents preserve the account name used when saved.

If snapshot publication fails after the database commit, the job stays `finalizing` and its intake copy remains. Startup or Retry republishes from the committed database without inserting transactions again. An integrity mismatch is surfaced and never silently overwritten. Recovery does not claim to repair damaged storage. For a complete manual backup, close the app and copy the whole private workspace; snapshot CSVs alone are not a restorable backup of account rules and provenance. Automated backup/restore is not implemented.

## Verification

`npm test` covers all adapters, exact cents, malformed files, repeat and reordered exports, duplicate multiplicity, partial overlaps, explicit extra payments, separate accounts, ambiguous routing, automatic date routing, legacy filtered-source backfill, batch isolation, preserved originals, immutable revisions, database rollback, interrupted publication and restart recovery, and folder filtering.

`npm run test:desktop` launches the real Electron application with isolated synthetic data. It exercises automatic file selection imports, account assignment and editing, invalid/valid prefix feedback, automatic routing of new source bytes, persistent colors, actual progress events, reduced-motion animation, the 12-month calendar and tooltip, transaction/source inspection, searchable history/archive dialogs, Escape focus restoration, real folder-path dispatch, intake clearing, a 900px window, repeat imports, network/Node isolation, and queued close/reopen persistence. The OS picker response and Explorer invocation are stubbed; one synthetic processing run is paused briefly in the test harness to inspect its animation. This does not automate the OS-level drag gesture itself. Screenshots and test workspaces remain ignored under `private/validation/`.

The next milestone carries the accepted tag/category/group workflow into this durable transaction model, followed by transfer and repayment review. No synthetic categorization or repayment decisions are applied to real imports.
