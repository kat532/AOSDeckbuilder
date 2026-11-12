# Changelog

All changes to `index.html` and the test suite. Staging and production are deployed separately and only with owner approval.

## V5.3 C7 Gate C3 — owner's final stair-support rule (branch `v5.3/c7`, 12 Nov 2026)

Owner: **Gate C2 not approved**; final intended behavior confirmed. Built on `checkpoint/v5.3-c7-gate-c2` (`aaf67f3`, unchanged). **Pending owner approval; not deployed; final C7 release work not started.**

**Root cause:** in C2 the 6 ft cut-stringer span check both screened the stairs and generated the supports, so supports were drawn at any height. Screening and generation are now separate.
- **Deck 8′0″ or less** (vertical deck-to-grade rise): nothing is generated. Every flight is still checked; a flight whose cut stringers span more than 6 ft with no support gets a **"Structural Review Required"** warning (additional support, a different stringer design or other verified details may be necessary; NOT structurally approved), a red dashed outline and label in 2D Framing, and a line in the framing summary and Review › Framing. Recorded in `stats.stairSpanReview`.
- **Deck more than 8′0″**: support beams, posts and concept footings are generated. A landing on its own posts and footings satisfies the height rule; flights longer than 6 ft get the further supports the span check needs. Connections and sizes stay flagged for AOS production review.

**Tests**: 4′, 5′, 6′, 7′, 8′0″, 8′1″ and 10′ × straight, landings (straight/left/right), low landing (long upper run) and 6 ft wide stairs; quantities equal the generated members; owner-path app tests at 7′ and 8′0″ (no members in 2D or 3D, red outline, summary and Review) and at 8′1″ and 10′ (members visible, counts and summary match). Gate C exceptions extended only to the new warning and `stats.stairSpanReview`.

**Full regression**: 609 tests, 608 pass, 0 fail, 1 TODO (cut-corner golden, unchanged), 35.5 min; tree identical before and after the run.

## V5.3 C7 Gate C2 — owner stair support correction (branch `v5.3/c7`, 12 Nov 2026)

Owner testing: **Gate C not approved**; the intermediate stair support "did not appear as expected". Built on `checkpoint/v5.3-c7-gate-c` (`884fd15`, unchanged). **Pending owner approval; not deployed; final C7 release work not started.**

**Reproduced in the Gate C HTML** (owner path: deck with no stairs → Stairs → add stair → Framing; 7′, 8′, 8′1″, 10′ and a 10′ turning landing): the engine built the support beams, posts and footings, but
- 2D Framing drew the stringers and riser lines over the 3 in. beam, so it could not be seen; the framing summary did not mention it;
- 3D kept the camera fitted before the stair was added, so the stair and its supports were partly out of view.

**Repairs**
- 2D Framing draws stair support beams (at least 8 px wide, outlined) and their posts last, over the stringers and riser lines; the framing summary and Review › Framing list them.
- 3D refits once when a stair gains support members, so the whole stair and its supports are in view (no other camera change).
- AOS framing rule (owner, 12 Nov 2026): a stair with more than 8 ft of vertical rise has at least one intermediate structural support. A landing counts only when framed on its own posts and footings; otherwise a support beam is added to the longest flight. The 6 ft cut-stringer span rule still applies to every flight at every height. A *review* note states which support satisfies the rule.
- Supports are decided per stair after its flights and landing exist; every beam sits under all stringers with its top at their underside, on posts with footings (independently checked).
- Code references corrected to the Minnesota Residential Code (Minn. R. ch. 1309, adopting the 2018 IRC with amendments; stair width per Minn. R. 1309.0311). A 2024-IRC-based Minnesota edition is expected in late 2026; confirm the edition in force.

**Full regression**: 606 tests, 605 pass, 0 fail, 1 TODO (cut-corner golden, unchanged), 37.4 min; tree identical before and after the run. New tests: AOS 8 ft rule and support load path (130 cases, 89 stairs), owner-path e2e (2D color, summary, 3D refit).

## V5.3 C7 Gate C — stair and railing stabilization (branch `v5.3/c7`, 11–12 Nov 2026)

Owner authorization 11 Nov 2026, from the owner-approved Gate B2 checkpoint (`checkpoint/v5.3-c7-gate-b2-approved`, `dcff7d0`, unchanged). **Pending owner approval; not deployed.** Screening against the Minnesota Residential Code (Minn. R. ch. 1309: 2018 IRC R311.7, R312 as amended; corrected in Gate C2 from "2021 IRC") and the AWC prescriptive deck guide (DCA 6); nothing is presented as code-approved.

