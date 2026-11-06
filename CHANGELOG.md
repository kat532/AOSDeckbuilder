# Changelog

All changes to `index.html` and the test suite. Staging and production are deployed separately and only with owner approval.

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
