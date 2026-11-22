# Vendors

November 21, 2026. Vendors replace aliases and transaction rules. A vendor is one readable name for every bank description that is really the same place ("SQ *BEAN COUNTER 1042", "BEAN COUNTER ONLINE 77" → Bean Counter), plus, optionally, the tag and person its new transactions get. Vendors is its own page in the sidebar, under Accounts (`#vendors`); the former `#settings/aliases` and `#settings/rules` addresses open it.

## A vendor

- **Name**, 1–80 characters, unique ignoring case.
- **Matchers**, 1–20. Each is a plain sentence over the original bank description, ignoring case: starts with, contains, ends with, is exactly. They compile to the same RE2 forms aliases used (`^text`, `text`, `text$`, `^text$`), so a stored pattern that isn't a plain sentence comes back as a custom matcher ("match the pattern …") and stays editable as one. A description belongs to the vendor when any matcher matches.
- **Tag** (optional): any tag except the system ones. An expense tag only goes on money out and an income tag only on money in.
- **Person** (optional): "Paid <person>" (`review.assignedPersonId`), on money out only. Money in from a person is a settlement, which is never automatic.

The shared helpers (`compileMatcher`, `decompilePattern`, `normalizeMatchers`, `describeMatchers`, `readableName`) are in `electron/review/vendor-model.mjs`; the store is `electron/review/vendors.cjs`.

## Names

A transaction matched by exactly one vendor shows under the vendor's name everywhere (`description`), keeps its bank text in `originalDescription`, and carries `vendorId`; the Dashboard groups its vendor lists by `vendorId`. A transaction matched by two vendors keeps its bank text, carries `vendorConflicts`, gets nothing automatically, and is listed at the top of the Vendors page with Edit buttons for each vendor. No vendor wins by order. Saving refuses a vendor whose matchers would catch a transaction another vendor already has, or a duplicate name, rechecked inside the save transaction. Bank descriptions, identities, fingerprints, snapshots and archives never change.

## Tags and people

- **New imports.** Newly inserted transactions (never repeats) get their vendor's tag when they have no saved tags (the automatic Other counts as none) and fit its direction, and its person when they have none. This runs inside the import transaction (`applyNew`).
- **Transactions you already have.** The editor's preview lists every match and what each would get. When a tag or person is set and some matches have nothing yet, a box (on by default) says "Also give N transactions you already have …". Saving with it applies those fill-only changes in the same transaction and the toast offers Undo, which restores each row unless it was edited since (that row keeps its newer edit; versions only move forward). The page also offers "Tag N transactions from their vendors" when any vendor's matches are waiting, checked against the state it was shown (a token) and undoable the same way.
- Linked transfers, manual cash, deleted accounts and clashing rows are never changed. Deleting a vendor leaves the tags it gave. Each change writes the existing private audit row (`transaction_rule_applications`, payload `{ vendor, changes, previousVersion }`).
- A tag or person a vendor gives can't be deleted until the vendor changes; merging tags moves vendors to the target tag.

## The page and the editor

The page lists vendors (name, matchers in words, how many transactions, what new ones get, how many unsorted could get it, clashes) and, below, "Without a vendor": descriptions no vendor covers, most frequent first. Choosing one opens the editor with a readable name (card-processor prefixes such as `SQ *` dropped, store numbers trimmed) and a "starts with" matcher. In the editor the same list sits on the left; choosing a description adds it as another matcher, which is how differently worded descriptions join one vendor. Each matcher shows how many transactions it catches. Suggest vendors (Claude) proposes names and matchers; see [assistant.md](assistant.md).

On the Organize desk the open row's Vendor slot shows its vendor and what new ones get, offers "Always tag it <tag>" when the row's one tag differs, "Edit vendor", or "Make it a vendor" for a row without one. The Same again toast's Always opens the same editor, seeded with the row's tag and the person it paid.

## Storage and migration

Schema 23 adds the configuration table `vendors (id, name, matchers JSON, tagId, personId, version)`, exported in `workspace.sql` in place of `transaction_aliases` and `transaction_rules`. When a workspace opens (and after a configuration seed written by an older version), aliases and rules are converted once:

- each alias becomes a vendor with the same id and name, its pattern as one matcher;
- an enabled rule that picks aliases gives those vendors its tag and person;
- an enabled regex rule whose pattern equals an alias's, or whose current matches all fall under one alias, gives that vendor its tag and person; otherwise it becomes a vendor of its own named after the rule;
- two rules giving one vendor different tags (or people) cancel out, as they did before, when a clash applied nothing;
- switched-off rules are not converted, and a proportional template keeps only a single full-amount tag and its person.

The old definitions and a list of these notes are written first to `backups/admin/before-vendors-<id>.json`, then the old tables are emptied in one transaction. The tables themselves remain so older exports can still seed a new workspace. Transactions a rule template left waiting ("A rule suggested these settings") still show their Keep them button.

## Verification

- `node --test tests/desktop/vendors.test.cjs`: matcher round trips, several matchers under one name, clashes and stale edits refused, new imports tagged fill-only by direction, apply-existing with Undo that keeps later edits, Apply all with a stale token, guards on tags and people, tag merges, configuration export and seed, and the alias and rule conversion with its recovery copy.
- `node scripts/smoke-vendors.cjs`: the browser host on a synthetic workspace: a vendor made from a description, a second matcher added from the list, a tag applied to existing rows and undone, a clash refused, the Organize desk's Vendor slot, a vendor made from the desk, a new import named and tagged on arrival, the old Settings addresses, dark mode and a phone-width editor. Screenshots in `private/validation/vendors-<time>`.
