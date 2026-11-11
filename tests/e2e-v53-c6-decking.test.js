'use strict';
// V5.3 C6 Step 6 — Decking Selection: clear current choice, and switching collection or color
// never changes anything else in the design (proved by engine-model comparison).
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, CORE, ALL, VIEWPORTS, openDesign, step, intent, colors, click, saveFile, reopen, undo, redo, model, canon, without } = H;
const h = H.harness(test);

const COLLECTIONS = ['TimberTech Terrain', 'TimberTech Advanced PVC'];
const NAMES = Object.keys(CORE.PALETTES);
const FINISH_NAMES = [...NAMES, ...COLLECTIONS, 'Terrain', 'Advanced PVC'];

const STAIR = (id, edge, offset, rails = { left: true, right: true }) => ({ id, edge, width: 4, offset, rails });
const CASES = {
  // Rectangle with a turned landing, doors/windows and two concrete surfaces.
  rectangle: ALL['b3-showcase'],
  // L-shape, diagonal boards, double picture frame, double dividers, frame on house walls, landing.
  'L-shape': ALL['b2-diagonal-double-frame-dividers'],
  // Angled corner cut with two staircases and custom divider positions.
  angled: { ...ALL['cut-corner'], height: 5, borderCount: 1, dividerMode: 'single', dividerPositions: [0.4], staircases: [STAIR('a', 1, 0), STAIR('b', 2, 2, { left: true, right: false })] },
  // U-shape with two staircases and a custom railing finish on one edge.
  'U-shape': { ...ALL['b2-vertical-u'], railColor: 'Bronze', railOverrides: { 2: { railColor: 'White' } } },
};

const sanitize = (d) => JSON.parse(JSON.stringify(CORE.sanitize(structuredClone(d))));
// Everything except the decking choice fields must be identical; the model may differ only in those names/colors.
function assertOnlyDeckingChanged(before, after, changed, msg) {
  const keys = ['collection', 'decking', 'border'];
  assert.deepEqual(without(after, keys), without(before, keys), `${msg}: no other design field changes`);
  for (const k of keys) if (!changed.includes(k)) assert.equal(after[k], before[k], `${msg}: ${k} unchanged`);
  const mb = model(before), ma = model(after);
  assert.equal(ma.parts.length, mb.parts.length, `${msg}: same number of parts`);
  assert.deepEqual(canon(ma, FINISH_NAMES, [CORE.PALETTES]), canon(mb, FINISH_NAMES, [CORE.PALETTES]), `${msg}: geometry, framing, stairs, railings, surfaces and materials identical apart from the decking names/colors`);
}
async function toFinish(page, tab = 'field') { await step(page, 4); await click(page, `#stepContent [data-path="finishTab"][data-value="${tab}"]`); }

for (const [name, design] of Object.entries(CASES)) {
  test(`C6 decking: ${name} — collection, field color and accent changes touch nothing else; returning restores the exact design`, async () => {
    assert.ok(design, `fixture ${name}`);
    const { ctx, page, errors } = await h.newPage();
    await openDesign(page, design); await toFinish(page);
    const I0 = await intent(page), M0 = model(I0);
    assert.deepEqual(I0, sanitize(design), 'loaded design is the fixture');
    const otherCollection = COLLECTIONS.find(c => c !== I0.collection);
    // 1) switch collection
    await click(page, `#stepContent [data-path="collection"][data-value="${otherCollection}"]`);
    let I = await intent(page); assert.equal(I.collection, otherCollection); assertOnlyDeckingChanged(I0, I, ['collection'], 'collection switch');
    // 2) every field color in the collection, repeatedly
    for (const c of [...NAMES, NAMES[0], NAMES.at(-1)]) {
      await click(page, `#stepContent [data-path="decking"][data-value="${c}"]`);
      I = await intent(page); assert.equal(I.decking, c); assertOnlyDeckingChanged(I0, I, ['collection', 'decking'], `field color ${c}`);
    }
    // 3) accent color
    await toFinish(page, 'accent');
    const accent = NAMES.find(c => c !== I0.border);
    await click(page, `#stepContent [data-path="border"][data-value="${accent}"]`);
    I = await intent(page); assert.equal(I.border, accent); assertOnlyDeckingChanged(I0, I, ['collection', 'decking', 'border'], 'accent color');
    const Ilast = I;
    // 4) switch back to the original choices: the design and its model are exactly the original
    await click(page, `#stepContent [data-path="border"][data-value="${I0.border}"]`);
    await toFinish(page, 'field');
    await click(page, `#stepContent [data-path="collection"][data-value="${I0.collection}"]`);
    await click(page, `#stepContent [data-path="decking"][data-value="${I0.decking}"]`);
    I = await intent(page); assert.deepEqual(I, I0, 'returning restores the original design'); assert.deepEqual(model(I), M0, 'and the identical model');
    // 5) Undo back past the return and Redo forward again
    for (let k = 0; k < 3; k++) await undo(page);
    assert.deepEqual(await intent(page), Ilast, 'undo returns to the accent choice');
    for (let k = 0; k < 3; k++) await redo(page);
    assert.deepEqual(await intent(page), I0, 'redo returns to the original');
    assert.deepEqual(errors, []); await ctx.close();
  });
}

