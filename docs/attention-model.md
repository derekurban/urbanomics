# What needs the user's attention?

September 15, 2026. Wayfind checkpoint based on current code, workflow documentation and the user's feedback. This is a proposal for the next interaction trial, not an implemented inbox or a change to financial records.

## User direction

The Rolodex is a tactile list. Its value is making useful work inviting: progressing, making decisions and clearing items. The user wants each card to represent something needing attention, with convenient controls for that particular issue. Animation alone does not establish that the workflow is useful or understandable.

## Project context

Urbanomics imports local bank exports into deduplicated monthly snapshots, preserves originals, and maintains a ledger of transactions and relationships. Organize manages accounts, people, events, aliases, rules and the expense category/tag hierarchy, plus income tags. Review currently offers Transfers → Events → Income → Expenses → Overview. Dashboard reports cash crossing the account boundary and spending after repayments, alongside agreed shares and outstanding amounts.

The implementation already derives independent facts about transactions rather than using a universal reviewed flag. A transaction can be tagged, in an event, shared and partly reimbursed at once. Linked transfers leave income/expense queues. Rules can fill missing tags/person associations on newly imported rows; person recognition does not establish a split, debt or repayment purpose.

Some older documentation describes direct categories without tags. Current hierarchy and workflow sources take precedence. This checkpoint inspected code and documents, not the user's private ledger or live unresolved counts.

## Proposed attention inventory

| Area | When human input is useful | Question and suitable surface | What would resolve this task? |
| --- | --- | --- | --- |
| Import exceptions | Account routing is unknown/ambiguous; an export failed; duplicate-looking rows need interpretation. | Which account? Is this an additional payment? A file summary or side-by-side comparison, linking to Snapshots for technical failures. | A valid account/duplicate decision is saved, or the source problem is corrected and processing succeeds. One file problem should not create hundreds of transaction cards. |
| Transfers | A plausible own-account pair needs confirmation, several candidates compete, or a linked pair has an unexplained difference. | Are these the same movement? Show both accounts, dates, amounts and difference together, with candidate choices. | Explicit Link; or an explicit decision that a suggestion is not a transfer. Rejection memory is a proposed capability, not established behavior. |
| Expense tagging | A non-transfer expense has no tag or the user has opened it for correction. | What did I buy? This is the strongest fit for quick card sorting. Offer a split editor for mixed purchases. | Valid tag portions are saved. The broad category follows the tag's parent; it is not a second classification chore. |
| Incoming purpose | Money received is neither a linked transfer nor fully explained as income/repayment. | What is this money for? Visible choices for income type or expense reimbursement, with transfer inspection when relevant. | Purpose is saved; any remaining amount stays explicit rather than being silently treated as allocated. An income tag alone does not set purpose today. |
| Repayment allocation | A receipt is meant to reimburse spending, but target expenses or amounts need selection. | Which costs does this cover? Keep the receipt as an anchor and open a searchable multi-selection workspace with an allocation summary. Events select unique expense leaves. | The person and allocation are saved within receipt/expense capacities. A remainder remains unresolved or is explicitly handled under a future agreed policy. |
| Shared-cost agreement | The user knows an expense was shared and needs to record who owes what, or amend an existing agreement. | Who is responsible for this cost? People and exact split controls, with existing repayments visible. | Agreed shares are saved. Tagging or recognizing a person cannot establish these shares. Ordinary personal purchases need no extra confirmation. |
| Event organization | The user is organizing a trip/event, or choosing to inspect a relevant date suggestion. | Which transactions belong here? An event-centered calendar/list with bulk selection is better than a compulsory card for every transaction. | Selected memberships are saved. Being outside all events is valid. Event membership by itself never allocates a repayment. |
| Automation and naming conflicts | Aliases overlap, rules propose competing mappings, or an existing-data preview is ready to apply. | Which definition should apply? A grouped exception card can open Organize's existing preview/change/apply tools. | The conflicting definition is corrected and the affected set is rechecked, or the approved preview is applied. Avoid one identical card per affected row. |

## Do not turn every absence into work

