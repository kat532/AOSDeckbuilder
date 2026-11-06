// Representative designs used for regression snapshots. Each is a raw design intent as
// the app (or an older saved file) would hand to DeckCore.sanitize / make.
'use strict';

function fixtures(win) {
  const base = win.DeckCore.baseIntent();
  // A fresh shape pick: let sanitize derive default house/rail edges for the shape.
  const pick = (over) => {
    const q = { ...base, ...over };
    if (!('railEdges' in over)) delete q.railEdges;
    if (!('ledgerEdges' in over)) delete q.ledgerEdges;
    return q;
  };
  const stair = (edge, width = 4, offset = 0, id) => ({ id: id || `stair-${edge}-${offset}`, enabled: true, edge, width, offset, rails: { left: true, right: true } });

  const rectPoly = win.DeckCore.polygon(win.DeckCore.sanitize(pick({ shape: 'rectangle', width: 20, depth: 14 })));
  // Normalize to the 0..1 point space the intent stores for custom outlines.
  // Returns the intent fields for an outline: its own bounding box sets width/depth.
  const outline = (pts) => {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    return { shape: 'free', width: x1 - x0, depth: z1 - z0, points: pts.map(([x, z]) => [(x - x0) / (x1 - x0), (z - z0) / (z1 - z0)]) };
  };
  const cut = win.AOSShape.cutCorner(rectPoly, 2, 4, 45);
  const bump = win.AOSShape.addFeature(rectPoly, 2, 'bump', 6, 3, 0.5);

  return {
    'small-rect-12x10': pick({ width: 12, depth: 10 }),
    'default-rect-16x12': pick({}),
    'medium-rect-20x14-stair': pick({ width: 20, depth: 14, staircases: [stair(2, 4)] }),
    'square-14': pick({ shape: 'square', width: 14, depth: 14 }),
    'L-24x18': pick({ shape: 'L', width: 24, depth: 18 }),
    'L-flipped-24x18': pick({ shape: 'L', width: 24, depth: 18, flipL: true }),
    'T-28x20': pick({ shape: 'T', width: 28, depth: 20 }),
    'U-32x22': pick({ shape: 'U', width: 32, depth: 22 }),
    'large-U-40x24-9ft-stair': pick({ shape: 'U', width: 40, depth: 24, height: 9, staircases: [stair(2, 6)] }),
    'free-hexagon': pick({ shape: 'free', width: 24, depth: 18, points: [[0, 0], [1, 0], [1, 0.6], [0.7, 1], [0.3, 1], [0, 0.6]] }),
    'diagonal-boards': pick({ width: 18, depth: 14, deckLine: 'diagonal' }),
    'outward-boards': pick({ width: 18, depth: 14, deckLine: 'vertical' }),
    'no-border': pick({ width: 16, depth: 12, borderCount: 0 }),
    'double-border-dividers': pick({ width: 36, depth: 16, borderCount: 2, dividerMode: 'double', dividerPositions: [0.33, 0.66] }),
    'freestanding': pick({ width: 16, depth: 12, houseEdges: [], supportMode: 'freestanding' }),
    'two-house-walls': pick({ shape: 'L', width: 24, depth: 18, houseEdges: [0, 5] }),
    'flush-beam': pick({ width: 16, depth: 12, beamStyle: 'flush' }),
    'multi-stair': pick({ width: 30, depth: 16, height: 6, staircases: [stair(2, 4, -6, 'a'), stair(2, 4, 6, 'b'), stair(1, 4, 0, 'c')] }),
    'mixed-rail-edges': pick({ width: 20, depth: 14, railEdges: [1, 3], railColor: 'Bronze', railStyle: 'No rail product selected' }),
    'pvc-white-rail': pick({ width: 16, depth: 12, collection: 'TimberTech Advanced PVC', decking: 'Sandy Birch', border: 'Rustic Elm', railColor: 'White' }),
    'cut-corner': cut.points ? pick(outline(cut.points)) : null,
    'bump-out': bump.points ? pick(outline(bump.points)) : null,
    // Older saved-file shapes that must keep loading.
    'legacy-v4-single-stair': { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], stairs: { enabled: true, edge: 2, width: 4, offset: 0, rails: { left: true, right: false } }, railEdges: [1, 2, 3], decking: 'Brown Oak' },
    'legacy-minimal-attached-false': { shape: 'rectangle', width: 14, depth: 10, height: 3, attached: false },
  };
}

module.exports = { fixtures };