test('C6 decking: the panel names the manufacturer, collection and color, marks the active swatch and labels colors as approximate', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, CASES.rectangle); await toFinish(page);
  const card = page.locator('#stepContent .finish-current');
  assert.equal(await card.count(), 1, 'one current-selection summary');
  for (const [collection, short] of [['TimberTech Terrain', 'Terrain'], ['TimberTech Advanced PVC', 'Advanced PVC']]) {
    await click(page, `#stepContent [data-path="collection"][data-value="${collection}"]`);
    for (const c of ['Silver Maple', 'Rustic Elm']) {
      await click(page, `#stepContent [data-path="decking"][data-value="${c}"]`);
      const t = await page.locator('#stepContent .finish-current').innerText();
      assert.match(t, /TimberTech/); assert.match(t, new RegExp(short)); assert.match(t, new RegExp(c));
      const sel = page.locator('#stepContent [data-path="decking"].selected');
      assert.equal(await sel.count(), 1); assert.equal(await sel.getAttribute('data-value'), c); assert.equal(await sel.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#stepContent [data-path="decking"][aria-pressed="false"]').count(), NAMES.length - 1);
      const paint = await page.locator('#stepContent .finish-current .finish-chip').first().evaluate(e => getComputedStyle(e).backgroundColor);
      const hex = CORE.PALETTES[c], rgb = `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
      assert.equal(paint, rgb, 'summary chip shows the catalog color');
    }
    assert.match(await page.locator('#stepContent').innerText(), new RegExp(`${NAMES.length} colors in ${short}`, 'i'));
  }
  assert.match(await page.locator('#stepContent').innerText(), /approximate/i, 'swatches are labeled approximate');
  await toFinish(page, 'accent');
  const t = await page.locator('#stepContent .finish-current').innerText();
  assert.match(t, /Accent/i); assert.match(t, /Stone Ash/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 decking: 2D and 3D draw the chosen field and accent colors; part counts agree', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, CASES['L-shape']); await toFinish(page);
  for (const [field, accent] of [['Sandy Birch', 'Rustic Elm'], ['Stone Ash', 'Stone Ash'], ['Brown Oak', 'Silver Maple']]) {
    await toFinish(page, 'field'); await click(page, `#stepContent [data-path="decking"][data-value="${field}"]`);
    await toFinish(page, 'accent'); await click(page, `#stepContent [data-path="border"][data-value="${accent}"]`);
    await page.locator('#mode3d').first().click(); await page.waitForTimeout(400);
    const c = await colors(page);
    assert.deepEqual(c.view3d, c.plan, `${field}/${accent}: 3D draws the same parts and colors as 2D`);
    assert.deepEqual(c.plan['field-board'].colors, [CORE.PALETTES[field]]);
    for (const k of ['picture-frame', 'divider-board', 'fascia']) assert.deepEqual(c.plan[k].colors, [CORE.PALETTES[accent]], `${k} uses the accent color`);
    assert.ok(c.plan['field-board'].count > 0 && c.plan['picture-frame'].count > 0 && c.plan['divider-board'].count > 0);
    await page.locator('#mode2d').first().click(); await page.waitForTimeout(200);
  }
  assert.deepEqual(errors, []); await ctx.close();
});

test('C6 decking: product changes persist through save and reopen; materials list unchanged apart from color names', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, CASES.angled); await toFinish(page);
  const I0 = await intent(page);
  await click(page, '#stepContent [data-path="collection"][data-value="TimberTech Advanced PVC"]');
  await click(page, '#stepContent [data-path="decking"][data-value="Silver Maple"]');
  await toFinish(page, 'accent'); await click(page, '#stepContent [data-path="border"][data-value="Rustic Elm"]');
  const I1 = await intent(page), { file, data } = await saveFile(page);
  assert.equal(data.schemaVersion, 6, 'saved as schema 6');
  assert.equal(data.design.collection, 'TimberTech Advanced PVC'); assert.equal(data.design.decking, 'Silver Maple'); assert.equal(data.design.border, 'Rustic Elm');
  const r = await reopen(h, file);
  const I2 = await r.page.evaluate(() => window.AOSDeckStudioTest.intent());
  assert.deepEqual(I2, I1, 'reopened design is identical');
  const m0 = model(I0).materials, m1 = model(I2).materials;
  assert.equal(m1.decking.collection, 'TimberTech Advanced PVC'); assert.equal(m1.decking.fieldColor, 'Silver Maple'); assert.equal(m1.decking.frameColor, 'Rustic Elm');
  assert.deepEqual(canon(m1, FINISH_NAMES, [CORE.PALETTES]), canon(m0, FINISH_NAMES, [CORE.PALETTES]), 'board, frame, divider, fascia and stair quantities are unchanged');
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

for (const vp of ['tablet', 'phone']) {
  test(`C6 decking: ${vp} — summary visible, swatches tappable, no sideways scroll`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await openDesign(page, CASES.rectangle); await step(page, 4);
    await click(page, '#stepContent [data-path="decking"][data-value="Sandy Birch"]', press);
    assert.equal((await intent(page)).decking, 'Sandy Birch');
    assert.equal(await page.locator('#stepContent .finish-current').isVisible(), true);
    for (const b of await page.locator('#stepContent [data-path="decking"]').all()) { const box = await b.boundingBox(); assert.ok(box.height >= 44 && box.width >= 44, 'swatch touch target'); }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll');
    await page.screenshot({ path: H.path.join(H.SHOTS, `c6-step6-decking-${vp}.png`) });
    assert.deepEqual(errors, []); await ctx.close();
  });
}
