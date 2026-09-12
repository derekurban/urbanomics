# Categories and tags

Transactions carry tags with exact-cent portions. Each tag has zero or one broad category parent. Categories aggregate these portions; they never own another copy of the amount. Ungrouped tags let tagging happen before organizing the hierarchy. Moving a tag changes its current category rollup, including historical reporting, while preserving source records, saved portions, rules, events, transfers and repayments.

## Management

Organize → Categories & tags shows each category and its tags. Create or edit both layers, drag tags between categories, or use the per-tag Move selector. A shared tag editor also edits its parent. Search matches parent and tag names. Referenced tags cannot be deleted; move children before deleting a category. The Food & Personal starter creates the user's example definitions and groups exact case-insensitive name matches only when they have no parent. It does not overwrite existing parents, rename existing definitions or assign transactions, and repeated use is idempotent.

## Review interaction

Review → Tags uses a 190 × 174 card, 86px category bubbles and 76px tag petals. The stage keeps its height; labels clamp with full names available to accessibility tools and tag tooltips. Hover or focus a category to open its petals; drag the card through a category and drop onto a tag. A category itself never saves an assignment. Pointer release onto a tag saves exactly once after successful validation. Click a tag as a keyboard/mouse alternative. First assignment advances to the next unfinished card; changing or removing an existing tag stays on the viewed transaction. Click the card for multiple tags and exact-cent splits; Cancel/Escape preserves data. Escape cancels drawing and closes petals.

Each ring shows up to eight items with explicit overflow controls; search reaches all tags and category names. The canvas has a minimum width with local scrolling at smaller widths rather than shrinking targets into overlaps. Petals clamp inside the stage. Expansion and card-entry animation respect reduced motion. Events keep their calendar workflow.

## Compatibility and reporting

Schema 13 adds `review_entities.parentId` with an empty default and does not rewrite existing financial rows. For compatibility, existing storage kind `category` and rule field `categoryId` continue to identify assignable tags; the new `bucket` kind identifies a broad category. This avoids rewriting existing IDs, configuration rule references, transaction portions or private audit payloads. The former `review_entities.tags` field remains historical and is not used for the hierarchy.

Parent validation only accepts broad categories, so nested categories, cycles and assigning a category as a transaction tag are rejected. Config SQL explicitly includes parentId; legacy seeds without that column remain valid. Parent definitions are approved configuration, while transaction assignments stay local.

Dashboard offers Categories and Tags. Category rollups sum the already-calculated tag gross/net/repayment portions, so sibling tags retain exact-cent rounding. Filters expand parents to a union of child IDs; selecting overlapping parent/leaf definitions never doubles an amount. Drilldowns contain each transaction once. Internal transfers, fees, reimbursement timing, currencies and source drilldowns keep their existing definitions.

## Validation

`npm test` includes schema upgrade preservation, starter idempotence, parent validation, deletion safeguards, configuration-only round trips and category rollup conservation after repayments. `npm run test:orbit` exercises two-motion dragging, single saves, cancellation, first-only advance, tag removal, modal splits, hierarchy drag/move, protected deletion, reduced motion, fixed geometry at 900px and restart persistence using synthetic data. Organize, Rules and Dashboard retain separate Electron regression checks. Real-data checks may inspect records and configure the requested definitions but never classify transactions for testing.
