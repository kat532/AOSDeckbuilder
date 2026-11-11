'use strict';
// V5.3 C6 owner R1 — Priority 7 (railing controls) and Priority 8 (house look).
// P7 finding: "Left/Right stair rail" means left/right walking DOWN the stairs (stored as rails.left/right,
// unchanged); the panels now say so. The other railing checks (global vs per-edge, finishes, 2D/3D, save,
// Undo/Redo, the WIP1 removal confirmation) are the C6 railing tests, which still pass unchanged.
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, ALL, VIEWPORTS, openDesign, step, intent, model, settle, saveFile, reopen, undo, redo } = H;
const h = H.harness(test);

const D = { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: false, right: false } }] };

test('R1 railing: stair rail sides are explained in Stairs and Railings; Left means left walking down (the stored side is unchanged)', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, D); await step(page, 2);
  assert.match(await page.locator('#stepContent .rail-side-note').innerText(), /as you walk down the stairs/);
  await step(page, 5);
  assert.match(await page.locator('#stepContent .rail-side-note').innerText(), /Left\/right as you walk down the stairs/);
  await page.locator('#stepContent [data-action="stair-rail"][data-side="left"]').click(); await settle(page);
  const I = await intent(page); assert.deepEqual(I.staircases[0].rails, { left: true, right: false }, 'the same stored field as before');
  // Walking down = facing outward (nn). The left of someone facing nn is (nn.z, -nn.x)... in plan x,z with y up: left = (f.z, -f.x).
  const m = model(I), g = m.geometry.stairs[0], left = [g.nn[1], -g.nn[0]];
  const posts = m.parts.filter(p => p.kind === 'stair-rail-post');
  assert.ok(posts.length > 0 && posts.every(p => (p.x - g.base[0]) * left[0] + (p.z - g.base[1]) * left[1] > 0), 'the rail is on the walking-down left');
  await undo(page); assert.deepEqual((await intent(page)).staircases[0].rails, { left: false, right: false });
  await redo(page); assert.deepEqual((await intent(page)).staircases[0].rails, { left: true, right: false });
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 house look: a siding/color preview and a marked swatch; choosing changes only siding/color and does not move the camera', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, ALL['b3-showcase']); await step(page, 1);
  await page.locator('#stepContent [data-path="houseTab"][data-value="look"]').click(); await settle(page);
  const I0 = await intent(page), cam0 = await page.evaluate(() => JSON.stringify(window.AOSDeckStudioTest.camera?.() ?? null));
  for (const [style, color] of [['lap', 'Sage'], ['brick', 'Brick Red'], ['board-batten', 'Charcoal'], ['shake', 'Classic White']]) {
    await page.locator(`#stepContent [data-path="siding"][data-value="${style}"]`).click(); await settle(page);
    await page.locator(`#stepContent [data-path="houseColor"][data-value="${color}"]`).click(); await settle(page);
    const I = await intent(page);
    // The defaults (Lap siding, the default color) are stored as "not set", as before.
    assert.equal(I.siding ?? H.CORE.DEFAULT_SIDING, style); assert.equal(I.houseColor ?? H.CORE.DEFAULT_HOUSE_COLOR, color);
    const strip = (x) => { const { siding, houseColor, ...rest } = x; return rest; };
    assert.deepEqual(strip(I), strip(I0), 'nothing else changes');
    const fill = await page.locator('#stepContent .siding-preview rect').first().getAttribute('fill');
    assert.equal(fill, H.CORE.HOUSE_COLORS[color], 'preview in the chosen color');
    assert.match(await page.locator('#stepContent .house-preview-row').innerText(), new RegExp(`${H.CORE.SIDING_STYLES[style].label}[\\s\\S]*${color} · approximate preview`));
    const sel = page.locator('#stepContent [data-path="houseColor"][aria-pressed="true"]'); assert.equal(await sel.count(), 1); assert.equal(await sel.getAttribute('data-value'), color);
  }
  assert.equal(await page.evaluate(() => JSON.stringify(window.AOSDeckStudioTest.camera?.() ?? null)), cam0, 'no camera change');
  assert.equal(await page.locator('#mode2d').getAttribute('aria-pressed'), 'true', 'stays in 2D');
  const { file } = await saveFile(page); const r = await reopen(h, file);
  const I2 = await intent(r.page); assert.equal(I2.siding, 'shake'); assert.equal(I2.houseColor, 'Classic White');
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1-house-look-desktop.png') });
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('R1 house look and stair rails: phone layout readable, no sideways scroll', async () => {
  const { ctx, page, errors, press } = await h.newPage(VIEWPORTS.phone);
  await openDesign(page, ALL['b3-showcase']); await step(page, 1);
  await press(page.locator('#stepContent [data-path="houseTab"][data-value="look"]')); await settle(page);
  assert.equal(await page.locator('#stepContent .siding-preview').isVisible(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1-house-look-phone.png') });
  await step(page, 5); await page.locator('#stepContent .rail-side-note').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#stepContent .rail-side-note').isVisible(), true);
  assert.deepEqual(errors, []); await ctx.close();
});
