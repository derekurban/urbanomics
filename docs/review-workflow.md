# Review workflow

The current workflow is **Transfers → Events → Income → Expenses → Overview**. Steps remain freely navigable; there is no generic reviewed flag or mandatory completion gate. Review keeps the selected month, with All months available for allocations spanning periods. Manual transfer matching searches across imported months.

- **Transfers:** pending incoming records on the left, possible outgoing records on the right. Filter receiving account, search receipts, choose an amount band and optional date window, or show only receipts with matches. Drag a candidate into the From/To dock or click it; inspect either source, then Link (Ctrl/Command+Enter also works). Dropping only selects. A successful link advances and offers Undo. Linked history and the Auto-link lab remain available. Existing financial assignments, stale versions and repayment reservations retain their protections.
- **Events:** optional calendar membership and event creation with dates. Linked transfers are excluded from this selection view; existing event associations are preserved.
- **Income:** identify income purpose, add income tags, or allocate a repayment to one or more expenses/events. Repayment tags do not change their allocations. Unallocated incoming amounts remain visible.
- **Expenses:** use the radial tag cards, or open transaction settings for split tags. People & repayments opens the existing share/claim editor and allocation inspection. First tagging advances; editing an already tagged transaction stays in place.
- **Overview:** includes untagged transactions in the selected period. Per-currency cards report boundary money in/out, separate manual cash, incoming specified/allocated/unassigned amounts, gross and repaid expenses, claims by others, unclaimed portions and outstanding repayments. Costs include later repayments against visible expenses, explicitly labeled. Events means events with member transactions in this view, not an inferred creation date.

Transfers are a system classification derived from saved transfer links. They have neither an income nor expense tagging obligation. Linking preserves existing tags and events so unlinking restores the original context. Internal principal is excluded from boundary cash flow; fees remain external costs and excess received remains separately identified. Records are never rewritten just to change their presentation.

## Tag order

Organize → Categories & tags has Expenses, Income and Transfers lenses. Drag a tag onto another tag to place it before that tag, or use its earlier/later arrows. Space picks up a focused tag; Enter places it. Dropping into a different expense category changes its parent; dropping into its own category places it last. Income tags stay in the income lens.

Order applies to the full category even when searching. The server atomically checks the complete expected sibling list, rejects stale or incomplete changes, and updates definition sortOrder only. Initially unordered groups retain alphabetical fallback. New tags append in manually ordered groups; renaming does not change manual order. Radials, selectors, breakdowns and color-gradient steps follow this order. Definitions are exported to configuration SQL; transaction identities, portions, snapshots and reviews remain private and unchanged. Schema 17 adds only this configuration column.

## Verification

`npm run test:review-flow` exercises drag pairing, explicit linking, undo, keyboard linking, transfer exclusion, repayment tagging, expense shares, Overview, tag reordering and narrow layout in an isolated synthetic Electron workspace. Set `URBANOMICS_TEST_EXECUTABLE` to test a packaged executable. `tests/desktop/review-workflow.test.cjs` covers order conflicts, configuration round trips and reconciliation across months. Existing transfer, orbit, income, Organize and dashboard tests cover the retained workflows. The browser host uses the same operations with a separate sample workspace; see `browser-verification.md`.
