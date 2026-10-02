# Direction note

## Per-transaction liquid layers — September 18, 2026

The user proposes a vial metaphor: each incoming/outgoing amount begins as one default tag; connections to existing expenses and explicit tags create colored layers. They explicitly clarified that the stacked bar must be per transaction. The synthetic relationship prototype now explores this at its default URL, with the previous study preserved under `?view=relationships`. Each record has an independent bar, gray Other remainder, a unified Add layer chooser, exact amounts and adjacent dividers. Expense connections, tag pools and internal transfers retain distinct calculation effects behind a common presentation. Optional aggregate totals are separate. See `prototypes/relationships/README.md` for scope and validation. This is a trial awaiting user feedback, not a production migration or approval of allocation defaults.


## Connect → Classify → Context feedback — September 18, 2026

User feedback after the relationship trial: the unified interaction is relatively compelling and solid enough to continue exploring. For incoming money they propose Connect (deduct/link first), Classify (tag the remainder), then Context. They particularly like mixed receipts where connections consume part of the payment and the remainder can be classified as gift or other income. They question whether the Rolodex is suitable for this relational work and ask for a simpler, more polished direction. This is not an instruction to remove the production Rolodex or migrate financial data.

Proposed next trial, not yet implemented or accepted: one stable inbox/detail workspace, an anchored receipt and conservation rail, and three directly accessible sections with amount/status summaries. Connect puts transfer and expense connections on one surface; Classify operates on the unmatched remainder only; optional Context reveals existing related events/people and permits additional annotations without changing financial allocations. Ordinary income can jump straight to Classify; a fully linked transfer skips it; optional context must not force a stop. Editing a connection revalidates classification visibly rather than silently redistributing deliberate tags. Batch work remains available.

A connection may reveal context through its linked expenses without automatically copying event membership onto the entire receipt. Context should explain where those associations came from. The sample model has a single income tag and full-receipt internal transfers; multiple remainder tags and arbitrary partial internal-transfer combinations require explicit allocation model work before production integration. No UI edits or production changes were made during this feedback synthesis.


## Relationship workspace trial — September 18, 2026

The user challenges question-led attention cards: too many questions can limit freedom, and wants a credible hands-on exercise spanning transfers, repayments/deductions, events, expenses and payables before accepting a new direction. The assistant has revised the candidate interaction to a directly editable record workspace, with Focus and Desk layouts over identical sample state. This is a proposal awaiting user experience, not an accepted replacement for Experimental.

`prototypes/relationships/` runs at http://127.0.0.1:4183. It provides a mixed repayment/income receipt, partial repayment, independent expense tags and person shares, a bill paid by someone else with outgoing settlement, an internal transfer fee, reverse-link editing, event shortcuts, and a 120-item routine batch with per-item exclusions. Both layouts have undo, filtering and editable amounts. State is synthetic and session-only; no production code or personal records were changed, and desktop delivery is not needed for this disposable trial. See the prototype README for the exercise, limits and acceptance criteria.

Pending learning: whether Focus supports complex relationships without excessive backtracking, whether Desk supplies essential context, and whether a hybrid or an event-level settlement workspace is more appropriate. Test results validate the sample calculations and interactions only; they cannot establish enjoyment, production matching accuracy or scalability.


## Mini-grid allocation and tag docking — September 18, 2026

The user chose Mini grid from the split-bar prototype for application integration. Experimental income and expense cards now keep the shared segmented rail, exact tag amounts, remove buttons and available tags on one surface, replacing the separate browse/split states. Selected tags leave the available list and travel into a grid slot; removal returns them to their category (clearing search so the destination is visible). A 320ms shared-element flight and 260ms sibling movement preserve continuity. Reduced motion skips travel; keyboard focus follows the destination after landing; quick changes, card changes and unmounts clean up overlays. Only the active card is measured on selection, preserving the bounded Rolodex renderer.

The rail always offers an end divider into the gray, renameable Other remainder. Persist only positive Other portions (unless it is the sole fallback), preserving explicit zero-valued custom tags. Selecting a tag consumes Other first or takes half of the largest existing share. Removing a tag and lowering an exact amount return the released cents to Other; increases consume Other first, then other portions. Dividers move only adjacent shares. Split evenly shares all cents between custom tags. These are local drafts until the existing versioned Save succeeds; no import/schema/ledger migration. Preserve real IDs, legacy assignments, currency, system roles and incoming financial purpose. The shorter transfer sheet scrolls the tagging editor rather than overlapping its rows.

Validation: exact-cent allocation tests, isolated browser docking frames in both directions, keyboard focus, six tags, tiny portions, repeated selections, draft navigation, reduced motion, income/expense persistence and saved undo, plus 500/1,000-card rendering. Package and reopen desktop after browser validation as requested. The synthetic prototype remains as historical design context.


## Split-bar mockup — September 18, 2026

The user requested a disposable hands-on prototype before integrating a single segmented allocation bar into the application. `prototypes/split-bar/` now compares Inline, Mini grid and Integrated compact layouts against Original rail, draggable adjacent dividers, exact amounts with remove controls, automatic Other remainder, dollar/cent steps, undo and realistic one/two/five-tag presets. It is synthetic and disconnected from application APIs. This request explicitly stays outside the live app; do not package/restart the desktop for this trial. See its README for provisional allocation choices and checks. Browser behavior and screenshots are verified; the user's preferred layout and allocation behavior are still awaiting feedback.


## Immediate tag splits — September 18, 2026

The user likes replacing the default Other tag when choosing a specific tag and wants split controls immediately when selecting multiple tags. Both income and expense cards now open the existing split editor automatically for two or more tags, with dollar/cent precision, exact amounts and selected-tag removal. Back to Tags allows additional choices; any selection change reopens the split when multiple tags remain. Returning to one tag restores browsing. Equal initial allocations remain valid; the user can adjust or keep them before Save. Selection and view changes update the parent draft together, preserving amounts and avoiding competing state writes. Verify in the isolated browser, then package and restart the desktop app for the user to explore the finished changes.


## System tags and tags-only income — September 18, 2026

Income no longer requires a fixed paycheck/interest/sale/gift/other source selection. Financial purpose (income, transfer, repayment) still controls accounting; income tags describe the source. Legacy source fields remain private historical metadata and are not used for completion or calculations.

