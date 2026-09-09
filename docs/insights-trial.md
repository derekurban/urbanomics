# Tags and category views, sixth trial

Source: `prototypes/insights-flow.html`. Synthetic in-memory experience trial; reload resets changes. Implemented by Claude Fable 5.1 through Claude Code from `docs/fable-one-brief.md` (the filename is historical; the requested model is Fable 5.1).

## What changed from the fifth trial

Transaction tagging and insight organization are now separate layers:

- **Tags describe transactions.** Every expense, incoming payment, and internal transfer can carry several reusable tags. Each tag holds a portion of the amount in exact cents, and the portions always sum to the transaction. One tag receives the full amount; several tags default to an equal split with the rounding remainder given to the earliest tags in a fixed order (for example $100.00 across three tags is $33.34 / $33.33 / $33.33).
- **Category views organize insights.** A view is a name plus a chosen set of tags. Views can be created, renamed, given or stripped of tags, and deleted. The same tag may appear in several views. None of these actions touch a transaction, its portions, its financial purpose, its repayments, or its events.
- **Events still collect whole transactions.** Mountain weekend holds dinner and cabin as whole items; events never own tags or define views.
- **Financial purpose is separate from description.** Purpose comes from Deduct & balance decisions: expense, income, repayment of expenses, repayment with an unassigned remainder, unassigned e-transfer income, money in not yet reviewed, or internal transfer. Tags never change it. General income includes the sample bank interest; it is not labelled as exclusively earned income.

The workflow is Import → Organize → Events → Deduct & balance → Insights. After the simulated import every stage is reachable from the navigation, so untagged items, missing views, and unreviewed payments never block one another.

## Interaction decisions

**Organize.** A Needs tags lane sits beside a board of tag lanes. Dropping an untagged item onto a tag gives the whole amount to that tag and the item leaves Needs tags. Selecting items and clicking a lane title does the same without dragging. A tagged portion can be dragged to another tag; if the transaction already has that tag the portions merge. Dropping onto Needs tags clears all of a transaction's tags. Each lane shows its portions, gross totals, and which views include the tag. A search box filters tagged items by name or account so assigned items stay easy to find. Manage tags reveals rename forms and a Remove button per tag; removal is blocked while a tag has portions, and removing a tag also drops it from every view. New tags are created in place.

**Tag editor.** Split across tags or Edit tags opens the portion editor. Toggling tags produces an equal split when the previous split was equal. When the user had adjusted the divider, their amounts are kept: a newly added tag starts at $0.00, and a removed tag's amount moves to newly added tags or, failing that, evenly to the remaining ones. A review notice explains what happened and a Split evenly button resets to equal portions. This makes redistribution explicit rather than silently discarding the adjustment. Dividers move only two neighbouring tags, at $1 or $0.01 precision, with exact dollar positions available. Saving requires the portions to equal the transaction exactly.

**Insights.** The left column lists views with their gross totals and a Combine checkbox per view. Opening a view shows the tags it includes as visible toggles, with a note when a tag is also in another view. Below are gross money out and money in, money in broken down by financial purpose, internal transfers shown separately as moved between own accounts, per-tag contributions, and the transactions with their in-view portions. A mixed purchase appears once, labelled as a portion of its full amount. Clicking a tag row drills to that tag's transactions; Edit tags in Organize jumps back to the editor. Deleting a view asks for confirmation inline and keeps every tag and transaction.

**Combined views.** Checking several views shows one combined summary over the union of their tags. Each portion counts once, and any tag present in more than one selected view is named as counted once. Because views may overlap, their individual totals are never added together; the All tags panel provides the overall gross total and lists untagged transactions that appear in no view.

**Deduct & balance.** Unchanged from the fifth trial apart from wording: repayment selection stores one canonical set of expense IDs, choosing an event checks its expense members, excluding one produces a partial event, incoming members are never targets, allocations are capped, the payment is conserved exactly across expenses and unassigned e-transfer income, and saving a payment leaves expense review flags and tags untouched. The whole-expense personal cost view is preserved here. Internal transfers do not appear in this queue.

