# Configuration export

This folder is git-ignored apart from this README. The app's configuration export, `workspace.sql`, is personal and is never committed to this repository.

## Where the export lives

The app writes `workspace.sql` to the configuration folder named by `URBANOMICS_CONFIG_DIR`, or by `configurationDir` in `%APPDATA%\Urbanomics\workspace.json` when the environment does not set one. Keep that folder private, for example in a separate private Git repository. A development build falls back to this `configuration/` folder only when neither the environment variables nor `workspace.json` say otherwise; the export it writes here stays ignored. A data folder supplied through `URBANOMICS_DATA_DIR` without `URBANOMICS_CONFIG_DIR` gets no configuration folder at all, so synthetic test workspaces can neither seed from nor export over real definitions. The installer does not bundle any configuration SQL.

## What the export contains

`workspace.sql` stores the current accounts (including recoverable deletion), filename routing rules, global aliases, category/person mapping rules, categories, events, people and saved transfer-lab route/tolerance setup. Stable IDs, names, colors and regexes are included. Events use the existing `review_entities` kind `group`, with optional `startDate` and `endDate` fields.

There are no transactions, amounts, source descriptions from ledger rows, source hashes, raw CSVs, snapshots, import receipts, review decisions, transaction/category/event assignments, repayment links, balances or runtime settings in this export. Alias and transaction-rule names, patterns and mappings are configuration and may contain personal text by design, which is why the export stays private. The runtime SQLite database, rule-application audit and archive remain under the private workspace.

The app atomically updates the SQL after configuration edits and on startup. Identical exports do not rewrite the file. Export failure keeps the old SQL and the live configuration, and shows a retry message; Refresh retries. The app never runs Git or pushes; commit the export in its private repository yourself.

## Seeding

A fresh or fully empty workspace seeds from `workspace.sql` in its configuration folder when that file exists. Existing workspaces are authoritative and export their current configuration; pulling SQL changes does not overwrite an existing ledger's definitions. After Start from scratch, a private marker prevents seeding on restart. SQL is a trusted executable artifact, not an upload format. Do not apply it over an existing workspace. The file is a configuration seed, not a complete financial backup; back up the closed private workspace to preserve financial history and reviews.

## Schema notes

Schema 13 exports tag parent definitions in `review_entities.parentId`. Legacy kind `category` denotes assignable tags; kind `bucket` denotes broad categories. Empty parents mean ungrouped tags. Financial portions and raw records remain private. Existing SQL without parentId seeds compatible ungrouped tags; hierarchy edits never rewrite ledger payloads.

Schema 14 includes review_entities.flowType in the explicit configuration export. It describes expense/income tag definitions only; no financial assignments or transaction data are exported.

Schema 15 exports category gradientStart/gradientEnd definitions and category_palettes (Income/Ungrouped endpoints). The UI derives the category midpoint and alphabetical tag steps; no transaction or review data is exported.

Schema 18 exports `system_tag_names` overrides. System responsibilities remain code-defined; renames never change financial classification. Existing Other tag IDs are reused. Automatic default assignments and Transfer/Deduction badges are derived from private records and links, never exported as financial data.
