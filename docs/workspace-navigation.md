# Workspace navigation

September 20, 2026. This structure supersedes the earlier Review/Experimental navigation in historical workflow notes.

The sidebar separates Overview (Dashboard), Workspace (Snapshots, Organize, Transactions, Events, Accounts) and Preferences (Settings). Snapshots remains the default entry point. Existing allocation, experimental and review URL fragments resolve to Organize.

Organize is the desk described in [organize-desk.md](organize-desk.md) (October 2, 2026): one cross-account ledger with a shape strip per row, rows that open in place, one describe box and immediate versioned saves with undo. Transfer pairing settings live under Settings → Transfers. Links from Transactions and event payments open the specified row in Organize.

Transactions defaults to all months, with a single currency selected to avoid adding unlike money. Search includes original descriptions; account, month, direction, tag, event, person and connection filters combine. Dates, descriptions and signed amounts can be sorted. The table renders at most 50 records at once. Row details expose original files, an explicit saved person assignment, allocation editing and financial settings for shares/repayments. Manual cash receipts remain available. Partial imported history never implies an account balance.

Cash movement cards reflect the filtered rows. Matched transfer principal is excluded using the dashboard's existing boundary calculation and the complete ledger for counterpart resolution. Fees and excess received remain external. Repayments are cash coming in, not ordinary earned income. These totals are cash flow, not personal net spending.

Saved snapshots open the same table as a read-only view. Snapshot totals represent original gross cash movements, before later organization. Changing filters or inspecting a source never changes the snapshot. Back to current ledger returns to current saved classifications.

Events owns event creation, date/color/name editing and deletion through the existing versioned entity editor. Calendar membership is explicit; the optional one-day buffer only suggests relevant transactions. Costs and repayments retain currency separation and existing accounting. Settings no longer duplicates Accounts or Events and omits the former overview landing page.

No database migration or financial rewrite is required. All edits still use the shared desktop/browser service and existing version checks. Browser validation uses isolated synthetic data, then the Windows application is packaged and restarted.

Validation scripts: smoke-navigation-refresh.cjs, smoke-allocations.cjs, smoke-accounts.cjs, smoke-snapshots-v2.cjs. The transaction view model has dedicated tests for filters, currencies, snapshot gross amounts and cross-account transfer exclusions.