**Findings on R1 / Gate B2 (35 baseline designs, independent audit `tests/c7c-audit.js`)**
- Deck and landing guards: bottom-rail underside about 5½ in. above the decking, so a 4 in. sphere passes (430 guard bays).
- Baluster spacing by a rounded count: openings up to 4.4 in. on short bays and landings, and up to 6.3 in. on stairs, where the first bay starts at the deck post but its balusters started at the stair edge (51 bays).
- Stair bottom rail about 6 in. above the nosings: the riser/tread/rail triangle passes a 9.4 in. sphere (max 6).
- Cut stringers spanning up to 11.9 ft with no intermediate support (9 flights over 6 ft).
- No warning when an open deck edge or stair side more than 30 in. above grade has no guard, and no handrail requirement shown.

**Repairs**
- Balusters spaced between the posts actually there for at most 3¾ in. clear (deck, landing, stair); bottom rail underside 3 in. above the deck/landing; stair bottom rail ½ in. above the nosing line.
- Cut-stringer flights longer than 6 ft get evenly spaced support beams across all stringers, on 4x4 posts with concept footings (2D, 3D, counts; review alert).
- New alerts: handrail required (4+ risers; not modeled, guard top rail not verified graspable) and guard required (deck edges or stair sides over 30 in. with no railing), both *warning*; stair finished clearance with the 36 / 31½ / 27 in. references, *review*.
- 3′ default stair width kept. Posts, post caps and top rails are exactly R1's (1½ in. aluminum inset preserved). Railing mounting is keyed to the top-mounted aluminum system only; no wood preset added.

**Full regression**: 603 tests, 602 pass, 0 fail, 1 TODO (cut-corner golden, unchanged), 35.8 min; index.html sha256 bd3f92e2… identical before and after. One older e2e check (CP3 rail ends) exempted fixed bottom-rail heights at the deck; it now requires the rail end to be at the deck guard post instead.

**Tests**: `tests/stairs-rails-c7c.test.js` (110 designs and matrix cases, 69 stairs), `tests/e2e-v53-c7c-stairs.test.js`; Gate C exceptions only for the changed balusters/bottom rails, stair support members and new alerts (`tests/c7-gate-c.js`); posts, caps and top rails compared with the R1 build itself.

## V5.3 C7 Gate B corrections — owner visual testing (branch `v5.3/c7`, 11 Nov 2026)

Owner visual testing: **Gate B NOT approved**; Gate C not started. Built on the Gate B commit `66be222` (tag `checkpoint/v5.3-c7-gate-b`, unchanged). R1 unchanged. **Pending owner visual testing; not deployed.** Concept framing only, never presented as engineered.

