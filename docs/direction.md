# Direction note

Updated: 2026-09-11

## Current request

The user accepted integrating shared-cost allocation and replaced event cards with a calendar. Optional event start/end dates suggest bank-exported dates within a ±1-day window, with explicit linking by day or transaction. Every transaction needs categories; event membership stays optional. Single-ended dates are implemented as one-day occasions. Review shows event cost breakdowns and lets incoming money allocate to expenses through an event shortcut. Saved allocations target unique expense IDs, preserve excess as unassigned e-transfer income, and do not follow later membership changes. Existing transaction category and financial decisions remain independent.

Aliases now apply globally across accounts. The user explicitly approved committing configuration definitions (aliases, accounts, filename rules, categories, events and people) as SQL in the GitHub repository. Live SQLite, transactions, snapshots, raw CSVs and financial review decisions remain private. The app keeps the SQL export current; Git commits remain an explicit repository workflow. Fresh empty workspaces can seed definitions from the tracked SQL.

Suggested transaction alias regexes now keep the leading `^` and escape bank text, but omit the trailing `$` so suffixes can match. Saved rules are unchanged.

The user reversed transfer matching to start from money in, with outgoing candidates shown alongside it. Alias management and the unaliased transaction picker now use compact rows with less padding; names, rules, account context, amounts and edit actions remain available.

The user settled the transfer linker: incoming pending entries on the left, outgoing candidates on the right within a configurable plus/minus percentage band, checkmarked selections and an explicit Link action. Linked pairs leave the pending view, and are available under Linked with month/search filtering and Unlink. Shortfalls default to fees. Implementation starts the band at 2% of the outgoing amount; the user can set 0–100% in 0.01% increments. Candidates search across imported months without a hidden date cutoff. Additional incoming money is retained as an unexplained difference, not inferred income. Existing financial decisions and repayment reservations remain protected.

The user superseded the month picker: recognized uploads should deduplicate and apply transactions automatically without selecting a month. The importer now uses all exported dates, including the current month, and matches exact same-account rows one-for-one across overlaps. Account ambiguity still asks for assignment. Uploading or assigning a recognized file starts processing; manual folder discovery stays staged. Re-uploading old originals backfills rows previously excluded by a range while retaining accepted transaction IDs, reviews and archived snapshots. Startup does not reprocess archives.

Alias creation now includes a searchable preview of transactions without aliases. A row can seed an exact-match rule, and Save & create another keeps the editor open while removing newly covered transactions from the list. This queue is independent of category assignment and financial review.

The latest request adds regex-based transaction aliases in Organize alongside a shortcut to existing account-name/prefix management. Preview all historical imported matches and competing rules before saving. Retain source text, flag future ambiguous matches without guessing, and keep financial decisions independent. Clicking a selected category now removes it and stays on the same card; dropping retains quick-save-and-advance. Chevron alignment is corrected with centered SVG icons and square controls.

The latest accepted refinement replaces tags plus category views with direct categories and removes the board. Category cards save and advance immediately when dropped onto a category. Clicking a card opens a searchable multi-category settings modal with split controls; Save advances after persistence, while Cancel leaves the card and data unchanged. The user's mention of “multiple tags” in this request is interpreted as multiple categories, consistent with removing tags. Organize now contains Categories, Events, Accounts and People. Events retain whole-transaction membership and their explicit Save & next flow. Earlier tag/view and board descriptions below are historical.


Upload history now emphasizes the destination account, with color, timestamp and status in a compact row. Filenames and receipt details expand underneath. Modal scroll padding leaves room for visible input focus outlines. Accounts now support deletion with an impact confirmation and Restore: active views and routing exclude deleted accounts while local financial history and immutable archives remain preserved. Tests use synthetic accounts for deletion and restoration.

The latest refinement renames Data to Snapshots, compacts the layout and removes redundant labels and the permanent results card. Refresh feedback uses an overlay snackbar. Processing results open in a playful modal with a brief success celebration. The archive presents one current snapshot per account/month in a single row, with original files collapsed; older immutable files remain available on disk. Inset modal scrolling preserves rounded corners. Entrance, hover and processing motion respect reduced-motion preferences.

The user requested editable account names, filename-prefix regex rules and account colors. Data now stays on one page: a refresh action, a compact rolling calendar of the last 12 completed months, the Dropbox queue, animated processing feedback and a persistent latest-run summary. Colored rounded squares indicate account-month snapshot presence, with minimal hover/focus details and no revision labels. Upload history and full archive inspection open in modals. Earlier archived months remain available there. Prefix rules are optional, bank-specific and case-insensitive; ambiguous matches require review. These are implemented decisions, not changes to the accounting model.

