# Desktop organization and review

The accepted model now runs against the imported ledger in Electron. Review opens an imported month or all imported months. Every stage is accessible: Tags, Events, Review, and Categories. No sample entities or decisions are inserted into personal workspaces.

## Sorting

The user accepted the circular card trial and requested it for tags and events. Both stages now default to Cards: drag the central transaction onto surrounding targets or click the targets. Selections remain drafts until Save & next writes through the existing organization API and advances to the next unfinished row. Chevrons browse all visible rows, including saved rows. Drafts survive card, stage, search, and board changes within Review; they are memory-only and do not survive leaving Review or closing the app. Saved decisions persist. Stale drafts require discarding before they can overwrite newer changes.

Progress counts saved decisions in the current month/search result. Tags are complete when saved portions exist. Events are complete when a membership exists or the user explicitly saves No event. Optional `groupsReviewed` in the existing review payload records that decision; older payloads read with a false default without being rewritten. Clearing memberships through the board makes an empty event decision pending again. Removing the last event also makes affected transactions pending for event sorting. Tag and financial decisions remain independent.

At most six targets appear around the card; larger lists have search/paging, with all selected assignments visible as removable chips. Controls sit beside the circle on wide windows and stack on smaller windows. Manage tags/events exposes editors. Board remains a second view for seeing contents and bulk assignment. Events keep the existing group IDs, so previously saved repayment links and group membership remain valid. Multiple events collect the full transaction; they do not divide its amount or automatically allocate repayments.

Tags are reusable names/colors with exact integer-cent transaction portions. A first tag takes the full absolute amount. Multiple tags start equal, with leftover cents assigned in selection order. Moving a divider changes only its adjacent portions; dollar and cent precision are selectable, and exact boundary amounts can be entered. A manually adjusted split keeps its portions when a tag is added (the new tag starts at zero). Removing a tag redistributes its portion among remaining tags. Split evenly resets the allocation explicitly.

The Needs tags lane shows unassigned transactions. Each tag lane exposes its contents and allocated amounts. Drag an unassigned row into a lane, or select multiple rows and click a lane heading. Dragging from one tag lane to another moves that portion, merging it with an existing target portion. Show all exposes already assigned transactions; dropping into Needs tags clears their tags. An item may appear in several lanes, but represents the same transaction throughout.

Groups collect whole expenses and incoming transactions independently of tags. Bulk assignment can add an item to several groups; dragging between groups moves that membership. Removing a group keeps its transactions and other decisions. Group membership does not imply that an incoming payment reimburses its expenses.

Categories are editable sets of tags, not transaction containers. Combining category views takes a union of tags and counts each selected portion once. Editing/deleting a category does not rewrite transactions. Used tags and people cannot be deleted until their references are removed, including references in deleted accounts.

## Financial decisions

The inbox contains unfinished financial reviews. Money out offers Expense or Own-account transfer; money in offers Income, Repayment or Own-account transfer. Zero-value records can be acknowledged without affecting totals. Saving removes the current row from the inbox. Show reviewed exposes completed decisions and Reopen review makes them pending again. Reopening preserves the recorded decision and its links until edited; existing repayment allocations therefore continue reserving their amounts.

An expense can have no agreed split, in which case received repayments reduce the user's remaining cost. Adding people records an agreed split (including Me). Cash paid, the user's share, repayments received and the remaining amount owed are shown separately. Saved repayments cannot exceed an expense's gross amount or the payer's agreed share. Changing an expense split or purpose cannot invalidate existing repayments; adjust those allocations first.

A repayment records a selected person and canonical expense transaction IDs. The searchable list includes groups and individual expenses across imported months. Selecting a group selects its member expenses once; partially selected groups are marked. Only expenses in the same currency are eligible. Selection suggests an even allocation bounded by remaining capacity; dividers can adjust that suggestion. Unallocated excess is retained as **Unassigned e-transfer income**. A saved group selection is an explicit set of expenses: later group changes do not silently change an existing payment allocation. Saving a repayment does not mark its expenses reviewed, add people to their agreed splits, or change their tags.

Own-account transfers and credit-card payments pair equal opposite movements in different accounts and the same currency. Both sides are reviewed atomically and remain separate from spending/income. Existing unrelated reviewed rows require reopening before pairing. Changing a pair unlinks the old counterpart and returns it to the inbox. Import a missing counterpart before completing transfer review; no fuzzy matching or automatic pairing is inferred.

Category totals are **gross tagged cash flow**, with pending rows, transfers, expenses, general income and repayments separated. Mixed repayments remain one gross repayment bucket, avoiding an invented allocation of reimbursements to tags. The exact excess is shown in the repayment editor. These are not net personal-spending reports or proof of complete month coverage.

## Private persistence

SQLite schema version 5 adds `review_entities` and `review_items`. Review payloads reference stable ledger transaction IDs; optimistic row versions reject stale saves and bulk operations are atomic. Original source files, observations and immutable monthly snapshot files are not rewritten by review. Inspection of an old snapshot still shows its imported cash movements; review edits use the current ledger identity.

Repeated/matched imports retain existing decisions. Newly added transactions start pending. Changed bank descriptions/amounts still follow the importer's cautious matching rules; they are not silently substituted for a reviewed transaction. Deleting an account hides its transactions from active review while retaining decisions and repayment capacity reservations; restoring it recovers those identities and decisions.

Review records live only in the private SQLite workspace, excluded from Git and packaging. To preserve them, back up the complete private workspace while the app is closed. Immutable import snapshots alone do not include later review decisions. There is no review audit history or backup/restore UI yet; completed decisions can be reopened and edited.

## Verification

`npm run test:orbit` runs the new card workflow in real Electron with isolated synthetic imports. It covers pointer dragging, exact tag splits, drafts across card/stage navigation, target paging/search, whole-transaction multi-event selection, explicit No event, stale-write rejection, responsive screenshots, and restart persistence. All source and review data in the live workspace are checked against a private backup when installing an update.

`npm test` covers exact-cent conservation, atomic/stale writes, independent category views, repayment caps and cross-month targets, transfer pair rollback/unlinking, repeat/amendment identity preservation, account deletion/restoration, and the pure divider/distribution/view-union calculations.

After `npm run build`, `npm run test:review` exercises the actual Electron renderer, preload and main process with isolated synthetic imports: drag-and-drop tagging, split editing, bulk groups, people, repayments, income, transfer pairing, zero rows, reopening, overlapping category views, narrow layouts and restart persistence. Screenshots remain under ignored `private/validation/`. `npm run test:desktop` retains the existing import/account/archive regression coverage.
