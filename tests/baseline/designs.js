// V5.3 C0: the designs whose complete engine output is recorded at the V5.3 baseline (d404af5)
// and must stay identical through V5.3 (no geometry-engine changes are approved).
'use strict';
const { fixtures } = require('../fixtures');
const freeDeck = (pts, over = {}) => { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), x0 = Math.min(...xs), z0 = Math.min(...zs), W = Math.max(...xs) - x0, D = Math.max(...zs) - z0;
  return { shape: 'free', width: W, depth: D, points: pts.map(([x, z]) => [(x - x0) / W, (z - z0) / D]), ...over }; };
const STAIR = { id: 's', edge: 2, width: 4, offset: 3, rails: { left: true, right: true } };
const LANDING = { id: 'a', edge: 2, width: 4, offset: 3, landing: { width: 6, depth: 5, elevation: 3, turn: 'left' }, rails: { left: true, right: true } };
function designs(win) {
  const out = { ...fixtures(win) };
  Object.assign(out, {
    'b3-showcase': { shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], borderCount: 1, decking: 'Brown Oak', border: 'Stone Ash', siding: 'shake', houseColor: 'Sandstone',
      openings: [{ id: 'd', type: 'door', edge: 0, offset: -6.5 }, { id: 'p', type: 'patio', edge: 0, offset: 1, width: 6 }, { id: 'w', type: 'window', edge: 0, offset: 7, width: 3, height: 4, sill: 3 }],
      staircases: [LANDING], surfaces: [{ id: 'p1', type: 'patio', x: -3, z: 21, width: 14, length: 10 }, { id: 'w1', type: 'walkway', x: 9, z: 30, width: 4, length: 12, angle: 15 }] },
    'b2-diagonal-double-frame-dividers': { shape: 'L', width: 24, depth: 18, height: 7, houseEdges: [0], borderCount: 2, deckLine: 'diagonal-left', dividerMode: 'double', frameHouseWalls: true, staircases: [{ ...LANDING, edge: 2, landing: { width: 6, depth: 6, elevation: 3.5, deckLine: 'vertical' } }] },
    'b2-vertical-u': { shape: 'U', width: 32, depth: 22, height: 9, houseEdges: [0], borderCount: 1, deckLine: 'vertical', staircases: [STAIR, { ...STAIR, id: 't', edge: 4, offset: 0 }] },
    'cp3-turn-right-wide': { shape: 'rectangle', width: 24, depth: 16, height: 10, houseEdges: [0], borderCount: 1, staircases: [{ id: 'r', edge: 2, width: 6, offset: -4, landing: { width: 8, depth: 7, elevation: 5, turn: 'right' }, rails: { left: true, right: false } }] },
    'b3c-inside-corner-door': { shape: 'rectangle', width: 20, depth: 14, height: 4, houseEdges: [0, 3], openings: [{ id: 'p', type: 'patio', edge: 0, offset: -4, width: 6, height: 8 }, { id: 'w', type: 'window', edge: 3, offset: 3, width: 3, height: 4, sill: 3 }] },
    'b3c-outside-corner': { shape: 'L', width: 24, depth: 18, height: 4, houseEdges: [3, 4], openings: [{ id: 'd', type: 'door', edge: 4, offset: 0 }] },
    'b3c-u-three-walls': { shape: 'U', width: 32, depth: 22, height: 4, houseEdges: [3, 4, 5], siding: 'brick', houseColor: 'Brick Red' },
    'b3c-bevel-walls': freeDeck([[3, 0], [20, 0], [20, 14], [0, 14], [0, 3]], { height: 6, houseEdges: [4, 0] }),
    'b3c-short-wall-window': freeDeck([[0, 2], [9, 2], [9, 0], [11, 0], [11, 2], [20, 2], [20, 14], [0, 14]], { height: 4, houseEdges: [2, 1, 3, 0, 4], openings: [{ id: 'w', type: 'window', edge: 2, offset: 0, width: 1.5, height: 2, sill: 3 }] }),
    'rails-custom-finish': { shape: 'rectangle', width: 18, depth: 12, height: 5, houseEdges: [0], railEdges: [1, 2, 3], railColor: 'Bronze', railOverrides: { 2: { railColor: 'White' } }, staircases: [STAIR] },
    'freestanding-flush': { shape: 'rectangle', width: 16, depth: 12, height: 3, houseEdges: [], supportMode: 'freestanding', beamStyle: 'flush' },
  });
  return out;
}
module.exports = { designs };
