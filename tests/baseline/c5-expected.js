// V5.3 C5 (owner authorization 8 Nov 2026): the control inventory after the Steps 1–4 usability work,
// built on the C4 expectation (tests/baseline/c4-expected.js). Allowed differences:
//   1. House & Height · Walls & doors: the "From wall center" field (data-opening-field=offset) is replaced
//      by the closest-edge position: From Left end / From Right end, the distance field
//      (data-opening-field=edge) and Apply.
//   2. Stairs (both census states): "Position from edge center" (data-stair-field=offset) is replaced the
//      same way (data-stair-field=edge).
//   3. Framing & Ledger: one Add/Remove ledger button per house wall (the census deck has one, edge 0).
// Everything else must still match C4 (and so C3, C2 and C0) exactly.
'use strict';
const { expectedC4 } = require('./c4-expected');
const k = (key) => ({ key, hidden: false });
const pos = (kind) => [`button data-action=pos-side data-target=${kind} data-value=left`, `button data-action=pos-side data-target=${kind} data-value=right`, `input data-${kind}-field=edge`, `button data-action=pos-apply data-target=${kind}`].map(k);
function expectedC5(base) {
  const c4 = expectedC4(base), states = {};
  for (const [name, list] of Object.entries(c4.states)) {
    if (name === '2 House & Height · Walls & doors') { if (!list.some(c => c.key === 'input data-opening-field=offset')) throw new Error('C4 inventory lost the opening offset field'); states[name] = [...list.filter(c => c.key !== 'input data-opening-field=offset'), ...pos('opening')]; }
    else if (name.startsWith('4 Stairs')) { if (!list.some(c => c.key === 'input data-stair-field=offset')) throw new Error('C4 inventory lost the stair offset field'); states[name] = [...list.filter(c => c.key !== 'input data-stair-field=offset'), ...pos('stair')]; }
    else if (name === '3 Framing & Ledger') states[name] = [...list, k('button data-action=ledger-toggle data-edge=0')];
    else states[name] = list;
  }
  return { chrome: c4.chrome, states };
}
module.exports = { expectedC5 };