The user accepted the in-chat Data prototype and requested applying it to the real app, with a Fable UI pass. The repository and live workspace now run from `C:/path/to/urbanomics`. The Data section is the single place for Dropbox intake, upload history, archived originals and account-month snapshot management. Fable 5.1 supplied the React/CSS layout through a restricted Claude Code task with code and synthetic inputs only; the coordinating agent implemented storage, IPC, integration and verification.

Build an operational Electron app in the existing private `urbanomics` repo. Start with the most recent completed month from supplied CSV samples, support drag/drop multi-account intake, deduplicate into monthly snapshots, archive sources and revisions, and keep personal data local and ignored by Git.

## Evidence from the earlier conversation

Source: [link to the earlier private conversation removed]

The shared conversation was readable on 2026-09-09. Its attached document and ZIP contents have not been reviewed. No existing code has been inspected or imported.

The user previously asked for:

- A personal finance app for their own use, with experience considered before architecture.
- Less effort maintaining data across several bank and investment accounts.
- Understanding income, spending, transfers, balances, and investment growth.
- Correct treatment of fronted expenses, reimbursements, shared rent, and utilities.
- Views by category, event, account, situation, and time, including trip costs and budgets.
- An intentional monthly import that trims exports to the selected month.
- Explicit documented rules and relationships rather than fuzzy matching.
- Original imports archived separately from their normalized monthly copies.
- Application work committed to Git while raw financial data stays out of Git.
- Compatibility with desktop agents, with review of AI-driven financial changes.
- Starting with 2026 data.

These are historical preferences, not assumed answers to every decision in this fresh start. In particular, 'Dropbox' may have meant a local intake folder; cloud storage is not established.

## Assistant proposals to revisit

The previous assistant proposed SQLite, YAML configuration, a CLI, several screens, rules, and transaction IDs. Those choices were not demonstrated in a working application.

Potential weaknesses to resolve through implementation and focused checks:

- Deterministic matching is not necessarily correct matching: same-amount payments can be unrelated.
- Replacing an account-month can lose records if the replacement export is incomplete.
- IDs based on duplicate occurrence order need validation against reordered and overlapping exports.
- Filtering out other months must preserve source provenance and support links across month boundaries.
- Transaction activity alone does not establish opening balances, investment valuations, growth, or registered-account contribution room.
- Real configuration and accepted decisions can expose financial details even when raw files are ignored.
- Date-window event assignment should be a declared choice or a reviewable candidate, not an unexplained assumption.

Bank export formats and limits quoted in the old conversation have not been independently verified. Validate supported formats against actual, user-provided or safely redacted examples when implementing parsers.

## Confirmed focus for the restart

The user wants to nail the uploading and finance-management experience. Their first question is how much they spend on different things, accounting for expenses they cover for friends who repay their share.

The proposed interaction calls this a shared expense and linked repayment. The user's term was a "deductible based system"; tax deductions are not part of the stated request.

## Working hypothesis

### User acceptance and transition to implementation

After the sixth trial, the user said the flow and experience are in a good spot. They value the fun of dragging, dropping, and organizing alongside the ability to inspect and divide transactions into richer structures. They are comfortable deferring cleanup and animations until the full app is built. This settles the overall experience direction; it does not individually confirm every proposed accounting default.

The assistant's proposed next milestone is one real month from CSV import through saved organization and repayments to a traceable spending breakdown. Begin with a chequing account and credit card so own-account payments are exercised, while designing account support for the user's full account set. Preserve original imports, handle repeat and overlapping imports without silent loss or double counting, retain edits across restarts, and support backup/restore. The first desktop import milestone now validates PC, EQ and Simplii layouts against supplied exports; financial organization and reporting remain to be implemented.

Before net spending by tag is implemented, settle how an expense-level repayment reduces tag portions. A proportional default with an explicit override is a proposal, not a confirmed user decision. Cash paid, personal share, repayments received, and outstanding amounts must remain distinguishable.

Completion evidence for that milestone: import the month, organize a mixed-tag purchase, link a repayment, close and reopen with decisions intact, reimport without changing totals, and trace a category total back to source rows and allocations. The existing prototype only establishes interaction fit and synthetic calculation behavior, not real-data reliability. The desktop importer now establishes the ingestion and persistence portion; the complete spending workflow remains the longer-term milestone.

### Sixth iteration, the current prototype

The user clarified the direction: transactions may have multiple tags, defaulting to equal monetary portions, while categories provide a separate layer for viewing selected tags and organizing insights. The prior assumption that each tag is owned by exactly one category is superseded. Transaction tagging and the organization of insight views are independent.

The implementation brief is `docs/fable-one-brief.md`, prepared for Fable 5.1 (the filename is historical). Fable 5.1 implemented it as `prototypes/insights-flow.html`, delegated through Claude Code at the user's request. The workflow is Import → Organize → Events → Deduct & balance → Insights, with every stage reachable after import.

