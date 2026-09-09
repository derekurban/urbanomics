# First experience to explore

Proposal only. All people, amounts, accounts, and transactions below are synthetic. This is a worked example, not an implemented app or evidence that the design will be easy to use.

## Question

After importing a month, can the user readily understand what they personally spent, what left their accounts, and what they are still owed?

## A tiny month

All amounts are CAD. These are the only activities in the example. Each incoming reimbursement is explicitly linked to its shared expense and participant; the app must not infer that link merely because an amount matches.

| Activity | Cash movement | Personal spending | Unpaid amount owed to user |
| --- | ---: | ---: | ---: |
| Pay arrives | +4,000 | 0 | 0 |
| Rent paid from chequing, split three ways | -2,400 | 800 | 1,600 |
| Housemate A repays their rent share | +800 | 0 | -800 |
| Housemate B repays their rent share | +800 | 0 | -800 |
| Dinner paid from chequing, split three ways | -180 | 60 | 120 |
| Friend A repays their dinner share | +60 | 0 | -60 |
| Groceries for the user | -120 | 120 | 0 |
| Move 500 from chequing to own savings | 0 across accounts | 0 | 0 |
| **Total** | **+2,960** | **980** | **60** |

Cash paid for expenses is 2,700. Reimbursements received are 1,660. Net cash paid for expenses is 1,040; personal spending is 980, with another 60 still owed back. Salary income remains 4,000. The internal transfer affects individual balances but neither aggregate cash nor spending.

These figures assume the declared shares are accepted and collectible. If a reimbursement is waived, its treatment must be updated explicitly.

## Candidate interaction

1. Choose the month and accounts, then add export files.
2. Preview included rows, rows outside the selected month, and any coverage or replacement concerns.
3. Review the dinner: confirm the three shares and link the received repayment. Leave the other share visibly unpaid.
4. Read a month summary showing personal spending of 980, net cash paid for expenses of 1,040, and 60 owed back.
5. Open any total to inspect its contributing transactions and decisions.

## Bounded next trial

After the user selects the first question, spend one implementation pass on a runnable synthetic workflow and one short user walkthrough. Observe which labels, actions, and explanations help or confuse. Do not build bank integrations or a broad dashboard to answer this first experience question.

- If the distinction between personal spending and cash movement is useful, extend this slice to monthly imports and ambiguous repayments.
- If a different task matters more, revise the workflow around that task.
- If the interaction is confusing, change the labels or sequence before adding breadth.

A successful walkthrough would support the interaction direction. It would not establish parser reliability, accounting correctness across all cases, automation accuracy, or long-term maintenance effort.
