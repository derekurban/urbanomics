# Urbanomics

A fresh start on a personal finance app that makes money movements understandable and monthly upkeep manageable.

The desktop app combines real CSV imports, a local SQLite ledger, immutable source/monthly archives, and persistent transaction organization and review. The accepted prototypes now connect to imported transactions through a Review workspace.

## Run the desktop app

Requires Node.js 24 and npm. From this directory:

```sh
npm ci
npm start
```

The Snapshots section brings Dropbox intake, upload history and archives together. Drop CSV files or a folder onto it, or use Upload CSVs / Choose folder. Recognized CSVs with a known account import automatically, using each transaction’s date to update the right monthly snapshot. Supported export layouts are PC Financial, EQ Bank, and Simplii; Wealthsimple is not supported yet. An unfamiliar filename asks which account it belongs to. A remembered filename pattern routes future imports automatically.

Snapshots is one page with a compact calendar of the last 12 months through the latest imported month (or last completed month, whichever is later). Each account has its own color; filled squares show saved snapshots and hover/focus reveals a short month summary. Select a square to inspect its transactions. Upload history and the full archive, including older months, open in dialogs. Each account has one current snapshot per month; subsequent imports update that entry while older immutable files remain archived. Account rows stay on one line and original files are collapsed. Refresh uses a temporary overlay snackbar without shifting the page. Processing opens a results dialog with brief confetti on success; Latest results reopens the saved summary. All motion respects reduced-motion settings. Original-file counts deduplicate repeated exports; upload history retains every receipt, including errors and removed intake copies. Open folder / Open archive launch the real folders in Explorer. Clear intake copies preserves archived originals, snapshots and Downloads files; non-CSV files and subfolders remain untouched.

**Organize** manages Categories, Events, Accounts and People through searchable lists with transaction usage counts. Create, rename, recolor and delete shared items through their editors. Categories and people already used by transactions are protected from deletion.

Its **Aliases** section turns bank descriptions into readable transaction names using regex rules. Preview matches across all imported months, check competing rules, then save across all accounts. Existing overlaps block saving; future ambiguous matches keep their original names and appear in a conflict list. Original bank text and financial decisions stay intact. Account aliases link to the existing account-name and filename-prefix settings. See [transaction alias behavior](docs/transaction-aliases.md).

Inside the alias editor, **Without an alias** shows searchable transactions still needing a readable name. Click one to start an exact-match rule, then use **Save & create another** to keep working through the list without reopening the editor.

Accounts can be added before importing, or while assigning an upload. Edit each account's name, color and optional filename-prefix regex in Organize → Accounts. A live filename tester previews matches; for example, `pc[_-]mastercard` matches `PC_Mastercard_2026-08.csv`. Matching ignores capitalization and requires a compatible bank format. Conflicting rules ask for review, while known originals retain their previously accepted account. Rules and colors are included in the tracked configuration SQL.

Upload history uses compact account-first rows with the account color, upload time and status. Expand a row to see the source filename and import counts. Search supports account names, filenames and status.

Delete on an account card removes it and its transactions from active views and stops its filename rules. The confirmation describes the impact; local records, original files and snapshots are retained. Restore it from Deleted accounts to recover its transactions and rules. Pending uploads return to account selection. This is recoverable deletion, not permanent erasure of financial files.

There is no import month or date range to select. All valid dates in an uploaded CSV are included, including current-month activity. Re-upload an older original to bring in rows previously excluded by a month filter. Files copied directly into the local Dropbox folder are discovered on startup, focus or Refresh and wait for Process; opening the app does not backfill archived files. Successful imports clear app-owned intake copies, preserving Downloads originals.

Exact same-account rows in repeated, reordered or overlapping exports match automatically one-for-one. Extra copies in a file become additional transactions; existing records, reviews and links stay intact. Bank exports lack reliable transaction IDs, so separate payments with completely identical exported details cannot be distinguished automatically. For that exception, stage a file via Dropbox/Refresh and use Review matches to keep its matching rows as additional payments. Partial exports never replace or delete an existing month. Snapshots show cash movements pending review, not settled spending or income.

Open **Review** (or **Organize transactions** on Snapshots) to sort an imported month. Categories use a card stack with surrounding targets. Drop a card onto a category to save its full amount and advance, or click the card to open Transaction settings. Search and select multiple categories, adjust their dollar/cent split, then Save to advance. Cancel or Escape leaves the transaction and current card unchanged. Chevrons browse saved and pending cards. Events use a calendar: choose an event, click a day and link individual transactions or all unlinked items on that day. Event membership is optional. Optional start/end dates highlight nearby dates, with a switchable one-day buffer; exports keep their original calendar dates. Larger target lists offer search and six-target pages. Category totals appear in Overview after financial review.

Click a selected category to remove it and stay on that card. Remaining categories absorb its amount; removing the final category makes the transaction uncategorized again.

The review inbox separates money in and money out. Save an expense, income, repayment, zero-value record, or paired own-account transfer to remove it from the inbox. Show reviewed lets you inspect and reopen decisions. Add people for agreed expense shares and repayments; a unified searchable picker selects individual expenses or all expenses in a group, including earlier months. Excess repayment amounts remain unassigned e-transfer income. Saving a repayment leaves target expense reviews untouched. Categories, groups and reviews persist across restarts and matching amendments; new rows arrive unreviewed.

