# Browser verification

User preference, September 18: perform UI testing and visual inspection in the browser, including animation and performance verification. Use synthetic isolated workspaces and the shared application service. Perform verification in the browser rather than controlling the desktop UI. Once validation passes, package and restart the desktop app for the user to explore the changes; the user explicitly requested this automatic delivery workflow. Keep unit/service checks; explicitly report any Electron-only behavior that browser testing cannot cover.

This page describes the isolated sample host. Phone access to the live desktop workspace uses the embedded host described in [mobile and remote access](mobile-remote.md). Never point the sample host at the live ledger.

Run `npm run web` from the repository, then open `http://127.0.0.1:4173`. This builds the same React interface used by Electron and serves it through a local Node host. `PORT` changes the listening port. Stop the server with Ctrl+C and rerun after source changes; reload the browser after rebuilding.

The browser has a separate persistent workspace in ignored `private/browser/`, initially seeded with three months of synthetic transactions. Its accounts, configuration SQL, reviews, uploads, archives and snapshots stay there. It does not open or seed from the desktop ledger or write the repository's configuration SQL. The sidebar identifies this verification workspace. Electron continues to own the desktop workspace and native folder dialogs.

Both hosts call `electron/workspace-service.cjs` for the same financial operations, validation, ingestion, deduplication and configuration export behavior. Electron uses its trusted preload IPC bridge; the browser uses a method allowlist over localhost HTTP. No public hosting, remote synchronization or Electron dependency is required for the browser host.

Upload CSVs, Choose folder and file drops submit browser-selected file bytes. CSVs are limited to 20 MiB each and 250 files per selection; folder selection includes top-level CSVs only. Recognized files process through the shared importer, with results combined for the current selection. Each file retains its own upload-history entry; Latest results after a refresh shows the most recent file's processing result. Original files selected from Downloads remain untouched. Native Open folder actions are available in Electron; the browser can inspect archive, snapshot and source details in the existing dialogs.

The host binds to `127.0.0.1` only. It checks Host/Origin, requires a session token for writes, refuses arbitrary filesystem path imports, and serves only built application assets. A workspace lock prevents two browser servers opening the same directory. It is intended for local verification, not Internet deployment.

`node --test tests/desktop/web-server.test.cjs` covers API parity, isolated persistence, CSV repeat imports, session/origin checks, path rejection and workspace locking. `npm run test:dashboard` verifies nested tag hover totals against split expenses and repayments in Electron; screenshots stay in ignored `private/validation/`.
