// V5.3 C2 (owner authorization 8 Nov 2026): what the C0 control inventory (controls-d404af5.json)
// must look like after the nine-step change. Every difference is a change the owner asked for:
//   1. The step bar gains one button for the new step "Patio & Walkway" (internal ID 8), shown just
//      before Review & Present (ID 7).
//   2. House & Height keeps "Walls & doors" and "Siding & color"; its "Patio & walkway" tab button
//      (houseTab=yard) is gone from every House state.
//   3. The patio/walkway controls move, unchanged and complete, from "2 House & Height · Patio &
//      walkway" to the new state "8 Patio & Walkway" (without the House tab buttons).
//   4. Review & Present is now step 9, so its census state is named "9 Review & Present".
// Nothing else may differ: every other control in every other state must be exactly as at C0.
'use strict';

const YARD_TAB = 'button data-path=houseTab data-value=yard';
const HOUSE_TABS = ['button data-path=houseTab data-value=walls', 'button data-path=houseTab data-value=look', YARD_TAB];
const OLD_YARD = '2 House & Height · Patio & walkway', NEW_YARD = '8 Patio & Walkway';
const OLD_REVIEW = '8 Review & Present', NEW_REVIEW = '9 Review & Present';

function expectedChrome(chrome) {
  const out = []; for (const k of chrome) { if (k === 'button data-step=7') out.push('button data-step=8'); out.push(k); }
  return out;
}
// states: { name: [control, ...] } where control has .key (and .hidden).
function expectedStates(states) {
  const out = {};
  for (const [name, list] of Object.entries(states)) {
    if (name === OLD_YARD) continue;
    if (name === OLD_REVIEW) { out[NEW_YARD] = states[OLD_YARD].filter(c => !HOUSE_TABS.includes(c.key)); out[NEW_REVIEW] = list; continue; }
    out[name] = name.startsWith('2 House & Height') ? list.filter(c => c.key !== YARD_TAB) : list;
  }
  return out;
}
function expectedC2(base) { return { chrome: expectedChrome(base.chrome), states: expectedStates(base.states) }; }

module.exports = { expectedC2, YARD_TAB, NEW_YARD, NEW_REVIEW };