**Review → Transfers** starts with pending money in on the left and matching money out on the right. Set an amount tolerance (default ±2% of the outgoing amount), select both entries, and press Link transfer to advance to the next incoming transaction. Candidates use other accounts in the same currency across all imported months. Shortfalls become transfer fees; extra received stays an unexplained difference. Linked pairs leave Pending and appear under Linked, where they can be inspected or unlinked. Existing completed financial reviews must be reopened before pairing, and repayments cannot lose their target expenses. Transfer principal stays separate from fees and unexplained differences in Overview.

Events → **Costs & repayments** shows cash paid, friends’ repayments, cash still fronted, agreed personal shares and outstanding reimbursements. Open an incoming event payment to allocate it to expenses; exact amount inputs and dollar/cent dividers adjust the allocation. Event selection counts each expense once, with excess left as unassigned e-transfer income. Unknown expense splits stay identified, and currencies are shown separately.

Overview shows gross categorized cash flows, with unreviewed amounts and own-account transfers separate. Expense review shows cash paid, personal share/cost, repayments and outstanding shares separately. A net personal-spending report by category, sender recognition, automatic categorization, and backup/restore UI remain future work. See [review behavior and persistence](docs/desktop-review.md).

Development data lives in `private/desktop/`, including Electron cache and logs. The packaged app defaults to `%APPDATA%/Urbanomics/private/`. `URBANOMICS_DATA_DIR` can select another private workspace. Transactions, snapshots, source archives and runtime SQLite are never bundled or committed. These local files are not encrypted by the app.

```sh
npm test                # Import, deduplication, date, and recovery checks
npm run test:desktop    # Real Electron UI + persistence checks; build first
npm run test:events     # Event dates/calendar, shared costs, cross-month repayments and migration checks
npm run test:review     # Synthetic categorization, grouping, financial review and restart checks
npm run test:orbit      # Quick category saves, modal splits/cancellation, events and responsive layout
npm run test:organize   # Shared management, direct categories, deletion safeguards and persistence
npm run test:aliases    # Regex previews, conflicts, readable names, persistence and visual checks
npm run test:transfers  # Pair matching, fees, linked history, automatic multi-month imports
npm run package:win     # Windows application in release/win-unpacked/
```

See [desktop architecture and import behavior](docs/desktop-imports.md) for archive layout, matching rules, limits, and recovery. For live development, run `npm run dev` and `npm run desktop:dev` in separate terminals.

## Configuration in Git

Use `Launch Urbanomics.cmd` in the repository to open the packaged app with configuration sync enabled.

`configuration/workspace.sql` contains accounts and filename rules, global transaction aliases, categories, events and people. App edits update this file automatically when connected to the repository configuration directory. These definitions are included in this private GitHub repository at your request; financial rows, assignments, reviews, sources and snapshots remain ignored. The app does not automatically commit or push: SQL changes are ready for the next Git commit. A fresh workspace loads these definitions without importing financial data. See [configuration setup](configuration/README.md).

## Starting direction

- Begin with the user's experience and the questions the app should answer.
- Import bank exports and automatically organize transactions into monthly snapshots.
- Preserve original files and report added and matched transactions.
- Represent transfers, shared expenses, and reimbursements explicitly.
- Make each reported amount traceable to its transactions and decisions.
- Keep personal financial data local and outside Git.

The overall sixth-trial experience is accepted. Detailed accounting defaults remain subject to validation as those stages are implemented.

## Discovery notes

- [Direction and open questions](docs/direction.md)
- [Monthly CSV preparation](docs/csv-preparation.md) — preserve manual exports and prepare monthly input files locally. This is separate from the prototype's simulated import.
- [Historical tags and category views trial](prototypes/insights-flow.html) — the sixth trial. Transactions carry several reusable tags with exact-cent portions; category views are editable insight lenses over chosen tags; events hold whole transactions; repayment review is unchanged. An HTML fragment shown in Codex; no dependencies, persistence, or real file ingestion.
- [Implementation brief for Fable 5.1](docs/fable-one-brief.md) — the product direction the sixth trial implements (the filename is historical).
- [A small example to make the experience concrete](docs/first-trial.md)
- [Previous organization board](prototypes/board-flow.html) — preserved as the fifth design trial, with fixed category ownership of tags.
- [Previous staged experience](prototypes/staged-flow.html) — preserved as the fourth design trial.
- [Previous inbox experience](prototypes/inbox-flow.html) — preserved as the third design trial.
- [Previous review experience](prototypes/review-flow.html) — preserved as the second design trial.
- [First monthly workflow](prototypes/monthly-flow.html) — preserved as an earlier design trial.
- [Prototype scope and verification](docs/prototype-notes.md)

Run the current prototype's calculation checks with `node --test tests/insights-prototype.test.cjs`. See [the current trial notes](docs/insights-trial.md) for interaction decisions, evidence, and limits. Earlier trials keep their own tests, such as `node --test tests/board-prototype.test.cjs`.

The explicitly approved configuration definitions and synthetic examples belong in this repository. Personal imports, financial decisions, snapshots, generated reports and agent proposals remain under ignored `private/`.
