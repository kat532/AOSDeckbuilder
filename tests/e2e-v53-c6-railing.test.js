'use strict';
// V5.3 C6 Step 7 — Railing appearance and finish selection (WIP1 removal confirmation is in e2e-v53-c6.test.js).
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, CORE, ALL, VIEWPORTS, openDesign, step, intent, colors, click, saveFile, reopen, undo, redo, model, canon, without } = H;
const h = H.harness(test);

const STYLES = ['Westbury Tuscany', 'No rail product selected'];
const RAIL_NAMES = [...Object.keys(CORE.RAILS), ...STYLES];
const RAIL_KINDS = ['railing-post', 'post-cap', 'top-rail', 'bottom-rail', 'baluster', 'stair-rail-post', 'stair-top-rail', 'stair-bottom-rail', 'stair-baluster'];
const STAIR = (id, edge, offset, rails) => ({ id, edge, width: 4, offset, rails });
// Railed edges 1,2,3; two stairs on edge 2 with different stair-rail sides; Edge 3 (index 2) has a custom color.
const DESIGN = { shape: 'rectangle', width: 20, depth: 14, height: 5, houseEdges: [0], railEdges: [1, 2, 3], railStyle: 'Westbury Tuscany', railColor: 'Bronze',
  railOverrides: { 2: { railColor: 'White' } }, staircases: [STAIR('a', 2, -5, { left: true, right: true }), STAIR('b', 2, 5, { left: false, right: true })] };
const sanitize = (d) => JSON.parse(JSON.stringify(CORE.sanitize(structuredClone(d))));
const hexes = (...names) => [...new Set(names.map(n => CORE.RAILS[n]))].sort();

// Only the railing finish fields may change; the model may differ only in railing names/colors.
function assertOnlyFinishChanged(before, after, msg) {
  const keys = ['railStyle', 'railColor', 'railOverrides', 'perimeter'];
  assert.deepEqual(without(after, keys), without(before, keys), `${msg}: railing edges, stairs (incl. stair rails), shape and decking unchanged`);
  // perimeter is derived: each edge records its railing product/color; only those names may differ.
  const seg = (p) => ({ ...p, segments: p.segments.map(x => ({ ...x, product: x.product && '§', color: x.color && '§', custom: '§' })) });
  assert.deepEqual(seg(after.perimeter), seg(before.perimeter), `${msg}: derived perimeter differs only in each edge's finish`);
  const mb = model(before), ma = model(after);
  assert.equal(ma.parts.length, mb.parts.length, `${msg}: same parts`);
  assert.deepEqual(canon(without(ma, ['intent']), RAIL_NAMES, [CORE.RAILS]), canon(without(mb, ['intent']), RAIL_NAMES, [CORE.RAILS]), `${msg}: railing geometry, posts, spans and materials unchanged`);
}
async function toFinish(page) { await step(page, 5); await click(page, '#stepContent [data-path="railTab"][data-value="finish"]'); }
const target = (page, v) => click(page, `#stepContent [data-action="rail-target"][data-edge="${v}"]`);
const card = (page) => page.locator('#stepContent .rail-current').textContent();

