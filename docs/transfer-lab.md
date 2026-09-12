# Auto-link lab (temporary experiment)

Review → Transfers → Auto-link lab previews possible own-account transfers across all imported months and active accounts, independently of the outer Review month/search filters. Pending and Linked keep their existing manual behavior. The lab never links on startup, import, preview, or saving its setup. The default Start unlinked sandbox treats saved transfers as unlinked in memory and offers Test selected pairs without writing financial records. Switch to Pending only to explicitly link eligible pending candidates.

## Directional setup

The user requested these starting routes: Savings → Chequing, Chequing → Mastercard, Simplii → Savings, and Simplii → Chequing. Reverse directions are not implied. No route receives into Simplii or sends out of Mastercard by default. A draggable account network edits each direction independently. Drag the plus connector onto another account, or click the source connector then the destination. Arrow keys move a focused account; select a line to remove it, or use its route chip. Escape cancels drawing. Arrange nodes resets the layout. Node positions are a private renderer localStorage preference; only saved allowed routes are shared configuration.

Defaults resolve only uniquely identifiable active schema/kind roles (`eq/savings`, `pc/chequing`, `pc/credit`, `simplii/chequing`); ambiguous roles are left unconfigured, never guessed from account names. Defaults are computed suggestions until Save setup. Saved routes use stable account IDs. Routes to deleted accounts are excluded from the effective setup without deleting their saved definitions. Reload setup fetches current accounts/configuration and discards unsaved lab edits.

Start with exact amounts (0% tolerance) and ±1 exported calendar day. The lab accepts 0–31 whole days and 0–10% in 0.01% steps. These settings can be tested without saving. No account balance is inferred: the comparison uses the two transaction amounts, because complete opening/running balances are not available for every bank export.

## Candidate algorithm

1. In Start unlinked, clear active bank transfer assignments only in a copied record set before eligibility checks. Other financial purposes remain protected. Pending only uses saved records unchanged. Use the existing transfer eligibility rules: active bank rows, opposite signs, no saved transfer, income, repayment, shared-cost commitments or expense deductions. Manual cash stays ineligible but its repayment reservations still protect bank expenses.
2. Only consider a debit-to-credit edge on an allowed directed route, in the same currency, within the absolute calendar-day window. UTC midnight arithmetic avoids daylight-saving shifts without changing bank-exported dates.
3. Require the absolute amount difference to be within the configured percentage of money sent. Whole cents and integer basis points use exact integer comparisons.
4. Build the complete candidate graph before selecting anything. An edge is **unique** only if both endpoints have exactly one candidate. Otherwise it is **ambiguous**, even if one candidate is closer in amount/date. No greedy consumption, tie-breaking assignment or reuse makes an ambiguous edge appear unique.
5. Display candidates ordered by unique status, absolute amount difference, day distance and stable identity. Ordering is for inspection, not a probability score or proof of transfer purpose.

Unique and Ambiguous lists show both source records, account direction, dates, amount difference and competing-candidate counts. Unmatched lists eligible entries with no candidate. Results paginate at 20. Selection can span pages; selecting a competing edge disables others sharing either endpoint. Select all unique pairs explicitly selects the entire preview's unique set. Ambiguous pairs can still be chosen individually by the user.

Sandbox Test revalidates selected pairs without writing records. Its preview token includes the simulation mode and cannot authorize live linking. Apply recomputes the full preview under a database write lock and checks a SHA-256 token covering settings, saved configuration, accounts and records. Changed transactions, configuration or mappings reject stale selection. All selected endpoints are validated for one-to-one use before any write. Linking uses the existing financial writer in one atomic transaction: a failure rolls back the entire batch. Shortfalls become one outgoing fee; extra received remains unexplained on the incoming side. Source records, categories, event memberships and existing linked pairs stay intact.

The algorithm supports one debit to one credit. Split deposits, combined payments, foreign-exchange transfers and absent counterpart exports require manual investigation; they are not inferred from net account balances.

## Comparison against existing links

The lab extracts active reciprocal saved pairs and hides those links only in an in-memory copy. It combines those copied entries with eligible pending competitors, then runs the same algorithm. It reports saved pairs uniquely recovered, ambiguous, or excluded by routes/dates/amounts. The Existing pairs list explains each result. Saved links are never removed, recomputed or replaced in the ledger. This is agreement with user-provided examples, not an estimate of accuracy on unseen transactions. No financial sample results are committed to this document.

## Persistence and verification

Schema 12 adds an initially empty `transfer_lab_config` table with one versioned row: date window, amount tolerance and canonical directed routes. Save setup updates this configuration and the existing deterministic configuration SQL export. It stores no matched transaction IDs, amounts, dates, previews, history comparison results or selection. Financial links remain private review data; imports and archives stay immutable. The migration does not rewrite earlier tables. Runtime SQLite, screenshots and validation workspaces remain ignored.

`npm test` covers routing, date/currency boundaries, exact cents, ambiguity, protected records, historical simulation, stale/version checks, atomic selection, preserved source/category data, configuration seeding, repeat/new import behavior, deleted routes and a populated schema upgrade. `npm run test:transfer-lab` checks the actual Electron UI/IPC with synthetic CSVs, including node dragging, pointer-drawn connections, keyboard connections, Escape cancellation, read-only sandbox validation, direction controls, cross-month matching, historical comparison, checkbox reuse prevention, stale apply, batch fee links, saved setup/restart and a 900px window. Existing transfer checks continue under `npm run test:transfers`.
