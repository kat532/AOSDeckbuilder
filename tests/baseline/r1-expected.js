// V5.3 C6 owner corrections R1 (owner authorization 10 Nov 2026): the control inventory after R1, built on
// the C6 expectation (tests/baseline/c6-expected.js). Allowed differences:
//   1. Header: a New Plan button (#newPlanBtn, data-control=new-plan) before Projects.
//   3. 2D view tools: Edit / Move view (#planEditBtn, #planMoveBtn) after the 3D camera tools.
//   2. Shape & Size with an edge or a corner selected: Change Deck Shape stays available (C6 hid it).
// Everything else must still match C6.
'use strict';
const { expectedC6 } = require('./c6-expected');
function expectedR1(base) {
  const c6 = expectedC6(base), chrome = [];
  for (const k of c6.chrome) { if (k === 'button #openBtn text=Projects') chrome.push('button #newPlanBtn data-control=new-plan'); chrome.push(k);
    if (k === 'button #cameraUnderBtn text=⤒ Under') chrome.push('button #planEditBtn text=✎ Edit', 'button #planMoveBtn text=✥ Move view'); }
  if (!chrome.includes('button #planEditBtn text=✎ Edit')) throw new Error('C6 inventory lost the 3D Under button');
  if (!chrome.includes('button #newPlanBtn data-control=new-plan')) throw new Error('C6 inventory lost the Projects button');
  const states = {};
  for (const [name, list] of Object.entries(c6.states)) {
    if (name === '1 Shape & Size · edge selected' || name === '1 Shape & Size · corner selected') {
      if (list.some(c => c.key === 'button data-action=choose-shape')) throw new Error(`${name} already had Change Deck Shape`);
      states[name] = [...list, { key: 'button data-action=choose-shape', hidden: false }];
    } else states[name] = list;
  }
  return { chrome, states };
}
module.exports = { expectedR1 };
