'use strict';
// V5.3 C6 owner R1 — Priority 4: dimension labels keep clear of the plan's other markers and labels (edge
// badges, stair/divider handles, stair-rail toggles, corner handles, door/window lines, patio labels), stay
// outside the outline where there is room, still open the exact-length editor, and are not hidden wholesale.
const test = require('node:test');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const H = require('./c6-helpers');
const { assert, ALL, VIEWPORTS, openDesign, step, fs, os, path, ROOT } = H;
const h = H.harness(test);
const C6_HTML = path.join(os.tmpdir(), `aos-r1-c6-${process.pid}.html`), C6_APP = pathToFileURL(C6_HTML).href;
test.before(() => fs.writeFileSync(C6_HTML, execFileSync('git', ['show', 'checkpoint/v5.3-c6:index.html'], { cwd: ROOT })));
test.after(() => fs.rmSync(C6_HTML, { force: true }));

const STAIR = (id, edge, offset, landing) => ({ id, edge, width: 4, offset, rails: { left: true, right: true }, ...(landing ? { landing } : {}) });
const CASES = {
  rectangle: ALL['b3-showcase'],
  L: { ...ALL['b2-diagonal-double-frame-dividers'], openings: [{ id: 'd', type: 'door', edge: 0, offset: 2 }] },
  U: ALL['b2-vertical-u'],
  angled: { ...ALL['cut-corner'], height: 5, houseEdges: [0], staircases: [STAIR('a', 1, 0), STAIR('b', 2, 2)], dividerMode: 'single' },
};
const STATES = [[0, null], [1, null], [2, null], [3, ['layoutTab', 'border']], [5, ['railTab', 'locations']], [5, ['railTab', 'finish']], [6, null], [8, null]];
const hit = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
const shrink = (b, k) => ({ l: b.l + k, r: b.r - k, t: b.t + k, b: b.b - k });
async function goState(page, s, tab) { await step(page, s); if (tab) { await page.locator(`#stepContent [data-path="${tab[0]}"][data-value="${tab[1]}"]`).click(); await page.waitForTimeout(150); } }
const measured = (page) => page.evaluate(() => (document.getElementById('planCanvas').getAttribute('aria-label').match(/Dimensions: (.*)\.$/)?.[1] || '').split(', ').filter(t => t && t !== 'none shown'));

for (const vp of ['desktop', 'phone']) for (const [name, design] of Object.entries(CASES)) {
  test(`R1 dims: ${name} (${vp}) — no measurement covers a badge, handle, door line, patio label or another measurement; none dropped vs C6`, async () => {
    const { ctx, page, errors } = await h.newPage(VIEWPORTS[vp]);
    const old = await h.newPage(VIEWPORTS[vp]); await old.page.goto(C6_APP); await old.page.waitForFunction(() => window.AOSDeckStudioTest);
    await openDesign(page, design); await openDesign(old.page, design);
    for (const [s, tab] of STATES) {
      await goState(page, s, tab); await goState(old.page, s, tab);
      const { labels, reserved } = await page.evaluate(() => window.AOSDeckStudioTest.planLabels());
      const where = `${name} ${vp} step ${s}${tab ? ' ' + tab[1] : ''}`;
      const forcedOk = (l) => /overall/.test(l.text) || /^Landing /.test(l.text) || /^[LR] /.test(l.text); // overall/landing are forced (as in C6); L/R is the C5 position guide (its own reserved box) // forced placements kept from C6
      for (const l of labels) { if (forcedOk(l)) continue;
        for (const m of reserved) assert.ok(!hit(shrink(l, 1), m), `${where}: "${l.text}" covers a plan marker`);
        for (const o of labels) if (o !== l && (!forcedOk(o) || /^Landing /.test(o.text))) assert.ok(!hit(shrink(l, 1), shrink(o, 1)), `${where}: "${l.text}" overlaps "${o.text}"`); }
      const now = await measured(page), before = await measured(old.page);
      assert.ok(now.length >= before.length, `${where}: ${now.length} measurements shown (C6 showed ${before.length})`);
    }
    if (vp === 'phone' && name === 'rectangle') { await goState(page, 2, null); await page.screenshot({ path: H.path.join(H.SHOTS, 'r1-dims-stairs-phone-after.png') }); await goState(old.page, 2, null); await old.page.screenshot({ path: H.path.join(H.SHOTS, 'r1-dims-stairs-phone-before.png') }); }
    assert.deepEqual([...errors, ...old.errors], []); await ctx.close(); await old.ctx.close();
  });
}

test('R1 dims: on Shape & Size every edge measurement is shown and tapping it still opens the exact-length editor (zoomed in and out)', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, CASES.L); await step(page, 0);
  for (const zoom of ['#zoomOut', '#zoomIn', '#zoomIn']) {
    await page.locator(zoom).click(); await page.waitForTimeout(200);
    const edges = await page.evaluate(() => window.AOSDeckStudioTest.edges().length);
    const { labels } = await page.evaluate(() => window.AOSDeckStudioTest.planLabels());
    const edgeLabels = labels.filter(l => /✎$/.test(l.text) && !/overall/.test(l.text));
    assert.equal(edgeLabels.length, edges, `${zoom}: one editable label per edge`);
    const b = await page.locator('#planCanvas').boundingBox();
    const l = edgeLabels[1]; await page.mouse.click(b.x + (l.l + l.r) / 2, b.y + (l.t + l.b) / 2); await page.waitForTimeout(200);
    assert.equal(await page.locator('#stepContent input[data-edge-field="length"]').count(), 1, `${zoom}: tap opens the editor`);
    await page.keyboard.press('Escape'); await page.locator('#stepContent [data-action="close-edge"], #stepContent [data-action="selection-done"]').first().click().catch(() => {});
    await page.waitForTimeout(100);
  }
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 dims: All / Selected / Off still cycle and each says what it shows', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, CASES.rectangle);
  for (const [label, msg] of [['Selected', /only the edge, stair or divider you select/], ['Off', /no measurements/], ['All', /every measurement/]]) {
    await page.locator('#measureBtn').click(); await page.waitForTimeout(120);
    assert.match(await page.locator('#measureBtn').innerText(), new RegExp(label, 'i'));
    assert.match(await page.locator('#toast').innerText(), msg);
  }
  assert.match(await page.locator('#measureBtn').getAttribute('title'), /All, only the Selected item, or Off/);
  assert.deepEqual(errors, []); await ctx.close();
});
