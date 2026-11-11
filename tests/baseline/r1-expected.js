// V5.3 C6 owner corrections R1 (owner authorization 10 Nov 2026): the control inventory after R1, built on
// the C6 expectation (tests/baseline/c6-expected.js). Allowed differences:
//   1. Header: a New Plan button (#newPlanBtn, data-control=new-plan) before Projects.
// Everything else must still match C6.
'use strict';
const { expectedC6 } = require('./c6-expected');
function expectedR1(base) {
  const c6 = expectedC6(base), chrome = [];
  for (const k of c6.chrome) { if (k === 'button #openBtn text=Projects') chrome.push('button #newPlanBtn data-control=new-plan'); chrome.push(k); }
  if (!chrome.includes('button #newPlanBtn data-control=new-plan')) throw new Error('C6 inventory lost the Projects button');
  return { chrome, states: c6.states };
}
module.exports = { expectedR1 };
