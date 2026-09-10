# Urbanomics

A fresh start on a personal finance app that makes money movements understandable and monthly upkeep manageable.

The first working desktop milestone is implemented: Electron + React, real CSV imports, a local SQLite ledger, and immutable source and monthly snapshot archives. Tagging, repayment allocation, and spending reports still live in the experience prototype and are the next implementation stages.

## Run the desktop app

Requires Node.js 24 and npm. From this directory:

```sh
npm ci
npm start
```

The Data section brings Dropbox intake, upload history and archives together. Drop CSV files or a folder onto it, or use Upload CSVs / Choose folder. Files wait in the local Dropbox until you press Process. Supported export layouts are PC Financial, EQ Bank, and Simplii; Wealthsimple is not supported yet. An unfamiliar filename asks which account it belongs to. A remembered filename pattern routes future imports automatically.

The account-by-month map shows saved versions for each account. Select a cell to inspect versions, their source uploads, or the underlying transactions. Original-file counts deduplicate repeated exports; upload history retains every receipt, including errors and removed intake copies. Open folder / Open archive launch the real folders in Explorer. Files added directly to Dropbox are discovered on app focus, Scan folder, or Process. Clear intake copies preserves archived originals, snapshots and Downloads files; non-CSV files and subfolders remain untouched.

The Accounts screen controls the completed-month range. Rows outside that range remain in the original archive. Re-drop the original after extending the range to import earlier or newly completed months. Successful imports leave the intake queue automatically; files in Downloads are never deleted.

Exact repeated or reordered-equivalent files do not add transactions. Different overlapping exports ask for match decisions because the bank files lack reliable transaction IDs. Partial exports add or match rows without replacing the existing month. Monthly snapshots show unreviewed cash movements, not settled spending or income.

Development data lives in `private/desktop/`, including Electron cache and logs. The packaged app defaults to `%APPDATA%/Urbanomics/private/`. `URBANOMICS_DATA_DIR` can select another private workspace. None of this is bundled or committed. These local files are not encrypted by the app.

```sh
npm test                # Import, deduplication, date, and recovery checks
npm run test:desktop    # Real Electron UI + persistence checks; build first
npm run package:win     # Windows application in release/win-unpacked/
```

See [desktop architecture and import behavior](docs/desktop-imports.md) for archive layout, matching rules, limits, and recovery. For live development, run `npm run dev` and `npm run desktop:dev` in separate terminals.

## Starting direction

- Begin with the user's experience and the questions the app should answer.
- Import a chosen month's bank exports through an intentional workflow.
- Preserve original files and explain which rows are included or excluded.
- Represent transfers, shared expenses, and reimbursements explicitly.
- Make each reported amount traceable to its transactions and decisions.
- Keep personal financial data local and outside Git.

The overall sixth-trial experience is accepted. Detailed accounting defaults remain subject to validation as those stages are implemented.

## Discovery notes

- [Direction and open questions](docs/direction.md)
- [Monthly CSV preparation](docs/csv-preparation.md) — preserve manual exports and prepare monthly input files locally. This is separate from the prototype's simulated import.
- [Current tags and category views experience](prototypes/insights-flow.html) — the sixth trial. Transactions carry several reusable tags with exact-cent portions; category views are editable insight lenses over chosen tags; events hold whole transactions; repayment review is unchanged. An HTML fragment shown in Codex; no dependencies, persistence, or real file ingestion.
- [Implementation brief for Fable 5.1](docs/fable-one-brief.md) — the product direction the sixth trial implements (the filename is historical).
- [A small example to make the experience concrete](docs/first-trial.md)
- [Previous organization board](prototypes/board-flow.html) — preserved as the fifth design trial, with fixed category ownership of tags.
- [Previous staged experience](prototypes/staged-flow.html) — preserved as the fourth design trial.
- [Previous inbox experience](prototypes/inbox-flow.html) — preserved as the third design trial.
- [Previous review experience](prototypes/review-flow.html) — preserved as the second design trial.
- [First monthly workflow](prototypes/monthly-flow.html) — preserved as an earlier design trial.
- [Prototype scope and verification](docs/prototype-notes.md)

Run the current prototype's calculation checks with `node --test tests/insights-prototype.test.cjs`. See [the current trial notes](docs/insights-trial.md) for interaction decisions, evidence, and limits. Earlier trials keep their own tests, such as `node --test tests/board-prototype.test.cjs`.

Only synthetic examples belong in this repository. Personal imports, configuration, financial decisions, generated reports, and agent proposals belong under the ignored `private/` directory.
