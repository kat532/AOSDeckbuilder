'use strict';
// V5.3 C6 owner R1 — final corrections 2 (owner, 11 Nov 2026):
//  1. Plan name sits in Step 01 · Shape & Size above the shapes; Open Existing Plan below; no naming form in
//     the drawing workspace.
//  2. Stairs may be as wide as their edge and sit flush with either end (no 0.08 ft / 0.5 ft clearances).
const test = require('node:test');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const H = require('./c6-helpers');
const { RAIL_LINE } = require('./rail-inset');
const { assert, VIEWPORTS, openDesign, step, intent, settle, model, saveFile, reopen, undo, redo, fs, os, path, ROOT } = H;
const h = H.harness(test);
const PREV_HTML = path.join(os.tmpdir(), `aos-r1f-${process.pid}.html`), PREV = pathToFileURL(PREV_HTML).href;
test.before(() => fs.writeFileSync(PREV_HTML, execFileSync('git', ['show', 'checkpoint/v5.3-c6-owner-r1-final:index.html'], { cwd: ROOT })));
test.after(() => fs.rmSync(PREV_HTML, { force: true }));

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('aosDeckStudio.projects.v1') || '{}'));
const waitSaved = (page) => page.waitForFunction(() => /Saved/.test(document.getElementById('saveStatus').textContent), null, { timeout: 8000 });
const started = (page) => page.waitForFunction(() => /\d+ SQ FT/.test(document.getElementById('squareFeet').textContent)).then(() => settle(page));
// 16 × 12 deck with a 4′ wide × 3′ deep bump-out on the front (edge 4 is the 4′ bump-out face).
const BUMP = { shape: 'free', width: 16, depth: 15, height: 4, houseEdges: [0], points: [[0, 0], [16, 0], [16, 12], [10, 12], [10, 15], [6, 15], [6, 12], [0, 12]].map(([x, z]) => [x / 16, z / 15]) };
const RECT = { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], railEdges: [1, 2, 3] };
const S = (o) => ({ id: 's', edge: 4, width: 4, offset: 0, rails: { left: true, right: true }, ...o });
const count = (m, k) => m.parts.filter(p => p.kind === k).length;
async function posSet(page, side, value, press = (l) => l.click()) {
  await press(page.locator(`#stepContent [data-action="pos-side"][data-target="stair"][data-value="${side}"]`)); await page.waitForTimeout(100);
  const f = page.locator('#stepContent input[data-stair-field="edge"]'); await f.scrollIntoViewIfNeeded(); await f.fill(value);
  await press(page.locator('#stepContent [data-action="pos-apply"][data-target="stair"]')); await page.waitForTimeout(300);
}
const setStairWidth = async (page, v) => { const w = page.locator('#stepContent input[data-stair-field="width"]'); await w.fill(v); await w.dispatchEvent('change'); await settle(page); };

