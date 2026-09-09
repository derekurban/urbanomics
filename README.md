# Urbanomics

A fresh start on a personal finance app that makes money movements understandable and monthly upkeep manageable.

The project is in discovery, with an interactive experience prototype using synthetic data. Bank imports, storage, and a production financial calculation engine are not implemented yet.

## Starting direction

- Begin with the user's experience and the questions the app should answer.
- Import a chosen month's bank exports through an intentional workflow.
- Preserve original files and explain which rows are included or excluded.
- Represent transfers, shared expenses, and reimbursements explicitly.
- Make each reported amount traceable to its transactions and decisions.
- Keep personal financial data local and outside Git.

These are priorities recovered from an earlier conversation, pending confirmation for this restart. Its proposed architecture is not an implementation specification.

## Discovery notes

- [Direction and open questions](docs/direction.md)
- [Current tags and category views experience](prototypes/insights-flow.html) — the sixth trial. Transactions carry several reusable tags with exact-cent portions; category views are editable insight lenses over chosen tags; events hold whole transactions; repayment review is unchanged. An HTML fragment shown in Codex; no dependencies, persistence, or real file ingestion.
- [Implementation brief for Fable 5.1](docs/fable-one-brief.md) — the product direction the sixth trial implements (the filename is historical).
- [A small example to make the experience concrete](docs/first-trial.md)
- [Previous organization board](prototypes/board-flow.html) — preserved as the fifth design trial, with fixed category ownership of tags.
- [Previous staged experience](prototypes/staged-flow.html) — preserved as the fourth design trial.
- [Previous inbox experience](prototypes/inbox-flow.html) — preserved as the third design trial.
- [Previous review experience](prototypes/review-flow.html) — preserved as the second design trial.
- [First monthly workflow](prototypes/monthly-flow.html) — preserved as an earlier design trial.
- [Prototype scope and verification](docs/prototype-notes.md)

Run the current prototype's calculation checks with `node --test tests/insights-prototype.test.cjs`. See [the current trial notes](docs/insights-trial.md) for interaction decisions, evidence, and limits. Earlier trials keep their own tests, such as `node --test tests/board-prototype.test.cjs`.

Only synthetic examples belong in this repository. Personal imports, configuration, financial decisions, generated reports, and agent proposals belong under the ignored `private/` directory.
