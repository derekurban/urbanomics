# Urbanomics

A fresh start on a personal finance app that makes money movements understandable and monthly upkeep manageable.

The desktop app combines real CSV imports, a local SQLite ledger, immutable source/monthly archives, and persistent transaction organization and review. The accepted prototypes now connect to imported transactions through a Review workspace.

## Dashboard

**Dashboard** brings together Spending, Cash flow and Events with a data-backed year/month picker and category filters. Compare monthly stacked expense trends and money-in/money-out bars, then inspect a month through composition bars and expandable vendor totals. Cash flow shows latest exported balance observations where available, per-account external movements and a network of linked transfers. See gross expenses, repayments and amounts still paid by you; inspect recorded amounts friends still owe; compare money entering and leaving the boundary of your accounts, excluding matched internal principal. Open any total, category or event to trace its contributing records and original sources. The optional later-repayments switch updates expense costs across month boundaries. Manual cash stays separate from bank totals, and linked transfers contribute only their fees to spending. See [dashboard definitions](docs/dashboard.md).

## Run the desktop app

Requires Node.js 24 and npm. From this directory:

```sh
npm ci
npm start
```

The Snapshots section brings Dropbox intake, upload history and archives together. Drop CSV files or a folder onto it, or use Upload CSVs / Choose folder. Recognized CSVs with a known account import automatically, using each transaction’s date to update the right monthly snapshot. Supported export layouts are PC Financial, EQ Bank, and Simplii; Wealthsimple is not supported yet. An unfamiliar filename asks which account it belongs to. A remembered filename pattern routes future imports automatically.

Snapshots is one page with a compact calendar of the last 12 months through the latest imported month (or last completed month, whichever is later). Each account has its own color; filled squares show saved snapshots and hover/focus reveals a short month summary. Select a square to inspect its transactions. Upload history and the full archive, including older months, open in dialogs. Each account has one current snapshot per month; subsequent imports update that entry while older immutable files remain archived. Account rows stay on one line and original files are collapsed. Refresh uses a temporary overlay snackbar without shifting the page. Processing opens a results dialog with brief confetti on success; Latest results reopens the saved summary. All motion respects reduced-motion settings. Original-file counts deduplicate repeated exports; upload history retains every receipt, including errors and removed intake copies. Open folder / Open archive launch the real folders in Explorer. Clear intake copies preserves archived originals, snapshots and Downloads files; non-CSV files and subfolders remain untouched.

**Organize** is the management hub for Categories, Events, People, Accounts, Aliases and Rules. Its Overview highlights uncategorized transactions, alias/rule conflicts, events missing dates, transfer differences and unused definitions, with links to the relevant tools. Compact searchable rows show transaction and rule usage; shared editors keep names, colors and dates consistent. Tags and people referenced by transactions or rules are protected from deletion.

**Rules** maps original bank-description regexes to a tag, a person, or both, optionally limited to money in or money out. Live previews show matching transactions, conflicting mappings and protected existing choices. Saving enables automation for newly imported transactions; **Apply to ready transactions** separately fills gaps in existing records. Compatible rules combine; conflicting mappings apply nothing to that transaction. Person associations can be edited in Transaction settings and never create repayments or shared expenses automatically. See [Rules behavior](docs/transaction-rules.md).

Its **Aliases** section turns bank descriptions into readable transaction names using regex rules. Preview matches across all imported months, check competing rules, then save across all accounts. Existing overlaps block saving; future ambiguous matches keep their original names and appear in a conflict list. Original bank text and financial decisions stay intact. Account aliases link to the existing account-name and filename-prefix settings. See [transaction alias behavior](docs/transaction-aliases.md).

Inside the alias editor, **Without an alias** shows searchable transactions still needing a readable name. Click one to start a description-prefix rule, then use **Save & create another** to keep working through the list without reopening the editor.

