// V5.3 C1 (owner approval 8 Nov 2026): the settings panel scrolls on every step; Back/Next stay
// fixed; every control recorded in the C0 census (tests/baseline/controls-d404af5.json) is still
// present and can be reached and pressed with a mouse wheel, a touchpad or a finger, at six sizes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { census, STATES, CENSUS_DESIGN } = require('./ui-census');

const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(__dirname, '..', 'test-results', 'screenshots');
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline', 'controls-d404af5.json'), 'utf8'));
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { await browser?.close(); });

const VIEWPORTS = [
  ['desktop 1440×900 (mouse wheel)', { width: 1440, height: 900 }, 'wheel'],
  ['laptop 1280×720 (mouse wheel)', { width: 1280, height: 720 }, 'wheel'],
  ['tablet landscape 1180×820 (touch)', { width: 1180, height: 820 }, 'touch'],
  ['tablet portrait 820×1180 (touch)', { width: 820, height: 1180 }, 'touch'],
  ['phone 390×844 (touch)', { width: 390, height: 844 }, 'touch'],
  ['short phone 375×667 (touch)', { width: 375, height: 667 }, 'touch'],
];
async function newPage(vp, touch) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: vp.width < 800 }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors, cdp: touch ? await ctx.newCDPSession(page) : null };
}
async function openCensus(page) {
  const f = path.join(os.tmpdir(), `aos-c1-${process.pid}-${Date.now()}.json`); fs.writeFileSync(f, JSON.stringify({ design: CENSUS_DESIGN }));
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
}
const stateFn = (name) => STATES.find(([n]) => n === name)[1];

