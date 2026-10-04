# Design system

Urbanomics uses Derek Urban's design system, [`derekurban/design-system`](https://github.com/derekurban/design-system), for every interface color, typeface, spacing step, radius, shadow, motion duration, icon and logo. The design system repository is the source of truth. This project consumes a pinned release and never edits or copies the system's files.

## Where it comes from

- `package.json` pins `"@derekurban/design-system": "github:derekurban/design-system#v0.1.0"`. npm builds the package's `dist/` during install.
- `src/main.jsx` imports `@derekurban/design-system/styles.css` before any app stylesheet. It defines the tokens for light and dark, the Albert Sans and Wix Madefor Text fonts, and base element styles.
- `src/design-system.css` applies those tokens to the app's native `button`, `input`, `select`, headings and status classes, following the Button, Input and Select specs. It defines no new colors, radii, shadows or durations.
- React components come from the package: `Mark` (sidebar and phone header), `Icon` (navigation, close, check, sort and toolbar icons), `SegmentedControl` (Settings → Appearance).
- `src/icons.js` bundles `lucide@0.460.0`, the version the design system names, and registers the icons in use on `window.lucide`, which the `Icon` component reads. The app's Content Security Policy allows no CDN scripts. Add an icon there before using `<Icon name="…" />`.

### Installing on Windows

