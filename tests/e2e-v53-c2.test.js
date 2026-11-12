// V5.3 C2 (owner authorization 8 Nov 2026): the nine-step workflow.
//   Shape & Size · House & Height · Framing & Ledger · Stairs & Landings · Decking Layout ·
//   Decking Selection · Railings · Patio & Walkway (new internal ID 8) · Review & Present.
// Patio & Walkway is the existing patio/walkway editor moved out of House & Height; nothing about the
// slabs themselves may change. Comparisons marked "d404af5" run the approved B3 build side by side.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { STATES, CENSUS_DESIGN } = require('./ui-census');
const { withoutRailInset } = require('./rail-inset');
// V5.3 C7 framing (owner, 11 Nov 2026): framing outputs of designs C7 reframes and the new framing count
// categories/alerts are excepted (tests/c7-framing.js), decided from this build's engine model of the design.
const { savedWithoutC7 } = require('./c7-framing');
// V5.3 C7 Gate C: the Gate C stair members, counts and alerts are excepted too (tests/c7-gate-c.js).
const { savedWithoutGateC } = require('./c7-gate-c');
const C7W = require('./engine').loadEngine(), c7decide = (design) => C7W.DeckCore.make(C7W.DeckCore.sanitize(design));
const railless = (k, v) => k === 'componentModel' ? withoutRailInset({ parts: v }).parts : k === 'counts' ? withoutRailInset({ counts: v }).counts : k === 'alerts' ? withoutRailInset({ alerts: v }).alerts : v;

const ROOT = path.join(__dirname, '..');
const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(ROOT, 'test-results', 'screenshots');
const BASE_HTML = path.join(os.tmpdir(), `aos-c2-d404af5-${process.pid}.html`);
const BASE_APP = pathToFileURL(BASE_HTML).href;
const FLOW = [0, 1, 6, 2, 3, 4, 5, 8, 7];
const TITLES = ['Shape & Size', 'House & Height', 'Framing & Ledger', 'Stairs & Landings', 'Decking Layout', 'Decking Selection', 'Railings', 'Patio & Walkway', 'Review & Present'];
const SHORT = ['Shape', 'House', 'Framing', 'Stairs', 'Layout', 'Decking', 'Railings', 'Patio', 'Review'];

let browser;
test.before(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(BASE_HTML, execFileSync('git', ['show', 'd404af5:index.html'], { cwd: ROOT }));
});
test.after(async () => { await browser?.close(); fs.rmSync(BASE_HTML, { force: true }); });

