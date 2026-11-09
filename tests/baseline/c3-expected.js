// V5.3 C3 (owner authorization 8 Nov 2026): what the control inventory must look like after the
// Review & Present redesign, built on the C2 expectation (tests/baseline/c2-expected.js). Allowed
// differences, each one an owner requirement:
//   1. "9 Review & Present" (Customer mode, the default) keeps both existing download buttons
//      (download-json, export-concept) and adds the Customer/Internal switch and the eight
//      Available Adjustments shortcuts.
//   2. Two new Review states: Internal · Materials and Internal · Framing. Each has the switch, the
//      Materials/Framing tabs and the same two download buttons.
//   3. A new state "1 Shape & Size · opened from Review" adds only the Return to Review button to the
//      Shape & Size controls.
// Every other state must still match C2 (and so C0) exactly.
'use strict';
const { expectedC2 } = require('./c2-expected');

const DOWNLOADS = ['button data-action=export-concept', 'button data-action=download-json'];
const SWITCH = ['button data-path=reviewMode data-value=customer', 'button data-path=reviewMode data-value=internal'];
const TABS = ['button data-path=reviewTab data-value=materials', 'button data-path=reviewTab data-value=framing'];
const ADJUST = [0, 1, 6, 2, 3, 4, 5, 8].map(i => `button data-action=adjust data-adjust=${i}`);
const RETURN = 'button data-action=return-review';
const REVIEW = '9 Review & Present', MATERIALS = '9 Review & Present · Internal · Materials', FRAMING = '9 Review & Present · Internal · Framing', FROM_REVIEW = '1 Shape & Size · opened from Review';
const k = (key) => ({ key, hidden: false });

function expectedC3(base) {
  const c2 = expectedC2(base), states = {};
  for (const [name, list] of Object.entries(c2.states)) {
    if (name === REVIEW) {
      for (const d of DOWNLOADS) if (!list.some(c => c.key === d)) throw new Error(`C2 inventory lost ${d}`);
      states[REVIEW] = [...SWITCH, ...ADJUST, ...DOWNLOADS].map(k);
      states[MATERIALS] = [...SWITCH, ...TABS, ...DOWNLOADS].map(k);
      states[FRAMING] = [...SWITCH, ...TABS, ...DOWNLOADS].map(k);
      continue;
    }
    states[name] = list;
  }
  states[FROM_REVIEW] = [k(RETURN), ...c2.states['1 Shape & Size']]; // last census state
  return { chrome: c2.chrome, states };
}
module.exports = { expectedC3, REVIEW, MATERIALS, FRAMING, FROM_REVIEW, ADJUST, DOWNLOADS };