Accounts can be added before importing, or while assigning an upload. Edit each account's name, color and optional filename-prefix regex in Organize → Accounts. A live filename tester previews matches; for example, `pc[_-]mastercard` matches `PC_Mastercard_2026-08.csv`. Matching ignores capitalization and requires a compatible bank format. Conflicting rules ask for review, while known originals retain their previously accepted account. Rules and colors are included in the tracked configuration SQL.

Upload history uses compact account-first rows with the account color, upload time and status. Expand a row to see the source filename and import counts. Search supports account names, filenames and status.

Delete on an account card removes it and its transactions from active views and stops its filename rules. The confirmation describes the impact; local records, original files and snapshots are retained. Restore it from Deleted accounts to recover its transactions and rules. Pending uploads return to account selection. This is recoverable deletion, not permanent erasure of financial files.

There is no import month or date range to select. All valid dates in an uploaded CSV are included, including current-month activity. Re-upload an older original to bring in rows previously excluded by a month filter. Files copied directly into the local Dropbox folder are discovered on startup, focus or Refresh and wait for Process; opening the app does not backfill archived files. Successful imports clear app-owned intake copies, preserving Downloads originals.

Exact same-account rows in repeated, reordered or overlapping exports match automatically one-for-one. Extra copies in a file become additional transactions; existing records, reviews and links stay intact. Bank exports lack reliable transaction IDs, so separate payments with completely identical exported details cannot be distinguished automatically. For that exception, stage a file via Dropbox/Refresh and use Review matches to keep its matching rows as additional payments. Partial exports never replace or delete an existing month. Snapshots show cash movements pending review, not settled spending or income.

Open **Review → Tags** to sort an imported month. A fixed card stack sits inside broad category bubbles. Hover over a category to reveal its tags, then drag onto a tag to save the full amount. Keyboard users can focus a category and activate a tag. First-time tagging advances; edits and removals stay on the viewed transaction. Click the card for searchable multi-tag settings and dollar/cent splits. Save persists; Cancel or Escape leaves data unchanged. All targets remain visible without pages: larger groups use additional rings with fixed-size bubbles. The dragged stack stays beneath expanded tags. Money out and Money in have separate tag choices; tagging never infers an incoming payment’s financial purpose.

**Organize → Categories & tags** manages the hierarchy. Tags own transaction portions; categories collect their tags. Expense tags belong to broad categories; income tags have their own alphabetical list. Drag expense tags between categories. Keyboard users can pick up a focused tag with Space and place it into a focused category with Enter. Existing assignments retain their IDs and amounts; ungrouped tags remain available. The Food & Personal starter uses the user's example definitions and can be added without changing transactions. Dashboard switches between category rollups and individual tags, preserving repayment rounding and transfer exclusions. See [hierarchy behavior](docs/tag-hierarchy.md).

Events retain their optional calendar membership and required date ranges. Money in, deductions, transfers and source inspection remain independent of tagging.

**Review → Money in** is the dedicated place for incoming payments, across all months. Choose **Income** and a type (Paycheck, Interest, Sale, Gift, or a named Other income), or choose **Deduct expenses** and select a person plus one or several expenses. An event is an optional shortcut to its expenses. **+ Add cash received** records physical cash separately from bank imports and uses the same allocation editor. The All, Income, Allocated and Unassigned money filters show saved assignments directly; Edit cash receipt can edit or remove a receipt and undo its deductions. Expenses also offer **Apply incoming money to this expense**.

**Transactions** shows records with independent filters and labels for categorized/uncategorized, received deductions, allocated payments, income, events, shared expenses and transfer links. Select a transaction to edit categories, shares, income or deductions; saved items remain accessible. Clear financial assignment removes its financial purpose and allocations, preserving categories and events. Review stays in the sidebar for Tags, Money in, Events, Transfers and Overview, without a numbered review-completion stage. There is no separate reviewed status to manage.

