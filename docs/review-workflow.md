# Review workflow

## System tags and tags-only income — September 18, 2026

Income no longer requires a fixed paycheck/interest/sale/gift/other source selection. Financial purpose (income, transfer, repayment) still controls accounting; income tags describe the source. Legacy source fields remain private historical metadata and are not used for completion or calculations.

Expense Other and Income Other are locked gray system defaults. Existing exact-name Other definitions are adopted with their original IDs, preserving assignments and rules; otherwise stable system IDs supply them. Defaults are projected for records without saved portions, not bulk-written into financial payloads. Their automatic status keeps them in attention queues; explicitly saving Other files the decision. Choosing a specific tag replaces a sole Other, removing the final tag restores Other, and multi-tag exact-cent splits remain available. Rules replace automatic defaults but preserve deliberate assignments. Reset transaction tags restores the automatic fallback.

Transfer and Deduction are derived system tags, not user-selectable monetary portions. Transfer appears on linked entries; Deduction appears on receipts with positive allocations and their target expenses. Original expense tags and saved transfer tags remain preserved, and removing links removes the corresponding system tag. Their roles cannot be changed by renaming. Organize → Categories & tags → System tags permits names only; deletion, reparenting, color/type changes and ordering are locked. Gray defaults are excluded from gradient interpolation and manual reorder groups.

Schema 18 adds only system_tag_names configuration, exported with configuration SQL. Import identities, reviews, snapshots and archives are not migrated or rewritten. Review state exposes effective defaults and automatic link badges; internal raw records remain available to finance validation and undo. Verified with unit checks, isolated browser checks of rename/default/split/link behavior, and 500/1,000-card rendering checks. Personal transaction data must never be changed for verification.


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


### Experimental Allocations workspace

Allocations offers a transaction list and one selected transaction's vertical layer bar. Tags, repayments and transfers use real ledger IDs; changes remain drafts until Save allocation. Unallocated is the remainder, not a tag. Completely unallocated transactions can be saved. Full allocation removes the remainder row and its divider. Existing Other assignments are omitted from this new draft presentation and only replaced when explicitly saved here.

For money in, select a repayment person to connect expenses, respecting agreed shares and remaining cost. Remaining cents can carry income tags or stay unallocated. Whole-account transfers still use reciprocal linking, with fees on the outgoing record. Existing linked transfers can be inspected and explicitly unlinked. Context and expense shares are preserved; use existing Organize and Review tools to manage them. Legacy receipts whose tags describe their entire gross amount show a warning before their tag portions are scaled to the remainder on save.

Partial portions persist under a private allocationMode marker. Dashboard and review overview split incoming classified income, connected repayments and unallocated cents. Import files, snapshots, configuration definitions and existing records are not bulk-rewritten. Checks: `node --test tests/desktop/allocations.test.cjs` and `node scripts/smoke-allocations.cjs` (after build).


September 19 interaction update: Allocations uses a horizontal category strip with hover/click tag menus; the bar only displays portions and exposes dividers. A link icon opens Expenses, Transfers and Events for incoming money, or Events for expenses and linked transfers. Events add context without consuming cents. Changes remain in the transaction draft until Save allocation, including event changes. The standalone vial prototype remains historical design context.

The latest Allocations layout uses wrapped category buttons and separate Expense, Transfer and Event actions instead of the horizontal rail and single link icon. Each action opens the corresponding modal section. Event chips remain with the connection controls; the monetary breakdown stays separate. Styles are scoped to avoid inheriting the app shell's nested main/footer spacing.