// ---------- 1. Plan name in Step 01 ----------
for (const vp of ['desktop', 'tablet', 'phone']) {
  const touch = VIEWPORTS[vp].width < 800;
  test(`R1 final 2 (${vp}): Step 01 shows Plan name, then the six shapes, then Open Existing Plan; the workspace has no form`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    const y = async (sel) => (await page.locator(sel).first().boundingBox()).y;
    assert.equal(await page.locator('#emptyOverlay input, #emptyOverlay form').count(), 0, 'no naming form in the drawing workspace');
    assert.equal(await page.locator('#stepContent #newPlanName').count(), 1, 'name field in the Step 01 panel');
    assert.equal(await page.locator('#stepContent [data-shape]').count(), 6);
    assert.deepEqual(await page.locator('#stepContent [data-shape]').evaluateAll(b => b.map(x => x.dataset.shape)), ['rectangle', 'square', 'L', 'T', 'U', 'free']);
    assert.ok(await y('#stepContent #newPlanName') < await y('#stepContent [data-shape="rectangle"]'), 'name above the shapes');
    assert.ok(await y('#stepContent [data-shape="free"]') < await y('#stepContent #openExistingBtn'), 'Open Existing Plan below the shapes');
    assert.equal(await page.locator('#startFromCanvas').count(), 0);
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1final2-start-${vp}.png`), fullPage: false });
    // name, then shape → designing
    if (touch) { await page.locator('#newPlanName').tap(); await page.keyboard.type('Brown – 8 Pine Rd'); } else await page.locator('#newPlanName').fill('Brown – 8 Pine Rd');
    const sh = page.locator('#stepContent [data-shape="T"]'); await sh.scrollIntoViewIfNeeded(); await press(sh); await started(page);
    assert.equal((await intent(page)).project, 'Brown – 8 Pine Rd'); assert.equal((await intent(page)).shape, 'T');
    assert.equal(await page.locator('#emptyOverlay').isVisible(), false);
    await waitSaved(page); assert.deepEqual(Object.values(await stored(page)).map(r => r.name), ['Brown – 8 Pine Rd']);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    assert.deepEqual(errors, []); await ctx.close();
  });
}

test('R1 final 2: the typed name survives panel redraws; blank names refused; Open Existing Plan opens without asking for a name', async () => {
  const { ctx, page, errors } = await h.newPage();
  await page.locator('#stepContent [data-shape="rectangle"]').click();
  assert.match(await page.locator('#newPlanError').innerText(), /Enter a plan name first/); assert.equal(await intent(page), null);
  await page.locator('#newPlanName').fill('   '); await page.locator('#newPlanName').press('Enter');
  assert.match(await page.locator('#newPlanError').innerText(), /Enter a plan name/);
  await page.locator('#newPlanName').fill('Keeps its name');
  assert.equal(await page.locator('#newPlanError').innerText(), '', 'error clears when a name is typed');
  // redraw the panel: switch steps away and back, toggle measurements
  await page.locator('#measureBtn').click(); await page.locator('#measureBtn').click();
  await page.evaluate(() => document.querySelector('#stepdots [data-step="0"]')?.click()); await page.waitForTimeout(150);
  assert.equal(await page.locator('#newPlanName').inputValue(), 'Keeps its name');
  await page.locator('#stepContent [data-shape="L"]').click(); await started(page);
  assert.equal((await intent(page)).project, 'Keeps its name'); await waitSaved(page);
  // New Plan (confirmed) then Open Existing Plan from Step 01
  await page.locator('#newPlanBtn').click(); await page.locator('#leaveAccept').click();
  assert.equal(await page.locator('#newPlanName').inputValue(), '', 'fresh name field');
  await page.locator('#stepContent #openExistingBtn').click();
  await page.locator('#projectsList .project-row', { hasText: 'Keeps its name' }).locator('[data-action="project-open"]').click(); await settle(page);
  assert.equal((await intent(page)).project, 'Keeps its name'); assert.equal((await intent(page)).shape, 'L');
  assert.equal(await page.locator('#unsavedDialog').isHidden(), true); assert.equal(await page.locator('#leaveDialog').isHidden(), true);
  assert.equal(await page.locator('#stepContent #newPlanName').count(), 0, 'no name field once a plan is open');
  assert.deepEqual(errors, []); await ctx.close();
});

// ---------- 2. Flush stairs ----------
test('R1 final 2: a 4′ stair fits a 4′ bump-out exactly (C6/R1 shrank it to 3′ 6″); same model as Full width', async () => {
  const d = { ...BUMP, staircases: [S({})] };
  const now = await h.newPage(), old = await h.newPage(); await old.page.goto(PREV); await old.page.waitForFunction(() => window.AOSDeckStudioTest);
  await openDesign(now.page, d); await openDesign(old.page, d);
  const Iold = await intent(old.page), I = await intent(now.page);
  assert.equal(Iold.staircases[0].width, 3.5, 'before: the 4′ stair was cut to 3′ 6″');
  assert.equal(I.staircases[0].width, 4); assert.equal(I.staircases[0].offset, 0);
  const m = model(I), mf = model({ ...BUMP, staircases: [S({ fullWidth: true })] });
  const strip = (x) => JSON.stringify(x.parts.map(({ id, label, ...p }) => p));
  assert.equal(strip(m), strip(mf), 'identical parts to the approved Full width stair (posts, stringers, rails)');
  assert.deepEqual(m.counts, mf.counts, 'identical quantities');
  await step(now.page, 2); await now.page.screenshot({ path: H.path.join(H.SHOTS, 'r1final2-bump-after.png') });
  await step(old.page, 2); await old.page.screenshot({ path: H.path.join(H.SHOTS, 'r1final2-bump-before.png') });
  await now.page.locator('#mode3d').click(); await now.page.waitForTimeout(400);
  const c = await now.page.evaluate(() => window.AOSDeckStudioTest.colors()); assert.deepEqual(c.view3d, c.plan, '3D matches');
  await now.page.screenshot({ path: H.path.join(H.SHOTS, 'r1final2-bump-3d-after.png') });
  assert.deepEqual([...now.errors, ...old.errors], []); await now.ctx.close(); await old.ctx.close();
});

test('R1 final 2: on the bump-out — tap creates a 3′ stair, resize 3′ → 4′ fits flush, Undo/Redo, save/reopen, framing view', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, BUMP); await step(page, 2);
  const p = await page.evaluate(() => { const e = window.AOSDeckStudioTest.edges()[4]; return window.AOSDeckStudioTest.toScreen(e.mid[0] + e.t[0] * .9, e.mid[1] + e.t[1] * .9); });
  await page.mouse.click(p[0], p[1]); await settle(page);
  let I = await intent(page); assert.equal(I.staircases.length, 1); assert.equal(I.staircases[0].edge, 4); assert.equal(I.staircases[0].width, 3, 'new stair 3′');
  await setStairWidth(page, '4');
  I = await intent(page); assert.equal(I.staircases[0].width, 4, '3′ → 4′ accepted on the 4′ edge'); assert.equal(I.staircases[0].offset, 0, 'kept on the edge');
  await undo(page); assert.equal((await intent(page)).staircases[0].width, 3); await redo(page); assert.equal((await intent(page)).staircases[0].width, 4);
  await setStairWidth(page, '4 1'); assert.equal((await intent(page)).staircases[0].width, 4, 'wider than the edge is refused');
  await step(page, 6); const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
  assert.equal(v.plan['stair-stringer'], count(model(I), 'stair-stringer'));
  const { file } = await saveFile(page); const r = await reopen(h, file);
  assert.deepEqual((await intent(r.page)).staircases.map(s => [s.width, s.offset]), [[4, 0]], 'reopens exactly (no shrinking)');
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('R1 final 2: a 4′ stair flush with each end of a 16′ edge — position fields, railing opening, posts and stringers', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, { ...RECT, staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] }); await step(page, 2);
  for (const side of ['left', 'right']) {
    await posSet(page, side, `0' 0"`);
    const I = await intent(page), st = I.staircases[0];
    assert.equal(Math.abs(st.offset), 6, `${side}: flush (offset ±6 on a 16′ edge)`);
    const m = model(I), e = m.geometry.edges[2], sd = m.parts.find(p => p.kind === 'stair-stringer').d;
    const strs = m.parts.filter(p => p.kind === 'stair-stringer').map(p => st.offset + p.profileOffset);
    const outer = st.offset < 0 ? Math.min(...strs) - sd / 2 : Math.max(...strs) + sd / 2;
    assert.ok(Math.abs(Math.abs(outer) - e.len / 2) < .05, `${side}: outer stringer face at the edge end (${outer.toFixed(3)} vs ±8)`);
    const P = m.parts.filter(p => /rail-post|^railing-post/.test(p.kind));
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) assert.ok(Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) >= .3, `${side}: no two posts in the same place`);
    const rails = m.parts.filter(p => p.kind === 'top-rail').map(p => { const u = (p.x - e.mid[0]) * e.t[0] + (p.z - e.mid[1]) * e.t[1], v = (p.x - e.mid[0]) * e.n[0] + (p.z - e.mid[1]) * e.n[1], L = Math.max(p.w, p.d); return { a: u - L / 2, b: u + L / 2, v }; }).filter(r => Math.abs(r.v) < .4);
    const sa = st.offset - 2, sb = st.offset + 2;
    // R1 rail inset: the deck rail ends on the stair railing line, RAIL_LINE (1½ in. + half a post) inside the stair side.
    assert.ok(rails.every(r => r.b <= sa + RAIL_LINE + .01 || r.a >= sb - RAIL_LINE - .01), `${side}: no deck rail across the stair`);
    assert.ok(rails.every(r => r.b - r.a > .25), `${side}: no railing slivers at the flush end`);
    // R1 rail inset: 12′ less RAIL_LINE at the outside corner, plus RAIL_LINE to the stair railing line = 12′.
    const covered = rails.reduce((t, r) => t + (r.b - r.a), 0); assert.ok(Math.abs(covered - 12) < .02, `${side}: the other 12′ of the edge is railed (${covered.toFixed(2)})`);
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1final2-flush-${side}.png`) });
  }
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 final 2: dragging a stair snaps flush to the edge end; stairs on one edge still cannot overlap (6 in. apart)', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, { ...RECT, staircases: [{ id: 'a', edge: 2, width: 4, offset: -6, rails: { left: true, right: true } }, { id: 'b', edge: 2, width: 4, offset: 4, rails: { left: true, right: true } }] }); await step(page, 2);
  let I = await intent(page); assert.deepEqual(I.staircases.map(s => s.offset), [-6, 4], 'both load as saved (one flush)');
  // drag stair b toward the right end: it snaps flush at +6
  const c = await page.evaluate(() => { const g = window.AOSDeckStudioTest.scene3d().stairs[1]; return [window.AOSDeckStudioTest.toScreen(g.base[0] + g.nn[0] * 1.2, g.base[1] + g.nn[1] * 1.2), window.AOSDeckStudioTest.toScreen(g.base[0] + g.nn[0] * 1.2 + g.tt[0] * 1.95, g.base[1] + g.nn[1] * 1.2 + g.tt[1] * 1.95)]; });
  await page.mouse.move(...c[0]); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(c[0][0] + (c[1][0] - c[0][0]) * k / 8, c[0][1] + (c[1][1] - c[0][1]) * k / 8); await page.mouse.up(); await settle(page);
  I = await intent(page); assert.equal(Math.abs(I.staircases[1].offset), 6, `drag snaps flush (${I.staircases[1].offset})`);
  // an overlapping position is still refused
  await page.locator('#stepContent [data-action="stair-next"], #stepContent [data-action="stair-prev"]').first().click().catch(() => {});
  const before = await intent(page);
  const q = structuredClone(before); q.staircases[1].offset = -3; // would overlap stair a (needs 4 + 0.5 ft spacing)
  const m = model(q); assert.equal(m.intent.staircases.length, 1, 'the engine still drops an overlapping stair (6 in. separation unchanged)');
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 final 2: older designs with stairs keep their stored width and position (0.08 ft-from-end stairs unchanged)', () => {
  const d = { ...RECT, staircases: [{ id: 's', edge: 2, width: 4, offset: -5.92, rails: { left: true, right: true } }, { id: 't', edge: 1, width: 3.5, offset: 0, rails: { left: true, right: true } }] };
  const I = JSON.parse(JSON.stringify(H.CORE.sanitize(structuredClone(d))));
  assert.deepEqual(I.staircases.map(s => [s.edge, s.width, s.offset]), [[2, 4, -5.92], [1, 3.5, 0]]);
});