**Review → Transfers** starts with pending money in on the left and matching money out on the right. Set an amount tolerance (default ±2% of the outgoing amount), select both entries, and press Link transfer to advance to the next incoming transaction. Candidates use other accounts in the same currency across all imported months. Shortfalls become transfer fees; extra received stays an unexplained difference. Linked pairs leave Pending and appear under Linked, where they can be inspected or unlinked. Existing income, repayment and shared-expense assignments must be cleared before pairing, and repayments cannot lose their target expenses. Transfer principal stays separate from fees and unexplained differences in Overview.

**Review → Transfers → Auto-link lab** is a temporary testing area for directed account routes, date windows and amount tolerance. Draw directed connections between draggable account nodes. Start unlinked tests unique/ambiguous matches as if existing pairs were unlinked, without changing saved records. Switch to Pending only to explicitly link selected candidates. Defaults use exact amounts, ±1 day and the requested EQ/PC/Simplii directions. Save setup remembers routes and tolerances; it never links transactions automatically. See [algorithm and safeguards](docs/transfer-lab.md).

Events → **Costs & repayments** shows cash paid, friends’ repayments, cash still fronted, agreed personal shares and outstanding reimbursements. Open an incoming event payment to allocate it to expenses; exact amount inputs and dollar/cent dividers adjust the allocation. Event selection counts each expense once, with excess left as unassigned e-transfer income. Unknown expense splits stay identified, and currencies are shown separately.

Overview shows gross categorized cash flows, with unspecified purposes and own-account transfers separate. Expense review shows cash paid, personal share/cost, repayments and outstanding shares separately. Dashboard adds category costs after received repayments; finalized personal-share reporting and backup/restore UI remain future work. Regex rules now provide explicit person recognition and automatic categorization. See [review behavior and persistence](docs/desktop-review.md).

Development data lives in `private/desktop/`, including Electron cache and logs. The packaged app defaults to `%APPDATA%/Urbanomics/private/`. `URBANOMICS_DATA_DIR` can select another private workspace. Transactions, snapshots, source archives and runtime SQLite are never bundled or committed. These local files are not encrypted by the app.

```sh
npm test                # Import, deduplication, date, and recovery checks
npm run test:desktop    # Real Electron UI + persistence checks; build first
npm run test:dashboard  # Dashboard totals, filters, relationships and source drilldowns
npm run test:money-in   # Income sources, cash lifecycle and deductions without events
npm run test:events     # Event dates/calendar, shared costs, cross-month repayments and migration checks
npm run test:review     # Synthetic categorization, grouping, financial review and restart checks
npm run test:orbit      # Quick category saves, modal splits/cancellation, events and responsive layout
npm run test:organize   # Shared management, direct categories, deletion safeguards and persistence
npm run test:rules      # Rule previews, conflicts, new/repeat imports and person mappings
npm run test:aliases    # Regex previews, conflicts, readable names, persistence and visual checks
npm run test:transfer-lab # Directed candidate matching, historical comparison and batch linking
npm run test:transfers  # Pair matching, fees, linked history, automatic multi-month imports
npm run package:win     # Windows application in release/win-unpacked/
```

See [desktop architecture and import behavior](docs/desktop-imports.md) for archive layout, matching rules, limits, and recovery. For live development, run `npm run dev` and `npm run desktop:dev` in separate terminals.

## Configuration in Git

Use `Launch Urbanomics.cmd` in the repository to open the packaged app with configuration sync enabled.

`configuration/workspace.sql` contains accounts and filename rules, global transaction aliases, category/person mapping rules, categories, events and people. App edits update this file automatically when connected to the repository configuration directory. These definitions are included in this private GitHub repository at your request; financial rows, assignments, reviews, sources and snapshots remain ignored. The app does not automatically commit or push: SQL changes are ready for the next Git commit. A fresh workspace loads these definitions without importing financial data. See [configuration setup](configuration/README.md).

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
