# Inbox experience, third trial

Source: `prototypes/inbox-flow.html`. This is a self-contained HTML fragment for the Codex preview, using synthetic data and in-memory state only.

## Changes requested by the user

- Compact import across five accounts: two banks with chequing and savings, plus Mastercard.
- Groups before review, with the same group editor accessible inside review.
- Visible selectable buttons in place of dropdowns.
- Horizontal people avatars with names underneath.
- Sender selection followed by one-expense or group repayment selection.
- Drag-and-drop expense grouping.
- Share dividers that change only neighbouring sections.
- A review inbox containing only unfinished Money in and Money out tasks.

## Trial behavior

The import displays one compact row per sample account with included and excluded counts. Thirteen synthetic movements are represented across five accounts. Known income and expense classifications are preconfigured. Two own-account pairs are represented: a savings transfer and a Mastercard payment; neither contributes to income or spending. This depicts automatic triage without implementing a general bank-file parser or rules engine.

The next step is Groups. Expenses can be dragged or selected and moved into a group. In this iteration each expense has one group; moving it removes it from its previous group. Creating another group is supported. Group membership takes effect immediately and does not rewrite existing repayment links. The inline group editor preserves the currently selected review task.

Review starts with four attention items: two incoming payments and two expenses. Saved rules have already handled the other synthetic movements. Saving a completed review removes it from the inbox and advances to the next task. A partial repayment remains until fully assigned. Undo restores the last review and its financial changes. Once all tasks are resolved, the empty state links to reviewed spending.

People use initial-based avatars. Remembering the explicit sample sender string preselects the person on the next matching payment without deciding its purpose. Income, repayment, category, target, and scope choices are visible buttons. People can be added inline or in their own page.

Splits use a segmented bar with native range controls styled as dividers. Each divider changes exactly two neighbouring shares, preserving their combined amount. Other people are unaffected. Dividers cannot cross each other; advanced exact entry also checks that boundary condition before saving. Participant changes still default to equal shares. A saved split cannot fall below an existing repayment.

## Verified example

A $360 cabin starts at $120 each for You, Alex, and Sam. Moving the first divider to $200 yields $200 / $40 / $120. Moving the second divider to $280 yields $200 / $80 / $80. Dragging that second divider farther keeps your $200 unchanged.

## Verification

- Eight Node tests exercise the actual embedded model: adjacent-only changes, the $200 example, crossing constraints, cent conservation, inbox completion, partial payments, group membership moves, own-account matching conditions, repayments, and paid-share limits.
- Browser checks verified batch import, groups before review, actual pointer dragging between groups, click-based moves, visible choices, sender avatars, direct divider dragging, exact divider entry, review completion, undo, sender recognition, group repayment, inline group management, and the empty inbox.
- At 360px, the expense panel fits within the page. The avatar row scrolls within a 245px viewport over 428px of content, and the full split bar remains visible.
- JavaScript syntax validation passed.

Run: `node --test tests/inbox-prototype.test.cjs`.

## Limits and next evidence

Real file selection, account detection, parsing, archives, persistent records, and automatic financial rules are not implemented. Account names and file contents are synthetic. The matching predicate in the model requires a shared explicit reference, opposite amounts, distinct accounts, and the same currency; the UI's matched pairs are predefined fixtures. Production imports may lack such shared references and need an unresolved-transfer workflow rather than forcing the movement into income or reimbursement.

The trial does not support a full ledger/history editor, undo beyond the last review, mixed income-and-repayment treatment within one incoming payment, refunds, multiple currencies, cross-month balances, or multiple simultaneous groups for one expense. Reloading discards all changes.

Next, let the user try the review and divider interactions. Actual bank-file ingestion should follow a settled experience and verified source formats, not be inferred from this trial's static import labels.