async function newPage(viewport = { width: 1280, height: 900 }, app = APP) {
  const touch = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: touch, isMobile: touch }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(app); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  return { ctx, page, errors };
}
async function openDesign(page, design) {
  const f = path.join(os.tmpdir(), `aos-c2-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
}
async function saveFile(page) {
  const [d] = await Promise.all([page.waitForEvent('download'), (async () => { await page.locator('#openBtn').click(); await page.locator('#projectsDialog [data-action="project-download"]').click(); })()]);
  const f = path.join(os.tmpdir(), `aos-c2-save-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); await d.saveAs(f);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const step = async (page, id) => { await page.locator(`#stepdots [data-step="${id}"]`).click(); await page.waitForTimeout(200); };
const header = (page) => page.evaluate(() => ({ number: document.getElementById('stepNumber').textContent, title: document.getElementById('stepTitle').textContent.trim(), counter: document.getElementById('progressText').textContent.trim(), next: document.getElementById('nextBtn').innerText.replace(/\s+/g, ' ').trim(), backDisabled: document.getElementById('backBtn').disabled, view: document.getElementById('planCanvas').classList.contains('visible') ? '2d' : '3d' }));
const prop = (page) => page.evaluate(() => window.AOSDeckStudioTest.property());
const slabs3d = (p) => p.parts3d.filter(x => x.kind === 'concrete-surface');

for (const [name, vp] of [['desktop 1440×900', { width: 1440, height: 900 }], ['tablet portrait 820×1180', { width: 820, height: 1180 }], ['phone 390×844', { width: 390, height: 844 }]]) {
  test(`C2 ${name}: nine steps forward with Next and back with Back; labels, counters, step bar order and direct jumps`, async () => {
    const { ctx, page, errors } = await newPage(vp);
    await openDesign(page, CENSUS_DESIGN); await step(page, 0);
    // Step bar: nine buttons in display order, each fully on screen and large enough to press.
    const bar = await page.locator('#stepdots [data-step]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { id: Number(e.dataset.step), label: e.getAttribute('aria-label'), text: e.innerText.trim(), l: r.left, r: r.right, w: r.width, h: r.height }; }));
    assert.deepEqual(bar.map(b => b.id), FLOW, 'step bar order (internal IDs unchanged, Patio & Walkway = 8 before Review = 7)');
    bar.forEach((b, k) => { assert.match(b.label, new RegExp(`^Step ${k + 1}: ${TITLES[k].replace(/[&]/g, '\\$&')}`)); assert.ok(b.l >= 0 && b.r <= vp.width, `${SHORT[k]} button inside the screen`); assert.ok(b.w >= 24 && b.h >= 24, `${SHORT[k]} button is at least 24×24 px (${b.w}×${b.h})`); });
    for (let k = 1; k < bar.length; k++) assert.ok(bar[k].l >= bar[k - 1].r - 0.5, 'step buttons do not overlap');
    if (vp.width > 760) assert.deepEqual(bar.map(b => b.text), SHORT, 'short labels'); else assert.ok(bar.every(b => b.text === '' || b.text === SHORT[bar.indexOf(b)]), 'labels hidden on a phone, as before');
    const progressRight = await page.evaluate(() => document.querySelector('.progressbar').scrollWidth - document.querySelector('.progressbar').clientWidth);
    assert.ok(progressRight <= 1, 'the progress bar does not overflow');
    // Forward.
    for (let k = 0; k < 9; k++) {
      const h = await header(page);
      assert.equal(h.title, TITLES[k]); assert.equal(h.counter, `Step ${k + 1} of 9`); assert.equal(h.number, `STEP ${String(k + 1).padStart(2, '0')}`);
      assert.equal(h.next, k < 8 ? `Next ${TITLES[k + 1]} →` : 'Finish ✓'); assert.equal(h.backDisabled, k === 0);
      assert.equal(await page.locator(`#stepdots [data-step="${FLOW[k]}"]`).getAttribute('aria-current'), 'step');
      if (vp.width === 390) await page.screenshot({ path: path.join(SHOTS, `c2-phone-step-${k + 1}.png`) });
      if (vp.width === 1440) await page.screenshot({ path: path.join(SHOTS, `c2-desktop-step-${k + 1}.png`) });
      if (k < 8) { await page.locator('#nextBtn').click(); await page.waitForTimeout(200); }
    }
    // Back.
    for (let k = 8; k > 0; k--) { await page.locator('#backBtn').click(); await page.waitForTimeout(150); const h = await header(page); assert.equal(h.title, TITLES[k - 1]); assert.equal(h.counter, `Step ${k} of 9`); }
    assert.equal((await header(page)).backDisabled, true);
    // Direct jumps from the step bar.
    for (const k of [7, 2, 8, 0, 6]) { await step(page, FLOW[k]); const h = await header(page); assert.equal(h.title, TITLES[k]); assert.equal(h.counter, `Step ${k + 1} of 9`); }
    assert.deepEqual(errors, []); await ctx.close();
  });
}

test('C2 Patio & Walkway controls exist only in step 8; House & Height keeps Walls & doors and Siding & color only', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN);
  const surfaceControls = () => page.locator('#stepContent [data-action^="surface-"], #stepContent [data-surface-field]').count();
  for (const [name, go] of STATES) {
    await go(page);
    const n = await surfaceControls();
    if (name === '8 Patio & Walkway') assert.ok(n >= 10, `${name}: the full patio/walkway editor (${n} controls)`);
    else assert.equal(n, 0, `${name}: no patio/walkway controls outside step 8`);
    if (name.startsWith('2 House & Height')) {
      assert.deepEqual(await page.locator('#stepContent [data-path="houseTab"]').evaluateAll(els => els.map(e => [e.dataset.value, e.innerText.trim()])), [['walls', 'Walls & doors'], ['look', 'Siding & color']], `${name}: two House tabs`);
      assert.equal(await page.locator('#stepContent').getByText(/patio & walkway/i).count(), 0, `${name}: no duplicate patio tab or text`);
    }
  }
  // In House & Height the slabs on the plan cannot be picked or dragged.
  const before = (await prop(page)).surfaces, sf = before[0], selBefore = (await prop(page)).selected;
  for (const tab of ['walls', 'look']) {
    await step(page, 1); await page.locator(`#stepContent [data-path="houseTab"][data-value="${tab}"]`).click(); await page.waitForTimeout(150);
    const [x, y] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [sf.x, sf.z]);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y + 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
    const p = await prop(page); assert.deepEqual(p.surfaces, before, `House (${tab}): slab not moved or changed`);
    assert.equal(p.selected, selBefore, `House (${tab}): slab selection unchanged by tapping it`);
  }
  // Step 8: the plan picks and drags the slab (select the other one first so the pick is visible).
  await step(page, 8); if ((await prop(page)).selected === sf.id) { await page.locator('#stepContent [data-action="surface-next"]').click(); await page.waitForTimeout(150); }
  assert.notEqual((await prop(page)).selected, sf.id);
  const [x, y] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [sf.x, sf.z]);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y + 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250);
  const moved = (await prop(page)).surfaces[0]; assert.equal((await prop(page)).selected, sf.id); assert.ok(Math.hypot(moved.x - sf.x, moved.z - sf.z) > 1, 'dragged in step 8');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C2 step 8 opens in 2D Plan, can switch to 3D; add, select, move, resize, rotate and delete; slabs identical to the d404af5 build in 2D and 3D; undo/redo', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, { ...CENSUS_DESIGN, surfaces: [] });
  await step(page, 7); assert.equal((await header(page)).view, '3d', 'Review opens in 3D, as before');
  await page.locator('#backBtn').click(); await page.waitForTimeout(200);
  let h = await header(page); assert.equal(h.title, 'Patio & Walkway'); assert.equal(h.view, '2d', 'step 8 opens in 2D Plan');
  // Add both, then edit the patio with every control.
  await page.locator('#stepContent [data-action="surface-add"][data-value="patio"]').click(); await page.waitForTimeout(250);
  await page.locator('#stepContent [data-action="surface-add"][data-value="walkway"]').click(); await page.waitForTimeout(250);
  await page.locator('#stepContent [data-action="surface-prev"]').click(); await page.waitForTimeout(150);
  const w = page.locator('#stepContent input[data-surface-field="width"]'); await w.fill('15'); await w.dispatchEvent('change'); await page.waitForTimeout(200);
  const l = page.locator('#stepContent input[data-surface-field="length"]'); await l.fill('11'); await l.dispatchEvent('change'); await page.waitForTimeout(200);
  let p = await prop(page); const patio = p.surfaces[0];
  assert.equal(p.surfaces.length, 2); assert.equal(patio.width, 15); assert.equal(patio.length, 11);
  // Resize with the round handle (the far corner) and move by dragging the body.
  const corner = await page.evaluate((s) => { const c = window.DeckCore.surfaceCorners(s)[2]; return window.AOSDeckStudioTest.toScreen(c[0], c[1]); }, patio); // the round handle
  await page.mouse.move(corner[0], corner[1]); await page.mouse.down(); await page.mouse.move(corner[0] + 30, corner[1] + 30, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250);
  const resized = (await prop(page)).surfaces[0]; assert.ok(resized.width !== patio.width || resized.length !== patio.length, 'handle resizes');
  const [bx, by] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [resized.x, resized.z]);
  await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx - 50, by + 20, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250);
  p = await prop(page); assert.ok(Math.hypot(p.surfaces[0].x - resized.x, p.surfaces[0].z - resized.z) > 1, 'body drag moves');
  await page.locator('#stepContent [data-action="surface-rotate"][data-value="15"]').click(); await page.waitForTimeout(200);
  p = await prop(page); const final = p.surfaces; assert.equal(final[0].angle, 15, 'turned 15°');
  // 3D from step 8: one slab per surface at the same place, size, turn and ground level.
  await page.locator('#mode3d').click(); await page.waitForTimeout(400);
  p = await prop(page); assert.equal(slabs3d(p).length, 2);
  for (const s of final) { const sl = slabs3d(p).find(x => x.surface === s.id); assert.ok(sl, '3D slab'); for (const [a, b] of [['x', 'x'], ['z', 'z'], ['w', 'width'], ['d', 'length']]) assert.ok(Math.abs(sl[a] - s[b]) < 1e-9, `3D ${a} = 2D ${b}`); assert.ok(Math.abs(sl.yaw - (-s.angle * Math.PI / 180)) < 1e-9 || Math.abs(sl.yaw - s.angle * Math.PI / 180) < 1e-9, '3D turn = 2D turn'); }
  await page.screenshot({ path: path.join(SHOTS, 'c2-desktop-step-8-3d.png') });
  // The same surfaces opened in the approved d404af5 build give exactly the same slab geometry and 3D parts (ground elevation included).
  const design = (await saveFile(page)).design;
  const base = await newPage({ width: 1280, height: 900 }, BASE_APP); await openDesign(base.page, design);
  await base.page.locator('#mode3d').click(); await base.page.waitForTimeout(400);
  const bp = await prop(base.page);
  assert.deepEqual(p.geometry.surfaces, bp.geometry.surfaces, 'slab geometry identical to d404af5');
  assert.deepEqual(slabs3d(p), slabs3d(bp), '3D slab parts identical to d404af5 (position, size, turn, ground level, material)');
  assert.deepEqual(p.parts3d.filter(x => x.kind === 'earth'), bp.parts3d.filter(x => x.kind === 'earth'), 'ground identical');
  await base.ctx.close();
  // Delete, undo, redo.
  await page.locator('#mode2d').click(); await page.waitForTimeout(150);
  await page.locator('#stepContent [data-action="surface-remove"]').click(); await page.waitForTimeout(200);
  assert.equal((await prop(page)).surfaces.length, 1, 'deleted');
  await page.locator('#undoBtn').click(); await page.waitForTimeout(200); assert.deepEqual((await prop(page)).surfaces, final, 'undo restores exactly');
  await page.locator('#redoBtn').click(); await page.waitForTimeout(200); assert.equal((await prop(page)).surfaces.length, 1, 'redo deletes again');
  await page.locator('#undoBtn').click(); await page.waitForTimeout(200);
  // Leaving and coming back keeps the work; returning from 3D opens 2D again.
  await step(page, 4); await step(page, 8); h = await header(page); assert.equal(h.view, '2d'); assert.deepEqual((await prop(page)).surfaces, final);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C2 Undo/Redo works across step changes (patio in step 8, railing in step 7, height in step 2)', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, { ...CENSUS_DESIGN, surfaces: [] });
  const snap = async () => { const d = await page.evaluate(() => ({ s: window.AOSDeckStudioTest.property().surfaces })); const f = (await saveFile(page)).design; return { surfaces: d.s, railColor: f.railColor, height: f.height }; };
  const s0 = await snap();
  await step(page, 8); await page.locator('#stepContent [data-action="surface-add"][data-value="patio"]').click(); await page.waitForTimeout(250); const s1 = await snap();
  await step(page, 5); await page.locator('#stepContent [data-path="railTab"][data-value="finish"]').click(); await page.locator('#stepContent [data-path="railColor"][data-value="Bronze"]').click(); await page.waitForTimeout(250); const s2 = await snap();
  await step(page, 1); const hgt = page.locator('#stepContent input[data-field="height"]'); await hgt.fill('7'); await hgt.dispatchEvent('change'); await page.waitForTimeout(300); const s3 = await snap();
  assert.equal(s1.surfaces.length, 1); assert.equal(s2.railColor, 'Bronze'); assert.equal(s3.height, 7);
  for (const [want, label] of [[s2, 'height'], [s1, 'railing color'], [s0, 'patio']]) { await page.locator('#undoBtn').click(); await page.waitForTimeout(250); assert.deepEqual(await snap(), want, `undo ${label} (from step ${(await header(page)).counter})`); }
  await step(page, 8); assert.equal(await page.locator('#stepContent [data-action="surface-remove"]').count(), 0, 'step 8 shows no patio after undo');
  for (const [want, label] of [[s1, 'patio'], [s2, 'railing color'], [s3, 'height']]) { await page.locator('#redoBtn').click(); await page.waitForTimeout(250); assert.deepEqual(await snap(), want, `redo ${label}`); }
  assert.equal(await page.locator('#stepContent [data-action="surface-remove"]').count(), 1, 'step 8 shows the patio again after redo');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C2 existing saved projects reopen unchanged: the same file saved again gives the same design, parts, counts and alerts as the d404af5 build', async () => {
  const OLD_V4 = { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], railEdges: [1, 2, 3], stairs: { enabled: true, edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }, decking: 'Brown Oak', border: 'Stone Ash', project: 'Older V4 project' };
  const B2 = { shape: 'L', width: 24, depth: 18, height: 3, houseEdges: [0], borderCount: 2, dividerMode: 'double', deckLine: 'diagonal', railEdges: [1, 2], project: 'B2 project', schemaVersion: 6 };
  for (const [label, design] of [['census (every feature, patio + walkway)', CENSUS_DESIGN], ['older V4 project', OLD_V4], ['B2 project', B2]]) {
    const out = [];
    for (const app of [APP, BASE_APP]) { const { ctx, page, errors } = await newPage(undefined, app); await openDesign(page, design); out.push(await saveFile(page)); assert.deepEqual(errors, []); await ctx.close(); }
    const [c2, base] = out;
    // V5.3 R1 rail inset (owner, 11 Nov 2026): railing posts 1½ in. inside the finished edges. The saved
    // railing parts, rail counts and the two railing review alerts are the only allowed differences from d404af5
    // (the railing is pinned and checked in tests/rail-inset-r1.test.js); everything else is identical.
    for (const k of ['schemaVersion', 'design', 'structuralStatus']) assert.deepEqual(c2[k], base[k], `${label}: ${k} identical to d404af5`);
    const dc = c7decide(c2.design);
    for (const k of ['componentModel', 'counts', 'alerts']) assert.deepEqual(savedWithoutGateC(k, savedWithoutC7(k, railless(k, c2[k]), dc)), savedWithoutGateC(k, savedWithoutC7(k, railless(k, base[k]), dc)), `${label}: ${k} identical to d404af5 (railing and C7 framing excepted)`);
    assert.ok(c2.componentModel.some(p => p.group === 'rail') === base.componentModel.some(p => p.group === 'rail'), `${label}: railing present in both or neither`);
    assert.equal(c2.schemaVersion, 6);
    // And the C2 save opens again unchanged.
    const { ctx, page } = await newPage(); await openDesign(page, c2.design); const again = await saveFile(page);
    for (const k of ['design', 'componentModel', 'counts', 'alerts']) assert.deepEqual(again[k], c2[k], `${label}: reopen of the C2 save: ${k}`);
    await ctx.close();
  }
});