Expense Other and Income Other are locked gray system defaults. Existing exact-name Other definitions are adopted with their original IDs, preserving assignments and rules; otherwise stable system IDs supply them. Defaults are projected for records without saved portions, not bulk-written into financial payloads. Their automatic status keeps them in attention queues; explicitly saving Other files the decision. Choosing a specific tag replaces a sole Other, removing the final tag restores Other, and multi-tag exact-cent splits remain available. Rules replace automatic defaults but preserve deliberate assignments. Reset transaction tags restores the automatic fallback.

Transfer and Deduction are derived system tags, not user-selectable monetary portions. Transfer appears on linked entries; Deduction appears on receipts with positive allocations and their target expenses. Original expense tags and saved transfer tags remain preserved, and removing links removes the corresponding system tag. Their roles cannot be changed by renaming. Organize → Categories & tags → System tags permits names only; deletion, reparenting, color/type changes and ordering are locked. Gray defaults are excluded from gradient interpolation and manual reorder groups.

Schema 18 adds only system_tag_names configuration, exported with configuration SQL. Import identities, reviews, snapshots and archives are not migrated or rewritten. Review state exposes effective defaults and automatic link badges; internal raw records remain available to finance validation and undo. Verified with unit checks, isolated browser checks of rename/default/split/link behavior, and 500/1,000-card rendering checks. Personal transaction data must never be changed for verification.


## Income and expense decision cards — September 18, 2026

The user asked for the transfer card’s on-sheet polish across income and expenses and authorized a creative implementation to try. Experimental now removes the expense radial/outer tag toolbar. Expense cards anchor the receipt above an internal category rail and searchable multi-select tag tiles, with inherited colors and saved ordering. Selections are drafts: one tag receives the total; additional tags use existing retag/equal-cent semantics. Adjust split opens an on-card dollar/cent divider and exact boundary editor. A selected-tag strip supports removal; Save expense appears once tagged and uses the existing organize service, envelope and versioned undo. Optional Person is an assignedPersonId association, explicitly distinct from agreed shares or repayments. Advanced transaction settings remain on the card menu.

Income reuses the same tag browser and exact split editor while retaining independent source type, named Other, repayment/event allocations and transfer choices. Purpose and income tags still save atomically through the financial service. No source-type/tag inference and no ledger migration. Card heights are fixed per queue; state transitions, selection feedback and conditional footers honor reduced motion. Parent-held drafts survive the bounded renderer’s unmount/remount; 500/1,000-card navigation and 471-item performance remain covered. This is an implemented direction for hands-on feedback, not a claim that the user has accepted the new interaction.

## Bounded Rolodex rendering — September 18, 2026

Experimental retains the full in-memory attention queue and per-ID drafts, but mounts only a radius-eight window around the animated position (at most 17 cards and both matching tick rails, plus the sending card while pinned for its fold). DOM/style work follows that window, never the full ledger. Mount destinations before filter entry flights; repaint new nodes in a layout effect before display. Stable ID lookup and currency formatters are cached. This is renderer virtualization, not partial financial loading: matching, totals, ordering and save/version checks still use the complete ledger. Preserve keyboard Home/End, fast navigation, reduced motion, draft remounts, undo and failed-save restoration. `npm run test:virtual-roll` exercises 500/1,000 expenses and bounds mounted nodes; synthetic measurements with 471 expenses reduced average frame interval from about 281ms to 13.5ms on the development machine. Never measure saves by changing personal records.

## Empty connections and shared payment tiles — September 16, 2026

X on an outgoing connection immediately condenses the incoming receipt and collapses/inerts the footer and connector, including the three-choice state before Transfer is chosen. Income and deduction editors keep the incoming receipt compact and hide/inert the footer until the decision is valid; they omit Skip and reveal a single Save action when ready. Brief next-step guidance explains missing choices, then summarizes the amount recorded as income or deducted with any unassigned remainder. Removing a required choice collapses Save again. Selecting a candidate runs a 280ms card-local shared-element transition: its surface, description, amount, account dot/name and date move from the clicked tile's actual position (including scrolling) to the outgoing receipt; X and currency fade in near completion. The hero measures the final layout once in an invisible, immediately removed clone and animates text with transforms toward fixed endpoints, avoiding a moving destination and per-frame font reflow. Confirm remains disabled until the handoff finishes, the underlying receipt is hidden during motion, and the normal entry fade is suppressed afterward to prevent a second flash. Navigating away cleans up the overlay; reduced motion skips it. Selection changes only the draft, never saves a transfer.

## Card-local transfer picker — September 16, 2026

Experimental manual transfer selection replaces search with a right-side ±0–7 calendar-day slider and ±0–10% amount slider (0.1% steps). Amount tolerance is measured against the incoming receipt, includes both bounds, and only returns eligible same-currency outgoings from other accounts. Day comparisons use bank calendar dates in UTC to avoid DST shifts. Each card retains its own ranges, seeded from the shared matcher and clamped to these limits; edits never change shared matcher configuration. Explicit manual choice can still override automatic account routes. The chosen pair's tolerance is converted to the existing sent-amount basis for versioned persistence, preserving backend protections and fee/extra acknowledgement.

Selecting Transfer expands the scrollable candidate list within the same 320px sheet, smoothly condenses the incoming receipt, and collapses/inerts the bottom actions and connector. Choosing a candidate restores confirmation controls. Source content fades/slides between states; layout transitions take 240ms and respect reduced motion. Tests cover both date/amount bounds, protected rows, local settings, and a boundary pair saved through the actual financial service.

## Immediate folding feedback — September 15, 2026

Experimental captures the visible card before disabling controls and starts its fold on click, alongside the existing versioned save. A success stamp and queue removal are gated on persistence; slow saves hold the folded paper, failed saves unfold the same card for retry. Standard successful motion remains 750ms. Physical top/bottom paper segments have separate hidden backfaces and separated depth; the shared 3D parent has no clipping mask. The underlying core fades only when covered, preserving rounded flap edges. Undo clears both transfer drafts. Synthetic checks delay and reject saves, verify no premature stamp or queue removal, and measure click-to-fold latency.

