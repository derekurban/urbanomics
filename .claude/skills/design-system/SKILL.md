---
name: design-system
description: Use before any UI, styling, copy, icon, chart or layout change in Urbanomics. The app follows Derek Urban's design system (@derekurban/design-system); this explains where its rules live, how the app applies them, and how to request changes upstream instead of editing locally.
---

Urbanomics' interface comes from `@derekurban/design-system`, pinned in `package.json` and installed in `node_modules/@derekurban/design-system/`. Before changing UI:

1. Read `docs/design-system.md` in this repository: how the app consumes the system, its deliberate exceptions and open upstream requests.
2. Read the system's own rules in `node_modules/@derekurban/design-system/readme.md` (and `SKILL.md` there for the short version). For a component, read `components/<group>/<Name>.prompt.md` and `<Name>.d.ts` in the package. Token values are in its `tokens/*.css`.

Rules for this project:

- Use only the system's tokens (`--bg`, `--surface`, `--sunk`, `--line`, `--ink-*`, accent and status families, `--radius-*`, `--space-*`, `--shadow-*`, `--ring-*`, `--duration-*`, `--ease-*`, type tokens). Don't add hex colors, ad hoc shadows, radii or durations to app CSS. Account, category, tag and event colors are user data and stay independent.
- Prefer the package's React components (`Mark`, `Icon`, `SegmentedControl`, `Button`, `Dialog`, …) for new UI. Wrap them in `.du-host` inside app markup. Register any new Lucide icon in `src/icons.js` first.
- Native controls are styled by `src/design-system.css`; give the one resolving action in a view `className="primary"`.
- Copy: sentence case, no letter-spaced eyebrow labels, no exclamation marks, no emoji, labels name the action.
- Check light and dark (Settings → Appearance) and reduced motion in the browser on synthetic data.
- Never edit, copy or override the system's files here. If something is missing or wrong, open an issue (and, when asked, a pull request) on https://github.com/derekurban/design-system following its `CONTRIBUTING.md`, record it in `docs/design-system.md`, and upgrade the pinned tag after it's released.
