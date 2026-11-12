'use strict';
// V5.3 C7 Gate C (owner authorization 11 Nov 2026): stair and railing stabilization in the app.
// For stairs that need stringer supports, landings and an unrailed side: the 2D Framing plan and the 3D framing
// view show the same stair support members as the model, the finished 3D view shows the guards with the new
// infill, the Review "Framing" tab lists the handrail / guard / clearance / stringer items, and a saved project
// reopens with the identical design. Screenshots for owner review: test-results/screenshots/c7c-*.png.
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, openDesign, step, intent, model } = H;
const h = H.harness(test);

const R = { shape: 'rectangle', width: 20, depth: 14, houseEdges: [0], railEdges: [1, 2, 3] };
const S = (o) => ({ id: 's', edge: 2, width: 3, offset: 0, rails: { left: true, right: true }, ...o });
const CASES = {
  '7 ft deck, 3 ft stair (stringer support)': { ...R, height: 7, staircases: [S({})] },
  '10 ft deck, turning landing': { ...R, height: 10, staircases: [S({ width: 4, landing: { elevation: 5, width: 5, depth: 4, turn: 'left' } })] },
  '5 ft deck, stair left side and edge 3 unrailed': { ...R, height: 5, railEdges: [1, 3], staircases: [S({ rails: { left: false, right: true } })] },
};
const KINDS = ['stair-stringer-support', 'stair-support-post'];
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

for (const [name, design] of Object.entries(CASES)) {
  test(`C7 Gate C in the app: ${name}`, async () => {
    const { ctx, page, errors } = await h.newPage();
    await openDesign(page, design);
    const I = await intent(page), m = model(I);
    // Finished 3D view with the guards.
    await page.locator('#mode3d').click(); await page.waitForTimeout(400);
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7c-3d-${slug(name)}.png`) });
    await page.locator('#mode2d').click(); await page.waitForTimeout(200);
    await step(page, 6);
    const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7c-framing-2d-${slug(name)}.png`) });
    await page.locator('#mode3d').click(); await page.waitForTimeout(300);
    await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
    const v3 = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7c-framing-3d-${slug(name)}.png`) });
    for (const k of KINDS) { const n = m.parts.filter(p => p.kind === k).length; assert.equal(v.plan[k] || 0, n, `2D ${k}`); assert.equal(v3.view3d[k] || 0, n, `3D ${k}`); }
    if (/support/.test(name)) assert.ok(m.parts.some(p => p.kind === 'stair-stringer-support'));
    // Review → Framing lists the Gate C items.
    await step(page, 7); await page.waitForTimeout(200);
    await page.locator('#stepContent [data-path="reviewMode"][data-value="internal"]').click(); await page.waitForTimeout(150);
    await page.locator('#stepContent [data-path="reviewTab"][data-value="framing"]').click(); await page.waitForTimeout(150);
    const text = await page.locator('#stepContent').innerText();
    for (const a of m.alerts.filter(a => ['stair-handrail-required', 'stair-guard-required', 'guard-required', 'stair-stringer-support', 'stair-finished-clearance'].includes(a.code)))
      assert.ok(text.includes(a.message.slice(0, 60)), `Review lists: ${a.message.slice(0, 60)}`);
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7c-review-${slug(name)}.png`) });
    // Save and reopen: identical design.
    const { file, data } = await H.saveFile(page);
    const r = await H.reopen(h, file);
    assert.deepEqual(await intent(r.page), JSON.parse(JSON.stringify(data.design)));
    assert.deepEqual(r.errors, []); await r.ctx.close();
    assert.deepEqual(errors, []); await ctx.close();
  });
}