## Compact incoming cards — September 15, 2026

Experimental incoming cards now use a 320px sheet: transaction descriptions are the primary titles, account names are secondary at bottom left, dates sit at bottom right, and the suggestion X is top right. The card heading, source inspector, direction captions, explanatory footer, bottom divider and Split tags / Matching setup / Linked history shortcuts are removed from this surface. Existing Review tools remain available. Fee acknowledgement sits in the connecting seam. Three connection choices, on-card editors, explicit save and the 750ms two-flap completion remain. This supersedes the larger incoming-card layout below.

## Neutral theme and incoming resolution — September 15, 2026

The new direction is implemented directly in Experimental. Compact queue tabs replace the full-width controls; the transaction search/account filter and side panel are removed. Incoming cards put the suggested outgoing record above the incoming receipt, use actual account colors as small accents, and keep differences, acknowledgement and actions on the sheet. X clears only the local suggestion and exposes three plus choices: Transfer, Deduction and Income. Manual transfer choice searches eligible same-currency outgoing records within the amount band across all dates; explicit manual choice may override the suggestion graph's account routes, as labelled. Existing pair eligibility and version guards still apply.

Income selects a source type and income tags; exact tag portions and financial purpose save atomically with one version increment through the existing financial API. Deduction selects a person, unique expense IDs or event members, and editable cent amounts bounded by current capacities. Excess stays unassigned; tagging never silently declares a repayment. Expense tagging retains its orbit. Saving incoming tag settings alone stays on that card until its purpose is resolved. Skip is session-only and makes no ledger change. Draft versions remain pinned even after navigating away and back; stale drafts must be explicitly reloaded. Undo is version-checked.

The application chrome now comes from @derekurban/design-system (October 2, 2026; see docs/design-system.md), which supersedes the theme-config.json palette, per-device palette overrides and the shared tonal ramp. Settings → Appearance chooses light, dark or system on the current device. Account, category and chart data colors remain meaningful.

The 750ms completion animation now folds bottom up, then top down over it (400ms), stamps the overlapping seam (100ms), and departs with its ticks (250ms). This supersedes four-corner/triangular folding. Card contents use fixed slots and crisp untransformed resting faces. No personal transactions should be classified to verify these changes.

The desktop card workspace is now unboxed: larger landscape cards, floating tag targets and a divider for transfer options. Mobile redesign was explicitly deferred. Resting selected cards use device-pixel-aligned positions with no transform/filter/will-change; only moving and neighbouring cards use 3D composition (neighbours retain 2px blur and the 70% apparent-opacity wash). Envelope creases adapt to card proportions so reflected corners stay inside the sealed shape. The same paper palette persists through all four folds; timing is 400ms folds + 100ms seal + 250ms departure, with no shrink bounce or backwards departure. Normal spring timing also applies to the arriving card. Synthetic browser checks inspect paused fold/seal frames, crisp resting geometry, stable content and saves; personal finance data is not altered.

## Experimental consistency and replay — September 15, 2026

The user rejected the dark prototype styling inside the live application and reported content jumps after animations settled. Experimental now adopts the existing light UI and keeps face row slots, menu controls, transfer selections and the category stage stable across motion and saves. Admin now offers a preview/confirmation action to unlink all transfers for replay, with an atomic private update and local recovery backup. The user's existing transfer data is not reset during development verification.

## Live Experimental section — September 15, 2026

The user authorized moving the three focused interactions into the real application. Experimental now uses the desktop-owned ledger through the existing browser/Electron service. Transfer cards show receiving and sending halves; selecting a half changes the options alongside it (below on phone). The saved route matcher proposes pairs and preselects mutually unique matches. It does not apply links without confirmation. Income and expense tags surround the Rolodex in a growing orbit, with inherited colors and manual tag order. The existing settings modal handles multi-tag cent-exact splits. Successful saves play the approved envelope; errors retain the decision. The regular Review tools remain available for income purpose, repayments, people, events and manual transfer matching. Dismissing a suggestion is only remembered for the current Experimental session. See [implementation and checks](experimental.md).

## Three focused decisions — September 15, 2026

The user selected transfer validation, income tagging and expense tagging as the three core activities to trial. The isolated `/lab/` now pairs the retained Rolodex with a contextual decision panel: account/payment comparison and fee acknowledgement for transfers; flat income tags; expense category tabs and tags with multi-tag cent-exact splits. Candidate pairs and all records are authored examples. Linking excludes both records from tagging; rejecting a suggestion releases them. Later leaves work pending, Undo restores the most recent decision, and Reset starts over. Saving commits only in memory before playing the envelope. Receipt tags do not set financial purpose or allocate reimbursements. Desktop is side by side; phone is a compact roll followed by the decision panel. Model checks and UI flows pass at four sizes, including reduced motion. The user's feedback on usefulness and feel is pending; production integration is not part of this trial.

## Attention before animation — September 15, 2026

The user sees the Rolodex as a tactile list and wants to establish its purpose: each card should represent something needing input, with convenient controls for that question. Pause animation refinements and revisit the full finance workflow. Code/document inspection confirms independent tag, purpose, transfer, event, share and allocation facts; optional event/alias/person absences should not automatically become chores. See `attention-model.md` for the inventory, evidence, unimplemented queue semantics and open mixed-receipt/refund questions. The proposed next trial is three meaningful card surfaces (tagging, transfer comparison, repayment allocation); it is not integrated or yet accepted as the next build. Mobile reading notes are at the existing notebook's `/#attention`. No ledger records were inspected or changed.

## Focused Rolodex — September 14, 2026

The user requested staggered departures and arrivals so individual cards and ticks visibly fly away, rather than the scene moving as one replacement. The latest trial keeps the scene stationary and staggers cards top to bottom, with 42ms between immediate cards. Each card's two ticks share its movement and timing; outer ticks continue the cascade. Rails allow sideways travel during filtering, retaining the vertical feather through opacity. The queue swaps only after all departing items are invisible, then the new items arrive from the left. The trial takes roughly 650ms including stagger; feedback on the feel remains pending.

