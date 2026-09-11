# Dashboard

The sidebar Dashboard implements the accepted Spending / Cash flow / Events mockup against the current local ledger and saved assignments. It is read-only: it uses `reviewState`, and source actions open the existing original-transaction inspector. Nothing is exported to a service, added to configuration SQL, or written back as a financial decision.

## Scope and measurements

- Start with the most recent imported month no later than the last completed calendar month, falling back to the latest import. Recent months, All dates and inclusive custom calendar-date ranges are available. Import presence does not establish complete month coverage.
- Select one currency at a time. Hidden accounts are excluded from selected cash movements and expenses. Their saved repayments still reduce active expenses, matching the existing repayment-capacity rules. Voided manual receipts are excluded by the ledger API.
- Spending selects negative bank entries by expense date. Valid reciprocal transfer links exclude principal. Their outgoing fee becomes a derived cost under **Transfer fees (linked)**, dated to the debit, counted once, and linked to the original bank record. No synthetic ledger record is created. Unclassified debits remain provisional expenses until explicitly assigned or linked; the count is disclosed.
- **Paid for expenses** is gross selected expense portions. **Repaid** is linked allocations toward those expenses, not all positive account entries. **Still paid by you** is gross minus received repayments, including money friends have not paid yet.
- Include payments received by the range end by default, regardless of whether their date precedes the selected start. The optional later-repayments switch includes all currently saved linked repayments. It changes expense/event costs and outstanding shares, never bank cash flow. These are current assignments evaluated with a receipt-date cutoff, not historical snapshots of prior edits.
- **Friends still owe** sums each recorded non-owner share less payments from that person, floored at zero. Unknown agreements are excluded and counted; when no agreements are known, show Not set rather than implying no debt. Original agreed own share is available in expense details.
- Gross bank inflow/outflow use every matching signed bank entry inside the date range, including both transfer sides and any fee/excess embedded in those entries. Net movement is inflow minus outflow, not an account balance or earned income. Manual cash receipts have a separate total. Cash inflow separates saved income, repayment receipts, internal transfers and other/unassigned receipts.
- Events use explicitly linked expense identities; date ranges do not infer membership. Their totals inherit the selected expense dates/categories/currency. An expense may appear in multiple events but is counted once in overall spending. Event sums are therefore not additive.

## Category attribution

Cash flow filters use each transaction's own category portions. Spending filters use the expense's portions, so a repayment categorized differently still reduces its linked expense. Missing assignments use an explicit Uncategorized bucket. No income purpose, transfer link, event membership or sender is inferred from a category's name.

For each expense, process payments in stable date/ID order. Distribute each applied amount proportionally across its remaining category costs, using integer largest-remainder rounding with BigInt multiplication. This conserves every cent and prevents repeated small payments from overdrawing one category. Filtering happens after allocation, so independent category totals and combined selections reconcile. Outstanding agreed shares are apportioned over remaining costs; original own shares are apportioned over gross costs. Display allocation is derived and does not change saved repayment links or splits.

## Inspection and limitations

Headline values, category bars, event cards, account summaries and cash-flow groups open details with the contributing records. Repayment rows show receipt dates, amounts attributable to the selected expense categories, cash/bank origin and original-source actions. The transfer inspector shows both entries, dates, fees and unexplained extra received; it deliberately shows all linked pairs in the selected date range/currency, independent of category filters, with that scope stated in the dialog. About these numbers exposes definitions in the app.

The dashboard does not estimate unrecorded debt, auto-identify refunds or transfers, or predict final settled personal spending. Unallocated incoming money is not treated as a deduction. The current configuration/ledger can change earlier-period results when assignments change.

## Verification

`tests/desktop/dashboard.test.cjs` checks independent known totals, cent conservation, tiny repeated repayments, cross-month receipts, overlapping events, hidden-account repayments, transfer boundaries, currency separation, empty selections and input immutability. `npm run test:dashboard` exercises the real Electron renderer/preload with synthetic imports: multi-select category filters, date ranges, source inspection, later repayments, cash flow, event details, invalid/empty dates and narrow layouts. All validation data and screenshots stay under ignored `private/validation/`.