Version 0.1.0's build script uses `rm -rf`, which fails under npm's default Windows shell ([design-system#2](https://github.com/derekurban/design-system/issues/2), fix in [design-system#9](https://github.com/derekurban/design-system/pull/9)). Until a release includes the fix, a fresh install needs Git's shell for package scripts:

```bash
npm install --script-shell "C:\Program Files\Git\bin\bash.exe"
```

That is Git for Windows' default location; use your own Git installation's path if it differs. An existing `node_modules` is not affected.

## Reading the rules

The package ships its own documentation in `node_modules/@derekurban/design-system/`:

- `readme.md`: principles, writing, color, type, spacing, depth, motion, data visualization, iconography and the logo.
- `SKILL.md`: the short version of the rules that matter most.
- `components/<group>/<Name>.prompt.md` and `.d.ts`: usage and props for each React component.
- `tokens/*.css`: every token, in light and dark.

The project skill in `.claude/skills/design-system/SKILL.md` points agents to these files.

## How Urbanomics applies it

- **Tokens only.** App CSS uses the system's custom properties: `--bg`, `--surface`, `--sunk`, `--line`, `--line-strong`, `--ink`, `--ink-secondary`, `--ink-tertiary`, `--data-neutral`, the accent and status families, `--radius-*`, `--space-*`, `--shadow-*`, `--ring-*`, `--duration-*`, `--ease-*` and the type tokens. The former 21-step gray ramp (`--tone-*`), the `--paper`/`--muted`/`--soft` aliases and `electron/theme-config.json` were removed on October 2, 2026, and each use was mapped to the nearest system token by role (text, fill or line).
- **One accent.** Moss green marks the single primary action in a view (`button.primary`), the selected navigation item and success. Status colors are for errors, warnings and information only.
- **Depth.** Resting cards use `--shadow-rest`; menus, popovers and toasts use `--shadow-float`; dialogs use `--shadow-overlay` over `--scrim`. No backdrop blur and no decorative gradients.
- **Type and copy.** Albert Sans for headings and Wix Madefor Text for everything else, at the system's small step (14px) for this dense tool. Sentence case everywhere, no letter-spaced eyebrow labels, no exclamation marks, no emoji.
- **Themes.** Settings → Appearance chooses Light, Dark or System. The choice is stored on the device (`urbanomics.colorMode.v1`) and set as `data-theme` on `<html>`. Per-device palette editing was removed; the palette belongs to the system.
- **Motion.** Shared controls use the duration and easing tokens, which drop to zero under reduced motion. Bespoke product motion (allocation drags, Snapshots staging) keeps its existing reduced-motion handling.

### Deliberate exceptions

- **Account, category, tag and event colors** are user data. They stay independent of the interface palette and keep their meaning in both themes. Guidance requested in [design-system#7](https://github.com/derekurban/design-system/issues/7).
- **Monospace** for regular expressions and raw values uses a local stack until the system has a token ([design-system#5](https://github.com/derekurban/design-system/issues/5)).
- **Native elements** are styled in `src/design-system.css` to the component specs, because the components are inline-styled React and the app's existing markup is native ([design-system#3](https://github.com/derekurban/design-system/issues/3)). When a system component is used inside app markup, wrap it in `.du-host` so native element defaults don't leak into it.
- **Dialogs** use the app's `WorkspaceModal` on the native `<dialog>` element, restyled to the Dialog spec (subheading title, 24px padding, `--shadow-overlay` over `--scrim`, rise on open, resolving action last), because confirmations stack over editors and long forms scroll inside with the footer fixed. Sizes: narrow, default, wide. `ConfirmDialog` in `src/ui.jsx` is the one confirmation pattern ([design-system#14](https://github.com/derekurban/design-system/issues/14)).
- **Charts.** The year charts (`src/DashboardCharts.jsx`, also on Accounts) are bespoke until BarChart can stack, group, select and show missing months ([design-system#10](https://github.com/derekurban/design-system/issues/10)). They follow the data rules: neutral series, dashed gridlines, a hairline baseline, 3px bar tops, the accent only on the selected month.
- **Interactive stats** wrap the package `Stat` in a native button (`StatRow` items with `onClick`) ([design-system#11](https://github.com/derekurban/design-system/issues/11)).
- **Tag chips with identity dots** are drawn by the app ([design-system#12](https://github.com/derekurban/design-system/issues/12)). The hatched pattern for the unsorted part of an Organize strip is a deliberate data pattern, not decoration.
- **InfoDot and the category hover card** are local popovers on `--shadow-float` until the system has a Popover ([design-system#13](https://github.com/derekurban/design-system/issues/13)).
- **Text on user colours.** Labels drawn on account or category colours (the Organize strip) use ink chosen for contrast against the user's colour, since those colours aren't system tokens (#7).
- **Shared compositions** live in `src/ui.jsx`: `Alert`, `ConfirmDialog`, `Segmented`, `PageTabs`, `StatRow`, `PersonAvatar`, `PersonPicker`, `Swatches`, `FloatingMenu`. Transient confirmations go through `notify()` and the package Toast (`src/toast.jsx`), bottom-left of the content area. Plain-language recognition (`src/recognize.jsx`) replaces regex fields for filenames, aliases and rules; a stored pattern that isn't a plain sentence shows as a custom pattern.
- Retired screens that are no longer bundled (Review, Experimental, the orbit sorter and Rolodex) were removed from the source along with their stylesheets.

## Requesting changes

Never change tokens, components, fonts or logos inside Urbanomics. If the app needs something the system doesn't have, or something in the system is wrong:

1. Open an issue on [derekurban/design-system](https://github.com/derekurban/design-system/issues) using its template (bug, component request, or token and foundation change). Say where Urbanomics needs it.
2. Make the change there through a pull request, following its `CONTRIBUTING.md` (conventional PR titles such as `fix:`, `feat:`, `tokens:`).
3. After a release that includes it, upgrade here: `npm install github:derekurban/design-system#vX.Y.Z`, read the changelog for breaking changes, and check the app in light and dark before committing.

Open requests from adopting it:

| Request | Issue |
| --- | --- |
| Windows install fails (`rm -rf` in build) | [#2](https://github.com/derekurban/design-system/issues/2) (closed), fix in [#9](https://github.com/derekurban/design-system/pull/9) |
| BarChart: stacked and grouped series, selection, missing values | [#10](https://github.com/derekurban/design-system/issues/10) |
| Stat: interactive variant | [#11](https://github.com/derekurban/design-system/issues/11) |
| Tag: identity colour dot | [#12](https://github.com/derekurban/design-system/issues/12) |
| Popover component | [#13](https://github.com/derekurban/design-system/issues/13) |
| Dialog: top layer, scrollable body, sizes | [#14](https://github.com/derekurban/design-system/issues/14) |
| Class-based styles for native buttons, inputs and selects | [#3](https://github.com/derekurban/design-system/issues/3) |
| Icon without a `window.lucide` global | [#4](https://github.com/derekurban/design-system/issues/4) |
| Monospace font token | [#5](https://github.com/derekurban/design-system/issues/5) |
| Table component | [#6](https://github.com/derekurban/design-system/issues/6) |
| User-assigned identity colors in data | [#7](https://github.com/derekurban/design-system/issues/7) |
| Urbanomics sub-logo | [#8](https://github.com/derekurban/design-system/issues/8) |

## Verification

After a design-system upgrade or a styling change, build and run the browser checks in [browser verification](browser-verification.md) on synthetic workspaces, including `scripts/smoke-navigation-refresh.cjs`, which switches Appearance to dark and back. Look at each page in light and dark, then package and reopen the desktop app.