The user rejected the remaining jank in the edge-on filter handoff and requested a different transition: fade the whole stack out to the right, then bring the new stack in from the left. The latest trial moves the complete scene, including both tick rails, with a 180ms exit and 280ms arrival. It swaps the queue only at zero opacity and keeps card/rail poses fixed within each phase. The filler deck and its per-card cleanup are removed. Rapid filter selections update the pending exit or depart continuously from an interrupted arrival. This supersedes the spin studies below; feedback on the new feel is pending.

The user approved trying a coordinated cleanup of the filter handoff. The landing card and immediate neighbours now retain their real DOM nodes throughout the flick. Retiring leaves tuck behind the incoming face and are removed before the final settling phase. Matching ticks move into filtered positions while excluded ticks fade early. Completion now performs invisible cleanup, with no new card replacement or tick-position reset. The 720ms timing remains; feedback on feel is pending.

The user prioritizes quick, seamless filter changes over a literal full rotation. The latest trial shortens the edge-on flick to 720ms and at most eight filler cards. Travel uses a smooth curve with zero endpoint velocity/acceleration; entry and exit tilt overlap the travel so the selection settles in one motion. This supersedes the long spin below. Phone/desktop checks cover sub-second timing, filtered landing and repeated filter changes; feedback on feel remains pending.

The user clarified that the fast spin should show the ends of almost-flat cards, and approved trying that interpretation. This supersedes the face-on cylindrical trial below. The spin now presents an exposed fan of radial leaves passing through 90°; hidden leaves tuck away, and the selected card eases upright during deceleration. Thin edges stay legible during the spin; the established 2px neighbour blur returns at rest. Ordinary scrolling and the envelope are unchanged. Feedback on this edge-on trial is pending.

The user requested a physical spinning Rolodex transition and explicitly allowed fake cards. The filter trial now places cards tangentially around a horizontal axle, with circular vertical/depth movement and a full rotation. Lightweight filler faces carry the fast section; entry and deceleration blend into the established resting stack. The 2.2-second timing, current filter behavior, ordinary scrolling and 750ms envelope remain. Geometry and filtered landing are verified at four viewport sizes; the user's reaction to the new feel remains pending.

The user expanded the trial to income and expense cards with filters and a full-turn spin that slows into the filtered selection. The isolated deck now has 60 illustrative transactions, direction chips, account choices and submitted name/description search. A 2.2-second spin traverses the larger remaining deck and eases into the matching subset. Changing filters mid-spin retargets from the current visual position. Reduced motion applies filters immediately. Done samples remain removed across filters until Replay cards or refresh; nothing connects to the financial ledger.

The user removed the confetti idea. Keep the 750ms envelope send-off, aligned checkmark and synchronized departing ticks without particles.

The user chose 750ms for the full envelope sequence. Remove the temporary speed control and ignore its saved setting; keep the established relative fold, stamp and departure timing, including the departing ticks and completion gap spring. Normal card scrolling is unchanged.

The user rejected an envelope triangle appearing after rectangular folds. The fold geometry now uses real triangular panels around diagonal hinges; the envelope seams are their edges, with no late graphic overlay. Both selected ticks slide right and fade on the same departure timing as the envelope. The anchored upper neighbour and fixed 2px / 70% softness remain.

The user settled on 2px neighbouring blur and 70% apparent opacity; remove Tune and ignore its old stored preferences. The next isolated trial adds Done: fold the selected card into an envelope, stamp a checkmark, then slide/fade right while the next card rolls forward. This previews an animation only; no financial records change. The user then requested all four sides fold inward and the upper neighbour stay anchored. Done now removes the selected item from the in-memory stack, closing the gap from below without restoring the sent card. Refresh replays the study; finishing all cards resets it. The existing scrolling motion remains the baseline. Feedback on the send-off is pending.

Latest visual trial: the user now wants opacity/blur on neighbouring cards. Apply subtle position-driven softness while preserving the approved motion and crisp selected card. This supersedes the earlier all-opaque preference for this trial; it does not restore the old disappearing rear-card tails.

The user explicitly likes the latest animation smoothness and rounded transition. Treat that motion as the accepted baseline. Their next refinement is a smaller visible peek from previous/next cards; adjust their resting fold while retaining the spring, gesture response, position path and selected-card size.

The user subsequently rejected opacity fades, protruding rear-card corners and the ghosted bottom card. Keep card faces/text solid and use inward depth/scale with occlusion instead. Both close-set tick rails stay interactive; preserve the mid-transition separation that prevents amounts being covered.

The user rejected the breadth and execution of the three-layout playground. Replace it with one intentional incoming-money Rolodex and a synchronized, selectable vertical tick index based on their supplied reference. Concentrate on scrolling, dragging, card depth and index selection before connecting financial actions. The previous playground UI and sample-task state are removed; the same phone-accessible `/lab/` address now serves only this interaction. Illustrative card faces provide movement context, without an account connection or task simulation. See `../prototypes/ingest/README.md`. User feedback on the feel remains pending.

## Hands-on ingest layouts — September 13, 2026

The user accepted the synopsis but wants disposable, hands-on UI alternatives, with mobile as the current viewing device. Organize and the alias/rule test-preview-apply mechanism are satisfactory. The open focus is triaging ingestion work, sorting/tag attribution, incoming deductions and transfer application. A separate sample-only playground at the notebook's `/lab/` compares Card stack, Work queues and Preview & apply. See `../prototypes/ingest/README.md` for trial boundaries, verification and the next feedback decision. Do not treat a prototype layout as approved for the live app before the user reacts.

## Experience checkpoint — September 13, 2026

The user requested a Wayfind map of implemented areas and unresolved interaction design before further expansion. See [experience-map.md](experience-map.md) for the Mermaid product map, evidence limits and proposed focus sequence. The finance loop is implemented; card-sorting fluidity remains explicitly open. The recommended next trial is a bounded sorting playground with realistic timing and synthetic records, testing desktop and phone equivalents. This is a proposed refinement direction, not a new interaction decision or application change.

## Phone access and responsive review — September 13, 2026

