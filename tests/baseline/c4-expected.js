// V5.3 C4 (owner authorization 8 Nov 2026): the control inventory after the customer PDF, built on
// the C3 expectation (tests/baseline/c3-expected.js). The only difference: every Review state's
// Downloads section adds "Preview customer PDF" (data-action=pdf-preview). The preview window's own
// buttons (Zoom in, Download PDF, Close) exist only while it is open and are tested in
// e2e-v53-c4.test.js. Everything else must still match C3 (and so C2 and C0) exactly.
'use strict';
const { expectedC3, REVIEW, MATERIALS, FRAMING } = require('./c3-expected');
const PDF = 'button data-action=pdf-preview';
function expectedC4(base) {
  const c3 = expectedC3(base), states = {};
  for (const [name, list] of Object.entries(c3.states)) states[name] = [REVIEW, MATERIALS, FRAMING].includes(name) ? [{ key: PDF, hidden: false }, ...list] : list;
  return { chrome: c3.chrome, states };
}
module.exports = { expectedC4, PDF };
