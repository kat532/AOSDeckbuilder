# Changelog

All changes to `index.html` and the test suite. Staging and production are deployed separately and only with owner approval.

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