The next priority is a usable mobile experience alongside desktop. The user requested live access through their existing Tailscale connection, with all persistent files on the desktop. Electron now optionally serves its existing workspace service to authenticated personal-tailnet clients. This supersedes the earlier browser-only sample restriction specifically for the embedded remote host; standalone browser verification remains isolated. The first mobile iteration uses bottom navigation, touch controls, stacked panels and category/tag selection below an expense card. The desktop radial remains. See `mobile-remote.md` for connection, limits and verification.

## Transfers first and user-ordered tags — September 12, 2026

The accepted workflow is now Transfers → Events → Income → Expenses → Overview. Transfers are their own system lens and linked entries leave income/expense tagging. Pairing is tactile but always requires explicit Link. Events remain optional, income can be classified or allocated to expenses, and expense claims use the existing financial editor. Overview measures the full selected period regardless of tags. Manual within-category tag ordering supersedes alphabetical-only lists and drives inherited gradient steps. See `review-workflow.md` for implemented behavior and verification.

## Separate financial lenses — September 12, 2026

Expense tags now belong to broad expense categories; income tags are separate flat definitions. Organize and Review offer separate lenses with alphabetical tags. Tagging alone does not classify income, repayment or transfer purpose. The review radial has no pages: fixed-size targets use extra rings as needed, and the dragged card stays beneath expanded targets. Parent moves use drag/drop or keyboard pickup/place rather than dropdowns. Existing financial decisions remain unchanged. See `tag-hierarchy.md`.

## Transfer experiment — September 12, 2026

The user requested a temporary auto-link testing tab under Review → Transfers, using amount/day similarity and directed account permissions while preserving manual links. The lab implements an editable route matrix, conservative one-to-one candidate classification, explicit batch apply and a read-only comparison against existing pairs. It does not automate imports. Start with exact amounts and ±1 day, with adjustable tolerances. See `transfer-lab.md` for the algorithm and current limits.

## Current Organize direction — September 11, 2026

The user requested a full Organize overhaul delegated to Fable 5.1, preserving existing management while adding regex-driven category/person rules. Fable 5.1 designed the Overview, compact management lists and Rules UI through Claude Code using source-only files; the parent integrated the persistence and verified the Electron workflow.

Organize now opens with a management Overview and sections for Categories, Events, People, Accounts, Aliases and Rules. Cleanup items link to their management tools; transfer differences open linked pairs. Rule previews separate ready, conflicting, protected and unchanged matches. Implementation choices: saved rules fill gaps on new imports, with an explicit apply step for existing transactions; they never overwrite current assignments. People are associations, independently editable, without inferring repayment purpose. Definitions are versioned configuration; applications stay private. See `docs/transaction-rules.md` for the current behavior. Historical prototype notes below remain design history where superseded.


Updated: 2026-09-11

## Current request

Money in/out now excludes linked internal principal across all dashboard views, including transfers spanning dates or hidden accounts. Fees remain external costs and unexplained extra remains separately identified. Per-account bars use the same boundary rule. Internal transfers appear in a shared-node network with directed edges and linked-payment inspection, replacing repeated account-to-account rows. This supersedes the earlier inclusion of internal principal in gross cash flow.

The dashboard now leads with monthly expense and external bank-flow trends, a year/month picker limited to existing data, and stacked period breakdowns. Category details group by vendor/alias with expandable dated transactions and a full-list toggle. Cash flow leads with available exported balances, per-account movements and directed transfer routes. Current bank balances cannot be established for PC/Simplii exports without an opening/current balance source; EQ running-balance observations retain their dates and same-day ambiguity. This supersedes the initial summary-card-first dashboard layout.

The user accepted the in-chat dashboard mockup and asked for implementation with a pastel palette. Dashboard now integrates Spending, Cash flow and Events, date/category filters and source drilldowns. It separates cash movement from costs after repayments and recorded debts, keeping fees, event overlaps and repayment timing explicit. See `dashboard.md` for accounting and scope policies.

The user removed the numbered Review stage, while explicitly retaining Review in the sidebar. Categories, Money in, Events, Transfers and Overview are independent tools with no stage numbering. Transactions exposes editable financial details and independent saved-state filters rather than a reviewed/pending completion flag. Existing financial payloads remain unchanged; the legacy reviewed field no longer controls visibility, reports or transfer eligibility.

Changing categories on an already categorized transaction keeps the current card. Only a successful first assignment advances through the unfinished queue. This applies to category clicks, drops and transaction-settings saves; removals and cancellations stay put.

Category review now shows all category targets in one growing circle/ellipse. The user rejected paging between subsets of categories; search remains optional, and ordinary vertical scrolling accommodates larger rings.

The user wants a visible money-in workflow and deductions from single transactions or unrelated selections without requiring events. Review → Money in now separates typed income from expense deductions, offers manual cash receipts, and is reachable directly from an expense. New and edited events require both dates. Cash receipts are private, off-bank contributions; allocation and reversal use the same caps as bank repayments. Earlier optional-event-date decisions below are superseded.

The user accepted integrating shared-cost allocation and replaced event cards with a calendar. Optional event start/end dates suggest bank-exported dates within a ±1-day window, with explicit linking by day or transaction. Every transaction needs categories; event membership stays optional. Single-ended dates are implemented as one-day occasions. Review shows event cost breakdowns and lets incoming money allocate to expenses through an event shortcut. Saved allocations target unique expense IDs, preserve excess as unassigned e-transfer income, and do not follow later membership changes. Existing transaction category and financial decisions remain independent.

Aliases now apply globally across accounts. The user explicitly approved committing configuration definitions (aliases, accounts, filename rules, categories, events and people) as SQL in the GitHub repository. Live SQLite, transactions, snapshots, raw CSVs and financial review decisions remain private. The app keeps the SQL export current; Git commits remain an explicit repository workflow. Fresh empty workspaces can seed definitions from the tracked SQL.

Suggested transaction alias regexes now keep the leading `^` and escape bank text, but omit the trailing `$` so suffixes can match. Saved rules are unchanged.

The user reversed transfer matching to start from money in, with outgoing candidates shown alongside it. Alias management and the unaliased transaction picker now use compact rows with less padding; names, rules, account context, amounts and edit actions remain available.

