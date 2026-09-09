# Review experience, second trial

This trial responds to the user's feedback on import space, incoming-payment purpose, shared collections, people, and adjustable splits. All data is synthetic and all changes remain in memory. Source: `prototypes/review-flow.html`.

## Current experience

Import is a single compact file row with `+ 7 rows included · − 2 outside September`. No transaction breakdown appears before review.

Review distinguishes income (general, job, selling something) from repayment. A sender can be assigned to a person and the exact sample sender string can be remembered. The next matching sample transfer recognizes the person, while its purpose still needs review. People can be added, and saved sender rules can be forgotten.

Linking a repayment can add its sender as a participant in the expense. The new participant starts with an equal split, visibly proposed before saving. Each participant has a share slider and exact money input. Moving one share redistributes the remaining total across the other participants. Adding or removing a participant resets the draft split equally. A save cannot reduce a person's share below an existing repayment.

One repayment can be allocated across expenses in a named group. The sample proposes oldest-expense-first allocation, capped at the sender's unpaid shares. Allocation amounts can be changed. Unallocated money remains in review, and payments cannot be overallocated. Only expenses receiving a positive allocation have their proposed shares applied on save. Creating groups and changing group membership do not rewrite existing payment-to-expense links.

Spending stays behind review completion. Its design remains intentionally modest for now.

## Sample result

- Dinner total $120, shared by You and Alex: $60 each.
- Cabin total $360, shared by You, Alex, Sam: $120 each.
- Alex's $180 payment applies $60 to dinner and $120 to cabin.
- Alex owes $0; Sam still owes $120.
- Other personal expenses: groceries $86 and transport $32.
- Reviewed personal spending: $298.
- A separate $30 transfer can be recorded as selling something; payroll can be recorded as job income.

## Verification

Eight Node tests run the actual embedded model functions. They cover equal splits with odd cents, conservation across slider adjustments, multi-expense allocation, unassigned remainders, editing existing payments, overpayment rejection, paid-share reduction rejection, income reclassification, and currency parsing.

Browser checks cover the compact import, choosing Alex, group allocation and saving, sender recognition, income buckets, person creation, group creation and membership, spending after review, and the paid-share guard. Desktop and 360px layouts were inspected; the narrow page had no horizontal overflow.

Run: `node --test tests/review-prototype.test.cjs`.

## Boundaries and next learning

This is still a UI trial, with a simulated import and no persistence, archive, real CSV parser, bank connection, or production ledger. It does not implement own-account transfers, refunds, multi-currency, cross-month coverage, repayment write-offs, or mixed income/repayment classification within one transfer. The sample uses an exact synthetic sender string; production identity rules must use the bank's actual available sender identifiers and account context, and must surface ambiguity.

The user's next reaction should guide the review interaction. Avoid broadening analytics or treating the prototype's UI state as production financial infrastructure.
