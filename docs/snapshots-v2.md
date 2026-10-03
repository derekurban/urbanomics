# Snapshots

Snapshots is the single import workspace. The former V2 flow replaces the legacy page; there is one sidebar entry and new launches start here. The historical #snapshots-v2 and #data entry URLs still open Snapshots. Dropping files elsewhere in the app opens this workspace and stages them for explicit setup and import.

## Flow

Choosing or dropping CSV files stages and archives the originals without importing them and opens the guided setup. Files that share a header row are one kind and are set up once.

1. **We found N files.** The kinds, each with its files (removable), the months they cover, the suggested or recognized account, and how many things still need a call. Files already recognized by name on both counts (layout and account) are marked "Already yours" and need no screen.
2. **One screen per kind.** Left, the account: a name, type and colour suggested from the filenames and a recognition sentence ("Recognize files whose name starts with Bank_everyday") checked live against the staged files; or an existing account, recognized by its rule or picked from chips. Right, how the file is read, as facts with reasons: the date column and its order (checked against every row by the real parser; one fitting order fills in, two ask with an example of each, none is reported with the record), the description, the amount (one signed column whose direction a running balance proves, or money-out and money-in columns named by the headings), the balance, the currency. Only what the cells could not prove is a question. "Not right? Change the columns" opens the table-first mapper. The preview is the parser's reading of every row. Looks right saves the layout and the account and applies them to every file of the kind.
3. **Ready to import.** Every file with its account and layout. Import N files files each row by its own date and matches rows already recorded one-for-one.

`src/import-analysis.mjs` holds the proofs and the plain-language rule compiler; `tests/desktop/import-analysis.test.cjs` covers them. "How importing works" explains the same thing to the person, from the landing, the populated page and the setup.

The calendar shows one current snapshot per account/month over twelve months. Repeated and overlapping exports deduplicate one-for-one; partial exports cannot remove prior transactions. Source dates choose months. No date filter or inferred timezone adjustment is added.

## Input templates and accounts

Schema 20 added `import_layouts` (configuration), `account_import_layouts` (configuration) and `source_layouts` (private pinned interpretation). The account's original schema remains its legacy adapter hint; V2 can explicitly associate an additional layout with the same account. Future matching uses filename rules and compatible saved layout associations, retaining ambiguity and known-source routing checks.

Each custom source is bound to the exact template definition used to read it. Editing the template with a new staged example changes future imports, not prior source interpretations. An already imported original cannot be reinterpreted. Schema 21 adds `import_layouts.prefixRegex` to configuration. Layout matching uses the same anchored RE2 engine as account rules. Blank rules require manual selection. Headers alone never select a layout. Multiple filename matches report conflicting layout names and require explicit selection; mismatched headers reject a rule-selected layout. When a newly saved rule matches another file already staged in the same batch, Use this layout explicitly binds that file. The upgrade releases unimported native mappings for manual setup while preserving imported sources and user-defined layouts. Templates used by accounts or imported sources cannot be removed. Removing an unused template returns its staged files to layout selection while retaining their original archives. Template changes are version checked. Financial source cells, pinned mappings and provenance stay private; only reusable definitions and account-layout associations export to configuration SQL. Workspace reset clears the new tables while preserving archive files and its full recovery database.

The compact editor groups layout name/regex, columns and date/sign/currency controls above a three-row preview. Optional balance mapping is collapsed. CSV separator detection remains mechanical, with strict validation.

Layout support is intentionally strict: unique header row, consistent columns, UTF-8, comma/semicolon/tab, calendar dates in YMD/MDY/DMY order, exact cents, CAD/USD/EUR/GBP per template. No preamble/footer skipping, locale decimal-comma conversion, currency inference or multi-currency rows. Original built-in adapters retain CAD assumptions. Unsupported formatting surfaces validation errors for correction rather than guessing.

## Verification

Use `tests/desktop/import-layouts.test.cjs` for staged batch gating, unknown mappings, exact money/dates, malformed-file rejection, account-layout reuse, archive interpretation, template changes, ambiguity and regex segments. Web service tests cover byte uploads with staging and block arbitrary filesystem paths. Browser validation uses a fresh synthetic workspace, never personal transactions. Package and restart desktop after passing checks.

Date assistance additionally has unit/service and synthetic browser coverage for a decisive date beyond the first rows, ambiguous dates, leap years, invalid/mixed dates, preserved manual choices and immutable originals. `scripts/smoke-snapshots-v2.cjs` covers a fresh landing, manual file upload, mapping, independent filename rules and live preview, account creation before any import, invalid and matching regex, aggregate results, repeat deduplication, twelve-month calendar, tooltips, history/archive/layout dialogs, 1280/1440/1680px layouts, 768px-height dialog actions, top snackbar without layout shift, app-chrome file drop staying staged, cancel and confirm intake clearing. Screenshot evidence stays in private/validation. Native OS picker/Explorer actions were not automated; they retain the existing Electron platform bridge.

## September 20 polish

Opus-5 implemented the scoped visual pass through Claude Code: shared form/card spacing, a compact step rail, staged-file cards, animated selections, capped entrance staggers, progress/results feedback, and padded dialog scroll areas. Reduced-motion disables transitions and animations. Filename matching spans use monochrome fill and underline styles with a matching legend. Browser review caught and fixed an archive iteration variable shadowing its snapshot index. Date preview retains its position and focus while editing names.

131 unit/service tests passed. `smoke-date-assist.cjs` additionally covers column-switch races and preserves manual overrides, and `smoke-snapshots-motion.cjs` captures transition frames and checks reduced motion. Synthetic browser verification covers the full V2 import/re-import flow, calendars and dialogs; no personal data is used for testing.
