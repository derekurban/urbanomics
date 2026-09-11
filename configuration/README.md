# Versioned configuration

`workspace.sql` stores the current accounts (including recoverable deletion), filename routing rules, global aliases, categories, events and people. Stable IDs, names, colors and regexes are included intentionally at the user's request. Events use the existing `review_entities` kind `group`, with optional `startDate` and `endDate` fields.

There are no transactions, amounts, source descriptions from ledger rows, source hashes, raw CSVs, snapshots, import receipts, review decisions, transaction/category/event assignments, repayment links, balances or runtime settings in this export. Alias names and patterns are configuration and may contain personal text by design. The runtime SQLite database and archive remain ignored under `private/`.

The app atomically updates the SQL after configuration edits and on startup. Identical exports do not rewrite the file. Export failure keeps the old SQL and the live configuration, and shows a retry message; Refresh retries. These changes are ready for normal Git commits; the app never runs Git or pushes in the background.

Development's standard workspace uses this directory automatically. The installed launcher sets `URBANOMICS_DATA_DIR=C:/path/to/urbanomics/private/desktop` and `URBANOMICS_CONFIG_DIR=C:/path/to/urbanomics/configuration`. Custom data workspaces only synchronize when a configuration directory is explicitly supplied, so synthetic tests cannot overwrite the repository's definitions.

A fresh or fully empty workspace seeds from its configuration directory (or the packaged SQL if no local copy exists). Existing workspaces are authoritative and export their current configuration; pulling SQL changes does not overwrite an existing ledger's definitions. SQL is a trusted executable repository artifact, not an upload format. Do not apply it over an existing workspace. The file is a configuration seed, not a complete financial backup; back up the closed private workspace to preserve financial history and reviews.
