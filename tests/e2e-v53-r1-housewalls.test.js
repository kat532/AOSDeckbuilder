'use strict';
// V5.3 C6 owner R1 — Priority 5: house walls stand out in 2D (charcoal wall line + hatched house-side band
// outside the deck); doors/windows stay visible; railing edges and ledgers stay distinguishable; drawing only.
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, ALL, VIEWPORTS, openDesign, step, intent, model } = H;
const h = H.harness(test);

// Pixel color (r,g,b) of the 2D plan at a plan point offset by `off` feet along the edge normal.
const pixelAt = (page, x, z) => page.evaluate(([x, z]) => {
  const c = document.getElementById('planCanvas'), r = c.getBoundingClientRect(), p = window.AOSDeckStudioTest.toScreen(x, z);
  const px = Math.round((p[0] - r.left) * c.width / r.width), py = Math.round((p[1] - r.top) * c.height / r.height);
  return [...c.getContext('2d').getImageData(px, py, 1, 1).data].slice(0, 3); }, [x, z]);
const dark = (c) => c[0] < 80 && c[1] < 80 && c[2] < 90;
const light = (c) => c.every(v => v > 170);
const DESIGN = { ...ALL['b3-showcase'] }; // house wall on edge 0 with a door, patio door and window; railings on 1–3

for (const vp of ['desktop', 'phone']) {
  test(`R1 house walls (${vp}): charcoal wall line and a house-side band outside the deck in every step; railing edges have no band`, async () => {
    const { ctx, page, errors } = await h.newPage(VIEWPORTS[vp]);
    await openDesign(page, DESIGN);
    const I = await intent(page), M = model(I), e = M.geometry.edges;
    for (const s of [0, 1, 2, 3, 4, 5, 6, 8]) {
      await step(page, s);
      // a spot on the wall line clear of openings: between the door and the patio door (32.5% along edge 0)
      const w = e[0], at = (f, n) => [w.a[0] + (w.b[0] - w.a[0]) * f + w.n[0] * n, w.a[1] + (w.b[1] - w.a[1]) * f + w.n[1] * n];
      const ws = await page.evaluate(() => window.AOSDeckStudioTest.houseWalls());
      assert.deepEqual(ws.map(x => x.edge), [0], `step ${s}: one house wall`);
      const bandDepth = Math.hypot(ws[0].band[3][0] - ws[0].band[0][0], ws[0].band[3][1] - ws[0].band[0][1]);
      assert.ok(bandDepth >= 14, `step ${s}: band at least 14 px deep (${bandDepth.toFixed(1)})`);
      if (s !== 6) assert.ok(dark(await pixelAt(page, ...at(.325, 0))), `step ${s}: charcoal wall line`);
      const scale = await page.evaluate(() => { const a = window.AOSDeckStudioTest.toScreen(0, 0), b = window.AOSDeckStudioTest.toScreen(1, 0); return b[0] - a[0]; });
      const inBand = await pixelAt(page, ...at(.325, (bandDepth * .88) / scale));
      assert.ok(light(inBand) && !(inBand[0] > 240 && inBand[1] > 240), `step ${s}: house-side band shaded (${inBand})`);
      // Railing edge 2 (front): just outside it is plan background, not a band
      const r = e[2], out = await pixelAt(page, r.mid[0] * .2 + r.a[0] * .8 + r.n[0] * (bandDepth * .6) / scale, r.mid[1] * .2 + r.a[1] * .8 + r.n[1] * (bandDepth * .6) / scale);
      assert.ok(out.every(v => v > 215), `step ${s}: no band outside a railing edge (${out})`);
    }
    // Doors and windows drawn on top of the band
    await step(page, 1);
    for (const o of await page.evaluate(() => window.AOSDeckStudioTest.openings())) {
      const w = e[o.edge], c = await pixelAt(page, w.mid[0] + w.t[0] * o.offset + w.n[0] * .12, w.mid[1] + w.t[1] * o.offset + w.n[1] * .12);
      assert.ok(!light(c) || (c[2] > c[0] + 25), `${o.type}: opening color visible (${c})`);
    }
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1-housewalls-${vp}.png`) });
    assert.deepEqual(await intent(page), I, 'drawing only: design unchanged');
    assert.deepEqual(errors, []); await ctx.close();
  });
}

test('R1 house walls: band stays readable when zoomed out and in; U-shape with three walls; ledger badges still shown in Framing', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, ALL['b3c-u-three-walls']);
  for (const z of ['#zoomOut', '#zoomOut', '#zoomOut', '#zoomIn', '#zoomIn', '#zoomIn', '#zoomIn', '#zoomIn']) {
    await page.locator(z).click(); await page.waitForTimeout(80);
    const ws = await page.evaluate(() => window.AOSDeckStudioTest.houseWalls());
    assert.equal(ws.length, 3);
    for (const w of ws) assert.ok(Math.hypot(w.band[3][0] - w.band[0][0], w.band[3][1] - w.band[0][1]) >= 14);
  }
  await page.locator('#fitBtn').click(); await step(page, 6);
  const { reserved } = await page.evaluate(() => window.AOSDeckStudioTest.planLabels());
  assert.ok(reserved.length >= 3, 'ledger badges and bands reserved from measurements');
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1-housewalls-u-framing.png') });
  assert.deepEqual(errors, []); await ctx.close();
});
