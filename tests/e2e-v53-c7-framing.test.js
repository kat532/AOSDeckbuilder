'use strict';
// V5.3 C7 Gate B (owner authorization 11 Nov 2026): "Check that 2D and 3D depict the same actual framing."
// Owner visual testing (11 Nov 2026, Gate B NOT approved): "Verify 2D/3D agreement on actual member positions,
// not just counts." For every required case, the owner irregular deck and the custom irregular outlines:
//   - the 2D Framing plan and the 3D framing view show every framing member of the model, including the
//     picture-frame / divider flat 2x6 blocking and field-end blocking that 2D used to leave out;
//   - member by member (by part id), the outline 2D draws and the extent of the vertices 3D builds agree
//     with each other and with the model (0.01 ft), so a member cannot be in a different place in one view;
//   - members the screen found unsupported are red in BOTH views (and only those).
// Screenshots of both views are saved for owner review (test-results/screenshots/c7-*.png).
const test = require('node:test');
const fs = require('fs');
const H = require('./c6-helpers');
const { assert, ALL, openDesign, step, intent, model } = H;
const { CASES } = require('./c7-audit');
const IRREGULAR = require('./c7-irregular-shapes');
const h = H.harness(test);

const KINDS = ['ledger', 'joist', 'picture-support-joist', 'divider-support-joist', 'corner-trimmer', 'rim-backing-joist', 'rim-joist', 'dropped-beam', 'post-6x6',
  'picture-blocking-2x6-flat', 'divider-blocking-2x6-flat', 'field-end-blocking'];
const count = (m, k) => m.parts.filter(p => p.kind === k).length;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const OWNER = JSON.parse(fs.readFileSync(H.path.join(__dirname, 'fixtures', 'owner-irregular-deck.json'), 'utf8')).design;
const SHAPES = IRREGULAR(OWNER);
// Model extent of a part in plan (footprint, or the rotated w x d rectangle).
const modelBox = (p) => {
  let pts; if (p.footprint) pts = p.footprint;
  else { const c = Math.cos(-(p.yaw || 0)), s = Math.sin(-(p.yaw || 0)); pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [p.x + c * u * p.w / 2 - s * v * p.d / 2, p.z + s * u * p.w / 2 + c * v * p.d / 2]); }
  const xs = pts.map(v => v[0]), zs = pts.map(v => v[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
};
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 0.01);

const ALLCASES = { ...CASES(ALL), ...Object.fromEntries(Object.entries(SHAPES).map(([n, q]) => [`custom: ${n}`, q])) };
for (const [name, design] of Object.entries(ALLCASES)) {
  test(`C7 framing views: 2D Framing and 3D framing show the same members in the same places as the model: ${name}`, async () => {
    const { ctx, page, errors } = await h.newPage();
    await openDesign(page, design);
    const I = await intent(page), m = model(I);
    await step(page, 6);
    const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    const g2 = await page.evaluate(() => window.AOSDeckStudioTest.framingGeometry());
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7-framing-2d-${slug(name)}.png`) });
    await page.locator('#mode3d').click(); await page.waitForTimeout(300);
    await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
    const v3 = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    const g3 = await page.evaluate(() => window.AOSDeckStudioTest.framingGeometry());
    assert.equal(v3.showStructure, true);
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7-framing-3d-${slug(name)}.png`) });
    for (const k of KINDS) {
      assert.equal(v.plan[k] || 0, count(m, k), `2D framing: ${k}`);
      assert.equal(v3.view3d[k] || 0, count(m, k), `3D framing: ${k}`);
    }
    // Positions, member by member.
    const parts = new Map(m.parts.filter(p => KINDS.includes(p.kind)).map(p => [p.id, p]));
    const by2 = new Map(g2.plan.map(x => [x.id, x])), by3 = new Map(g3.view3d.map(x => [x.id, x]));
    assert.equal(by2.size, parts.size); assert.equal(by3.size, parts.size);
    for (const [id, p] of parts) {
      const a = by2.get(id), b = by3.get(id), mb = modelBox(p);
      assert.ok(a && b, `${id} drawn in both views`);
      assert.ok(near(a.box, mb), `${id} 2D position ${a.box} vs model ${mb.map(x => x.toFixed(3))}`);
      assert.ok(near(b.box, mb), `${id} 3D position ${b.box} vs model ${mb.map(x => x.toFixed(3))}`);
      assert.equal(a.red, Boolean(p.structuralFault)); assert.equal(b.red, Boolean(p.structuralFault));
      assert.equal(a.color, p.color); assert.equal(b.color, p.color);
    }
    assert.ok(count(m, 'dropped-beam') > 0 && count(m, 'post-6x6') > 0);
    if (m.framing && m.framing.structuralReviewRequired) assert.ok(g2.plan.some(x => x.red) && g3.view3d.some(x => x.red), 'unsupported members red in both views');
    else assert.ok(!g2.plan.some(x => x.red) && !g3.view3d.some(x => x.red));
    assert.deepEqual(errors, []); await ctx.close();
  });
}
