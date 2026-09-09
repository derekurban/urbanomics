# Staged experience, fourth trial

Superseded by [the organization board trial](board-trial.md). This file describes the preserved fourth prototype.

Source: `prototypes/staged-flow.html`. Synthetic data and in-memory state only; reload resets the trial.

## Experience under test

The workflow is Import → Categorize → Group → Deduct & balance. Import remains a compact five-account fixture. Categorize shows all nine non-transfer money movements on the left and broad category destinations on the right. Group uses the same list with event destinations. Both expenses and incoming payments can have a category and multiple groups. Selection plus clicking a destination provides an alternative to dragging. Four pre-matched transfer legs represented by the import counts are omitted from this organization list; a real transfer engine is not implemented.

The final stage is an attention inbox. Completed payments and expenses leave it independently; All items reopens them. A repayment save writes payment allocations only. It never sets expense review flags or changes agreed shares. Expense cost can update through its explicit repayment links without marking the expense reviewed.

The repayment editor presents sender avatars followed by one searchable mixed list of groups and expenses. Multiple groups and individual expenses may be selected together. Groups expand to expense leaves; overlapping selections are deduplicated. Incoming group members cannot receive an allocation. Changing targets or pressing Distribute evenly divides the payment equally across the unique expenses, capped by available expense amounts or the sender's agreed unpaid share. Saved links refer to expenses; subsequent group edits do not rewrite them automatically.

The allocation bar uses adjacent dividers, followed by an Unassigned e-transfer income segment. Its precision can be $1 or $0.01. The same control is used for explicit participant shares. Changing a divider affects only its neighbours, and changing precision alone does not round existing allocations. Payment allocation and its income remainder must conserve the payment's exact cent total. Remainder income is allowed even when selected expenses still have capacity.

Without an agreed split, the unreimbursed part of an expense is treated as personal cost. An explicit agreed split instead preserves the user's share and shows unpaid friend shares as owed. This is an assistant interpretation of the user's requested remainder behavior, pending a real example that validates both modes.

## Verification

Ten Node tests exercise the actual model embedded in the fragment: unique target expansion, even capped distribution, surplus income, precision and cent conservation, adjacent divider isolation, immutable payment saving, independent expense review flags, personal cost modes, independent category/group membership, previously paid capacity, sender-specific share limits, and invalid amounts.

Browser checks verified:

- Direct pointer dragging into a category, and selection-based grouping of an incoming payment while preserving its category.
- The searchable mixed list, with Mountain weekend plus Dinner at Juniper still resolving to two unique expenses, and a separate market expense increasing that to three.
- Dollar keyboard adjustment and a one-cent adjustment after switching precision.
- Saving the $180 payment removed only that payment, leaving all four expenses pending; the exact sender rule recognized Alex on the next payment.
- Saving the next $30 wholly as unassigned transfer income, then independently confirming all four expenses, produced $419.43 personal expense cost, $178.99 applied repayments, and $31.01 unassigned transfer income.
- The explicit people-share editor exposes the same precision controls.
- At 360px the payment editor and allocation bar fit without horizontal page overflow. Desktop allocation layout was also visually inspected.

Run `node --test tests/staged-prototype.test.cjs`.

## Boundaries

This is an experience trial, not a financial ledger. Real CSV upload, account routing, deduplication, source archives, durable storage, refunds, currencies, cross-month links, and financial rule execution remain unimplemented. Categories, accounts, and people are fixed sample choices in this iteration; groups can be created. Payment rules remember only an exact sample sender string. Undo restores the last financial save, not every organization edit.

Next evidence: try a repayment that covers one event and an unrelated expense, leave a deliberate income remainder, and assess whether the four stages feel useful before implementing real imports.
