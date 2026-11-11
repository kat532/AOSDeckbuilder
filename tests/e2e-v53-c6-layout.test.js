'use strict';
// V5.3 C6 Step 5 — Decking Layout: current board direction, picture-frame and divider summary, and a
// plan highlight for frame/divider boards that changes drawing only (never the design or quantities).
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, CORE, ALL, VIEWPORTS, openDesign, step, intent, colors, click, saveFile, reopen, undo, redo, model } = H;
const h = H.harness(test);

const hl = (page) => page.evaluate(() => window.AOSDeckStudioTest.planHighlight());
const cardDir = (page) => page.locator('#stepContent [data-current-direction]').getAttribute('data-current-direction');
const count = (m, k) => m.parts.filter(p => p.kind === k).length;
async function toTab(page, tab) { await step(page, 3); await click(page, `#stepContent [data-path="layoutTab"][data-value="${tab}"]`); }

test('C6 layout: every board direction is named before and after a change; design differs only in deckLine', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, ALL['b3-showcase']); await toTab(page, 'direction');
  const I0 = await intent(page);
  assert.equal(await cardDir(page), model(I0).geometry.deckLineResolved, 'current direction shown on arrival');
  assert.match(await page.locator('#stepContent .layout-current').innerText(), /Boards run now/i);
  for (const [v, label, words] of [['vertical', 'Vertical', /out from the house/], ['diagonal-left', 'Diagonal left', /45°/], ['diagonal-right', 'Diagonal right', /45°/], ['horizontal', 'Horizontal', /Along the house wall/]]) {
    await click(page, `#stepContent [data-path="deckLine"][data-value="${v}"]`);
    const I = await intent(page);
    assert.deepEqual({ ...I, deckLine: I0.deckLine }, I0, `${v}: only deckLine changes`);
    assert.equal(await cardDir(page), v);
    const t = await page.locator('#stepContent .layout-current').innerText(); assert.match(t, new RegExp(label)); assert.match(t, words);
    assert.equal(await page.locator(`#stepContent [data-path="deckLine"][aria-pressed="true"]`).getAttribute('data-value'), v);
    assert.equal(await page.locator('#stepContent .layout-current svg.board-diagram line').count() > 0, true);
    assert.deepEqual(await hl(page), { frame: 0, divider: 0 }, 'no highlight on the direction tab');
    const dk = await page.evaluate(() => window.AOSDeckStudioTest.decking());
    assert.equal(dk.plan.direction, v); assert.deepEqual(dk.plan.materials, model(I).materials, 'materials are the engine figures');
  }
  assert.deepEqual(await intent(page), I0, 'back to the original direction');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 layout: picture frame None/Single/Double and dividers are summarized; highlight counts match the model; 2D and 3D agree', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, ALL['b2-diagonal-double-frame-dividers']); await toTab(page, 'border');
  for (const n of [2, 0, 1, 2]) {
    await click(page, `#stepContent [data-path="borderCount"][data-value="${n}"]`);
    const I = await intent(page), m = model(I);
    assert.equal(I.borderCount, n);
    const c = page.locator('#stepContent .layout-current');
    assert.equal(await c.getAttribute('data-frame'), String(n));
    assert.match(await c.innerText(), n ? new RegExp(`${['', 'Single', 'Double'][n]} · ${I.border}`) : /Picture frame\s*Off/i);
    assert.deepEqual(await hl(page), { frame: count(m, 'picture-frame'), divider: count(m, 'divider-board') }, `frame ${n}: every frame and divider board highlighted`);
    await page.locator('#mode3d').click(); await page.waitForTimeout(400);
    const col = await colors(page);
    for (const k of ['picture-frame', 'divider-board', 'field-board']) assert.equal(col.view3d[k]?.count || 0, count(m, k), `3D ${k} count`);
    assert.deepEqual(col.view3d, col.plan);
    await page.locator('#mode2d').click(); await page.waitForTimeout(200);
  }
  // Leaving the tab removes the highlight; nothing in the design changes by viewing.
  const I = await intent(page);
  await click(page, '#stepContent [data-path="layoutTab"][data-value="direction"]');
  assert.deepEqual(await hl(page), { frame: 0, divider: 0 }); assert.deepEqual(await intent(page), I);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 layout: divider add, position, remove, Remove All (confirmed) and Reset still work, with Undo/Redo and save/reopen', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, { ...ALL['b2-vertical-u'], dividerMode: 'single' }); await toTab(page, 'border');
  const dv = async () => Number(await page.locator('#stepContent .layout-current').getAttribute('data-dividers'));
  const n0 = await dv(); assert.ok(n0 >= 1, 'long U deck starts with dividers');
  await click(page, '#stepContent [data-action="divider-add"]'); assert.equal(await dv(), n0 + 1);
  assert.equal((await hl(page)).divider, count(model(await intent(page)), 'divider-board'));
  const slider = page.locator('#stepContent [data-divider-slider]');
  const v = Number(await slider.getAttribute('min')) + 0.02; await slider.fill(String(v)); await slider.dispatchEvent('change'); await H.settle(page);
  const I1 = await intent(page); assert.ok(Array.isArray(I1.dividerPositions) && I1.dividerPositions.length === n0 + 1, 'custom positions kept');
  await click(page, '#stepContent [data-action="divider-remove"]'); assert.equal(await dv(), n0);
  await undo(page); assert.equal(await dv(), n0 + 1); await redo(page); assert.equal(await dv(), n0);
  await click(page, '#stepContent [data-action="divider-remove-all"]');
  assert.equal(await page.locator('#dividerConfirm').isVisible(), true, 'Remove All asks first');
  await page.locator('#dividerConfirmAccept').click(); await H.settle(page);
  assert.equal(await dv(), 0);
  assert.match(await page.locator('#stepContent').innerText(), /No divider boards: field decking may need butt seams/, 'long-run rule still warns');
  assert.match(await page.locator('#stepContent .layout-highlight-note').innerText(), /No frame or divider|highlighted/);
  await click(page, '#stepContent [data-action="divider-reset"]'); assert.ok(await dv() >= 1, 'reset restores default dividers');
  const Ir = await intent(page), { file } = await saveFile(page);
  const r = await reopen(h, file); assert.deepEqual(await r.page.evaluate(() => window.AOSDeckStudioTest.intent()), Ir);
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('C6 layout: same color for field and accent — note explains the outline; boards stay highlighted; quantities unchanged by the highlight', async () => {
  const { ctx, page, errors } = await h.newPage();
  const d = { ...ALL['b2-diagonal-double-frame-dividers'], decking: 'Stone Ash', border: 'Stone Ash' };
  await openDesign(page, d); await step(page, 3);
  const before = await page.evaluate(() => window.AOSDeckStudioTest.decking());
  await click(page, '#stepContent [data-path="layoutTab"][data-value="border"]');
  assert.match(await page.locator('#stepContent .layout-highlight-note').innerText(), /share the field color/);
  const m = model(await intent(page)), x = await hl(page);
  assert.ok(x.frame > 0 && x.divider > 0); assert.equal(x.frame, count(m, 'picture-frame'));
  const after = await page.evaluate(() => window.AOSDeckStudioTest.decking());
  assert.deepEqual(after, before, 'highlight changes no board, divider or material figure');
  for (const vp of ['desktop']) await page.screenshot({ path: H.path.join(H.SHOTS, `c6-step5-same-color-${vp}.png`) });
  assert.deepEqual(errors, []); await ctx.close();
});

for (const vp of ['tablet', 'phone']) {
  test(`C6 layout: ${vp} — direction card and border summary visible, no sideways scroll`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await openDesign(page, ALL['b2-diagonal-double-frame-dividers']); await step(page, 3);
    assert.equal(await page.locator('#stepContent .layout-current').isVisible(), true);
    await page.screenshot({ path: H.path.join(H.SHOTS, `c6-step5-direction-${vp}.png`) });
    await click(page, '#stepContent [data-path="layoutTab"][data-value="border"]', press);
    assert.equal(await page.locator('#stepContent .layout-current').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: H.path.join(H.SHOTS, `c6-step5-border-${vp}.png`) });
    assert.deepEqual(errors, []); await ctx.close();
  });
}