The user settled the transfer linker: incoming pending entries on the left, outgoing candidates on the right within a configurable plus/minus percentage band, checkmarked selections and an explicit Link action. Linked pairs leave the pending view, and are available under Linked with month/search filtering and Unlink. Shortfalls default to fees. Implementation starts the band at 2% of the outgoing amount; the user can set 0–100% in 0.01% increments. Candidates search across imported months without a hidden date cutoff. Additional incoming money is retained as an unexplained difference, not inferred income. Existing financial decisions and repayment reservations remain protected.

The user superseded the month picker: recognized uploads should deduplicate and apply transactions automatically without selecting a month. The importer now uses all exported dates, including the current month, and matches exact same-account rows one-for-one across overlaps. Account ambiguity still asks for assignment. Uploading or assigning a recognized file starts processing; manual folder discovery stays staged. Re-uploading old originals backfills rows previously excluded by a range while retaining accepted transaction IDs, reviews and archived snapshots. Startup does not reprocess archives.

Alias creation now includes a searchable preview of transactions without aliases. A row can seed an exact-match rule, and Save & create another keeps the editor open while removing newly covered transactions from the list. This queue is independent of category assignment and financial review.

The latest request adds regex-based transaction aliases in Organize alongside a shortcut to existing account-name/prefix management. Preview all historical imported matches and competing rules before saving. Retain source text, flag future ambiguous matches without guessing, and keep financial decisions independent. Clicking a selected category now removes it and stays on the same card; dropping retains quick-save-and-advance. Chevron alignment is corrected with centered SVG icons and square controls.

The latest accepted refinement replaces tags plus category views with direct categories and removes the board. Category cards save and advance immediately when dropped onto a category. Clicking a card opens a searchable multi-category settings modal with split controls; Save advances after persistence, while Cancel leaves the card and data unchanged. The user's mention of “multiple tags” in this request is interpreted as multiple categories, consistent with removing tags. Organize now contains Categories, Events, Accounts and People. Events retain whole-transaction membership and their explicit Save & next flow. Earlier tag/view and board descriptions below are historical.


Upload history now emphasizes the destination account, with color, timestamp and status in a compact row. Filenames and receipt details expand underneath. Modal scroll padding leaves room for visible input focus outlines. Accounts now support deletion with an impact confirmation and Restore: active views and routing exclude deleted accounts while local financial history and immutable archives remain preserved. Tests use synthetic accounts for deletion and restoration.

The latest refinement renames Data to Snapshots, compacts the layout and removes redundant labels and the permanent results card. Refresh feedback uses an overlay snackbar. Processing results open in a playful modal with a brief success celebration. The archive presents one current snapshot per account/month in a single row, with original files collapsed; older immutable files remain available on disk. Inset modal scrolling preserves rounded corners. Entrance, hover and processing motion respect reduced-motion preferences.

The user requested editable account names, filename-prefix regex rules and account colors. Data now stays on one page: a refresh action, a compact rolling calendar of the last 12 completed months, the Dropbox queue, animated processing feedback and a persistent latest-run summary. Colored rounded squares indicate account-month snapshot presence, with minimal hover/focus details and no revision labels. Upload history and full archive inspection open in modals. Earlier archived months remain available there. Prefix rules are optional, bank-specific and case-insensitive; ambiguous matches require review. These are implemented decisions, not changes to the accounting model.

The user accepted the in-chat Data prototype and requested applying it to the real app, with a Fable UI pass. The repository and live workspace now run from `C:/path/to/urbanomics`. The Data section is the single place for Dropbox intake, upload history, archived originals and account-month snapshot management. Fable 5.1 supplied the React/CSS layout through a restricted Claude Code task with code and synthetic inputs only; the coordinating agent implemented storage, IPC, integration and verification.

Build an operational Electron app in the existing private `urbanomics` repo. Start with the most recent completed month from supplied CSV samples, support drag/drop multi-account intake, deduplicate into monthly snapshots, archive sources and revisions, and keep personal data local and ignored by Git.

## Evidence from the earlier conversation

Source: [link to the earlier private conversation removed]

The shared conversation was readable on 2026-09-09. Its attached document and ZIP contents have not been reviewed. No existing code has been inspected or imported.

The user previously asked for:

- A personal finance app for their own use, with experience considered before architecture.
- Less effort maintaining data across several bank and investment accounts.
- Understanding income, spending, transfers, balances, and investment growth.
- Correct treatment of fronted expenses, reimbursements, shared rent, and utilities.
- Views by category, event, account, situation, and time, including trip costs and budgets.
- An intentional monthly import that trims exports to the selected month.
- Explicit documented rules and relationships rather than fuzzy matching.
- Original imports archived separately from their normalized monthly copies.
- Application work committed to Git while raw financial data stays out of Git.
- Compatibility with desktop agents, with review of AI-driven financial changes.
- Starting with 2026 data.

These are historical preferences, not assumed answers to every decision in this fresh start. In particular, 'Dropbox' may have meant a local intake folder; cloud storage is not established.

## Assistant proposals to revisit

The previous assistant proposed SQLite, YAML configuration, a CLI, several screens, rules, and transaction IDs. Those choices were not demonstrated in a working application.

Potential weaknesses to resolve through implementation and focused checks:

- Deterministic matching is not necessarily correct matching: same-amount payments can be unrelated.
- Replacing an account-month can lose records if the replacement export is incomplete.
- IDs based on duplicate occurrence order need validation against reordered and overlapping exports.
- Filtering out other months must preserve source provenance and support links across month boundaries.
- Transaction activity alone does not establish opening balances, investment valuations, growth, or registered-account contribution room.
- Real configuration and accepted decisions can expose financial details even when raw files are ignored.
- Date-window event assignment should be a declared choice or a reviewable candidate, not an unexplained assumption.

Bank export formats and limits quoted in the old conversation have not been independently verified. Validate supported formats against actual, user-provided or safely redacted examples when implementing parsers.

## Confirmed focus for the restart

The user wants to nail the uploading and finance-management experience. Their first question is how much they spend on different things, accounting for expenses they cover for friends who repay their share.

The proposed interaction calls this a shared expense and linked repayment. The user's term was a "deductible based system"; tax deductions are not part of the stated request.

## Working hypothesis

### User acceptance and transition to implementation