- No event, no person and no alias are not automatically errors.
- An expense with no agreed split must not automatically produce an unpaid debt.
- An outstanding, already-recorded repayment can be a waiting item. It becomes actionable when new information or a receipt needs a decision. Reminders are a separate, optional design question.
- A configured rule that already handled a row should reduce manual work. A rule's success does not require a redundant confirmation card by default.
- A linked transfer is not an untagged expense/income task. An accepted fee should not become an endless discrepancy card merely because it is nonzero.
- Snapshot presence does not prove complete coverage. Missing-month or balance-reconciliation alerts need evidence the app does not currently establish.
- Unused tags, disabled rules and clean-up opportunities belong in optional maintenance rather than the main decision count.

## Proposed card contract

A card represents one actionable question and references the relevant transaction, pair, file, event or conflict set. Its front explains **why it is here**, shows enough evidence to decide, and offers a concrete action. The surrounding surface adapts to the question. Some cards have a quick choice; others open a larger comparison or allocation workspace.

Prefer focused queues such as Tag expenses, Explain money in and Match transfers, reached from a compact attention summary. This preserves repetition and muscle memory rather than changing the controls radically on every swipe. A transaction with multiple questions should expose the remaining questions in context, without duplicating its amount in totals or repeatedly asking for settled facts.

Prioritize real dependencies: resolve import errors before reviewing absent records; inspect a plausible transfer before prompting for income/spending classification; choose reimbursement purpose before allocating it. Do not make every transaction pass every stage, and do not hold all categorization hostage to unrelated transfer questions.

Saving should dismiss a card only when its specific question is resolved and persistence succeeds. The envelope can celebrate that successful decision. Cancel and failed saves keep the card and draft. Later postpones the issue without marking it solved. Undo or a correction should bring back only the facts/questions it actually invalidates. Snoozing, suggestion dismissal and a derived attention queue still need design and implementation; they are not current features.

## Example: one relationship, several facts

Illustrative only: a $120 dinner is tagged Restaurants. The user records a $60 share for Alex. A later $70 receipt arrives from Alex.

1. The tagging question is already resolved and does not reappear.
2. The share is agreed; waiting for $60 is not unfinished tagging or an unsaved split.
3. The receipt needs a purpose and target: allocate $60 to the dinner.
4. The remaining $10 is visible. The current app keeps an unassigned remainder; it does not provide a fully specified mixed income/reimbursement treatment for that remainder.
5. Event membership remains optional and does not affect whether the receipt has been allocated.

The card's task can finish while a different question remains. The dashboard must continue separating money received, cost reimbursed, agreed shares and any remainder.

## Decisions still open

- Mixed receipts: how to explicitly explain a remainder as income, an advance, or something still unknown without disturbing saved allocations.
- Merchant refunds: the current purpose choices do not define a dedicated refund flow. Decide whether/how to connect a refund to an original expense and represent it separately from a friend's repayment.
- Suggestion dismissal: what prevents a rejected transfer candidate or irrelevant event suggestion from recurring unchanged?
- How much batching belongs in the attention summary versus the focused stack, and what progress counts: actionable questions, records, or batches. Label these separately.

## Useful next trial

Keep the Rolodex shell stable and give it three real decision surfaces using illustrative data: tag a purchase, inspect a transfer pair, and allocate a repayment. Include an ambiguous transfer, a mixed purchase, an excess repayment and a failed save. The question is whether the user can understand why each item is present, act with little context switching, and understand exactly what clearing it means.

This is a recommendation, not authorization to integrate a new attention system. No further animation polish is needed to answer that question. Existing Organize, Events, Transactions and Dashboard remain complementary workspaces.

## Evidence

- `src/transaction-state.js`: independent saved facts and unassigned receipt amounts.
- `src/ReviewWorkspace.jsx`: income purpose/type, people/shares and multi-expense allocation controls.
- `src/TransferWorkspace.jsx`, `electron/review/transfer-model.mjs`: eligible pending records versus actual candidate matching.
- `src/OrganizeWorkspace.jsx`: existing attention summary mixes conflicts, differences and optional tidy-up items.
- `docs/review-workflow.md`, `docs/tag-hierarchy.md`, `docs/transaction-rules.md`, `docs/desktop-imports.md`: current workflow, taxonomy, automation limits and import recovery.

No new application or financial correctness test was run for this product inspection. The hosted note is a static reading aid, not a live queue.