**Irregular beam and post placement (root causes and repairs)**
- A post within 0.6 ft of another beam's post was counted as carrying both beams even when it did not stand under the second beam (inherited from R1; in the screen and in the model). Now a post serves two beams only when it is physically under both; it moves to the crossing of the two beam centerlines when that works, otherwise the beam end has no post and the layout fails the screen.
- Beam-to-beam contact was never checked. Two beams whose bodies touch must now END on one post under both (end-to-end or T connection); a mid-span crossing or any other overlap is a clash and fails the screen.
- New inset support-ring candidate for outlines with angled edges (concave corners, narrow sections, mixed 45°/22.5° edges): one beam per joist-end edge, set in by the cantilever, consecutive beams meeting on one post at the crossing of their centerlines; free ends run on (≤ 0.6 ft, inside the outline) under the side rims; interior straight beams only as long as the joists that need them, ending on a post at the ring beam. Rectangles, L, T and U keep their framing.
- When no layout passes, the layout with the fewest screen failures is shown (R1's when nothing is better) and every failing member is RED in 2D and 3D, labelled NOT BUILDABLE, with a warning; it is never presented as a usable arrangement.
- Owner irregular deck: R1 / Gate B left 12 joists and 2 side rims without bearing; now 0 (10 beams, 27 posts, 2x8). Of 12 custom outlines (`tests/c7-irregular-shapes.js`), 10 pass the screen; 2 (flared 22.5° sides, narrow angled arm) have short tip joists that fail the 1/4-backspan rule and are shown red for production review.

**Picture-frame blocking regression**
- Cause: Gate B added a rim-backing joist on notch side rims that R1's picture-frame assembly (rim / continuous flat 2x6 / picture-support joist) already backed; this doubled the framing, removed corner-trimmer stubs and shifted field-end blocking. Geometry, not rendering.
- Repair: no rim-backing joist on an edge with a picture-frame assembly; the screen and the independent audit accept that assembly as the rim's support path. Every baseline design now builds R1's support joists, flat 2x6 blocking, corner trimmers and field-end blocking exactly (`tests/baseline/c7-picture-frame-r1.json`, recorded from R1 by `scripts/record-c7-picture-frame-r1.js`). Reframed baseline designs: 14 → 7.
- Rendering: the 2D Framing plan now also draws the flat 2x6 picture-frame / divider blocking and field-end blocking that 3D showed (see-through, so beams under it stay readable).

**Full regression**: 594 tests, 593 pass, 0 fail, 1 TODO (cut-corner golden, unchanged), 34.9 min; index.html identical before and after the run.

**Tests**: beam/post connection checks in the independent audit (`supportChecks`); 12 custom outlines plus the owner deck checked member by member; 2D/3D agreement by member position (each member's drawn 2D outline and the vertices 3D builds, against the model, 0.01 ft) and red marking in both views; R1 picture-frame members preserved. Exceptions changed only for reframed designs (beam profile and flush-beam depth alert follow the joist size).

## V5.3 C7 Gates A and B — framing planner prototype (branch `v5.3/c7`, 11 Nov 2026)

Owner authorization 11 Nov 2026 (C7 Phase 2). Built from protected R1 `01f16df` (index.html `b8058b7b…`, unchanged; tag `checkpoint/v5.3-c7-start`). **Pending owner review; not deployed.** Concept framing only, never presented as engineered.

**Gate A (tests first, engine unchanged, tag `checkpoint/v5.3-c7-gate-a`)**: independent framing audit (`tests/c7-audit.js`) and required cases (`tests/framing-c7.test.js`). On R1, 10 of 11 cases fail (unsupported joists or side rims, or beams/posts outside the outline); recorded in `tests/baseline/c7-framing-r1-gate-a.json` and run as documented expected failures. R1 full regression: 541 tests, 537 pass, 0 fail, 4 TODO.

**Gate B (planner)**
- Selection by hard constraints: the R1 layout is kept when it passes the screen (every joist and load-carrying side rim bears within span, 2 ft cantilever and 1/4-backspan limits; every beam and post physically inside the outline). Otherwise all layouts are compared; if none passes, the R1 layout is kept and a warning says it requires structural review and is NOT buildable.
- Angled corner beams parallel to each cut, set in so the corner joists cantilever within the limits, meeting the main beam on one shared post (connection flagged) and running to the side rim. Beams fitted so their full width stays inside; U-shape beams moved clear of the open notch; segments where a line crosses a notch.
- Load-carrying side rims checked; continuous rim-backing joist along L/T/U/bump-out notch side rims. Flush perimeter posts moved ½ in. inward to the beam face where they projected.
- Counts: joists include corner trimmers and rim-backing joists; new cornerTrimmers, rimBackingJoists, rimJoists. 2D Framing plan draws every joist role (2D and 3D now show the same members).
- Results: all 11 required cases and all 35 baseline designs pass the screen (14 reframed, listed in `tests/c7-framing.js`). 18x12 two cut corners: 4 joists unsupported → 0, 3 → 5 posts. Octagon: 14 → 10 posts, 8 → 0 crowded footing pairs.
- Open: flush-beam angled decks and 45° bay bump-outs mostly have no passing layout and are flagged for structural review (header/trimmer option not built).
- Full regression: 568 tests, 567 pass, 0 fail, 1 TODO (cut-corner golden predates B2/B3; re-record only after owner acceptance).

## V5.2 Group A — checkpoint 2: A3 full-width stairs and landings (branch `v5.2/feature-recovery`, 7 Nov 2026)

Built on checkpoint 1 (tag `checkpoint/v5.2-groupA-a1a2`, unchanged). Internal build `5.2-group-a-a3`. Main deck framing generator untouched. 254 tests: 250 pass, 0 fail, 4 known structural failures (case 4).

**Full-width stairs**
- "Full edge width" on any stair: it spans the whole edge (offset 0), the deck railing on that edge becomes the stair opening, and the stair follows the edge when the deck size changes. A second stair cannot share that edge. Turning it off returns to 4′ 0″.

**Straight stairs with a landing**
- "Landing" on any stair: upper flight → landing → lower flight to grade, in a straight line.
- Landing width (stair width to +8 ft), depth (3–12 ft) and height above grade, in feet and inches. Every riser is the same height (total rise ÷ total risers, at most 7¾ in.); the landing height snaps to a whole number of risers with at least two risers above and below, and the app says when it moved it. Needs a deck of about 2′ 7″ or more; otherwise the button explains why it is unavailable.
- Drawn in 2D (landing platform, both flights, "Landing W × D · H high" dimension), finished 3D (treads, closed risers, skirts, landing surface and fascia) and framing-only 3D (both flights' stringers and the landing frame on its posts and footings).
- Stair railings follow each flight's pitch; guards on the open landing sides whenever the landing is more than 30 in. above grade, otherwise where that side's stair railing is on.
- Landing supports are separate from the deck framing: doubled 2x8 headers, rims, 2x8 joists at 16 in., 6x6 posts on concrete pads, counted separately (landings, landing posts, landing footings, landing framing). Main deck joists, beams, posts and footings are identical with or without a landing (tested). Every landing carries a review flag: concept only, NOT structurally approved. A landing too low for posts, or one that runs back under the deck, is flagged.
- Quantities: treads, risers, stringers for both flights; stair area includes the landing; stair railing length includes both flights and the landing guards; the Review step lists landings, posts, footings and framing members.
- Saved as `landing: {width, depth, elevation}` and `fullWidth: true` on the stair record; older single-flight and multi-stair files open unchanged and plain stairs build exactly as in V5.2 (framing-equivalence test).

**Tests added**: 13 engine tests (equal risers across 20 height/elevation combinations, flight/landing positions, support isolation, review flags, guards, quantities, limits, full width, overlaps, under-deck warning, save/reopen and compatibility) and 5 browser journeys (full width incl. deck resize and reopen; landing sizes, snapping, 2D label, 3D and framing-only, Review step, save/reopen, Undo; limits and low decks; several stairs with overlap refusal; old files).

**Known limitations**: landing framing is a fixed concept layout (not sized from loads); landing guard returns are drawn only when the landing is wider than the stair by about 1 ft; the stair hint bar and some phone labels from earlier builds are unchanged; turning stairs (A4) not started.

## V5.2 Group A — checkpoint 1: A1 + A2 (branch `v5.2/feature-recovery`, 7 Nov 2026)

Built on the protected V5.2 baseline (SHA-256 80b6afea…61c6). Version label unchanged (V5.2 · Deck Studio); internal build `5.2-group-a-a1a2`. Framing generator untouched. Project files unchanged in format. 226 tests: 222 pass, 0 fail, 4 known structural failures (case 4, reported as TODO).

**Tests reconciled (owner-approved 7 Nov)**
- Browser tests follow the V5.2 step order (Framing & Ledger = step 3); the expected step list is the V5.2 order.
- 23 snapshots updated after `scripts/approve-v52-snapshots.js` verified every difference is case 1 (duplicate corner trimmers on rim joists removed), case 2 (new containment statistics) or case 3 (new outside-outline warnings). It refuses any other difference.
- Case 4 not accepted: cut-corner snapshot and three angled-corner tests keep their assertions and run as known structural failures with the reason shown.

**A1 — defects**
- D1 Free Draw: a corner whose edge would cross or touch an earlier edge is refused ("That edge would cross edge 1…"); the next-edge preview turns red and reads "Crosses the outline". Closing a crossing outline gives the crossing reason instead of the angle rule. Closing never adds or slides a corner more than 2 ft outside what was drawn (previously a 4-tap sketch could close as a 30 ft-deep zig-zag). Size reasons (e.g. "at least 4 × 4 ft") are unchanged.
- D2 Corner tool: typing a cut size then pressing Apply works the first time with no page error. The size field updates the preview, slider and Apply button in place; panel renders can no longer nest.
- D3 Exact edge length: refusals say why — "Edge 2 must be at least 0′ 7¼″. 0′ 1″ is too short; no change made.", "Edge 2 can't be 45′ 0″: … editor range. No change made." — and nothing changes.
- D4 Change Deck Shape keeps every house wall (and its ledger) on the same side of the new shape; the confirmation says so; Undo restores the old shape.
- D7 withdrawn: the second corner control is the size slider paired with the exact field, not a duplicate.

**A2 — section dimensions**
- T: Main section depth, Extension width. U: Main section depth, Left arm width, Right arm width. Exact feet-and-inches; refusals explain the room needed; Undo works.
- L section fields already existed (Leg width, Main deck depth) and are now covered by tests.
- Changing overall width or depth keeps L, T and U section sizes exact instead of stretching them.

**Checkpoint verification (owner request, 7 Nov)**: full suite on the complete build (SHA-256 604adfc4…bef2): 236 tests, 232 pass, 0 fail, 4 known structural failures (case 4). Added: framing-equivalence test against the protected V5.2 file — every part, count, stat and alert identical on 24 regression decks, the owner deck (3 beams, 8 posts) and 176 generated angled/bump-out decks; Free Draw hand-drawn concave U, near-touching (1 ft clear allowed, touching refused) and 45° closing; house walls + ledgers keep their sides through rectangle → L → U → T → rectangle; four typed/slider corner cuts with no page errors; exact T/U edge geometry after save/reopen.

**Tests added**: 10 browser journeys (D1 ×2, D2 incl. save/reopen, D3, D4 incl. Undo, T, U, L sections incl. save/reopen, owner irregular deck round trip).

**Unresolved / noted**: section fields appear only while the outline keeps the template's structure (after free reshaping, tap-to-edit applies); the Free Draw hint bar still mentions "90° Locked by default" (wording left from older builds); case-4 corner support and outside-outline members remain framing limitations outside Group A.

## V5.2 baseline verified and audit rechecked (branch `v5.2/baseline`, 7 Nov 2026)

- Baseline: AOS_Deck_Studio_V5_2_Continuous_Middle_Beams.html, 370,800 bytes, SHA-256 80b6afea0adfafb40ed86a02cd1f1fead9e29d72bcd8a5c301241c9d39c061c6 (title "AOS Deck Studio V5.2 · Continuous Middle Beams", APP_VERSION 5.2-framing-workflow). Stored unchanged; tag `protect/v5.2-baseline-80b6afea`; hash in BASELINE.sha256.
- Difference from the older Stacking Fix build: Framing & Ledger shown as step 3 (display order only); irregular-deck shared-line planner (full beam footprint kept inside the outline); Framing step intro text; version labels. Nothing else.
- Audit rechecked on V5.2: 87 features, 59 working, 12 partial, 14 missing, 2 deferred. Step order now Working; defects D1–D7 all confirmed on V5.2. Owner irregular deck: 3 beams, 8 posts (older build 15, 33).
- Suite on V5.2: 181/217. 9 browser tests assume the old step order (all 49 pass with V5.2 navigation in a temporary copy). 27 framing tests reconciled into four cases (trimmer merged with rim; new containment statistics; members now reported outside the outline; angled corners with one main beam and 4 joists without confirmed bearing). No snapshot accepted; awaiting owner decision.
- No implementation started.

## Correction: wrong baseline (7 Nov 2026)

- The file audited below, AOS_Deck_Studio_V5_1_Stacking_Fix_Test.html, is an OLDER development build, not the approved V5.2. It has been renamed in the repository to branch `v5.1/stacking-fix-test` (tag `protect/v5.1-stacking-fix-test`); the tag `protect/v5.2-baseline` was removed so nothing is built on it.
- Approved baseline: AOS_Deck_Studio_V5_2_Continuous_Middle_Beams.html (Framing & Ledger as Step 3, updated flush/dropped beams, continuous middle beams). Not yet received; it will be stored unchanged with its SHA-256 recorded before any re-audit or code change.
- The audit findings below were measured on the older build and are pending re-verification against V5.2. No implementation has started.

## Superseded: feature-parity audit of the older build (7 Nov 2026)

- Audited file: AOS_Deck_Studio_V5_1_Stacking_Fix_Test.html (labeled V5.1 · Framing Prototype; SHA-256 0f8e9b10429e639a73fc19c0cd949d718bdf1afdc3ae7415454e9345512acb61), an older build mistakenly treated as V5.2.
- Owner irregular deck (9 corners, 614 sq ft) added as `tests/fixtures/owner-irregular-deck.json`.
- Audit: 87 features tested in a browser: 58 working, 13 partial, 14 missing, 2 deferred. Defects D1–D7 recorded (Free Draw accepts a crossing outline; corner tool page error; wrong rejection reason; extra house walls dropped on shape switch; divider readouts disagree; small phone buttons; duplicate corner size field).
- Existing suite on the baseline: 190/217 pass; all browser journeys pass; the 27 failures are framing snapshots from the earlier framing logic.
- No implementation yet; scope awaiting owner approval (see "AOS Deck Studio V5.2 — Feature-Parity Audit").

## Framing rebuild pending (branch `v5.1/framing-rebuild-base`, 6 Nov 2026)

- Owner testing found the framing planner build no better in practice: members outside the deck, and beams, posts and footings that don't form one support plan.
- An audit of 156 generated angled and bump-out decks confirmed solid parts outside the deck on 140 of them in every version, including V5.0, plus tiny repair beams and beams with fewer than two posts. The planner build's footprint check gave false passes because it tested only centers and end points.
- Decision pending: replace the support planner (beams, posts, footings) with a plan-first sequence. See "Framing Generator Rebuild: Diagnosis & Plan".
- Private preview reverted to the Phase A Corrections framing plus the framing timing work (no framing while drawing or dragging); 217/217 tests pass. The planner build is kept on `v5.1/framing-planner` (tag `protect/v5.1-framing-planner-2c6cffc`).

## V5.1 framing planner (not in use; kept for reference) (branch `v5.1/framing-planner`, stacked on Phase A Corrections)

Version label unchanged: **V5.1 · Phase A Corrections** (internal build `5.1-phase-a-corrections+framing-planner`). 231 automated tests, all passing.

**Performance (framing on commit)**
- Dragging an edge, corner or stair shows a light outline preview; the full framing is rebuilt once on release. 48×42 angled deck: about 0.4 ms per pointer move (was ~360 ms).
- Header chip: Framing current / Update needed / Calculating / Fix outline. The Framing step keeps the last framing faded with an "Update framing" button. Only the newest result is applied.
- Structural results are cached by their inputs: colors, railings and names reuse the framing; Undo back to an earlier design is instant.

**Plan-first framing (MN R507 based)**
1. Existing beams first: before anything is added, a shared beam line is extended under the joists it already crosses (one continuous line instead of short local beams).
2. Angled corners: one beam parallel to each angled edge (unchanged rule), and where it crosses the main beam both end at the crossing on ONE shared post (the beam follows the deck outline). The connection is flagged for production review.
3. A shared beam end that overlaps a corner beam under the same joist is shortened, never split or removed, when that fixes a cantilever.
4. Flush decks: angled flush headers now count as bearing (the joist end is cut on the angle), so they no longer trigger a cluster of local beams.
5. Local support beams remain only as a last resort and are flagged. No structural check was relaxed.

**Sizing and validation (structure model, separate from the renderer)**
- Every joist's load is followed to its actual bearings (half of each span, cantilevers with their back-span effect); ledger load goes to the house. Deck area is fully accounted for (checked in tests).
- Beams: equivalent joist span from the actual tributary; posts spaced by MRC Table R507.5 (3-ply, one-sided). Beams carrying joists on both sides are outside that table, keep the AOS 6 ft post-spacing proxy and are flagged. That adds posts on L (+1), T (+2) and two-house-wall decks.
- Footings: each post's tributary area sized from Minn. R. 1309.0507 Table R507.3.1 at the chosen soil value (interpolated, never extrapolated; over 160 sq ft = engineered footing warning); bottom at the frost depth for the chosen zone. 3D footings are drawn at the table size.
- Checks recorded with sources: joist span/overhang (R507.6, ¼ span, AOS 2 ft), beam span (R507.5), footing size (MN R507.3.1), post height (R507.4, 6x6 ≤ 14 ft), framing inside the outline, ledger verified. Never marked code-checked.
- Framing step: "Design assumptions (AOS production)" (soil 1,500–3,000+ psf, frost Zone I 5 ft / Zone II 3 ft 6 in, ledger verified or not), saved with the project and undoable. "View framing measurements" lists the checks, each beam (post spacing vs allowed) and each post (deck carried, footing, height).
- Tables re-entered from MRC 2020 R507 and the Minnesota rule; the solver's existing joist and 3-ply beam tables were confirmed identical.

| Deck | V5.0 | Phase A Corrections | Framing planner |
| --- | --- | --- | --- |
| 18×12 two 45° corners (reported) | 12 posts | 3 beams / 7 posts | 3 beams / 5 posts |
| 20×14 large corners | 21 posts | 3 / 7 | 3 / 6 |
| 16×16 octagon, freestanding | 24 posts | 6 / 14 | 6 / 8 |
| 16×12 one corner | 9 posts | 2 / 5 | 2 / 4 |
| 48×42 angled | — | 17 beams / 48 posts, 1 unresolved joist | 9 / 32, all joists bear |
| 18×12 two corners, flush | — | 7 / 8 | 4 / 5 |
| Rectangle / U | 3 / 10 posts | unchanged | unchanged |
| L / T | 5 / 6 posts | unchanged | 6 / 8 (two-sided beam rule) |

**Known limitations**: header/trimmer framing with hangers is not generated yet (angled corners use a corner beam, flagged); two-sided beams and all connections still need production review; ledger fastener spacing (MN Table R507.9.1.3(1)) is not computed; 2-ply beam rows are stored for reference only (single source).

## V5.1 Phase A — Corrections (branch `v5.1/phase-a-corrections`)

Version label: **V5.1 · Phase A Corrections**. 214 automated tests, all passing.

**Priority 1 — Excessive framing supports on angled decks (root cause fixed)**
- Present since V4.7 (identical counts in V5.0). Rectangles, L, T and U shapes were never affected.
- Cause: joists were grouped only when their start AND end matched within 2.4 in. Along a 45° edge each joist is 16 in longer than the next, so every corner joist got its own beam line. One such line requested from both sides was stretched across the deck, which broke the long joists' ¼-backspan cantilever check and triggered a second full-width beam 1.7 ft away. Leftover corner joists each received a 0.7–1.6 ft "repair" beam with 2 posts.
- Fix (owner-approved Option A):
  1. A joist ending on an angled edge first joins the neighboring shared beam when that beam meets its span, 2 ft cantilever and ¼-backspan rules.
  2. Corner joists that cannot reach it get ONE beam parallel to that angled edge (inset adapted to the shortest joist so every overhang stays within ¼ of its span), finishing at the deck edge like the main beams.
  3. Existing repair, pruning and every joist check are unchanged; anything unresolved stays a warning.
  4. Where beams meet, one post carries both ends (flagged for connection review).
- Beam roles: shared beam, angled corner beam, local support beam, perimeter flush header; rim joists stay separate parts. Labels and `stats.beamRoles` show the role.
- New review flags: angled corner beams (AOS production review), local support beams, footings closer than 3 ft (guideline, not removed), shared posts.

| Deck | Posts/footings before | After |
| --- | --- | --- |
| 18×12, two 45° corners (reported) | 12 | 7 |
| 18×12 two corners, freestanding | 14 | 10 |
| 20×14, large corners | 21 | 7 |
| 16×16 octagon, freestanding | 24 | 14 |
| 16×12, one corner | 9 | 5 |
| Hexagon fixture | 25, 3 joists unsupported | 7, all supported (now warns: beam load outside reference range) |
| Rectangle / L / T / U | 3 / 5 / 6 / 10 | unchanged |

**Priority 2 — Automatic Free Draw angles**: Square/45°/22.5° buttons removed; each edge snaps on its own; live corner angle (90°, 135°, 270°…) and edge length; closing prefers the simplest angle grid used; finishing a drawing keeps materials, colors, height and name.

**Priority 3 — Shape & Size help**: "Edit your deck shape" at 13.5–14 px.

**Priority 4 — Change Deck Shape**: replaces "Templates"; replacing a deck confirms and lists what is removed and kept; Undo restores.

**Dimensions**: feet and inches everywhere a length shows (21′ 3″, 16′ 0″); inputs accept 21′ 3″, 21 3, 21.25; geometry keeps exact values.

**Known limitations**: on decks with corner beams, the corner beam's posts sit within 3 ft of the main beam's end post (flagged; a beam-to-beam connection could remove one post but needs production input). Angled flush-beam decks keep a perimeter header per edge.

## V5.1 Phase A (branch `v5.1/phase-a`, stacked on the corner post fix)

Version label: **V5.1 DEV**. 199 automated tests (engine + headless Chrome), all passing.

**A.1 Free Draw**
- Close by tapping *near* the start pin (32 px desktop / 44 px touch), or by placing a corner within 1 ft of it.
- Closing only ever uses allowed angles (90°, 45°, 22.5° per mode): close directly, else slide the last corner up to 2 ft along its own edge, else add one corner. Corners left mid-edge at the seam are merged. Invalid drawings are refused with a reason.
- Live preview of the exact closed shape (green dashed) and a "Tap to close" ring on the start pin (red when it can't close).
- Header Undo/Redo step through corners while drawing.
- Overall width/depth on an angled shape now explains that it would bend the angles and points to editing an edge length.

**A.2 Clickable steps**
- Step bar buttons: Shape, House, Stairs, Layout, Decking, Railings, Framing, Review. Jump anywhere once a valid shape exists; locked while drawing or while the outline is invalid.
- Visited steps marked; amber dot on steps with warnings. Jumping never changes the design.
- Fix: typing a project name and then clicking a step lost the first click.

**A.3 2D measurements**
- "Dims" toolbar button: All / Selected / Off (remembered per browser).
- Edge lengths on every step, overall size for decks with more than four edges, stair width and distance from both corners, divider distance from the house (or deck edge). Live, collision-checked, stairs kept clear.

**A.4 Projects and saving**
- V5.0 had no project storage or Recent Projects, and Save always reported success even where downloads are blocked.
- Autosave ~1 s after each change; header status Saving / Saved time / Not saved.
- Claude preview: each person's private project space (same link on any device). Downloaded HTML: this browser only. The app says which.
- Recent projects on the start screen; Projects dialog with Open, Duplicate, Delete (confirmed), New, Open file, Download current.
- Downloads use the preview's confirmed save; messages never claim success they can't confirm.

## Unreleased — shared corner post fix (branch `fix/corner-post-count`, stacked on per-edge railing finish)

- **Bug (present in V5.0):** where two railed edges meet, each edge placed its own corner post about 0.1 ft from the other's, so corners were drawn and counted twice. Example: 12×10 deck with three railed edges reported 10 railing posts and 10 caps; the real number is 8.
- **Fix:** a deck railing post is skipped when one already exists within 0.3 ft. That's the same rule the stair code already used for stair posts. The first edge placed owns the corner, including its color.
- **Quantity changes:** railing posts and post caps drop by exactly one per shared railed corner (rectangle with house wall: −2; freestanding rectangle: −4; U-shape: −6). Joists, beams, footings, boards, rail LF and alerts are unchanged in all 24 golden fixtures.
- Golden snapshots regenerated with this fix; the before/after diff touched only `railing-post`, `post-cap`, `counts.railPosts` and part totals.
- New tests: no overlapping posts, one cap per post, posts = bays + 1 per run minus shared corners. 164/164 tests pass.

## Unreleased — per-edge railing finish (branch `feat/per-edge-railing-finish`)

Customer-visible:
- **Railings → Railing finish** now has an "Apply to" row: *All railed edges* plus one chip per railed edge (Edge 2 · 12′, Edge 3 · 16′ …). Pick an edge, then a railing product or color, and only that edge changes. Edge numbers match the 2D plan.
- Tap a railed edge on the 2D plan to select it; tap again to go back to all edges. Plan markers show each edge's number in its railing color, and the selected edge is highlighted.
- *Match other edges* removes an edge's custom finish; *Use on all edges* makes it the whole-deck finish.
- Choosing a color or product with *All railed edges* applies it everywhere and clears that property from custom edges (a custom product on another edge is kept).
- Stair railings take the finish of the deck edge the stair sits on.
- The Customer concept export lists custom edges.
- Edge chips are 44 px tall for touch.

Data and engine:
- New `design.railOverrides` (`{ "<edge>": { railColor?, railStyle? } }`). Only railed edges that differ from the whole-deck choice are stored; overrides on house walls, unrailed edges, unknown edges or non-catalog values are dropped on load.
- `DeckCore.RAIL_PRODUCTS` (the existing two entries) and `DeckCore.railFinish(q, edge)`.
- `perimeter.segments` report each edge's effective product/color and a `custom` flag.
- Shape edits (bump-outs, cuts, edge moves) carry a custom finish to the matching new edge, using the same edge-matching already used for house walls and railings. Choosing a new starting shape clears custom finishes.
- No new products or colors were added.

Verification:
- 161/161 tests pass. All 96 V5.0 baseline-golden checks still pass, so designs without custom finishes produce identical parts, quantities, framing and alerts.
- New: `tests/railing.test.js` (11 engine tests) and 7 browser journeys (edge color, undo/redo, all-edges rules, match/use-everywhere, removal + save/open, phone tap targets, tapping the plan).

Known limitations:
- All railing products still share one geometry (aluminum picket). Cable, glass, composite, vinyl and privacy-wall styles need AOS's product list and new geometry.
- Where two edges with different colors meet, the corner post takes the color of the lower-numbered edge (after the corner post fix).
- One edge = one finish; splitting an edge into separately styled sections is planned with privacy walls.

## Schema v6 + regression harness (PR #1, branch `test/regression-harness-schema-v6`)

- `schemaVersion: 6` on designs and saved files; derived `perimeter.segments`; `DeckCore.migrate()` for V4/V5.0 files. No UI or model change.
- Node engine tests with 24 golden fixtures and headless-Chrome journeys (143 tests at the time).

## Baseline — V5.0 Brand Logo Update

- `index.html` as deployed to staging (sweet-dawn-8523.andrew-8b7.workers.dev) on 6 Nov 2026.
