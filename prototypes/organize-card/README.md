# Open card study

October 2, 2026. Ten layouts for the opened row in Organize, side by side on one page. The describe box the user likes stays exactly as it is; everything under it varies. Synthetic data only, nothing saves, disconnected from the application. This is the manual round; a second round will explore where intelligent suggestions sit in whichever layouts survive.

Run from the repository: `node node_modules/vite/bin/vite.js --config prototypes/organize-card/vite.config.mjs`, then open http://127.0.0.1:4185. `?v=3&s=repay` opens a variation and scenario directly. `node prototypes/organize-card/check.cjs` screenshots every variation for two scenarios under ignored `private/validation/organize-card-*`.

## Scenarios

Untagged expense (City Power, nothing done yet, a tag used before for this name). Split expense in an event (Mountain cabin: two tags, a gap, a split that follows Cabin weekend, one person settled and one still owing). Money in repayment (e-Transfer from Sam: part repayment, part gift, a rule that already notes Sam). Linked transfer (principal and fee, nothing else editable). Rule-suggested expense (Ritual coffee: tagged by a rule, waiting for confirmation).

## What every variation must show

The amount's parts and the unsorted gap. The split: who, how much, repaid, still owed, your share, whether it follows the event. The event. The rule state in three forms: none ("Remember" opens a preview of exactly what rule would be created: the match, the direction, the tag percentages, person and event, the review mode, and whether to apply it to past matches), exists (name, match, count, Review), suggested (Confirm or Edit). The original description, account, date and a way to the source file. For money in, the "paid you back for…" candidates.

## The ten

1. Baseline: what ships today.
2. Ledger line: one row of pills, status at the right, everything else behind Details. Minimal height.
3. Money and context: amount on the left, context rows (event, split, rule, source) on the right, each with its own action.
4. Receipt: a narrow till-receipt column with lines, a total, and split, event and rule as footers.
5. Facts: four facts with done or open marks that expand in place. Shows what still needs you.
6. Proportional chips: the chips are the bar; avatars for the split; event and rule as pills.
7. Form: labeled fields in a grid. Nothing moves.
8. Focus header: the strip becomes a full-width header band; three tiles for split, event and rule; parts as rows.
9. Inspector: a docked right panel with tabs instead of an expanding row, so the list stays readable.
10. Console: text-first facts with key hints, for keyboard sorting.

## Interaction models behind them

Rows that expand (1, 2, 3, 4, 5, 6, 7, 8, 10) keep the context of neighbours, which matters for transfers and trips. A docked panel (9) keeps the list stable at the cost of a second focus area. Status-first layouts (2, 5, 10) answer "what is left" before "what is here". Amount-first layouts (1, 3, 6, 8) make proportions the primary object. Form (7) and Receipt (4) trade motion for predictability.

## Round two: no repeats

The user liked 1, 3, 8 and 9 but not the duplication between the closed row and the open card. Round two (the default view, `?round=2`) treats the closed row as the open card's header: name, amount and strip carry view-transition names, so opening a row moves them into their open places instead of drawing them twice, and the browser animates the morph. Click any row to open it; `check2.cjs` captures each layout and a mid-transition frame.

1. Strip grows: the row's strip drops under the name and grows into the editor; original and date fold into the subtitle; chips carry the editable amounts.
2. Band: the row becomes the band; name and amount sit on plates over it; tiles and part rows beneath.
3. Halves: the header line never changes; context grows under the name, parts under the strip, status under the amount.
4. Lift: name, amount and strip lift into a docked panel; the list keeps a slim "editing in the panel" marker.
5. Strip is the editor: segments take their own amount field and remove control; one line of facts beneath, each opening only its own panel. No parts list.
6. Band with a rail: the band from 2 with the context rail from 3.

Strips in 1, 2, 3, 4 and 6 show labels only; the amounts live once, in the chips or part rows. In 5 the strip is the only place amounts appear.

## Round three: Halves and Strip-is-the-editor, varied

The user kept 3 (Halves) and 5 (Strip is the editor) from round two, rejected the full-width band headers, and asked for less clutter with the source tucked away. Round three (the default, `?round=3`) varies only those two ideas. In every layout the header line is the card header, the strip is the tag editor (amount fields inside the segments, boundaries draggable), event, people and rule each have their own place, and the original description, account, date and file sit behind a small info mark next to the subtitle. `check3.cjs` captures each.

1. Halves, strip in place: strip grows in its column; describe box and three context rows under the name; whatever you open under the strip; status under the amount.
2. Strip wide, three facts: strip drops wide under the header; describe; split, event and rule as three quiet columns that open a panel beneath.
3. Strip wide, one line: as 2, but the facts are one sentence of plain links.
4. Strip in place, one line: the header stays and the strip grows in its column; beneath, the describe box and the one-line facts.
5. Describe and facts together: strip in its column; the describe box and the facts sentence share the one extra line; anything opened appears under it.

## Round four: the four natures, playable

The user agreed with a higher-level model and asked for playable approaches to test it. Every bank line is one of four natures: Move (between your own accounts, including ones you don't import), Spend (tags with exact amounts, a split with people, an event, a payee when you paid a person back), Receive (income tags, event) and Offset (a person settling what they owe, or a vendor refund). People carry a balance: the shares they owe minus what they have settled; a settlement draws that balance down and is attributed oldest-open-share first, visibly and editably. Events are a bounded context with participants, not a nature. Rules learn spends and receives only.

Round four (default, `?round=4`) is one in-memory ledger of thirteen lines with real operations (`model4.mjs`) and three approaches to the same card (`round4.jsx`): Undo and Reset sit top right.

1. Nature first: a segmented choice of nature, suggested from evidence and switchable; the card takes that nature's fixed slots, all visible.
2. Parts first: one box adds typed parts (tag, person, event, account); the nature is read off the parts; split, event and rule stand to the right.
3. Who first: the first question is who is on the other side (vendor, person, own account); the answer decides the card; a people balance panel sits beside the list.

`check4.cjs` drives all three through the same tasks: tag City Power, settle Sam's e-transfer, pair the credit card payment, move the brokerage contribution to an untracked account (investment-account importers are not supported, so the brokerage is not imported).
