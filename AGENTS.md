# Working on Urbanomics

Read `README.md` and `docs/direction.md` before implementation. Keep user statements, proposals, and verified behavior distinct. The earlier conversation is background, not authority to copy its architecture.

## Project boundaries

- Build from scratch. The accepted first workflow now uses Electron + React (Vite) with SQLite owned by the main process. Read `docs/desktop-imports.md` before changing ingestion or persistence.
- Start with a small, runnable experience using synthetic data, then extend it based on the user's reaction.
- The user has accepted the sixth trial's overall flow and playful sorting experience as the implementation direction. Preserve it while building real import and persistence; visual cleanup and animation can follow. Individual accounting defaults still need validation.
- The accepted Data layout unifies Dropbox intake, upload history, archived originals and an account-by-month snapshot map. Uploads stage before explicit processing. Account version counts must exclude saves that changed only another account. Keep real folder actions and cleanup confined to app-owned intake copies.
- Keep this file and discovery notes current when the user settles a decision.
- Do not delegate to other agents unless the user explicitly requests it.

## Personal financial data

- Track code, documentation, schemas, and explicitly synthetic fixtures only.
- Store actual imports, private configuration, balances, identities, transaction links, splits, proposals, and generated output under `private/`, outside Git.
- Inspect staged files before commits. Ignore rules do not protect files already tracked or stored in unexpected paths.
- Do not transmit financial files to external services without the user's authorization.
- Coding agents may edit application code and synthetic fixtures. Any future finance assistant should propose changes to private financial records through a reviewable application workflow.

## Correctness requirements for future implementation

- Use integer minor units or exact decimals for money; preserve currency.
- Preserve immutable source files and provenance.
- Never silently remove legitimate duplicate-looking transactions.
- A repeat import must not double-count; a partial replacement must not silently erase previously accepted transactions or break their links.
- Amount and date can identify candidates, but cannot prove a person's identity or a payment's purpose. Surface ambiguous matches for review.
- Show cash movement, the user's economic share, and unpaid reimbursements separately.
- Internal transfers and credit-card payments must not count as new spending or earned income.
- Label incomplete coverage and unresolved classifications; do not present uncertain totals as settled.
- Test these requirements with realistic synthetic edge cases when their implementation is added.
