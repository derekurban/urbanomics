# Transaction rules

Organize → Rules manages global mappings with two match modes: **Aliases / vendors**, a searchable multi-selection of saved alias identities, or **Regex**, an RE2 pattern over the original bank description. Either mode maps to one tag and/or person, with an optional direction (any/in/out), enabled flag, name and optimistic version. Regexes retain case-insensitive Unicode matching, the 256-character limit and compiled-expression cache. No mappings are inferred from personal records or seeded as examples.

Alias mode matches any selected vendor only when a transaction resolves to exactly one alias across all saved alias definitions. Ambiguous aliases are skipped by alias-based rules; independent regex rules still follow their normal matching behavior. Rules reference stable alias IDs, so renaming or refining a vendor changes future matching without copying its regex into each rule. Alias edits never retroactively change assignments. Removing an alias referenced by any rule, including a disabled rule, is blocked until its references are removed. Switching a rule to Regex clears saved alias references; switching to Aliases clears its saved pattern.

## Applying mappings

Saving a rule changes configuration only. Newly inserted bank transactions apply enabled rules atomically during import; a duplicate/repeated import never reapplies rules to existing identities. The category mapping assigns the entire absolute amount, in exact cents, only when no category portions exist. Existing portions, including splits from another rule, remain intact. Linked transfers are protected. Manual cash and deleted-account transactions are excluded from rule matching.

People mappings fill `review.assignedPersonId` only when neither a person association nor an actual repayment person exists. This is descriptive metadata: it does not create a financial purpose, debt, split, repayment, transfer, or event membership. The repayment editor can preselect that person for the user to confirm. Transaction settings can change or clear the association; transaction-list badges and Organize's person usage include it. Actual repayment person identities and capacity rules remain separate.

Rules can be applied to existing transactions only through the explicit existing-data action. Its preview includes ready, conflicting, protected and unchanged matches. A SHA-256 token covers saved rules, all alias definitions/versions, entity definitions, and record identities/versions/source matching fields; stale previews are rejected and require refresh. Applying locks the database, recomputes candidates, checks the token, then writes ready rows atomically. No background/startup scan retroactively changes the ledger.

Compatible matching rules combine missing fields. Different proposed categories or different people make a conflict; there is no priority ordering and no winner. Conflict rows receive no changes, even if one field would otherwise be available. Existing values are protected rather than overwritten. If a rule proposes an already-assigned category plus a missing person, only the person can be ready, with the category protection explained. Invalid regexes/missing entity references and stale rule edits/deletions are rejected. Deleting an entity still mapped by any rule is blocked until the mapping/rule is removed.

Disabling or deleting a rule stops future use and does not undo previous assignments. Removing or changing a category/person manually is an explicit transaction edit. A later explicit Apply can fill fields cleared by the user; re-importing the same records cannot do so.

## Persistence and privacy

Schema 11 adds `transaction_rules` for configuration and private `transaction_rule_applications` for a minimal application audit (transaction identity, time, rule IDs, changed mappings, previous review version). Existing ledger rows, source files, snapshots and financial decisions are not migrated or rewritten. Rule application uses the existing review payload/version writer. Raw bank descriptions, IDs, amounts, fingerprints and archive contents are unchanged.

Rule definitions join the existing deterministic configuration SQL allowlist. Application history, matched transactions, assigned people/categories on transactions and audit payloads are never exported to configuration or Git. Empty initialized workspaces can seed rule definitions along with their referenced categories/people; configuration is not imported over an existing ledger.

## Verification

The transaction-rule model tests cover config-only saves, synthetic bank-format CSV imports, direction and raw-description matching, alias independence, exact amounts, repeat imports, protected manual edits, compatible/competing rules, disabled rules, stale tokens/versions, invalid regexes, entity-deletion guards, explicit person metadata changes, and private audit/config separation. Existing ingestion, financial review, account, alias, transfer and dashboard checks remain required.

`npm run test:rules` exercises the real Electron renderer, preload, IPC and importer with synthetic files: live previews, conflicting mappings, disabled rules, explicit existing-data apply, protected categories, person association edits, stale apply, new/repeat imports, invalid regexes, deletion, narrow/focused layouts and raw-record preservation. Schema-upgrade tests compare every existing table in a populated synthetic workspace.

The schema 13 hierarchy presents assignable mappings as Tags. For compatibility, the stored `categoryId` continues to reference a leaf entity of legacy kind `category`; broad parents use kind `bucket` and cannot be rule targets. Moving a tag to a different category changes its rollup, not the rule or its transaction associations.

Tag definitions now specify expense or income. Rule choices show this type; an explicitly opposing in/out direction is rejected. Any-direction tag rules only match the corresponding transaction sign. Person-only rules can still cover both directions. Transfers remain protected and tagging cannot infer repayment or earned-income purpose.

Schema 16 adds `matchType` and JSON `aliasIds` to rule configuration. Existing rules retain regex behavior and all financial tables remain unchanged. Both fields export in configuration SQL; aliases are seeded before rules. Preview/apply and new-import matching use the same current alias resolution, including ambiguity checks. Synthetic tests cover multiple vendors, alias renames and pattern edits, stale previews, deletion guards, invalid references, mixed regex/alias conflicts, repeat imports, mode switching, config seeding and migration preservation. Electron checks cover search, multi-select, persistent selections, Cancel, both match modes and narrow layouts.

## Transaction templates

Allocations → Next time → Remember these settings captures current tag proportions and the associated person. Event context is optional and selected explicitly. Templates use a description regex or saved vendor/alias identities across accounts, with a fixed income/expense direction. They never copy specific repayment or transfer links, agreed person shares, or absolute tag amounts. The proportional remainder stays unallocated, and largest-remainder rounding preserves exact cents.

Preview is required before saving. A save defines future-import behavior only; use Organize → Rules to preview and explicitly apply to existing records. Auto-review defaults off and keeps applied settings pending manual confirmation. Turning it on accepts the configured classification and removes the transaction from income/expense attention queues. Allocations includes a Needs attention only filter; accepted records remain accessible with it off. Manual saves clear the template review override. Existing template decisions are not replayed after subsequent edits.

A template matching alongside any other rule is a conflict rather than a priority contest. Existing tags, shares, repayment/transfer decisions, event membership or a different associated person are preserved. Disabled templates still protect their entity references from deletion. Schema 19 adds nullable template JSON to the deterministic configuration export; source transactions and private application history remain excluded. Existing rule definitions retain their behavior.

`node scripts/smoke-allocation-templates.cjs` verifies creation, preview, editing from Rules, seven-layer callouts with all sliders, sub-$100 template capture and both review modes through the browser against an isolated synthetic workspace. `tests/desktop/templates.test.cjs` covers proportional cents, income/expense queues, conflict protection, duplicate import behavior, manual overrides, events and configuration round trips.

## Reuse before creation

The transaction’s Next time section discovers matching ordinary rules and templates through the import matcher, including switched-off rules. Existing mappings are summarized next to the transaction, and differing current tags/person can update that same rule ID. Matching scope and future review preference remain editable. The independent Save as template action is replaced by Remember these settings only when no match exists.

Preview rows explain protection and overlap with concrete rule details, not just a conflict badge. Competing rules can be opened directly for editing; conflicting rows are shown first. Enabled template saves recheck observed conflicts atomically, including competitors introduced after preview. Saving a disabled definition remains possible. These changes do not retroactively assign or erase tags, people, events or financial links. Browser verification: `node scripts/smoke-rule-reuse.cjs`.
