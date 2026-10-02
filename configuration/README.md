# Versioned configuration

`workspace.sql` stores the current accounts (including recoverable deletion), filename routing rules, global aliases, category/person mapping rules, categories, events, people and saved transfer-lab route/tolerance setup. Stable IDs, names, colors and regexes are included intentionally at the user's request. Events use the existing `review_entities` kind `group`, with optional `startDate` and `endDate` fields.

There are no transactions, amounts, source descriptions from ledger rows, source hashes, raw CSVs, snapshots, import receipts, review decisions, transaction/category/event assignments, repayment links, balances or runtime settings in this export. Alias and transaction-rule names, patterns and mappings are configuration and may contain personal text by design. The runtime SQLite database, rule-application audit and archive remain ignored under `private/`.

The app atomically updates the SQL after configuration edits and on startup. Identical exports do not rewrite the file. Export failure keeps the old SQL and the live configuration, and shows a retry message; Refresh retries. These changes are ready for normal Git commits; the app never runs Git or pushes in the background.

Development's standard workspace uses this directory automatically. The installed launcher sets `URBANOMICS_DATA_DIR=C:/path/to/urbanomics/private/desktop` and `URBANOMICS_CONFIG_DIR=C:/path/to/urbanomics/configuration`. Custom data workspaces only synchronize when a configuration directory is explicitly supplied, so synthetic tests cannot overwrite the repository's definitions.

A fresh or fully empty workspace seeds from its configuration directory (or the packaged SQL if no local copy exists). Existing workspaces are authoritative and export their current configuration; pulling SQL changes does not overwrite an existing ledger's definitions. SQL is a trusted executable repository artifact, not an upload format. Do not apply it over an existing workspace. The file is a configuration seed, not a complete financial backup; back up the closed private workspace to preserve financial history and reviews.

Schema 13 exports tag parent definitions in `review_entities.parentId`. Legacy kind `category` denotes assignable tags; kind `bucket` denotes broad categories. Empty parents mean ungrouped tags. Financial portions and raw records remain private. Existing SQL without parentId seeds compatible ungrouped tags; hierarchy edits never rewrite ledger payloads.

Schema 14 includes review_entities.flowType in the explicit configuration export. It describes expense/income tag definitions only; no financial assignments or transaction data are exported.

Schema 15 exports category gradientStart/gradientEnd definitions and category_palettes (Income/Ungrouped endpoints). The UI derives the category midpoint and alphabetical tag steps; no transaction or review data is exported.

Schema 18 exports `system_tag_names` overrides. System responsibilities remain code-defined; renames never change financial classification. Existing Other tag IDs are reused. Automatic default assignments and Transfer/Deduction badges are derived from private records and links, never exported as financial data.
