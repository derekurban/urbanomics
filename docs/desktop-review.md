# Desktop organization and review

The accepted model now runs against the imported ledger in Electron. Review opens an imported month or all imported months. Every stage is accessible: Categories, Events, Transfers, Review, and Overview. No sample entities or decisions are inserted into personal workspaces.

## Sorting

Organize in the sidebar manages Categories, Events, Accounts and People. Its Accounts subsection preserves routing/prefix configuration, recoverable account deletion, import range and remembered filenames. Other sections provide searchable lists, usage counts and the shared entity editor used from Review. Used categories and people cannot be deleted while referenced, including by deleted accounts.

Categories and Events use the card structure only. Dropping a card onto a category saves its full absolute amount to that category and advances to the next unfinished visible transaction. Pressing a surrounding category button provides the same keyboard-accessible action. Revisiting and dropping a previously split card replaces its category split with the selected single category.

Exception for a selected category: clicking its target or selected chip removes that category, saves without advancing, and redistributes its portion across remaining categories. Removing the last selection clears category completion. Both target-page and transaction chevrons use centered SVG icons inside square controls.

Organize also includes Aliases for readable transaction names and regex previews/conflict management. These labels decorate current Review and Transactions only; original descriptions and immutable import snapshots remain preserved. See [transaction aliases](transaction-aliases.md).

Click the card (or press Enter/Space) to open Transaction settings. Searchable checkboxes support multiple categories, with selected chips staying visible across searches. A single category receives 100%; multiple categories initially split evenly with deterministic cent rounding. Adjacent dividers offer dollar or cent precision and exact boundary inputs. Manually adjusted amounts are preserved when adding categories, with new selections starting at zero; Split evenly explicitly resets them. Save commits and advances only on success. Cancel, Escape and backdrop dismissal discard modal edits and keep the current card. During saving, closing and further submissions are disabled. Failed/stale writes keep the editor open, preserving the user's draft without overwriting newer data. Save and Cancel sit outside the scrollable modal body.

Chevrons browse visible transactions, including saved items. Progress counts saved category assignments in the current month/search result. At most six surrounding targets appear at once; larger lists support search and paging. Manage categories/events opens shared editors.

Events contain whole transactions and remain independent of category amounts and financial decisions. Select one or more events, then Save & next, or explicitly save No event. Event drafts survive navigation inside Review but not leaving the workspace or restarting. Saved decisions persist; deleting an event removes its membership and reopens affected event decisions. Group selection in repayment review still uses canonical expense IDs and does not double-count members.

Overview filters gross flows by directly assigned categories. Combining categories counts each portion once. There is no separate tag or category-view layer.

## Financial decisions

The inbox contains unfinished financial reviews. Money out offers Expense or Own-account transfer; money in offers Income, Repayment or Own-account transfer. Zero-value records can be acknowledged without affecting totals. Saving removes the current row from the inbox. Show reviewed exposes completed decisions and Reopen review makes them pending again. Reopening preserves the recorded decision and its links until edited; existing repayment allocations therefore continue reserving their amounts.

An expense can have no agreed split, in which case received repayments reduce the user's remaining cost. Adding people records an agreed split (including Me). Cash paid, the user's share, repayments received and the remaining amount owed are shown separately. Saved repayments cannot exceed an expense's gross amount or the payer's agreed share. Changing an expense split or purpose cannot invalidate existing repayments; adjust those allocations first.

A repayment records a selected person and canonical expense transaction IDs. The searchable list includes groups and individual expenses across imported months. Selecting a group selects its member expenses once; partially selected groups are marked. Only expenses in the same currency are eligible. Selection suggests an even allocation bounded by remaining capacity; dividers can adjust that suggestion. Unallocated excess is retained as **Unassigned e-transfer income**. A saved group selection is an explicit set of expenses: later group changes do not silently change an existing payment allocation. Saving a repayment does not mark its expenses reviewed, add people to their agreed splits, or change their categories.

Own-account transfers and credit-card payments use **Transfers** for percentage-band matching. Pending outgoing entries appear on the left; selecting one finds all eligible positive entries in other active accounts and the same currency across imported months. The symmetric amount band is relative to the absolute outgoing amount, defaults to 2%, and accepts 0–100% in 0.01% increments. Integer basis points and whole cents are compared using exact integer arithmetic. Dates are visible and help order equally close amounts; there is no hidden date cutoff. Amount similarity supplies candidates only: select both checkmarks and press Link transfer to save.