test('C6 railing: global product and color changes; per-edge custom finish; repeated switching; Undo/Redo', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, DESIGN); await toFinish(page);
  const I0 = await intent(page); assert.deepEqual(I0, sanitize(DESIGN));
  assert.match(await card(page), /All railed edges/); assert.match(await card(page), /Westbury Tuscany · Bronze/);
  // Global product change keeps the Edge 3 custom color.
  await click(page, '#stepContent [data-path="railStyle"][data-value="No rail product selected"]');
  let I = await intent(page); assert.equal(I.railStyle, 'No rail product selected'); assert.deepEqual(I.railOverrides, { 2: { railColor: 'White' } }, 'per-edge color kept on a product change');
  assertOnlyFinishChanged(I0, I, 'global product');
  assert.match(await card(page), /Product not selected · Bronze/);
  await click(page, '#stepContent [data-path="railStyle"][data-value="Westbury Tuscany"]');
  // Per-edge: give Edge 2 (index 1) its own color.
  await target(page, 1);
  assert.match(await card(page), /Edge 2 only/);
  await click(page, '#stepContent [data-path="railColor"][data-value="Textured Black"]');
  I = await intent(page); assert.deepEqual(I.railOverrides, { 1: { railColor: 'Textured Black' }, 2: { railColor: 'White' } }); assert.equal(I.railColor, 'Bronze', 'global color unchanged by an edge choice');
  assert.match(await card(page), /Edge 2 only · custom/); assert.match(await card(page), /Textured Black/);
  assertOnlyFinishChanged(I0, I, 'per-edge color');
  const Iedge = I;
  // Switch the edge color repeatedly; only that edge changes each time.
  for (const c of ['White', 'Bronze', 'Textured Black', 'White', 'Textured Black']) {
    await click(page, `#stepContent [data-path="railColor"][data-value="${c}"]`);
    I = await intent(page); assert.equal(CORE.railFinish(I, 1).railColor, c); assert.equal(CORE.railFinish(I, 2).railColor, 'White'); assert.equal(CORE.railFinish(I, 3).railColor, 'Bronze');
  }
  assert.deepEqual(I, Iedge);
  // Global color change: the documented rule — an all-edges choice applies to every railed edge (warning shown first).
  await target(page, 'all');
  assert.match(await page.locator('#stepContent').innerText(), /including 2 edges with a custom finish/);
  await click(page, '#stepContent [data-path="railColor"][data-value="White"]');
  I = await intent(page); assert.equal(I.railColor, 'White'); assert.deepEqual(I.railOverrides, {}, 'all-edges color applies to every edge (existing V5.1 rule)');
  assertOnlyFinishChanged(I0, I, 'global color');
  // Undo restores the two custom edges; Redo re-applies.
  await undo(page); assert.deepEqual(await intent(page), Iedge, 'undo restores per-edge custom finishes');
  await redo(page); assert.deepEqual((await intent(page)).railOverrides, {});
  while (!(await page.locator('#undoBtn').isDisabled())) await undo(page);
  assert.deepEqual(await intent(page), I0, 'undo all the way returns to the opened design');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 railing: product-only overrides survive a global color change; color-only overrides survive a global product change', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, { ...DESIGN, railOverrides: { 1: { railStyle: 'No rail product selected' }, 2: { railColor: 'White' } } }); await toFinish(page);
  await click(page, '#stepContent [data-path="railColor"][data-value="Textured Black"]');
  assert.deepEqual((await intent(page)).railOverrides, { 1: { railStyle: 'No rail product selected' } });
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 railing: 3D draws each edge and stair railing in its finish; 2D and 3D agree; save and reopen keep everything', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, DESIGN); await toFinish(page);
  await target(page, 1); await click(page, '#stepContent [data-path="railColor"][data-value="Textured Black"]');
  const I1 = await intent(page);
  await page.locator('#mode3d').click(); await page.waitForTimeout(500);
  const c = await colors(page);
  assert.deepEqual(c.view3d, c.plan, '3D receives the same railing parts and colors as the plan model');
  const m = model(I1);
  for (const k of RAIL_KINDS) {
    const parts = m.parts.filter(p => p.kind === k); if (!parts.length) continue;
    assert.equal(c.view3d[k].count, parts.length, `${k} count`);
  }
  assert.deepEqual(c.view3d['top-rail'].colors, hexes('Bronze', 'Textured Black', 'White'), 'three deck-edge finishes drawn');
  // Both stairs are on Edge 3 (custom White) → every stair railing part is White.
  for (const k of ['stair-top-rail', 'stair-baluster', 'stair-rail-post']) assert.deepEqual(c.view3d[k].colors, hexes('White'), `${k} follows Edge 3`);
  assert.equal(c.view3d['stair-top-rail'].count, model(DESIGN).parts.filter(p => p.kind === 'stair-top-rail').length, 'three stair railings (2 + 1 sides) unchanged');
  await page.screenshot({ path: H.path.join(H.SHOTS, 'c6-step7-rail-3d.png') });
  const { file, data } = await saveFile(page);
  assert.deepEqual(data.design.railOverrides, { 1: { railColor: 'Textured Black' }, 2: { railColor: 'White' } });
  const r = await reopen(h, file);
  assert.deepEqual(await r.page.evaluate(() => window.AOSDeckStudioTest.intent()), I1);
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('C6 railing: Remove deck rails (WIP1) still confirms, mentions custom finishes, and keeps stair railings', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, DESIGN); await step(page, 5);
  const I0 = await intent(page);
  await click(page, '#stepContent [data-action="rails-none"]');
  assert.match(await page.locator('#dividerConfirmMessage').innerText(), /all 3 deck edges\. Custom finishes on 1 edge are cleared too\. Stair railings/);
  await page.locator('#dividerConfirmCancel').click(); assert.deepEqual(await intent(page), I0);
  await click(page, '#stepContent [data-action="rails-none"]'); await page.locator('#dividerConfirmAccept').click(); await H.settle(page);
  const I = await intent(page);
  assert.deepEqual(I.railEdges, []); assert.deepEqual(I.staircases, I0.staircases, 'stair railings unchanged');
  assert.equal(I.railStyle, I0.railStyle); assert.equal(I.railColor, I0.railColor);
  assert.deepEqual(errors, []); await ctx.close();
});

for (const vp of ['desktop', 'tablet', 'phone']) {
  test(`C6 railing: ${vp} — finish card, approximate preview label, tappable swatches, no sideways scroll`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await openDesign(page, DESIGN); await step(page, 5);
    await click(page, '#stepContent [data-path="railTab"][data-value="finish"]', press);
    await click(page, '#stepContent [data-path="railColor"][data-value="White"]', press);
    assert.equal(await page.locator('#stepContent .rail-current').isVisible(), true);
    assert.equal(await page.locator('#stepContent .rail-current svg.rail-preview').count(), 1);
    const fill = await page.locator('#stepContent .rail-current svg.rail-preview rect').first().getAttribute('fill');
    assert.equal(fill, CORE.RAILS.White, 'preview uses the catalog color');
    assert.match(await page.locator('#stepContent').innerText(), /Approximate color preview/);
    const sel = page.locator('#stepContent [data-path="railColor"][aria-pressed="true"]');
    assert.equal(await sel.count(), 1); assert.equal(await sel.getAttribute('data-value'), 'White');
    for (const b of await page.locator('#stepContent [data-path="railColor"]').all()) { const box = await b.boundingBox(); assert.ok(box.height >= 44, 'swatch touch target'); }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: H.path.join(H.SHOTS, `c6-step7-railing-${vp}.png`) });
    assert.deepEqual(errors, []); await ctx.close();
  });
}
