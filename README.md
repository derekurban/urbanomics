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
- [A small example to make the experience concrete](docs/first-trial.md)
- [Interactive monthly workflow](prototypes/monthly-flow.html) — an HTML fragment shown in Codex; no dependencies, persistence, or real file ingestion.
- [Prototype scope and verification](docs/prototype-notes.md)

Only synthetic examples belong in this repository. Personal imports, configuration, financial decisions, generated reports, and agent proposals belong under the ignored `private/` directory.