Both row versions are checked and both reviews change atomically. Linked pairs leave Pending and appear under Linked, filtered by the review month and search (either side can match). Linking advances to the next outgoing entry. Unlink returns both entries to pending and removes the difference metadata. Existing unrelated completed financial reviews require reopening; repayment records and expenses reserved by repayments cannot be paired. The existing financial editor still allows exact pairs and editing/reopening a previously linked unequal pair.

When the incoming amount is smaller, the shortfall defaults to a fee stored once on the outgoing review as `transferFeeCents`. When it is larger, the excess is stored once on the incoming review as `transferExcessCents` and labeled unexplained extra received. It is not earned income. Principal is the smaller of the two amounts; no synthetic bank row or duplicate fee transaction is created. Original entries, category portions and event memberships stay intact. Changing either side's financial purpose also clears the former counterpart and its difference metadata. These optional payload fields default to zero for existing reviews; no database migration rewrites historical decisions.

Overview separates transfer principal, fees, and unexplained differences. When a transaction spans categories, its fee or excess is distributed proportionally over its existing portions using integer cents and largest-remainder rounding. Selecting all categories recovers the exact total; selecting subsets does not double-count principal or fees. Uncategorized entries remain outside this category-based report, as before. Explaining excess incoming money beyond unlinking/reviewing the pair remains future work.

Category totals are **gross categorized cash flow**, with pending rows, transfers, expenses, general income and repayments separated. Mixed repayments remain one gross repayment bucket, avoiding an invented allocation of reimbursements to categories. The exact excess is shown in the repayment editor. These are not net personal-spending reports or proof of complete month coverage.

## Private persistence

SQLite schema version 5 introduced `review_entities` and `review_items`. Review payloads reference stable ledger transaction IDs; optimistic row versions reject stale saves and bulk operations are atomic. Original source files, observations and immutable monthly snapshot files are not rewritten by review. Inspection of an old snapshot still shows its imported cash movements; review edits use the current ledger identity.

Schema 6 converts former tag entities into direct categories while retaining their IDs, colors, and every review payload/version unchanged. The historical `review.tags` payload key continues storing exact-cent portions, now referencing category IDs. Existing category-view names remain available as direct categories without automatically copying their former member tags' portions. Original entity definitions are preserved once in private `review_entity_history`. A converted tag with a conflicting category name receives a deterministic “(converted N)” suffix. This migration is transactional and idempotent; no imported rows, archives, event memberships, shares, or repayment links are rewritten.

Repeated/matched imports retain existing decisions. Newly added transactions start pending. Changed bank descriptions/amounts still follow the importer's cautious matching rules; they are not silently substituted for a reviewed transaction. Deleting an account hides its transactions from active review while retaining decisions and repayment capacity reservations; restoring it recovers those identities and decisions.

Review records live only in the private SQLite workspace, excluded from Git and packaging. To preserve them, back up the complete private workspace while the app is closed. Immutable import snapshots alone do not include later review decisions. There is no review audit history or backup/restore UI yet; completed decisions can be reopened and edited.

## Verification

`npm test` checks import safety, exact-cent conservation, atomic/stale writes, schema 5→6 conversion (including name collisions and deleted-account decisions), repayment caps, transfer pairs, amendments and restart persistence.

`npm run test:transfers` checks the two-list linker in Electron: percentage bounds, explicit checkmarks, cross-month candidates, fees, extra received, competing matches, removal from Pending, Linked/Unlink, narrow layout, and persistence. It also exercises the local import-month picker, cancellation, invalid future months, and a multi-month CSV filtered to the selected month. All fixtures are synthetic.

After building, `npm run test:orbit` exercises the real Electron card interactions: single-write drag saves and advance, searchable multi-category settings, cent splits, Cancel/Escape and keyboard access, stale-save rejection, event drafts/No event, responsive screenshots and restart. `npm run test:review` covers category splitting, events, people, repayments, income, transfers, zero records, reopening and gross category totals. `npm run test:organize` covers all four management sections, shared records, guarded deletion and focused/narrow layouts. `npm run test:desktop` retains import, account and archive regression coverage. All mutation tests use synthetic data; screenshots stay under ignored `private/validation/`.
