// V5.3 C6 (owner authorization 10 Nov 2026): the control inventory after the Steps 5–8 sales-design work,
// built on the C5 expectation (tests/baseline/c5-expected.js). Allowed difference:
//   1. Patio & Walkway: when there is more than one surface, each is listed as a button that selects it
//      (data-action=surface-pick data-index=N). The census design has two surfaces.
// Steps 5, 6 and 7 add summary cards and previews only (no new controls). Everything else must still match C5.
'use strict';
const { expectedC5 } = require('./c5-expected');
const k = (key) => ({ key, hidden: false });
function expectedC6(base) {
  const c5 = expectedC5(base), states = {};
  for (const [name, list] of Object.entries(c5.states)) {
    if (name === '8 Patio & Walkway') states[name] = [...list, k('button data-action=surface-pick data-index=0'), k('button data-action=surface-pick data-index=1')];
    else states[name] = list;
  }
  return { chrome: c5.chrome, states };
}
module.exports = { expectedC6 };
