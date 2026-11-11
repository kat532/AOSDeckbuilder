'use strict';
// V5.3 C6 owner R1 — final UI corrections (owner, 11 Nov 2026):
//  3. Measurements control only in 2D; the ON/OFF choice is kept across 2D/3D.
//  4. New staircases start 3′ 0″ wide; saved/imported stairs keep their width; quantities follow the engine.
//  5. New Plan always confirms while a design is open; autosave cannot save a discarded change.
// (1 and 2 — no Start Designing, Measurements ON/OFF — are covered by the R1 New Plan, hotfix-1 and dims tests.)
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, ALL, VIEWPORTS, openDesign, step, intent, settle, model, saveFile, reopen, undo, redo } = H;
const h = H.harness(test);

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('aosDeckStudio.projects.v1') || '{}'));
const waitSaved = (page) => page.waitForFunction(() => /Saved/.test(document.getElementById('saveStatus').textContent), null, { timeout: 8000 });
async function startPlan(page, name, shape = 'rectangle', press) {
  await page.locator('#newPlanName').fill(name); await (press || ((l) => l.click()))(page.locator(`#stepContent [data-shape="${shape}"]`));
  await page.waitForFunction(() => /\d+ SQ FT/.test(document.getElementById('squareFeet').textContent)); await settle(page);
}
const setWidth = async (page, v) => { const w = page.locator('#stepContent input[data-field="width"]').first(); await w.fill(v); await w.dispatchEvent('change'); await page.waitForTimeout(80); };

