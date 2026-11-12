'use strict';
// V5.3 C7 Gate B (owner authorization 11 Nov 2026): "Check that 2D and 3D depict the same actual framing."
// For every required case, the 2D Framing plan and the 3D framing view must show the same framing members as
// the engine model: every joist role (support joists, corner trimmers, rim-backing joists), rims, beams, posts
// and ledgers. Screenshots of both views are saved for owner review (test-results/screenshots/c7-*.png).
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, ALL, openDesign, step, intent, model } = H;
const { CASES } = require('./c7-audit');
const h = H.harness(test);

const KINDS = ['ledger', 'joist', 'picture-support-joist', 'divider-support-joist', 'corner-trimmer', 'rim-backing-joist', 'rim-joist', 'dropped-beam', 'post-6x6'];
const count = (m, k) => m.parts.filter(p => p.kind === k).length;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

for (const [name, design] of Object.entries(CASES(ALL))) {
  test(`C7 framing views: 2D Framing and 3D framing show the same members as the model: ${name}`, async () => {
    const { ctx, page, errors } = await h.newPage();
    await openDesign(page, design);
    const I = await intent(page), m = model(I);
    await step(page, 6);
    const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7-framing-2d-${slug(name)}.png`) });
    await page.locator('#mode3d').click(); await page.waitForTimeout(300);
    await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
    const v3 = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    assert.equal(v3.showStructure, true);
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7-framing-3d-${slug(name)}.png`) });
    for (const k of KINDS) {
      assert.equal(v.plan[k] || 0, count(m, k), `2D framing: ${k}`);
      assert.equal(v3.view3d[k] || 0, count(m, k), `3D framing: ${k}`);
    }
    assert.ok(count(m, 'dropped-beam') > 0 && count(m, 'post-6x6') > 0);
    assert.deepEqual(errors, []); await ctx.close();
  });
}