What the sixth trial does:

- Every expense, incoming payment, and internal transfer carries reusable tags with exact-cent portions that sum to the transaction. One tag takes the full amount; several tags start equal, with the rounding remainder assigned deterministically. Adjacent dividers adjust neighbouring tags at $1 or $0.01 precision, with a visible Split evenly action.
- Changing tags on a manually adjusted split keeps the user's amounts, starts new tags at $0.00, and shows a review notice instead of silently resetting.
- Tags are created, renamed, and removed in Organize; removal is blocked while a tag has portions.
- Category views are created, renamed, given tags, and deleted in Insights. The same tag may sit in several views. Each view shows gross money out and in, money in by financial purpose, internal transfers separately, per-tag contributions, and the transactions with their in-view portions. Combining views counts each portion once and names overlapping tags.
- Events still hold whole transactions and drive repayment selection with one canonical set of expense IDs. Deduct & balance is unchanged.

Overlapping views remain an assistant design default to try, not a separately confirmed requirement. Net personal cost by tag is still unspecified, so every tag and view total is labelled as a gross flow before repayments and shares. Fable 5.1 implemented the trial through Claude Code; the coordinating assistant reviewed it and fixed mixed-transfer reporting and small display issues. Sixteen current tests pass, including structural and headless UI checks. Browser checks verified category and tag management, manual splits, overlapping totals, drag assignment, independent repayment review, and a 360px layout without horizontal overflow. See `docs/insights-trial.md`.

### Fifth iteration

The fifth iteration was `prototypes/board-flow.html`, preserved as design history. The user asked for visible contents within categories/groups, assigned items leaving the unassigned queue, synchronized group/expense selection, and multiple estimated monetary tags on one purchase.

The trial uses an unassigned lane beside a two-column board of categories containing tag lanes and transaction portions. Grouping uses a parallel board of event contents. Dropping an unassigned item gives its whole amount to a tag. Editing tags supports rough splits using the existing dollar/cent divider. Moving a tagged portion changes only that portion; category totals sum tag amounts, with incoming/outgoing amounts shown separately. They are organization totals before repayment deductions.

Its taxonomy proposal, each tag belonging to one broad category, was superseded by the sixth iteration's independent category views. Category/tag definitions were fixed sample choices in that trial; the user has not finalized a taxonomy.

Repayment selection now stores unique expense IDs. Choosing a group selects all its expense members and updates each child checkmark. Unchecking one child makes the group partially selected; clicking a partially selected group fills its missing members. Deselecting a fully selected group removes those expense members; overlapping groups update their checkmarks accordingly. Group membership alone remains organizational and does not create a repayment allocation.

Verified: actual pointer drops remove dinner from Needs tags and an incoming payment from Ungrouped; a $240 Walmart purchase splits into $140 Groceries and $100 Furniture; group/child checkmarks remain synchronized. Sixteen model tests pass, and the tag editor fits at 360px. See `docs/board-trial.md` for limitations and the next review point.

### Fourth iteration

The fourth iteration is `prototypes/staged-flow.html`. The user requested:

- Import → Categorize → Group → Deduct & balance, with broad categories and thematic groups kept independent.
- A full list of incoming and outgoing items on the left, with drag destinations on the right during organization.
- Dollar or cent precision for both people-share and repayment-allocation dividers.
- One searchable multi-select list containing individual expenses and groups, including mixed selections.
- Repayment allocation across the selected expenses, with groups initially distributed evenly.
- An explicit unassigned e-transfer income remainder when a payment exceeds what is allocated.
- Saving a payment must not mark its linked expenses reviewed.

The trial expands groups into unique expense leaves, so selecting a group and one of its members does not count the member twice. Incoming items may belong to groups, but are never themselves repayment targets. Categories and group membership do not create repayment links.

Working interpretation: without an explicit agreed split, the expense's unreimbursed portion is personal cost. An explicitly agreed split preserves the user's share and tracks unpaid friend shares separately. This timing distinction remains a proposal to validate with the user. Amounts use integer cents, with capped allocation and exact conservation of the payment across expenses and unassigned income.

Browser checks confirmed independent expense reviews, mixed group/individual selection, exact sender recognition, dollar/cent adjustment, and a completed example with $419.43 personal expense cost, $178.99 allocated repayments, and $31.01 unassigned e-transfer income. Imports and pre-triage remain synthetic fixtures. See `docs/staged-trial.md` for scope.

### Third iteration

The third iteration was `prototypes/inbox-flow.html`. It followed this direction:

