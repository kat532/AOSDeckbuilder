// V5.3 C7 owner visual testing (11 Nov 2026): the picture-frame / divider framing members compared with R1.
'use strict';
const PF_KINDS = ['picture-support-joist', 'picture-blocking-2x6-flat', 'divider-support-joist', 'divider-blocking-2x6-flat', 'corner-trimmer', 'field-end-blocking'];
const r = (v) => Math.round(v * 1000) / 1000;
// Each member as kind @ x,z (plan centre), length, width and yaw, rounded to 0.001 ft, sorted.
const pfMembers = (m) => m.parts.filter(p => PF_KINDS.includes(p.kind))
  .map(p => `${p.kind} ${r(p.x)},${r(p.z)} w${r(p.w)} d${r(p.d)} yaw${r(p.yaw || 0)}`).sort();
module.exports = { PF_KINDS, pfMembers };
