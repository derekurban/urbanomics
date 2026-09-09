# Direction note

Updated: 2026-09-09

## Current request

Create a new `urbanomics` GitHub repository in the current working directory, restart from scratch, and use the wayfind process to establish a useful direction.

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

### Latest user feedback and current trial

The user liked the starting point and requested these changes:

- Compact import: show included/excluded counts as quiet plus/minus subtext, without previews of row contents or a pre-review monthly breakdown.
- Incoming money receives a purpose: general income, job income, selling something, or repayment of an expense.
- A repayment can cover multiple expenses in a shared collection or trip.
- People are reusable entities. Explicitly recognized e-transfer senders can be remembered and brought into linked expenses.
- Expense shares should be adjustable with sliders, initially split equally by participant count.
- Improve spending views later; focus now on import and review.

`prototypes/review-flow.html` is the current trial. The earlier `monthly-flow.html` remains available as design history. The sample demonstrates a $180 payment covering Alex's $60 dinner share and $120 cabin share. Remembering the exact sample sender recognizes Alex on the next transfer, without guessing that transfer's purpose.

The sliders preserve each expense total while redistributing the remaining shares. This interaction, the oldest-expense-first allocation suggestion, and hiding spending until review is complete are assistant design choices to try, not individually confirmed requirements.

The first useful experience may be: select a month, review a small number of unresolved money movements, and understand personal spending separately from cash paid and money owed back.

The trials record the user's agreed share as personal spending, and track the friend's share separately as owed back. A repayment settles that balance without changing spending again. The user has supported the general direction, without explicitly resolving every timing case.

## Open questions

1. Does the revised incoming-payment flow make expense and group repayment management feel natural?
2. Do per-person sliders that redistribute the remainder feel right for two and three people?
3. Should a group repayment fill the oldest outstanding expenses first, or should another allocation default be used?
4. Later: real file selection, statement formats, persistent storage, recurring arrangements, transfers, and cross-month balances.

## Next action and review point

Let the user try the synthetic monthly workflow and react. Change the interaction before adding architecture if needed. Actual file selection, preview, durable import, and multi-account coverage remain future work; none has been validated by this prototype.

Repository setup is complete when a private GitHub remote exists, the initial files are pushed, and the working tree is clean. Product discovery and application implementation remain open.