for (const [name, vp, mode] of VIEWPORTS) test(`C1 ${name}: every control from the C0 census is present and reachable by ${mode === 'touch' ? 'finger scrolling' : 'mouse wheel'}; Back/Next never move`, async () => {
  const { ctx, page, errors, cdp } = await newPage(vp, mode === 'touch');
  const c = await census(page, { APP, fs, os, path, mode, cdp });
  assert.deepEqual(c.chrome, BASE.chrome, 'header, step bar, view tools and Back/Next unchanged');
  assert.deepEqual(Object.keys(c.states), Object.keys(BASE.states), 'same steps, tabs and editing states');
  for (const [s, v] of Object.entries(c.states)) {
    const keys = (list) => list.filter(x => !x.hidden).map(x => x.key).sort();
    assert.deepEqual(keys(v.controls), keys(BASE.states[s]), `${s}: same controls as the baseline (none removed or added)`);
    assert.deepEqual(v.unreachable, [], `${s}: every control can be scrolled to and pressed`);
    assert.equal(v.footerMoved, false, `${s}: Back/Next stay fixed while the panel scrolls`);
    assert.equal(v.scroll.overflowY, 'auto', `${s}: the settings area scrolls`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('C1 touchpad-sized scrolling (small wheel steps) and keyboard focus reach the bottom of Border & dividers on a laptop', async () => {
  const { ctx, page, errors } = await newPage({ width: 1280, height: 720 }, false);
  await openCensus(page); await stateFn('5 Decking Layout · Border & dividers')(page);
  const b = await page.locator('#stepContent').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + 60);
  for (let k = 0; k < 60; k++) await page.mouse.wheel(0, 8); // touchpad: many small pixel deltas
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => { const s = document.getElementById('stepContent'); return { top: s.scrollTop, max: s.scrollHeight - s.clientHeight }; });
  assert.ok(st.max > 0 && st.top >= st.max - 1, `small steps scrolled to the bottom (${st.top}/${st.max})`);
  await page.evaluate(() => { document.getElementById('stepContent').scrollTop = 0; });
  await page.locator('#stepContent [data-action="divider-reset"]').focus(); await page.waitForTimeout(100);
  const vis = await page.evaluate(() => { const el = document.querySelector('#stepContent [data-action="divider-reset"]'), r = el.getBoundingClientRect(), p = document.getElementById('stepContent').getBoundingClientRect(), f = document.querySelector('.inspector-footer').getBoundingClientRect(); return r.top >= p.top - 1 && r.bottom <= p.bottom + 1 && r.bottom <= f.top + 1; });
  assert.ok(vis, 'keyboard focus brings the control fully into view, above Back/Next');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C1 nothing is hidden behind Back/Next: scrolled to the bottom, the last control of every state is fully above the bar (phone and short phone)', async () => {
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const { ctx, page, errors } = await newPage(vp, true);
    await openCensus(page);
    for (const [name, go] of STATES) {
      await go(page);
      const r = await page.evaluate(() => { const s = document.getElementById('stepContent'); s.scrollTop = s.scrollHeight;
        const els = [...s.querySelectorAll('button, input, select')].filter(e => e.getBoundingClientRect().height), last = els.reduce((a, e) => (e.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? e : a), els[0]);
        const lr = last.getBoundingClientRect(), p = s.getBoundingClientRect(), f = document.querySelector('.inspector-footer').getBoundingClientRect(); return { last: lr.bottom, panel: p.bottom, footer: f.top }; });
      assert.ok(r.last <= r.panel + 1 && r.panel <= r.footer + 1, `${vp.width}×${vp.height} ${name}: last control bottom ${r.last.toFixed(0)} ≤ panel ${r.panel.toFixed(0)} ≤ Back/Next ${r.footer.toFixed(0)}`);
    }
    assert.deepEqual(errors, []); await ctx.close();
  }
});

test('C1 the previously unreachable controls work on a phone: divider tools, railing product and color, framing measurements; undo/redo', async () => {
  const { ctx, page, errors, cdp } = await newPage({ width: 390, height: 844 }, true);
  await openCensus(page);
  const swipeUp = async () => { const b = await page.locator('#stepContent').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height - 20;
    for (let k = 0; k < 4; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let s = 1; s <= 6; s++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - s * 25 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    await page.waitForTimeout(150); };
  const tapEl = async (sel) => { const r = await page.locator(`#stepContent ${sel}`).boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + Math.min(r.height / 2, 12)); await page.waitForTimeout(250); };
  // Border & dividers: "Remove all" asks for confirmation (cancelled here); "Reset spacing" is pressable.
  await stateFn('5 Decking Layout · Border & dividers')(page); await swipeUp();
  await tapEl('[data-action="divider-remove-all"]');
  assert.equal(await page.locator('#dividerConfirm').isVisible(), true, 'remove-all confirmation opened');
  await page.screenshot({ path: path.join(SHOTS, 'v53c1-phone-divider-remove-all-confirm.png') });
  await page.locator('#dividerConfirm .cancel').click(); await page.waitForTimeout(150);
  // Railing finish: choose Bronze for every railed edge from the bottom of the panel, then undo/redo.
  await stateFn('7 Railings · finish, all edges')(page); await swipeUp();
  await page.screenshot({ path: path.join(SHOTS, 'v53c1-phone-railing-finish-scrolled.png') });
  await tapEl('[data-path="railColor"][data-value="Bronze"]');
  assert.equal(await page.locator('#stepContent [data-path="railColor"][data-value="Bronze"]').getAttribute('class').then(c => /selected/.test(c)), true, 'Bronze selected');
  const sc = await page.evaluate(() => document.getElementById('stepContent').scrollTop); assert.ok(sc > 0, 'the panel keeps its scroll position after the change re-renders it');
  await page.locator('#undoBtn').click(); await page.waitForTimeout(250);
  assert.equal(/selected/.test(await page.locator('#stepContent [data-path="railColor"][data-value="Textured Black"]').getAttribute('class')), true, 'undo restores Textured Black');
  await page.locator('#redoBtn').click(); await page.waitForTimeout(250);
  assert.equal(/selected/.test(await page.locator('#stepContent [data-path="railColor"][data-value="Bronze"]').getAttribute('class')), true, 'redo');
  // The 3D view follows (rail parts take the new color).
  await page.locator('#mode3d').click(); await page.waitForTimeout(400);
  const rails = await page.evaluate(() => window.AOSDeckStudioTest.scene3d().parts.filter(p => /^stair-(top-rail|bottom-rail|baluster|rail-post)$/.test(p.kind)).map(p => p.color));
  assert.ok(rails.length && rails.includes('#635849') && !rails.includes('#20272c'), '3D stair railings follow: Bronze, no Textured Black left');
  await page.locator('#mode2d').click();
  // Framing measurements button at the bottom of Framing & Ledger.
  await stateFn('3 Framing & Ledger')(page); await swipeUp(); await tapEl('[data-action="framing-details"]');
  assert.match(await page.locator('#stepContent').innerText(), /Proposed framing measurements/);
  // Changing step or tab starts the new panel at the top.
  await stateFn('7 Railings · finish, all edges')(page);
  assert.equal(await page.evaluate(() => document.getElementById('stepContent').scrollTop), 0, 'new step opens at the top');
  assert.deepEqual(errors, []); await ctx.close();
});
