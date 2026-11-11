'use strict';
// V5.3 C6 owner R1 — Priority 6: stair framing in the framing views. Finding: the engine already models the
// stringers and landing framing, and the 3D framing view shows them; the 2D Framing step left the stringers
// out. Presentation fix only: the 2D Framing plan now draws every stringer (and the flight in outline).
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, ALL, VIEWPORTS, openDesign, step, intent, model } = H;
const h = H.harness(test);

const CASES = {
  'single stair': { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] },
  'two stairs, wide stair': { ...ALL['b2-vertical-u'], staircases: [{ id: 's', edge: 2, width: 4, offset: 3, rails: { left: true, right: true } }, { id: 't', edge: 4, width: 6, offset: 0, rails: { left: true, right: true } }] },
  'landing with turn': ALL['b3-showcase'],
};
const count = (m, k) => m.parts.filter(p => p.kind === k).length;

for (const [name, design] of Object.entries(CASES)) {
  test(`R1 stair framing: ${name} — 2D Framing draws every stringer and the landing framing; 3D framing shows the same members; model unchanged`, async () => {
    const { ctx, page, errors } = await h.newPage();
    await openDesign(page, design);
    const I = await intent(page), m = model(I);
    assert.ok(count(m, 'stair-stringer') > 0, 'the engine models stringers');
    await step(page, 6);
    const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    assert.equal(v.plan['stair-stringer'], count(m, 'stair-stringer'), '2D framing: every stringer drawn');
    for (const k of ['landing-beam', 'landing-joist', 'landing-post', 'landing-rim']) assert.equal(v.plan[k] || 0, count(m, k), `2D framing: ${k}`);
    for (const k of ['joist', 'ledger', 'post-6x6']) assert.equal(v.plan[k] || 0, count(m, k), `2D framing: ${k} unchanged`);
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1-stairframing-2d-${name.replace(/\W+/g, '-')}.png`) });
    // 3D framing view
    await page.locator('#mode3d').click(); await page.waitForTimeout(300);
    await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
    const v3 = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
    assert.equal(v3.showStructure, true);
    assert.equal(v3.view3d['stair-stringer'], count(m, 'stair-stringer'), '3D framing shows every stringer');
    for (const k of ['landing-beam', 'landing-joist', 'landing-post']) assert.equal(v3.view3d[k] || 0, count(m, k), `3D framing: ${k}`);
    assert.equal(v3.view3d['stair-tread'] || 0, 0, '3D framing hides treads (finish), as before');
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1-stairframing-3d-${name.replace(/\W+/g, '-')}.png`) });
    assert.deepEqual(await intent(page), I); assert.deepEqual(model(await intent(page)).counts, m.counts, 'stringer count, spans and materials unchanged');
    assert.deepEqual(errors, []); await ctx.close();
  });
}

test('R1 stair framing: phone — 2D Framing shows the stringers', async () => {
  const { ctx, page, errors } = await h.newPage(VIEWPORTS.phone);
  await openDesign(page, CASES['landing with turn']); await step(page, 6);
  const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
  assert.equal(v.plan['stair-stringer'], count(model(await intent(page)), 'stair-stringer'));
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1-stairframing-2d-phone.png') });
  assert.deepEqual(errors, []); await ctx.close();
});
