# Releases and updates

October 2, 2026. Urbanomics now has two kinds of build. A **development** run is the repository: `npm run desktop:dev`, `npm start`, or the unpacked folder from `npm run package:win` started through `Launch Urbanomics.cmd`. An **installed release** is the Windows installer cut by `npm run release`, published to GitHub Releases, and kept current by the app itself.

## What each build does

| | Development | Installed release |
| --- | --- | --- |
| Starts from | the repository (`electron .` or `release/win-unpacked`) | `%LOCALAPPDATA%\Programs\Urbanomics` (per-user, no admin) |
| Package metadata | no `channel` | `channel: release` (from `electron-builder.release.yml`, which extends the base config) |
| Workspace by default | `private/desktop` and `configuration/` in the repository | `%APPDATA%\Urbanomics\private` and `…\configuration`, unless `workspace.json` points elsewhere (below) |
| Window title | Urbanomics (development) | Urbanomics |
| Settings → About | "Development build", no update actions | version, "Installed release", Check for updates / Restart to update |
| Update checks | never | 15 seconds after start, then every six hours, and on request |

The build kind is decided in `electron/main.cjs`: `app.isPackaged` and `channel === "release"` in the bundled `package.json`, plus electron-builder's `resources/app-update.yml`. Everything else (`electron .`, `--win dir` builds, the browser host) reports updates as unavailable through the same `updates:*` channels, so the renderer never has to guess.

## Where an installed release keeps its workspace

Environment variables still win (`URBANOMICS_DATA_DIR`, `URBANOMICS_CONFIG_DIR`, `URBANOMICS_UPDATE_TOKEN`). After them, the app reads `%APPDATA%\Urbanomics\workspace.json`:

```json
{
  "dataDir": "C:\\path\\to\\urbanomics\\private\\desktop",
  "configurationDir": "C:\\path\\to\\urbanomics\\configuration",
  "updateToken": ""
}
```

`dataDir` is the private workspace (SQLite, archives, backups, logs). `configurationDir` is where the configuration SQL is exported after every configuration change; naming the repository's `configuration/` keeps `workspace.sql` under Git exactly as the development build does. A `dataDir` without a `configurationDir` means no export, as before with the environment variables. `updateToken` is optional (see "Who can read the feed"). The file was written on October 2, 2026 pointing at the repository, so the installed release and the development build share the one live ledger; the single-instance lock lives in that workspace, so only one of them runs at a time. See `electron/workspace-location.cjs` and `tests/desktop/updates.test.cjs`.

## How an update arrives

`electron/updates.cjs` wraps electron-updater. It downloads in the background as soon as a newer release is found (`autoDownload`), then reports `ready`. Nothing installs by itself: the sidebar shows "Urbanomics x.y.z is ready" with Restart to update, Settings → About shows the same, and quitting the app also installs it (`autoInstallOnAppQuit`). The installer runs silently and relaunches. The workspace is untouched; it lives outside the program folder.

States: `idle`, `checking`, `downloading` (with percent), `ready`, `current`, `error`. The renderer gets them over `workspace:update` and can call `updatesState`, `checkForUpdates` and `installUpdate`. The remote phone host may read the state but cannot check or install. Every transition is appended to `logs/updates.log` in the workspace.

electron-updater uses its own session partition, so the main process's default-session request block (file: only) does not apply to it. The renderer still cannot reach the network.

## Cutting a release

```bash
npm run release -- patch
```

`scripts/release.cjs` accepts `patch`, `minor`, `major` or an exact `x.y.z`, with `--no-push` and `--dry-run`. It requires a clean tree on `main` and a GitHub token (`GH_TOKEN`, or `gh auth token`). It bumps `package.json`, commits `Release vX.Y.Z`, tags `vX.Y.Z`, builds the renderer, runs electron-builder for the NSIS installer with `channel: release`, publishes `Urbanomics-Setup-X.Y.Z.exe`, its blockmap and `latest.yml` to the releases repository, and pushes the commit and tag. `npm run dist:win` builds the same installer locally without publishing.

Installers are not code-signed. Windows SmartScreen asks once on a fresh install; updates install silently because electron-updater does not verify a signature on an unsigned app.

## The releases repository

Artifacts go to `derekurban/urbanomics-releases`, separate from the source repository, so the source can stay private while the feed is reachable. The installer carries code only: `dist/`, `electron/` and `package.json`. The configuration SQL (`configuration/workspace.sql`, with account, people, event and alias names) is **no longer bundled**; an installed release reads it from `configurationDir` instead. A brand-new install with no pointer file therefore starts with the built-in system labels only.

### Who can read the feed

The releases repository was created **private** on October 2, 2026 and is still private. electron-updater can read a private GitHub repository only with a token. Two ways to make daily checks work; the user chooses:

1. Make `urbanomics-releases` public (`gh repo edit derekurban/urbanomics-releases --visibility public --accept-visibility-change-consequences`). Anyone could download the installer and read the bundled app code; no workspace data is in it.
2. Keep it private and create a fine-grained personal access token with read-only Contents on that one repository, then put it in `workspace.json` as `updateToken` (or set `URBANOMICS_UPDATE_TOKEN`). The app then uses electron-updater's private GitHub provider. The token never leaves the machine and is not in Git.

Until one of these is done, the installed release reports "The release feed could not be found" in Settings → About and keeps working otherwise.

## Verification

- `node --test tests/desktop/updates.test.cjs`: workspace resolution order; the manager's states against a fake updater (check, download, progress, ready, late error, install, timers, private feed with a token, readable errors).
- `scripts/smoke-navigation-refresh.cjs`: Settings → About in the browser host shows no update actions.
- The first release, v0.2.0, was verified end to end on October 2, 2026: a locally built 0.1.9 installer was installed, started with a read token (`URBANOMICS_UPDATE_TOKEN` in the environment of that one launch), found v0.2.0 in the private feed within seconds, downloaded the full installer, reported `ready`, and installed it silently when its window was closed; the installed copy then read 0.2.0 and started on the shared workspace. Without a token the same build logs "The release feed could not be found" and otherwise runs normally.

## Known limits

- No code signing and no macOS or Linux targets.
- Against a private feed, electron-updater cannot parse the blockmap it fetches through the API, so it falls back to a full download (about 115 MB) instead of a differential one. A public feed downloads differentially.
- Builds run locally; there is no CI publishing yet (the design-system dependency's Windows install needs Git's shell until its next release).
- Release notes are empty unless written on the GitHub release afterwards.
