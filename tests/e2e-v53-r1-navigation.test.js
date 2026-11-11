'use strict';
// V5.3 C6 owner R1 — Priority 3: 2D navigation. Dragging empty plan space moves the view in every step
// (mouse and one finger); "Move view" moves the view from anywhere and never edits; Edit keeps every
// existing drag (stairs, outline, dividers, surfaces); pinch, wheel zoom and Fit still work.
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, ALL, VIEWPORTS, openDesign, step, intent, settle } = H;
const h = H.harness(test);

const origin = (page) => page.evaluate(() => window.AOSDeckStudioTest.toScreen(0, 0));
const DESIGN = ALL['b3-showcase'];
// A spot on the plan clear of the deck, stairs, surfaces and labels: the far left middle of the canvas.
async function emptySpot(page) { const b = await page.locator('#planCanvas').boundingBox(); return [b.x + 30, b.y + b.height * 0.45]; }
async function mouseDrag(page, [x, y], dx, dy) { await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 6; k++) await page.mouse.move(x + dx * k / 6, y + dy * k / 6); await page.mouse.up(); await page.waitForTimeout(150); }
async function touchDrag(cdp, [x, y], dx, dy, page) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * k / 6, y: y + dy * k / 6 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(150);
}
const stairCenter = (page) => page.evaluate(() => { const g = window.AOSDeckStudioTest.scene3d().stairs[0]; return window.AOSDeckStudioTest.toScreen(g.base[0] + g.nn[0] * g.run * .3, g.base[1] + g.nn[1] * g.run * .3); });

test('R1 navigation: mouse drag on empty plan space moves the view in every step and changes nothing', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, DESIGN);
  const I = await intent(page);
  for (const s of [0, 1, 6, 2, 3, 4, 5, 8, 7]) {
    await step(page, s);
    if (await page.locator('#mode2d').isVisible()) await page.locator('#mode2d').click();
    const o0 = await origin(page);
    await mouseDrag(page, await emptySpot(page), 60, 25);
    const o1 = await origin(page);
    assert.ok(Math.abs(o1[0] - o0[0] - 60) < 2 && Math.abs(o1[1] - o0[1] - 25) < 2, `step ${s}: the view moved with the drag (${o0} → ${o1})`);
    assert.deepEqual(await intent(page), I, `step ${s}: nothing in the design changed`);
  }
  assert.equal(await page.locator('#undoBtn').isDisabled(), true, 'panning adds nothing to Undo');
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 navigation: Move view pans even from a stair or edge and never edits; Edit restores stair dragging', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, DESIGN); await step(page, 2);
  const I = await intent(page);
  assert.equal(await page.locator('#planTools').isVisible(), true);
  assert.equal(await page.locator('#planEditBtn').getAttribute('aria-pressed'), 'true');
  await page.locator('#planMoveBtn').click();
  assert.equal(await page.locator('#planMoveBtn').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#viewTip').innerText(), /MOVE VIEW/i);
  const o0 = await origin(page);
  await mouseDrag(page, await stairCenter(page), 50, 40);
  const o1 = await origin(page);
  assert.ok(Math.abs(o1[0] - o0[0] - 50) < 2, 'the view moved'); assert.deepEqual(await intent(page), I, 'the stair did not move');
  // A tap does not toggle anything either.
  await step(page, 1);
  const e = await page.evaluate(() => { const x = window.AOSDeckStudioTest.edges()[2]; return window.AOSDeckStudioTest.toScreen(x.mid[0], x.mid[1]); });
  await page.mouse.click(e[0], e[1]); await page.waitForTimeout(200);
  assert.deepEqual(await intent(page), I, 'tap on an edge in Move view changes nothing');
  assert.match(await page.locator('#toast').innerText(), /Move view is on/);
  // Back to Edit: dragging the stair moves it again (existing behavior preserved).
  await page.locator('#planEditBtn').click(); await step(page, 2);
  const c = await stairCenter(page);
  await mouseDrag(page, c, 40, 0); await settle(page);
  assert.notDeepEqual((await intent(page)).staircases[0].offset, I.staircases[0].offset, 'Edit: stair drag still moves the stair');
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 navigation: phone — one finger on empty space pans (Stairs, Railings), pinch zooms, Fit recenters; Move view by touch', async () => {
  const { ctx, page, errors } = await h.newPage(VIEWPORTS.phone);
  const cdp = await ctx.newCDPSession(page);
  await openDesign(page, DESIGN);
  const I = await intent(page);
  for (const s of [2, 5]) {
    await step(page, s);
    const o0 = await origin(page); await touchDrag(cdp, await emptySpot(page), 40, 30, page); const o1 = await origin(page);
    assert.ok(Math.abs(o1[0] - o0[0] - 40) < 3 && Math.abs(o1[1] - o0[1] - 30) < 3, `step ${s}: one-finger pan (${o0} → ${o1})`);
    assert.deepEqual(await intent(page), I);
  }
  // Pinch
  const b = await page.locator('#planCanvas').boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const s0 = await page.evaluate(() => { const a = window.AOSDeckStudioTest.toScreen(0, 0), c = window.AOSDeckStudioTest.toScreen(10, 0); return c[0] - a[0]; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
  for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - k * 12, y: cy, id: 1 }, { x: cx + 30 + k * 12, y: cy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(150);
  const s1 = await page.evaluate(() => { const a = window.AOSDeckStudioTest.toScreen(0, 0), c = window.AOSDeckStudioTest.toScreen(10, 0); return c[0] - a[0]; });
  assert.ok(s1 > s0 * 1.3, `pinch zooms in (${s0.toFixed(1)} → ${s1.toFixed(1)} px per 10 ft)`);
  assert.deepEqual(await intent(page), I);
  // Move view by touch, starting on the stair
  await step(page, 2); await page.locator('#planMoveBtn').tap();
  const o0 = await origin(page); await touchDrag(cdp, await stairCenter(page), 30, 20, page);
  assert.ok(Math.abs((await origin(page))[0] - o0[0] - 30) < 3); assert.deepEqual(await intent(page), I, 'stair untouched');
  await page.locator('#planEditBtn').tap();
  // Fit recenters the deck
  await page.locator('#fitBtn').tap(); await page.waitForTimeout(250);
  const mid = await page.evaluate(() => { const e = window.AOSDeckStudioTest.edges(), xs = e.map(x => x.a[0]), zs = e.map(x => x.a[1]); return window.AOSDeckStudioTest.toScreen((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2); });
  const bb = await page.locator('#planCanvas').boundingBox();
  assert.ok(mid[0] > bb.x + bb.width * .25 && mid[0] < bb.x + bb.width * .75 && mid[1] > bb.y && mid[1] < bb.y + bb.height, 'deck centered after Fit');
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1-navigation-phone.png') });
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 navigation: the 2D tools show only in 2D with a design; Edit/Move state is clear', async () => {
  const { ctx, page, errors } = await h.newPage();
  assert.equal(await page.locator('#planTools').isVisible(), false, 'not on the start screen');
  await openDesign(page, DESIGN);
  assert.equal(await page.locator('#planTools').isVisible(), true);
  await page.locator('#mode3d').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#planTools').isVisible(), false, 'hidden in 3D (3D has Rotate/Move)');
  await page.locator('#mode2d').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#planTools').isVisible(), true);
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1-navigation-desktop.png') });
  assert.deepEqual(errors, []); await ctx.close();
});
