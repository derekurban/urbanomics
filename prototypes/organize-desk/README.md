# Organize desk study

Integrated into the application on October 2, 2026; see `docs/organize-desk.md`. This folder stays as the disposable study that led there.

October 2, 2026. A disposable, hands-on re-imagining of how money in, out and between accounts gets sorted by hand. It is synthetic and disconnected from the application, its APIs and any real data. Nothing here is accepted or integrated; it exists so the user can feel the interaction before deciding.

Run from the repository: `node node_modules/vite/bin/vite.js --config prototypes/organize-desk/vite.config.mjs`, then open http://127.0.0.1:4184. `node prototypes/organize-desk/check.cjs` drives the running study in headless Chrome, checks the flows below and saves screenshots under ignored `private/validation/organize-desk-*`.

## The idea

The ledger is the workspace. One date-ordered list across every account, and each row carries the **shape** of its amount: a strip whose parts are tags, repayments or a transfer, with a hatched gap for whatever is still unsorted. An unsorted month reads as a column of gaps; a sorted one reads as color. There is no separate inbox, sheet or transfers tab.

Opening a row expands it in place. The context that matters for the decision (the other account's entry a day earlier, the trip's other purchases, the friend's expense) is already on screen above and below.

One box describes a transaction. Type a tag, a person, an event or an account and the box offers the matching kind of thing: tags fill the amount, a person opens "paid you back for…", an account links the twin entry, an event adds context. Enter takes the top result. Most rows are one word and one key.

## Intuitive judgments it is built around

- "That's just groceries." Type three letters, press Enter, the row fills and the next unsorted row opens.
- "That's my own money moving." When a row opens, its likely twin (opposite direction, another account, within 2% and 3 days) is highlighted in the list with a Same money button, and sits first in the describe box. Linking writes both sides and shows the fee.
- "That's Sam paying me back." Type the name; the expenses Sam could be repaying appear ranked (Sam's own first, then those paid before the receipt, nearest first). Apply takes the smaller of the receipt's unsorted amount and what the expense has left. The remainder stays unsorted and can be tagged Gift.
- "That was partly lodging, partly fuel." A second tag halves the first; drag the boundary or type exact amounts. Cents always add up; the gap is never hidden.
- "Those six coffees are all the same." Ctrl-click rows and tag them together.
- "Oops." Every change saves at once and the toast offers Undo; Ctrl+Z also works.

## Provisional decisions to react to

- Immediate save with undo instead of draft-then-Save. Convenient, and reversible per change, but a different contract from the current Organize page.
- Advancing to the next unsorted row only after a row's first sort; later edits stay put.
- Transfer twins are matched symmetrically at 2% and 3 days. A twin whose other account has not been imported yet is offered as a disabled "No matching entry imported yet" rather than a pending state.
- Expense parts keep describing the original purchase after a repayment; the repayment shows as a note on the expense and as a part on the receipt.
- Agreed shares, rules, aliases, manual cash and events management are out of scope here.

## What the check covers

Tagging completes a row and advances, a split conserves cents through typed amounts and a keyboard boundary move, an event adds to a split row, a repayment takes the receipt's unsorted amount and leaves a taggable remainder, both twin paths link both sides with the fee, undo restores, batch tagging applies once per row, the Unsorted filter, dark mode and an 820px layout. It establishes that the sample behaves, not that the user prefers it.
