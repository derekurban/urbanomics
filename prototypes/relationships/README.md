# Per-transaction allocation vial — September 18, 2026

The default page at http://127.0.0.1:4183 now runs the user's new vial direction. The earlier Focus/Desk exercise is preserved at http://127.0.0.1:4183/?view=relationships and remains documented below. This is another disposable, synthetic, session-only trial; no Electron or real finance changes.

A transaction with no explicit layers automatically opens the add chooser, including after the final layer is removed. Explicitly closing it is respected until the default state is newly entered. Clicking a position on the bar prefills the fraction of the whole transaction measured from the bottom (0%) to the top (100%), rounded to cents. Hover previews the percentage and amount. The chosen layer is capped by Other and any expense-share capacity, with an explicit cap explanation. Whole-receipt transfers retain their full-amount behavior and explain the exception. Keyboard activation uses available money.

Hovering over an editable bar reveals a cursor-following Add layer cue; clicking any segment or pressing Enter opens the chooser and focuses its search. Existing amounts remain unchanged until a layer is selected and added. Transfer-locked bars do not advertise this action. Divider drags remain separate from add clicks.

Every transaction starts with its entire amount in gray Other. Each inbox row has its own miniature breakdown; selecting it opens its own vertical stacked bar and exact amounts. Add layer opens one chooser for direction-appropriate tags, expense connections, or eligible whole-receipt transfers. Additions consume Other; removal and amount reductions return cents to Other. Adjacent draggable dividers support dollar/cent precision and keyboard arrows, with separated handles and leader lines for tiny layers. All amounts sum to the selected transaction, independent of other rows.

A connection deducts from the target expense subject to sender-share and gross-capacity limits. The target retains its original tag breakdown and separately displays received repayments and still-fronted amount. Whole incoming transfers derive an outgoing principal/fee breakdown and are excluded from income/expense tag pools. Optional View totals exposes separate income tags, gross expense tags, recoveries, principal and fees; it is never the selected transaction's bar. Default Other is a valid provisional classification and can explicitly be kept. No silent conversion of a repayment into a second tag amount.

The liquid metaphor is visual: layer order follows addition, with Other at the bottom. This trial does not impose physical density or infer priority. No arbitrary partial transfers, currency conversion, payables, refunds, or new entity creation in this iteration. Context is shown from the fixture, not edited here. Earlier broad relationship tooling remains in the prior study. Zero-value explicit layers are preserved and editable.

Validation: `node --test prototypes/relationships/vial.test.mjs` and `node prototypes/relationships/check-vial.cjs` (server running). Verified mixed receipt allocation, isolated transaction states, reverse expense effect, exact amounts, keyboard/pointer divider movement, add/remove/undo, transfer fee and unlink, optional totals, reduced motion, and browser screenshots. User reaction to this new surface is pending.

---

# Relationship workspace trial — September 18, 2026

Run `node node_modules/vite/bin/vite.js --config prototypes/relationships/vite.config.mjs` from the repository root; open http://127.0.0.1:4183.

Disposable React/Vite prototype, synthetic CAD data only, no app imports, no APIs, no SQLite, no filesystem data access, no persistence across reloads. Working changes apply immediately within the sample and support 40-step Undo. Reset is undoable. Nothing is integrated into Electron.

## Decision to explore

The user challenges the earlier idea that every attention card should ask one question. They value freedom to model relationships conveniently and want evidence that the UI can handle complex work at scale. They have not accepted a new architecture or interaction model.

This trial revises that hypothesis into a record workspace with directly editable relationships. Focus and Desk share the same controls, amounts, records, and working state. Focus provides one bounded card plus a navigable queue. Desk retains the ledger, people and event context beside it. No mandatory order, question wizard, or completion gate for insights. Filing is an explicit prototype queue acknowledgement, not a proposal for replacing the production financial completion predicates.

Try both layouts for 5–10 minutes using The exercise. Start with either layout; switching preserves state, Reset enables an independent retry. Compare loss of context, navigation backtracking, ease of correcting a connection, and whether the next useful action is obvious. Do not interpret correctness checks or our own preference as user acceptance.

## Scenario

- Cabin $600: Me / Alex / Maya each owe $200.
- Dinner $180: each owes $60.
- Superstore $120: Me $80 / Alex $40. Intended tags: Groceries $80 / Home $40.
- Alex sends $275: cabin $200, dinner $60, Superstore $10, gift income $5.
- Maya sends $200: cabin $150, dinner $50. Maya still owes $60; Alex still owes $30.
- Maya paid $90 for tickets outside your accounts: your payable is $30. Your outgoing $30 settles it; it is not a second expense.
- Savings outgoing $502 links to chequing incoming $500 with an explicitly accepted $2 fee.
- $2,800 salary and optional 120 routine expenses have inspectable fixture suggestions; exclude individual rows and apply the rest in one operation. Batch undo restores all rows. This is a workload example, not an actual rule engine or a performance benchmark.

After the scenario (before loading routine items): paid-for purchases $900, repayments $470, cash still fronted $430, friends owe $90, your outstanding payable $0, identified income $2,805, separate transfer fee $2. The $30 payable settlement remains separate from bank purchase totals. Until paired, the candidate outgoing transfer is provisionally included in spending, as labelled.

## Genuine behavior in this prototype

- Integer-cent allocations, multiple expense targets, mixed income remainder, person-share capacity guards, editable reverse connections from expenses.
- Event shortcuts add unique expense IDs once using remaining shares in display order. Event membership changes never rewrite existing money links.
- Tags describe original purchase amounts. Shares describe responsibility. Repayments describe actual received money. These dimensions are not added together or subtracted twice.
- Payables are explicitly non-bank bills paid by someone else; cannot become incoming repayment sources.
- Transfer principal is excluded from expense totals after linking. Fee is retained separately, with unlink and undo.
- Suggestions cannot overwrite manually allocated or tagged records; applying a repayment doesn't reopen the target's already-filed tagging work.
- Navigation, filtering, explicit filing/revisiting, batch exclusion, instant totals, keyboard amount inputs, reduced motion, drag or click to connect.

## Boundaries / what this cannot establish

No real imports, matching algorithm, production save lifecycle, currency conversion, partial internal transfers, automatic netting of mutual debts, arbitrary creation of records/people/events, refunds, cash-deposit reconciliation, source changes, audit history, or production-level scale. People and initial agreements are seeded. The allocation rail is visual with exact inputs, not the production draggable divider. Existing Rolodex/envelope motion is intentionally not ported; this trial tests navigation and relationship editing. Mobile isn't targeted.

Both layouts may be insufficient. If dealing with a shared event requires repeated hopping among cards, explore an event-level settlement workbench next rather than adding more nested steps. If straightforward items still demand attention individually, improve batch automation before expanding the queue. If Focus works for simple items but Desk for connected work, prefer a hybrid instead of forcing either everywhere.

## Checks

`node --test prototypes/relationships/model.test.mjs`

`node prototypes/relationships/check.cjs` (server running)

Checks cover exact scenario totals, capacity errors, no double counting, stable event allocations, batch selection, both layout views, reverse editing, undo, pointer connection, reduced motion, and visible desktop card actions. Screenshots are under ignored `private/validation/relationships-*`. User experience remains untested until the user tries it.
