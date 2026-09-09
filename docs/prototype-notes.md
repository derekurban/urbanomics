# Monthly experience trial

This document describes the first trial. See [the current review trial](review-trial.md) for the iteration responding to user feedback.

Date: 2026-09-09

## Purpose

Explore the user's first question: how much they personally spend by category when they front shared expenses and receive reimbursements.

The trial is a self-contained HTML fragment in `prototypes/monthly-flow.html`, displayed inline in Codex. To view independently, place the fragment inside a standard HTML document with a UTF-8 charset and viewport meta tag, then open it in a browser. It has no package dependencies or network calls.

## Implemented interactions

- Simulated import preview: eight synthetic rows, six within September, two excluded.
- Importing the sample opens an expense-review screen; revisiting import does not add duplicates to the sample state.
- A $120 dinner can be split equally or by a custom personal share, with a category selection.
- A $30 incoming transfer is explicitly linked to the dinner, or left unclassified.
- Linked repayments can be undone.
- Personal spending, outstanding reimbursements, and net cash paid for expenses update separately.
- Category selection shows its underlying expenses.
- The optional Codex design controls compare spacing and summary wording.

## Sample arithmetic

Other purchases total $132: groceries $86, transport $32, subscriptions $14.

| State | Personal spending | Owed back | Net paid for expenses |
| --- | ---: | ---: | ---: |
| Dinner not split | $252 | $0 | $252 |
| Dinner split equally; repayment not linked | $192 | $60 | $252 |
| Dinner split equally; $30 repayment linked | $192 | $30 | $222 |
| User share $90; $30 repayment linked | $222 | $0 | $222 |

An unlinked incoming transfer is excluded from income and expense adjustments, with a visible unresolved notice. The pay deposit does not affect spending totals. All calculations use integer cents.

## Verification performed

- JavaScript syntax check passed with Node.
- Browser walkthrough verified import navigation, equal split, partial repayment, repayment undo, custom share, category reassignment, and full settlement.
- An edit reducing the friend's share below an already linked repayment is rejected.
- Desktop and narrow (360px) layouts were visually inspected.

## Limits

This is an interaction trial, not a financial record system. File selection, parsing, archiving, storage, duplicate detection, cross-month links, multiple friends, partial allocation of one repayment across expenses, and authentic bank formats are not implemented. Reloading loses all changes. The receipt and file archive language depicts the intended future behavior; the import screen explicitly labels the simulation.

The trial has not established that this workflow will be enjoyable or low-maintenance over repeated monthly use. Next evidence comes from the user's experience with it.