After the sixth trial, the user said the flow and experience are in a good spot. They value the fun of dragging, dropping, and organizing alongside the ability to inspect and divide transactions into richer structures. They are comfortable deferring cleanup and animations until the full app is built. This settles the overall experience direction; it does not individually confirm every proposed accounting default.

The assistant's proposed next milestone is one real month from CSV import through saved organization and repayments to a traceable spending breakdown. Begin with a chequing account and credit card so own-account payments are exercised, while designing account support for the user's full account set. Preserve original imports, handle repeat and overlapping imports without silent loss or double counting, retain edits across restarts, and support backup/restore. The first desktop import milestone now validates PC, EQ and Simplii layouts against supplied exports; financial organization and reporting remain to be implemented.

Before net spending by tag is implemented, settle how an expense-level repayment reduces tag portions. A proportional default with an explicit override is a proposal, not a confirmed user decision. Cash paid, personal share, repayments received, and outstanding amounts must remain distinguishable.

Completion evidence for that milestone: import the month, organize a mixed-tag purchase, link a repayment, close and reopen with decisions intact, reimport without changing totals, and trace a category total back to source rows and allocations. The existing prototype only establishes interaction fit and synthetic calculation behavior, not real-data reliability. The desktop importer now establishes the ingestion and persistence portion; the complete spending workflow remains the longer-term milestone.

### Sixth iteration, the current prototype

The user clarified the direction: transactions may have multiple tags, defaulting to equal monetary portions, while categories provide a separate layer for viewing selected tags and organizing insights. The prior assumption that each tag is owned by exactly one category is superseded. Transaction tagging and the organization of insight views are independent.

The implementation brief is `docs/fable-one-brief.md`, prepared for Fable 5.1 (the filename is historical). Fable 5.1 implemented it as `prototypes/insights-flow.html`, delegated through Claude Code at the user's request. The workflow is Import → Organize → Events → Deduct & balance → Insights, with every stage reachable after import.

What the sixth trial does:

- Every expense, incoming payment, and internal transfer carries reusable tags with exact-cent portions that sum to the transaction. One tag takes the full amount; several tags start equal, with the rounding remainder assigned deterministically. Adjacent dividers adjust neighbouring tags at $1 or $0.01 precision, with a visible Split evenly action.
- Changing tags on a manually adjusted split keeps the user's amounts, starts new tags at $0.00, and shows a review notice instead of silently resetting.
- Tags are created, renamed, and removed in Organize; removal is blocked while a tag has portions.
- Category views are created, renamed, given tags, and deleted in Insights. The same tag may sit in several views. Each view shows gross money out and in, money in by financial purpose, internal transfers separately, per-tag contributions, and the transactions with their in-view portions. Combining views counts each portion once and names overlapping tags.
- Events still hold whole transactions and drive repayment selection with one canonical set of expense IDs. Deduct & balance is unchanged.

Overlapping views remain an assistant design default to try, not a separately confirmed requirement. Net personal cost by tag is still unspecified, so every tag and view total is labelled as a gross flow before repayments and shares. Fable 5.1 implemented the trial through Claude Code; the coordinating assistant reviewed it and fixed mixed-transfer reporting and small display issues. Sixteen current tests pass, including structural and headless UI checks. Browser checks verified category and tag management, manual splits, overlapping totals, drag assignment, independent repayment review, and a 360px layout without horizontal overflow. See `docs/insights-trial.md`.

### Fifth iteration

The fifth iteration was `prototypes/board-flow.html`, preserved as design history. The user asked for visible contents within categories/groups, assigned items leaving the unassigned queue, synchronized group/expense selection, and multiple estimated monetary tags on one purchase.

The trial uses an unassigned lane beside a two-column board of categories containing tag lanes and transaction portions. Grouping uses a parallel board of event contents. Dropping an unassigned item gives its whole amount to a tag. Editing tags supports rough splits using the existing dollar/cent divider. Moving a tagged portion changes only that portion; category totals sum tag amounts, with incoming/outgoing amounts shown separately. They are organization totals before repayment deductions.

Its taxonomy proposal, each tag belonging to one broad category, was superseded by the sixth iteration's independent category views. Category/tag definitions were fixed sample choices in that trial; the user has not finalized a taxonomy.

Repayment selection now stores unique expense IDs. Choosing a group selects all its expense members and updates each child checkmark. Unchecking one child makes the group partially selected; clicking a partially selected group fills its missing members. Deselecting a fully selected group removes those expense members; overlapping groups update their checkmarks accordingly. Group membership alone remains organizational and does not create a repayment allocation.

Verified: actual pointer drops remove dinner from Needs tags and an incoming payment from Ungrouped; a $240 Walmart purchase splits into $140 Groceries and $100 Furniture; group/child checkmarks remain synchronized. Sixteen model tests pass, and the tag editor fits at 360px. See `docs/board-trial.md` for limitations and the next review point.

### Fourth iteration

The fourth iteration is `prototypes/staged-flow.html`. The user requested:

- Import → Categorize → Group → Deduct & balance, with broad categories and thematic groups kept independent.
- A full list of incoming and outgoing items on the left, with drag destinations on the right during organization.
- Dollar or cent precision for both people-share and repayment-allocation dividers.
- One searchable multi-select list containing individual expenses and groups, including mixed selections.
- Repayment allocation across the selected expenses, with groups initially distributed evenly.
- An explicit unassigned e-transfer income remainder when a payment exceeds what is allocated.
- Saving a payment must not mark its linked expenses reviewed.

The trial expands groups into unique expense leaves, so selecting a group and one of its members does not count the member twice. Incoming items may belong to groups, but are never themselves repayment targets. Categories and group membership do not create repayment links.

Working interpretation: without an explicit agreed split, the expense's unreimbursed portion is personal cost. An explicitly agreed split preserves the user's share and tracks unpaid friend shares separately. This timing distinction remains a proposal to validate with the user. Amounts use integer cents, with capped allocation and exact conservation of the payment across expenses and unassigned income.

Browser checks confirmed independent expense reviews, mixed group/individual selection, exact sender recognition, dollar/cent adjustment, and a completed example with $419.43 personal expense cost, $178.99 allocated repayments, and $31.01 unassigned e-transfer income. Imports and pre-triage remain synthetic fixtures. See `docs/staged-trial.md` for scope.

