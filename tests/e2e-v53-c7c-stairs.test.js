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

// Owner testing (12 Nov 2026): "the new intermediate stair support did not appear as expected". Reproduced in the
// Gate C build: the engine built the support, but the 2D Framing plan drew the stringers over it (hidden) and the
// 3D camera, fitted before the stair was added, left the stair and its support out of view. This follows the
// owner's path: a deck with no stairs, add a stair on the Stairs step, then open Framing.
async function planPixel(page, x, z) {
  const [sx, sy] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [x, z]);
  const box = await page.locator('#planCanvas').boundingBox();
  return page.evaluate(([sx, sy]) => { const c = document.getElementById('planCanvas'), r = c.getBoundingClientRect(), k = c.width / r.width; return Array.from(c.getContext('2d').getImageData(Math.round(sx * k), Math.round(sy * k), 1, 1).data.slice(0, 3)); }, [sx - box.x, sy - box.y]);
}
for (const [label, ht, landing] of [['8′1″ deck, straight stair', 8 + 1 / 12, false], ['10′ deck, stair with a turning landing', 10, true]]) {
  test(`C7 Gate C owner path: add a stair, open Framing: the stair supports are visible in 2D and 3D (${label})`, async () => {
    const { ctx, page, errors } = await h.newPage();
    await openDesign(page, { ...R, height: ht, staircases: [] });
    const stepBtn = (n) => page.locator('#stepdots [data-step]', { hasText: n });
    await page.locator('#mode3d').click(); await page.waitForTimeout(300);
    const cam0 = await page.evaluate(() => window.AOSDeckStudioTest.camera());
    await page.locator('#mode2d').click(); await page.waitForTimeout(150);
    await stepBtn('Stairs').click(); await page.waitForTimeout(200);
    await page.locator('#stepContent [data-action="stair-add"]').first().click(); await page.waitForTimeout(300);
    if (landing) { await page.locator('#stepContent [data-action="stair-landing"]').first().click(); await page.waitForTimeout(300);
      await page.locator('#stepContent [data-action="stair-turn"][data-value="left"]').first().click(); await page.waitForTimeout(300); }
    const m = model(await intent(page)), sup = m.parts.filter(p => p.kind === 'stair-stringer-support');
    assert.ok(sup.length >= 1, 'engine builds the support');
    await stepBtn('Framing').click();
    await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current', null, { timeout: 60000 }); await page.waitForTimeout(300);
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7c-owner-path-2d-${slug(label)}.png`) });
    // 2D: the support is drawn on top of the stringers in its own color, and the summary names it.
    // (Sampled a little off the beam's centre line: a tread line can cross exactly there.)
    const orange = (px) => Math.abs(px[0] - 0xc9) < 30 && Math.abs(px[1] - 0x8a) < 30 && Math.abs(px[2] - 0x3e) < 30;
    for (const b of sup) { const d = [Math.cos(-b.yaw), Math.sin(-b.yaw)], n = [-d[1], d[0]];
      const px = await Promise.all([-0.25, 0.25].flatMap(t => [-0.08, 0.08].map(o => planPixel(page, b.x + d[0] * t + n[0] * o, b.z + d[1] * t + n[1] * o))));
      assert.ok(px.filter(orange).length >= 3, `support beam visible in 2D at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}): ${JSON.stringify(px)}`); }
    assert.match(await page.locator('#stepContent').innerText(), /stairs: \d+ support beams? on \d+ posts \(AOS review\)/);
    // 3D: the view refits once the stair has supports, so the whole stair (and its supports) is framed.
    await page.locator('#mode3d').click(); await page.waitForTimeout(300);
    if (!(await page.evaluate(() => window.AOSDeckStudioTest.framingView())).showStructure) { await page.locator('#structureToggle').click(); await page.waitForTimeout(400); }
    const cam1 = await page.evaluate(() => window.AOSDeckStudioTest.camera()), v3 = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    assert.ok(cam1.radius > cam0.radius + 1, `3D refit to include the stair (${cam0.radius.toFixed(1)} → ${cam1.radius.toFixed(1)})`);
    assert.equal(v3.view3d['stair-stringer-support'] || 0, sup.length); assert.equal(v3.view3d['stair-support-post'] || 0, m.parts.filter(p => p.kind === 'stair-support-post').length);
    await page.screenshot({ path: H.path.join(H.SHOTS, `c7c-owner-path-3d-${slug(label)}.png`) });
    assert.deepEqual(errors, []); await ctx.close();
  });
}
