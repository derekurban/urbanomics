# Organization board, fifth trial

Source: `prototypes/board-flow.html`. Synthetic in-memory experience trial; reload resets changes. Superseded by [the sixth trial](insights-trial.md), which replaces fixed category ownership with independent category views.

## User direction and proposed interaction

The user wants to see category and group contents, have assigned items leave the unassigned list, simplify group/expense repayment selection, and estimate multiple tags within a purchase using dividers.

The category board has a Needs tags lane alongside category panels. Each category contains tag lanes with their actual transaction portions visible. Dropping an unassigned transaction into a tag allocates the whole amount and removes it from Needs tags. Select-and-click destinations offer an alternative to pointer dragging. An assigned portion may be moved to another tag; if that tag already exists on the transaction, the portions merge without duplicating money. Dropping into Needs tags clears that transaction's tags.

Edit tags opens a separate amount editor. Tags start equally split when their selection changes. Adjacent dividers support dollar or cent precision, with optional exact positions. Saving requires the tag amounts to equal the original transaction amount. One $240 Walmart transaction can show $140 in Groceries under Food and $100 in Furniture under Home. The board labels each as part of the original $240. Category totals sum portions and distinguish money out from money in; these are gross organization totals, not final personal spending.

The tag hierarchy is an assistant proposal: each tag belongs to one category, and categories are derived from the transaction's tags rather than assigned independently. Tag/category definitions remain fixed synthetic choices. Event groups collect whole transactions, including incoming payments, independently of tags. The grouping board shows actual members and an Ungrouped lane. Adding the first group removes the item from Ungrouped. Items can belong to multiple groups; Remove acts on one membership, while dropping into Ungrouped clears all memberships.

Repayment selection stores unique expense IDs as its source of truth. Choosing a group checks all eligible member expenses. Individual checkmarks and group checked/partial/unchecked states derive from the same set. Selecting a partial group fills its missing members; deselecting a full group removes its members. Overlapping groups immediately reflect the remaining selection. Incoming group members are excluded from repayment targets. Group membership is organizational; payment allocation remains an explicit action in Deduct & balance.

The existing payment editor still permits unassigned e-transfer income and caps allocations to available expense amounts or agreed sender shares. Payment saves do not review expenses or alter tags.

## Evidence

- Sixteen tests exercise the embedded model, including inherited repayment and divider checks plus canonical group selection, partial/overlapping groups, tag sum validation, category rollups, cent-preserving tag moves, and independent event membership.
- Browser pointer tests moved Dinner at Juniper to Dining out and an incoming payment to Mountain weekend. Each disappeared from its unassigned lane and appeared in the destination contents.
- The Walmart editor saved $140 Groceries / $100 Furniture. The board displayed those portions and Food's total included the separate $120 dinner only once.
- Selecting Mountain weekend checked dinner and cabin; deselecting dinner produced a partial group with one of two expenses selected and allocated only to cabin.
- The tag slider moved from $120 to $121 in dollar mode, then $121.01 in cent mode, preserving the $240 total.
- Desktop board and mobile tag editor were visually inspected. At 360px the board and editor fit with no horizontal page overflow. The temporary viewport override was reset.

Run `node --test tests/board-prototype.test.cjs`.

## Limits and next decision

Imports, known classifications, and transfer pairing remain simulated. There is no real CSV parser, persistence, archive, bank integration, refunds, or cross-month handling. Only groups can be created in the UI; category/tag management remains future work. Dragging has no edge autoscroll, so select-and-click is useful for off-screen destinations. Organization edits have no undo history; financial saves retain the previous trial's one-step undo.

Repayments still link to whole expenses, not individual tags. How a repayment should affect net spending across the expense's tag portions is deliberately unresolved; this trial does not invent that reporting rule. Changing selected tags or repayment targets recomputes the initial equal estimate, after which the dividers can be adjusted.

Next review point: sort dinner, split Walmart, find both portions on the board, and assign a payment to an event with one expense excluded. Use the user's reaction to decide whether this organization model is ready for tag management and real import work.