- Import a batch across chequing and savings accounts at two banks, plus Mastercard, and triage known movements.
- Set up groups before review, with group management also available within review.
- Use visible choices instead of dropdowns for income/repayment, scope, category, and target selection.
- Show people as a horizontally scrolling row of avatars with names underneath.
- Select the sender before choosing an expense or group.
- Drag expenses between groups, with a select-and-move alternative.
- Use dividers between share segments. A divider changes only the two adjacent people; other shares stay fixed.
- Show only unfinished tasks in the left inbox, under Money in and Money out. Completed items leave the list.

This supersedes the previous prototype's proportional redistribution sliders and always-visible list of reviewed items. The sample starts with five routed account files, known rule results, and two paired own-account movements. These are simulated fixtures, not tested bank integrations or a general rule engine. The concrete $200 personal-share case passes both model tests and browser interaction checks.

### Previous iteration

The user liked the starting point and requested these changes:

- Compact import: show included/excluded counts as quiet plus/minus subtext, without previews of row contents or a pre-review monthly breakdown.
- Incoming money receives a purpose: general income, job income, selling something, or repayment of an expense.
- A repayment can cover multiple expenses in a shared collection or trip.
- People are reusable entities. Explicitly recognized e-transfer senders can be remembered and brought into linked expenses.
- Expense shares should be adjustable with sliders, initially split equally by participant count.
- Improve spending views later; focus now on import and review.

`prototypes/review-flow.html` was the second trial. It and `monthly-flow.html` remain available as design history. The sample demonstrates a $180 payment covering Alex's $60 dinner share and $120 cabin share. Remembering the exact sample sender recognizes Alex on the next transfer, without guessing that transfer's purpose.

The sliders preserve each expense total while redistributing the remaining shares. This interaction, the oldest-expense-first allocation suggestion, and hiding spending until review is complete are assistant design choices to try, not individually confirmed requirements.

The first useful experience may be: select a month, review a small number of unresolved money movements, and understand personal spending separately from cash paid and money owed back.

The earlier trials recorded the user's agreed share as personal spending and tracked the friend's share separately as owed back. The fourth trial also supports the user's requested received-repayments method when no agreed split is recorded.

## Open questions

1. Does the tag board with a Needs tags lane make sorting and finding assigned items easier?
2. Do reusable category views over independently tagged transactions provide the right insight organization? Should those views overlap, and is the combined once-only count understandable?
3. Is keeping a manual split with new tags at $0.00 the right reviewable default, or should new tags take an equal share immediately?
4. Does the distinction between received-repayment cost and an explicitly agreed share match the user's expectations?
5. Later: how repayments affect individual tag portions in spending reports, merging a tag into another, real multi-file selection, ambiguous account routing, bank-specific formats, persistent storage, recurring arrangements, unmatched transfers, and cross-month balances.

## Next action and review point

The circular card trial is now accepted for implementation in Tags and Events. Each stage uses explicit Save & next, retained drafts while browsing Review, and saved completion progress. Events reuse existing group identities and support No event. Board remains available for bulk work and inspection. The user subsequently requested and accepted the app-wide Organize area: it replaces Accounts in the sidebar and manages tags, categories, events, accounts and people. Account settings and import controls live in its Accounts subsection. Review and Organize use the same records and editors.

The user has supplied manual CSV exports and asked for monthly copies excluding September. The January–August preparation utility is implemented and described in `docs/csv-preparation.md`. Original data and per-file results remain private. PC export date/time interpretation still needs validation against the bank's displayed transaction dates; no timezone correction was inferred. Export automation remains unverified after browser tool failures.

The user has accepted the overall sixth-trial experience and requested the first operational desktop import milestone. Electron + React and a SQLite-backed importer are implemented with three bank adapters, explicit account routing, cautious overlap review, source provenance, and immutable monthly revisions. Native Electron integration and synthetic recovery checks are now separate from prototype tests; see `docs/desktop-imports.md`. The latest completed month is loaded locally as a trial, with source-specific results kept private.

“Clear the Dropbox” is implemented as clearing successful app-owned intake copies after archive publication. Downloads originals remain untouched. This is a local intake workflow, not a Dropbox cloud integration. Month boundaries use exported calendar dates pending statement comparison.

The user has now requested integration of the accepted review prototypes with imported snapshots. The persistent Review workspace implements tags and split portions, independent category views, event groups, a financial task inbox, people and agreed shares, repayment allocation across months, and explicit transfer pairing. Matching amendments preserve decisions. See `docs/desktop-review.md` for implemented behavior and limits. Next: try organizing a real month and refine the workflow from that experience. Net personal spending by tag, sender recognition, automatic tagging, and backup/restore UI remain open.

Repository setup is complete when a private GitHub remote exists, the initial files are pushed, and the working tree is clean. Product discovery and application implementation remain open.
