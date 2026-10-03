# Import flow study

October 2, 2026. **Outcome:** the user chose D (Guided) and it was integrated into Snapshots the same evening (`src/snapshots-v2-guided.jsx`, `src/import-analysis.mjs`). This study stays as design history.

Originally: Three ways to set up a batch of bank exports, playable end to end with six synthetic files from three invented banks. Nothing saves and nothing touches the application. The question is which flow a person expects when they have just downloaded CSVs from their bank and want them in, without knowing what a regex is.

Run from the repository: `node node_modules/vite/bin/vite.js --config prototypes/import-flow/vite.config.mjs` (launch config `import-flow`), then open http://127.0.0.1:4186. `?flow=a|b|c` opens a flow directly; Start over resets it. `node prototypes/import-flow/check.cjs` screenshots each flow's screens under ignored `private/validation/import-flow-*`.

## The files

Three monthly exports from an everyday chequing account (`Bank_everyday_2026-07.csv` …, columns Transfer date, Description, Amount, Balance), two credit-card statements (`creditcard-statement-aug.csv` …, columns Posted, Merchant, Debit, Credit) and one odd `savings export (1).csv` (Date, Details, Amount). Files with the same columns are one *kind*; the study assumes a kind is read one way.

## Shared ideas

- **Plain-language recognition.** "Recognize files whose name *starts with* `Bank_everyday`", with the dropped filenames underneath as proof of what matches. Starts with, contains, ends with, is exactly. The app would compile this to the anchored RE2 it already uses; the user never sees a regex.
- **Table-first columns.** The file's first rows are the mapping surface: click a column heading, say what it holds. Guesses from the heading names are marked with a spark and must be confirmed; nothing is applied silently.
- **A fixed stage.** Every step lives in the same frame with the same header, footer and height, so moving between steps never jumps. Steps fade and rise in; reduced motion turns that off.

## The flows

- **D · Guided** (the default; accounts first and one question at a time, combined). The files are analyzed before anything is shown. The intro lists the kinds with what was worked out and how many things still need a call. Then one screen per kind: the account (name, type and colour suggested, a recognition sentence made from the shared filename and checked against the dropped files) beside a list of plain-language facts about how the file is read, each with its reason ("Balance rises when Amount is positive"). Anything the cells could not prove is a highlighted choice in that same list, with real rows as the examples. "Not right? Change the columns" opens the table-first mapper. Returning user (top right) pretends Everyday chequing already exists: its files are recognized by name and skipped. Then check and import.

- **A · Accounts first** (what the user suggested). Step 1: add accounts and a recognition sentence each; the file list on the right resolves as you type and flags what no rule catches. Step 2: for each kind, check the columns and confirm. Step 3: check and import.
- **B · Files first, grouped.** One step: the kinds, each a card with its files, "which account?" (pick or create; the recognition sentence is made from the filename for you) and "check the columns". Then check and import. Shortest path for someone who just wants the files in.
- **C · One question at a time.** Intro, then per kind: which account, which column is the date, which is the description, where is the amount (one signed column or out and in), does this look right. Then import. Longest path, least thinking, each screen has one control.

## What the cells can prove (used by Guided)

From the rows, not the headings, which only break ties:

- **Kinds**: files with the same header row are one kind and read one way.
- **Date column and order**: the column where every value parses as a calendar date; the order is settled when only one of year-month-day, month-day-year, day-month-year fits every value (a day above 12 settles it), otherwise it is a question with the first value shown both ways.
- **Money out and in**: two numeric columns where every row fills exactly one; the headings say which is which, otherwise it is a question.
- **Running balance and the sign of amounts**: a numeric column whose row-to-row difference equals another column's value is the balance, that other column is the amount, and whether the balance rises or falls on positive values proves which way is money in. Without a balance column the sign is a question, with the first rows shown under both readings.
- **Description**: the longest-text column that is neither a date nor money.
- **Months covered**: from the parsed dates, shown per kind ("Jul 2026 to Sep 2026").
- **Account name, type and recognition rule**: the prefix every filename in the kind shares, with trailing years stripped; words like credit, visa, savings, chequing (and a "PAYMENT - THANK YOU" row) suggest the type.
- **Already yours**: a kind whose files all match an existing account's rule needs no screen at all.

## Questions for the user

Which path feels like what you expect after exporting from a bank? Should a kind be recognized by its columns (as here) or only by filename rules (as the app does today)? Are guessed columns with a confirm acceptable, or should columns always be chosen by hand? Where should the recognition sentence live: on the account, on the kind, or hidden unless something fails to match?