// ---------- 3. Measurements control visibility ----------
for (const vp of ['desktop', 'phone']) {
  test(`R1 final (${vp}): Measurements shows in 2D only, takes no toolbar space in 3D, and keeps the ON/OFF choice`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await openDesign(page, ALL['b3-showcase']);
    const b = page.locator('#measureBtn'), label = async () => (await b.innerText()).replace(/\s+/g, ' ').trim();
    assert.equal(await b.isVisible(), true);
    await press(b); assert.equal(await label(), 'MEASUREMENTS OFF');
    const bar = page.locator('.viewbuttons'), w2 = (await bar.boundingBox()).width, mw = (await b.boundingBox()).width;
    await press(page.locator('#mode3d')); await page.waitForTimeout(300);
    assert.equal(await b.isVisible(), false, 'hidden in 3D'); assert.equal(await b.boundingBox(), null, 'no space kept');
    const w3 = (await bar.boundingBox()).width;
    assert.ok(w2 - w3 >= mw - 1, `toolbar closes up: the button group is ${(w2 - w3).toFixed(0)} px narrower (button was ${mw.toFixed(0)} px)`);
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1final-3d-toolbar-${vp}.png`) });
    await press(page.locator('#mode2d')); await page.waitForTimeout(200);
    assert.equal(await b.isVisible(), true); assert.equal(await label(), 'MEASUREMENTS OFF', 'choice kept');
    assert.equal((await page.evaluate(() => window.AOSDeckStudioTest.planLabels())).labels.length, 0, 'still OFF');
    await press(b); assert.ok((await page.evaluate(() => window.AOSDeckStudioTest.planLabels())).labels.length > 0);
    assert.deepEqual(errors, []); await ctx.close();
  });
}

// ---------- 4. New staircases start 3′ 0″ ----------
test('R1 final: Add staircase starts 3′ 0″; a second one too; width stays adjustable; Undo/Redo; save/reopen; 2D/3D', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Stair default'); await step(page, 2);
  await page.locator('#stepContent [data-action="stair-add"]').click(); await settle(page);
  let I = await intent(page); assert.equal(I.staircases.length, 1); assert.equal(I.staircases[0].width, 3);
  assert.match(await page.locator('#planCanvas').getAttribute('aria-label'), /3′ 0″ wide/);
  await page.locator('#stepContent [data-action="stair-add"]').click(); await settle(page);
  I = await intent(page); assert.equal(I.staircases.length, 2); assert.equal(I.staircases[1].width, 3, 'second staircase also 3′');
  const w = page.locator('#stepContent input').first(); await w.fill('5'); await w.dispatchEvent('change'); await settle(page);
  I = await intent(page); assert.equal(I.staircases[1].width, 5, 'adjustable'); assert.equal(I.staircases[0].width, 3, 'the other stair untouched');
  await undo(page); assert.equal((await intent(page)).staircases[1].width, 3); await redo(page); assert.equal((await intent(page)).staircases[1].width, 5);
  const m = model(I), g = await page.evaluate(() => window.AOSDeckStudioTest.scene3d().stairs.map(s => s.width));
  assert.deepEqual(g, [3, 5], 'stair geometry follows'); assert.ok(m.parts.filter(p => p.kind === 'stair-tread').length > 0);
  await page.locator('#mode3d').click(); await page.waitForTimeout(300);
  const c = await page.evaluate(() => window.AOSDeckStudioTest.colors()); assert.deepEqual(c.view3d, c.plan, '3D shows the same stair parts');
  await page.locator('#mode2d').click();
  const { file } = await saveFile(page); const r = await reopen(h, file);
  assert.deepEqual((await intent(r.page)).staircases.map(s => s.width), [3, 5]);
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('R1 final: tapping an edge on Stairs with no staircase creates a 3′ 0″ stair; phone touch', async () => {
  const { ctx, page, errors } = await h.newPage(VIEWPORTS.phone);
  await startPlan(page, 'Tap stair', 'rectangle', (l) => l.tap()); await step(page, 2);
  const p = await page.evaluate(() => { const e = window.AOSDeckStudioTest.edges()[2]; return window.AOSDeckStudioTest.toScreen(e.mid[0], e.mid[1]); });
  await page.touchscreen.tap(p[0], p[1]); await settle(page);
  const I = await intent(page); assert.equal(I.staircases.length, 1); assert.equal(I.staircases[0].width, 3);
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 final: saved and imported staircases keep their widths (4′, 6′, and a missing width still opens as 4′)', async () => {
  const { ctx, page, errors } = await h.newPage();
  const d = { shape: 'rectangle', width: 24, depth: 14, height: 4, houseEdges: [0], staircases: [{ id: 'a', edge: 2, width: 4, offset: -6, rails: { left: true, right: true } }, { id: 'b', edge: 2, width: 6, offset: 5, rails: { left: true, right: true } }, { id: 'c', edge: 1, offset: 0, rails: { left: true, right: true } }] };
  await openDesign(page, d);
  assert.deepEqual((await intent(page)).staircases.map(s => s.width), [4, 6, 4], 'unchanged on load; the engine fallback for a missing width is still 4′');
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 final: a 3′ stair recalculates stringers, treads and quantities through the engine (only the stair changes)', async () => {
  const base = { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], staircases: [{ id: 's', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }] };
  const m4 = model(base), m3 = model({ ...base, staircases: [{ ...base.staircases[0], width: 3 }] });
  const n = (m, k) => m.parts.filter(p => p.kind === k).length;
  assert.ok(n(m3, 'stair-stringer') > 0 && n(m3, 'stair-stringer') <= n(m4, 'stair-stringer'), `stringers ${n(m4, 'stair-stringer')} → ${n(m3, 'stair-stringer')}`);
  const tw = (m) => Math.max(...m.parts.filter(p => p.kind === 'stair-tread').map(p => Math.max(p.w, p.d)));
  assert.ok(Math.abs(tw(m3) - 3) < .25 && Math.abs(tw(m4) - 4) < .25, `tread length follows width (${tw(m4).toFixed(2)} → ${tw(m3).toFixed(2)})`);
  for (const k of ['joist', 'ledger', 'post-6x6', 'field-board']) assert.equal(n(m3, k), n(m4, k), `${k} unchanged`);
  assert.notDeepEqual(m3.counts, m4.counts, 'quantities recalculated');
  // Through the app: add a stair, check the app model equals the engine's for the same design
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Qty check'); await step(page, 2);
  await page.locator('#stepContent [data-action="stair-add"]').click(); await settle(page);
  const I = await intent(page), appCounts = await page.evaluate(() => window.AOSDeckStudioTest.scene3d().parts.filter(p => /^stair-/.test(p.kind)).length);
  assert.equal(appCounts, model(I).parts.filter(p => /^stair-/.test(p.kind)).length);
  await step(page, 6); const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView());
  assert.equal(v.plan['stair-stringer'], model(I).parts.filter(p => p.kind === 'stair-stringer').length, '2D framing shows the 3′ stair stringers');
  assert.deepEqual(errors, []); await ctx.close();
});

// ---------- 5. New Plan protection ----------
test('R1 final: saved design — New Plan asks "Start a New Plan?"; Cancel keeps everything; Start New Plan leaves the saved plan intact', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Johnson deck'); await setWidth(page, '20'); await waitSaved(page);
  await step(page, 2); await page.locator('#stepContent [data-action="stair-add"]').click(); await settle(page); await waitSaved(page);
  const I = await intent(page), before = await stored(page), id = Object.keys(before)[0];
  for (const via of ['header', 'projects']) {
    if (via === 'header') await page.locator('#newPlanBtn').click(); else { await page.locator('#openBtn').click(); await page.locator('[data-action="project-new"]').click(); }
    assert.equal(await page.locator('#leaveDialog').isVisible(), true, `${via}: asks`);
    assert.equal(await page.locator('#leaveTitle').innerText(), 'Start a New Plan?');
    assert.equal(await page.locator('#leaveMessage').innerText(), 'You are currently working on Johnson deck. Starting a new plan will close this design. Your saved plan will remain available in Projects.');
    assert.equal(await page.locator('#leaveCancel').innerText(), 'Cancel — Keep Working'); assert.equal(await page.locator('#leaveAccept').innerText(), 'Start New Plan');
    assert.equal(await page.locator('#unsavedDialog').isHidden(), true);
    await page.locator('#leaveCancel').click();
    assert.equal(await page.locator('#leaveDialog').isHidden(), true);
    assert.deepEqual(await intent(page), I, `${via}: Cancel keeps the design`);
    assert.match(await page.locator('#stepdots [data-step="2"]').getAttribute('class') || '', /active|current/, `${via}: still on Stairs`);
    if (via === 'projects') await page.locator('[data-action="projects-close"]').click();
  }
  // Escape also cancels
  await page.locator('#newPlanBtn').click(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#leaveDialog').isHidden(), true); assert.deepEqual(await intent(page), I);
  await page.locator('#newPlanBtn').click(); await page.locator('#leaveAccept').click();
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
  await page.waitForTimeout(1300);
  assert.deepEqual(await stored(page), before, 'saved plan untouched');
  // Start screen: no question
  await page.locator('#newPlanBtn').click(); assert.equal(await page.locator('#leaveDialog').isHidden(), true); assert.equal(await page.locator('#unsavedDialog').isHidden(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'newPlanName');
  // and the plan reopens as it was
  await page.locator('#openExistingBtn').click(); await page.locator('#projectsList .project-row', { hasText: 'Johnson deck' }).locator('[data-action="project-open"]').click(); await settle(page);
  assert.deepEqual(await intent(page), I); assert.equal(Object.keys(await stored(page))[0], id);
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 final: unsaved change — autosave waits while the question is open; Discard keeps the last saved version; Save writes first', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Race deck'); await waitSaved(page);
  const id = Object.keys(await stored(page))[0], w0 = (await stored(page))[id].design.width;
  // Discard: the 1 s autosave timer is pending when New Plan is pressed; wait well past it before choosing.
  await setWidth(page, '23');
  await page.locator('#newPlanBtn').click();
  assert.equal(await page.locator('#unsavedDialog').isVisible(), true);
  await page.waitForTimeout(2200);
  assert.equal((await stored(page))[id].design.width, w0, 'autosave did not run while the question was open');
  await page.locator('#unsavedDiscard').click(); await page.locator('#emptyOverlay').waitFor();
  await page.waitForTimeout(1500);
  assert.equal((await stored(page))[id].design.width, w0, 'discarded change never saved');
  // Cancel resumes autosave
  await page.locator('#openExistingBtn').click(); await page.locator('#projectsList .project-row', { hasText: 'Race deck' }).locator('[data-action="project-open"]').click(); await settle(page);
  await setWidth(page, '25'); await page.locator('#newPlanBtn').click(); await page.waitForTimeout(1500);
  assert.equal((await stored(page))[id].design.width, w0, 'still paused while asking');
  await page.locator('#unsavedCancel').click(); assert.equal((await intent(page)).width, 25);
  await waitSaved(page); assert.equal((await stored(page))[id].design.width, 25, 'Cancel: autosave resumes and saves the kept change');
  // Save writes first, then leaves
  await setWidth(page, '27'); await page.locator('#newPlanBtn').click(); await page.locator('#unsavedSave').click();
  await page.locator('#emptyOverlay').waitFor(); assert.equal((await stored(page))[id].design.width, 27);
  assert.equal(Object.keys(await stored(page)).length, 1, 'no extra or lost projects');
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 final: a never-saved plan discarded right away leaves no project behind', async () => {
  const { ctx, page, errors } = await h.newPage();
  await startPlan(page, 'Throwaway');
  await page.locator('#newPlanBtn').click(); // within the first second: not saved yet
  assert.equal(await page.locator('#unsavedDialog').isVisible(), true);
  await page.waitForTimeout(1500); await page.locator('#unsavedDiscard').click(); await page.locator('#emptyOverlay').waitFor(); await page.waitForTimeout(1300);
  assert.deepEqual(await stored(page), {}, 'nothing saved');
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 final: Free Draw in progress asks before discarding the drawing', async () => {
  const { ctx, page, errors } = await h.newPage();
  await page.locator('#newPlanName').fill('Sketch'); await page.locator('#stepContent [data-shape="free"]').click();
  const box = await page.locator('#planCanvas').boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(150);
  await page.locator('#newPlanBtn').click();
  assert.equal(await page.locator('#leaveDialog').isVisible(), true); assert.match(await page.locator('#leaveMessage').innerText(), /You are drawing “Sketch”/);
  await page.locator('#leaveCancel').click(); assert.equal(await page.evaluate(() => window.AOSDeckStudioTest.intent()), null); assert.equal(await page.locator('#emptyOverlay').isVisible(), false, 'still drawing');
  await page.locator('#newPlanBtn').click(); await page.locator('#leaveAccept').click();
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true); assert.equal(await page.locator('#newPlanName').inputValue(), '');
  assert.deepEqual(errors, []); await ctx.close();
});

for (const vp of ['tablet', 'phone']) {
  test(`R1 final (${vp}): New Plan confirmation works by touch and fits the screen`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    await startPlan(page, 'Touch confirm', 'L', press); await waitSaved(page);
    const I = await intent(page);
    await press(page.locator('#newPlanBtn'));
    for (const id of ['#leaveCancel', '#leaveAccept']) { const b = await page.locator(id).boundingBox(); assert.ok(b && b.x >= 0 && b.x + b.width <= VIEWPORTS[vp].width && b.height >= 40, `${id} on screen and tappable`); }
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1final-newplan-confirm-${vp}.png`) });
    await press(page.locator('#leaveCancel')); assert.deepEqual(await intent(page), I);
    await press(page.locator('#newPlanBtn')); await press(page.locator('#leaveAccept'));
    assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
    assert.deepEqual(errors, []); await ctx.close();
  });
}
