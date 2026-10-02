# Mobile and remote access

Urbanomics can serve the live desktop workspace to a phone on your personal Tailscale network. Electron owns the database, archives, import processing and financial service. The HTTP host shares those exact objects. Phone uploads go to the desktop intake and archived originals; phone edits use the same versions, constraints and save operations as the desktop. There is no cloud copy or phone database. Browsers can download an original CSV or immutable snapshot explicitly from Archive or upload history; normal browsing reads app data from the desktop.

## Start and connect

1. Connect the desktop and phone to the same personal Tailscale account.
2. Run `npm run remote:setup` in the repository. It reads local Tailscale status and writes ignored `private/desktop/remote-access.json`, without changing finances. A custom `URBANOMICS_DATA_DIR` selects a different existing workspace. `TAILSCALE_EXE` can override the Windows CLI location.
3. Launch Urbanomics through its existing desktop launcher. Open the address printed by setup on the phone. The address is `http://<desktop-tailscale-ip>:4174`.

Keep the desktop awake, Urbanomics open and Tailscale connected. Closing the desktop app stops phone access; reopening restores the same address and data. A disconnected browser shows a reconnecting message. It does not queue financial edits offline. The HTTP application traffic travels over the Tailscale connection. Remote access is opt-in over your own Tailscale network; setup uses the direct Tailscale address, and HTTPS Serve mode is optional.

To disable remote access, set `enabled` to false in `private/desktop/remote-access.json` and restart Urbanomics. Settings and runtime status never enter Git. The status file is `private/desktop/remote-status.json`. No public listener, port forwarding or Funnel is configured.

## Access boundaries

Direct mode listens only on the desktop's configured 100.64.0.0/10 Tailscale IPv4 address. It looks up the actual socket peer with `tailscale whois --json`, and accepts only the configured personal login, rejecting tagged nodes, unknown peers and lookup failures. Identity lookups are cached for up to 30 seconds. Client-supplied identity and forwarding headers cannot identify a direct client. Requests must use the configured Host/Origin; writes additionally require the current session token. Downloads and event streams receive the same identity checks as financial API calls.

An optional Serve adapter accepts an exact `https://<machine>.<tailnet>.ts.net` origin, binds only to loopback, and verifies Serve's `Tailscale-User-Login` header. It is not automatically enabled by the direct setup script. Activate Serve before choosing this mode, and keep the backend reachable only through the local Serve proxy. See [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) for verified identity headers and HTTPS setup.

The remote API refuses native file-picker/folder operations and arbitrary path ingestion. Uploads are file bytes with bounded size and filenames. Archive downloads resolve known source hashes or snapshot IDs into existing immutable files; the server never serves a filesystem directory. Desktop-only folder buttons become archive browsing and downloads in the browser.

## First mobile iteration

- Six bottom navigation destinations with safe-area spacing, including the live Experimental attention workspace.
- Dashboard opens first on phone-sized windows. Charts and the account/month library scroll within their own panels when needed.
- Review keeps Transfers → Events → Income → Expenses → Overview. Transfer pairs can be selected by tapping each side and explicitly linking. Events, incoming allocations and expense share editors use stacked panels and touch targets.
- Expense review uses a card followed by broad category buttons and the selected category's tags. Tap a tag to save, or tap the transaction for split-tag settings. First assignment advances; changing a saved card stays in place. Desktop continues to use the radial.
- Tag order arrows offer a touch alternative to dragging. Modals fit phone viewports and retain their save/cancel actions.
- Both hosts receive saved-change notifications. An open financial draft retains its original version when another screen changes that transaction, shows a reload action and cannot silently overwrite the newer record.

The temporary transfer route-network lab retains its large interactive canvas; manual pairing is the primary phone workflow. A home-screen install/offline mode and a fully native file manager are not part of this iteration.

## Verification

`npm run test:mobile` runs Chrome with touch at 360, 390 and 430 pixels against a disposable sample workspace. It exercises navigation, explicit transfer linking, category/tag taps, persistence, transaction dialogs and an incoming draft competing with a second client's save. `npm run test:review-flow` checks retained Electron interactions. The desktop test suite covers shared-service behavior, identity/Host/Origin/token restrictions, unknown paths and archived-file downloads. Tests never classify personal transactions. Real workspace verification is read-only, with database preservation checks before and after installation.

Troubleshooting: confirm the desktop app is open, check `remote-status.json`, confirm both devices' Tailscale identity, and ensure Windows permits inbound TCP 4174 on the Tailscale interface. Do not open the service on the LAN or public interfaces to work around a connection failure. `npm run web` serves separate samples and does not test connectivity to the live desktop ledger.