## Acceptance examples from the brief

1. Walmart $240 tagged Groceries and Furniture defaults to $120 each; the divider makes it $140 / $100 while preserving $240.
2. Food shows only Walmart's grocery portion and Home only its furniture portion; Walmart is listed once in each, marked as part of $240.
3. Adding Groceries to Essentials leaves Food unchanged, Walmart remains one transaction, the overall total stays $240, and Food + Essentials combined counts the grocery portion once.
4. Renaming or deleting a view leaves transactions, tags, events, and repayment links byte-for-byte unchanged.
5. An incoming payment with several tags keeps its reviewed purpose; a repayment, a mixed repayment, an unreviewed payment, and an internal transfer are never counted as earned income.
6. Event selection, allocation caps, cent conservation, unassigned e-transfer income, and independent expense review behave as before.

## Evidence

Run `node --test tests/insights-prototype.test.cjs`.

- Sixteen tests in the current suite cover the embedded model and UI, including the six acceptance examples above, deterministic rounding, reviewable retagging, tag management, purpose classification, group expansion, caps, dividers, repayment saves, portion moves, and invalid input rejection.
- One structural test confirms the fragment starts with the `urbanomics-insights` root, contains no document scaffolding, external resources, network calls, or storage, and that every CSS selector is scoped to the root.
- One headless walkthrough boots the actual UI script against a minimal DOM stub: import, tag Walmart across two tags, save, visit every stage, add Groceries to Essentials, combine Food and Essentials, delete Essentials, create a view and a tag, and confirm Walmart's portions survive every view and tag change.
- The fifth trial's sixteen tests still pass against `prototypes/board-flow.html`.

The coordinating assistant verified the browser interactions after Fable's handoff:

- Walmart's $140/$100 manual split survives adding a third tag at $0 with an explanation, and survives category creation, renaming, and deletion.
- Adding Groceries to Essentials leaves Food's $140 unchanged. Combining Food and Essentials shows $172 ($140 groceries plus $32 transit), counting groceries once.
- A new Pets tag can be renamed Pet care. A direct pointer drop moves dinner from Needs tags into Dining out.
- Selecting Mountain weekend checks both expenses; saving a repayment with a $1 remainder leaves all four expense reviews pending.
- Desktop Insights and the 360px layout were visually inspected; the page has no horizontal overflow, and the temporary viewport override was reset.

Review fixes: mixed repayment/income transfers now use a distinct gross-flow bucket rather than being labelled wholly as repayments. A new regression test covers partial and overlapping views of those mixed transfers. View names are escaped in transaction tag labels, and unused tags no longer misleadingly say “Only here.” The current sixteen tests and script syntax check pass after these fixes.

## Limits and open questions

Imports, account recognition, and the paired own-account transfer are simulated fixtures. There is no CSV parser, persistence, archive, bank integration, refunds, or cross-month handling. Organization edits, tag management, and view changes have no undo; financial saves keep the one-step undo.

Net personal cost by tag is deliberately not calculated. Repayments apply to whole expenses, and no rule attributes them to tag portions, so every tag and view total is labelled as a gross flow before repayments and shares. Purpose is a transaction-level label; a mixed repayment's tag portions are not split between its repaid and unassigned parts.

Overlapping views remain an assistant design default to test with the user. Tag order in the editor follows the tag list, which also decides which tag receives an equal split's rounding cent. Removing an in-use tag requires moving its portions first; a merge-into-another-tag action may be worth adding later.

Next review point: tag Walmart, watch Food and Home, add Groceries to Essentials and combine it with Food, delete a view, then allocate Alex's payment to Mountain weekend with dinner excluded. Use the user's reaction to decide whether this two-layer model is ready for real import work.
