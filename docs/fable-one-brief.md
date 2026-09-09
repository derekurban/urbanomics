# Urbanomics: tags for transactions, categories for insights

## Goal

Improve Urbanomics so the user can quickly describe what each transaction paid for, then explore the same data through useful category views. Keep transaction tagging independent from the organization of insights. Build a working next experience trial using synthetic data, starting from `prototypes/board-flow.html` and the rules in `AGENTS.md`.

## Product model

Transactions are the source records. Expenses and incoming payments can each have multiple reusable tags. Tags carry portions of the transaction amount. With one tag, it receives the full amount; with several tags, default to an equal split. Preserve exact cents, assigning rounding remainders deterministically. Equal splits are estimates, not claims about individual receipt items.

Keep the existing adjacent-divider control for optional adjustments, with dollar/cent precision and a visible Split evenly action. Do not silently discard a manually adjusted split when tags change; make the resulting redistribution reviewable.

Categories organize insight views over selected tags. Editing a category's name or included tags must not rewrite transaction tags, allocations, event memberships, or repayment links. A transaction does not need a separate category assignment. The previous prototype's rule that every tag belongs to exactly one category is superseded.

Recommended design default to try: the same tag may appear in several category views. For example, Groceries could appear in both Food and Essentials. Such views can overlap, so their displayed totals must not be added together to produce the overall spending total. Within any selected view, count each matching transaction-tag allocation once.

Event groups remain separate collections of whole transactions, such as Mountain weekend. They support event organization and repayment selection; they do not own tags or define category views.

## Experience to build

- An Organize workspace with a Needs tags queue, visible tag contents, multi-selection, and drag or click assignment. Tagged transactions leave Needs tags but remain easy to find and edit. Mixed purchases show their allocated portions without appearing to be duplicate transactions.
- A separate Insights workspace with editable category views. Let the user choose which tags each view includes, inspect tag contributions, and drill into the underlying transactions. Changing a view should feel like changing how one looks at the data, not reclassifying it.
- Keep the compact import, event grouping, and Deduct & balance workflow. Rename the transaction-classification stage to Tag or Organize so “category” consistently means an insight view. Category setup should not block transaction review.
- Preserve the unified repayment picker: selecting an event checks all its eligible expense members; excluding one makes the group partially selected. Use one set of expense IDs to prevent duplicates. Saving a repayment must leave expense review flags unchanged.

Give the new experience a coherent layout and clear language rather than adding more permanent panels to the existing screen. Keep the options visible, support keyboard interaction, and make the layout work on desktop and narrow screens.

## Concrete acceptance examples

1. Tag a $240 Walmart expense Groceries and Furniture. The default is $120 each; the optional divider can change that to $140/$100 while preserving $240.
2. A Food view including Groceries shows only Walmart's grocery portion, not the entire purchase. A Home view including Furniture shows the furniture portion.
3. Add Groceries to an Essentials view. Food remains unchanged, Walmart remains one transaction, and the overall total stays $240. A combined selection of overlapping views still counts the grocery portion once.
4. Rename or delete a category view. Transaction tags and amounts remain intact.
5. An incoming payment can have multiple tags, but those tags cannot turn a repayment or an internal transfer into earned income. Financial purpose and tag description are separate.
6. Existing event selection, allocation caps, cent conservation, unassigned e-transfer income, and independent expense review behavior still work.

## Accounting and scope

Keep gross cash amounts, personal spending, repayments, and income distinguishable. Category views should not change the underlying financial interpretation. Net personal spending by tag still needs an explicit rule for applying expense-level repayments to tag portions; do not silently invent receipt-level attribution. For the first trial, label gross tag breakdowns clearly and preserve the existing whole-expense balance view.

Use synthetic examples only. Real imports and persistence remain outside this UI trial. Deliver the working prototype, focused calculation checks, a short record of design decisions and unresolved questions, and a preview the user can try. Read the prior trial notes for context, but treat this brief as the latest product direction.