### Third iteration

The third iteration was `prototypes/inbox-flow.html`. It followed this direction:

- Import a batch across chequing and savings accounts at two banks, plus Mastercard, and triage known movements.
- Set up groups before review, with group management also available within review.
- Use visible choices instead of dropdowns for income/repayment, scope, category, and target selection.
- Show people as a horizontally scrolling row of avatars with names underneath.
- Select the sender before choosing an expense or group.
- Drag expenses between groups, with a select-and-move alternative.
- Use dividers between share segments. A divider changes only the two adjacent people; other shares stay fixed.
- Show only unfinished tasks in the left inbox, under Money in and Money out. Completed items leave the list.

This supersedes the previous prototype's proportional redistribution sliders and always-visible list of reviewed items. The sample starts with five routed account files, known rule results, and two paired own-account movements. These are simulated fixtures, not tested bank integrations or a general rule engine. The concrete $200 personal-share case passes both model tests and browser interaction checks.

### Previous iteration

The user liked the starting point and requested these changes:

- Compact import: show included/excluded counts as quiet plus/minus subtext, without previews of row contents or a pre-review monthly breakdown.
- Incoming money receives a purpose: general income, job income, selling something, or repayment of an expense.
- A repayment can cover multiple expenses in a shared collection or trip.
- People are reusable entities. Explicitly recognized e-transfer senders can be remembered and brought into linked expenses.
- Expense shares should be adjustable with sliders, initially split equally by participant count.
- Improve spending views later; focus now on import and review.

`prototypes/review-flow.html` was the second trial. It and `monthly-flow.html` remain available as design history. The sample demonstrates a $180 payment covering Alex's $60 dinner share and $120 cabin share. Remembering the exact sample sender recognizes Alex on the next transfer, without guessing that transfer's purpose.

The sliders preserve each expense total while redistributing the remaining shares. This interaction, the oldest-expense-first allocation suggestion, and hiding spending until review is complete are assistant design choices to try, not individually confirmed requirements.

The first useful experience may be: select a month, review a small number of unresolved money movements, and understand personal spending separately from cash paid and money owed back.

The earlier trials recorded the user's agreed share as personal spending and tracked the friend's share separately as owed back. The fourth trial also supports the user's requested received-repayments method when no agreed split is recorded.

## Open questions

1. Does the tag board with a Needs tags lane make sorting and finding assigned items easier?
2. Do reusable category views over independently tagged transactions provide the right insight organization? Should those views overlap, and is the combined once-only count understandable?
3. Is keeping a manual split with new tags at $0.00 the right reviewable default, or should new tags take an equal share immediately?
4. Does the distinction between received-repayment cost and an explicitly agreed share match the user's expectations?
5. Later: how repayments affect individual tag portions in spending reports, merging a tag into another, real multi-file selection, ambiguous account routing, bank-specific formats, persistent storage, recurring arrangements, unmatched transfers, and cross-month balances.

## Next action and review point

The circular card trial is now accepted for implementation in Tags and Events. Each stage uses explicit Save & next, retained drafts while browsing Review, and saved completion progress. Events reuse existing group identities and support No event. Board remains available for bulk work and inspection. The user subsequently requested and accepted the app-wide Organize area: it replaces Accounts in the sidebar and manages tags, categories, events, accounts and people. Account settings and import controls live in its Accounts subsection. Review and Organize use the same records and editors.

The user has supplied manual CSV exports and asked for monthly copies excluding September. The January–August preparation utility is implemented and described in `docs/csv-preparation.md`. Original data and per-file results remain private. PC export date/time interpretation still needs validation against the bank's displayed transaction dates; no timezone correction was inferred. Export automation remains unverified after browser tool failures.

The user has accepted the overall sixth-trial experience and requested the first operational desktop import milestone. Electron + React and a SQLite-backed importer are implemented with three bank adapters, explicit account routing, cautious overlap review, source provenance, and immutable monthly revisions. Native Electron integration and synthetic recovery checks are now separate from prototype tests; see `docs/desktop-imports.md`. The latest completed month is loaded locally as a trial, with source-specific results kept private.

“Clear the Dropbox” is implemented as clearing successful app-owned intake copies after archive publication. Downloads originals remain untouched. This is a local intake workflow, not a Dropbox cloud integration. Month boundaries use exported calendar dates pending statement comparison.

The user has now requested integration of the accepted review prototypes with imported snapshots. The persistent Review workspace implements tags and split portions, independent category views, event groups, a financial task inbox, people and agreed shares, repayment allocation across months, and explicit transfer pairing. Matching amendments preserve decisions. See `docs/desktop-review.md` for implemented behavior and limits. Next: try organizing a real month and refine the workflow from that experience. Net personal spending by tag, sender recognition, automatic tagging, and backup/restore UI remain open.

Repository setup is complete when a private GitHub remote exists, the initial files are pushed, and the working tree is clean. Product discovery and application implementation remain open.

Category targets use compact two-line chips and footprint-aware spacing around the ring, with a smaller center card and reduced padding. Keep all categories available without paging; selected amounts remain in the selected-assignment chips and transaction editor. Grow vertically only as needed to avoid overlaps.

## Tactile transfer lab — September 12, 2026

The user requested movable account nodes and drawing directional transfer connections, plus testing as if previous transfers did not exist. The lab now defaults to an in-memory unlinked sandbox with read-only selected-pair validation. Pending only retains explicit live linking. Node layout is a local preference; route and tolerance definitions remain saved configuration. Actual saved transfers and archives are preserved.

## Categories and tags hierarchy — September 12, 2026

The user replaced the single category layer with broad categories containing narrower tags. Food includes groceries, restaurants, fast food, coffee and cafes, bars, delivery, alcohol and cannabis. Personal includes clothing, cosmetic and toiletries, medical and gifts. Tags can be moved between parents in Organize. Review should use fixed-size cards and bubbles with a two-motion drag: enter a broad category, then choose its tag petals. The implementation preserves existing portions as tags, leaves unmatched definitions ungrouped, and adds a category/tag dashboard switch. Overflow rings use eight targets at a time with search, keeping footprints fixed; this is an implementation choice for the trial.
