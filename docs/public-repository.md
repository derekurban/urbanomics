# Public repository, private workspace

October 2, 2026. The Urbanomics source is published on GitHub. Everything personal stays out of it by construction: the ledger, the configuration export, local settings, validation captures and the sensitive-term list all live outside the tracked tree, a pre-commit guard refuses the likeliest leaks, and the history was rewritten once to remove what had been committed before the split.

## What is where

| | Lives in | Tracked |
| --- | --- | --- |
| Code, docs, tests, synthetic fixtures, prototypes, smoke scripts, builder configs | this repository | yes |
| `configuration/README.md` (explains the export) | this repository | yes |
| Configuration export `workspace.sql` (accounts, people, events, aliases, rules, palettes) | the private `urbanomics-configuration` repository, in the folder `workspace.json` names | no, ignored here (`/configuration/*`, `*.sql`) |
| Ledger, archives, snapshots, backups, logs (`private/desktop`), browser verification workspace (`private/browser`), validation screenshots (`private/validation`) | `private/` | no (`private/`, unanchored) |
| `%APPDATA%\Urbanomics\workspace.json` (where the app looks for the workspace, optional update token) | application data | no (`workspace.json`) |
| `remote-access.json`, `remote-status.json` (Tailscale remote access) | `private/desktop` | no |
| `private/sensitive-terms.txt` (names the guard refuses) | `private/` | no |
| Installers and the update feed | the `urbanomics-releases` repository | separate repository |

Bank exports, databases, logs, statements and images are ignored by extension everywhere (`*.csv`, `*.sqlite*`, `*.log`, `*.ofx`, `*.pdf`, `*.png`, …). Fixtures are generated inline by the tests and smoke scripts; no data file is tracked. If documentation ever needs an image, allow it explicitly (`!/docs/**/*.png`).

## How the app finds the private parts

`electron/workspace-location.cjs` resolves the workspace in this order: `URBANOMICS_DATA_DIR` and `URBANOMICS_CONFIG_DIR`, then `workspace.json` (installed releases only), then the defaults (the repository's `private/desktop` and `configuration/` for a development run, the application data folder for an installed release). Development builds never read the pointer file, so the installed app and the development build keep separate ledgers. A data folder given through the environment never borrows the pointer file's configuration folder, so a synthetic workspace run by a smoke script can neither seed from nor export over the real configuration. `Launch Urbanomics.cmd` sets nothing.

The configuration export is written by the app after every configuration change into `configurationDir`. Commit it there, in the private repository, as before. The app never runs Git.

## The guard

`.githooks/pre-commit` runs `scripts/check-public.cjs` on the staged files. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

It refuses SQL exports, bank exports, databases, logs, images outside `docs/`, local settings and secrets, Tailscale addresses, personal email addresses, tokens, user-profile and machine paths, configuration SQL rows pasted into any file, and any term listed in `private/sensitive-terms.txt` (one per line; keep people, events, account labels and anything else you never want to see in a diff). `node scripts/check-public.cjs --all` checks every tracked file; the release script runs it before building. A deliberate exception needs `git commit --no-verify`.

## Writing docs and fixtures

- Invent names for people, vendors, events and accounts ("Desk friend", "Juniper dinner", "Everyday chequing"). Never copy a row from the real ledger, not even its amount.
- Describe the product, not the owner's setup: which banks the importer supports is product scope; which accounts the owner has, and how their money moves, is not.
- No machine paths, no Tailscale addresses, no conversation links. Lab and smoke URLs come from `URBANOMICS_LAB_URL` or loopback.
- Transfer routes ship empty; users draw their own under Settings → Transfers.

## The rewrite

On October 2, 2026 the repository was public for a few minutes with the configuration export tracked. It was made private, audited twice (full history and working tree), and rewritten with `git filter-repo`: the configuration SQL was removed from every commit, a conversation link, a Tailscale address, the owner's account labels, one fixture row that matched a real transaction, and machine paths were replaced throughout history, and commit emails were mapped to the GitHub no-reply address. The configuration's own history was extracted into the private `urbanomics-configuration` repository first, so nothing was lost. Because unreachable objects can linger on GitHub after a force-push, the cleaned history was pushed to a fresh repository and the old one archived privately.
