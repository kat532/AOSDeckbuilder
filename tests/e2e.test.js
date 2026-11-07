// Browser journeys through the real index.html in headless Chrome.
// Needs Chrome/Chromium; set CHROME_PATH if it is not at a standard location.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');

const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const SHOTS = path.join(__dirname, '..', 'test-results', 'screenshots');

let browser;
test.before(async () => {
  if (!CHROME) throw new Error('Chrome not found; set CHROME_PATH');
  browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { await browser?.close(); });

async function openApp(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP);
  await page.waitForFunction(() => window.DeckCore && window.Deck3D);
  return { ctx, page, errors };
}

async function chooseShape(page, shape) {
  if (await page.locator('#shapeOverlay').isHidden()) await page.locator('#startFromCanvas').click();
  await page.locator(`#shapeOverlay [data-shape="${shape}"]`).click();
  await page.waitForFunction(() => /\d+ SQ FT/.test(document.getElementById('squareFeet')?.textContent || ''));
}

// #squareFeet is hidden on phone widths, so read its text rather than visible page text.
const area = (page) => page.evaluate(() => Number(document.getElementById('squareFeet').textContent.match(/(\d+(?:\.\d+)?) SQ FT/)?.[1]));
const hasArea = () => /\d+ SQ FT/.test(document.getElementById('squareFeet')?.textContent || '');
const stepText = (page) => page.locator('#progressText').innerText();

for (const shape of ['rectangle', 'square', 'L', 'T', 'U']) {
  test(`choose ${shape} shows a complete preview with no errors`, async () => {
    const { ctx, page, errors } = await openApp();
    await chooseShape(page, shape);
    assert.ok((await area(page)) > 0);
    await page.locator('#mode3d').click();
    await page.waitForTimeout(800); // let the 2D->3D fade finish before the screenshot
    await page.screenshot({ path: path.join(SHOTS, `shape-${shape}-3d.png`) });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('all 8 steps can be walked forward and back', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  const titles = [];
  for (let i = 0; i < 8; i++) {
    titles.push(await page.locator('#stepTitle').innerText());
    await page.screenshot({ path: path.join(SHOTS, `step-${i + 1}.png`) });
    if (i < 7) await page.locator('#nextBtn').click();
  }
  assert.deepEqual(titles.map(t => t.trim()), ['Shape & Size', 'House & Height', 'Stairs', 'Decking Layout', 'Decking Selection', 'Railings', 'Framing & Ledger', 'Review & Present']);
  for (let i = 0; i < 7; i++) await page.locator('#backBtn').click();
  assert.match(await stepText(page), /Step 1 of 8/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('exact width edit, undo and redo', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  assert.equal(await area(page), 192);
  const width = page.locator('#stepContent input[type=number]').first();
  await width.fill('20');
  await width.dispatchEvent('change');
  await page.waitForFunction(() => /240 SQ FT/.test(document.getElementById('squareFeet').textContent));
  await page.locator('#undoBtn').click();
  assert.equal(await area(page), 192);
  await page.locator('#redoBtn').click();
  assert.equal(await area(page), 240);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('selections survive moving between steps', async () => {
  const { ctx, page } = await openApp();
  await chooseShape(page, 'rectangle');
  for (let i = 0; i < 4; i++) await page.locator('#nextBtn').click(); // Decking Selection
  await page.getByRole('button', { name: 'Silver Maple' }).first().click();
  for (let i = 0; i < 4; i++) await page.locator('#backBtn').click();
  for (let i = 0; i < 4; i++) await page.locator('#nextBtn').click();
  const cls = (v) => page.evaluate((val) => document.querySelector(`[data-value="${val}"]`)?.className || '', v);
  assert.match(await cls('Silver Maple'), /\bselected\b/);
  assert.doesNotMatch(await cls('Brown Oak'), /\bselected\b/);
  await ctx.close();
});

test('save -> open round trip restores the same design', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'L');
  await page.locator('#nextBtn').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#saveBtn').click()]);
  const file = path.join(os.tmpdir(), `aos-roundtrip-${Date.now()}.json`);
  await download.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(saved.design, 'saved file has a design');
  assert.equal(saved.schemaVersion, 6);
  assert.equal(saved.design.schemaVersion, 6);
  assert.equal(saved.design.perimeter.segments.length, 6, 'L-shape has 6 perimeter segments');
  assert.deepEqual(saved.design.perimeter.segments.filter(s => s.kind === 'house').map(s => s.edge), saved.design.houseEdges);
  const before = await area(page);

  // Load it into a fresh page.
  const fresh = await openApp();
  await fresh.page.locator('#fileInput').setInputFiles(file);
  await fresh.page.waitForFunction(hasArea);
  assert.equal(await area(fresh.page), before);
  const [again] = await Promise.all([fresh.page.waitForEvent('download'), fresh.page.locator('#saveBtn').click()]);
  const file2 = file.replace('.json', '-2.json');
  await again.saveAs(file2);
  const resaved = JSON.parse(fs.readFileSync(file2, 'utf8'));
  assert.deepEqual(resaved.design, saved.design);
  assert.deepEqual(resaved.counts, saved.counts);
  assert.deepEqual([...errors, ...fresh.errors], []);
  await ctx.close(); await fresh.ctx.close();
});

test('V5.0 files saved before this change still open', async () => {
  const { ctx, page, errors } = await openApp();
  const legacy = { application: 'AOS Deck Studio V5.0', version: '5.0', design: { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], railEdges: [1, 2, 3], stairs: { enabled: true, edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }, decking: 'Rustic Elm' } };
  const file = path.join(os.tmpdir(), `aos-legacy-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(legacy));
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(hasArea);
  assert.equal(await area(page), 192);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone viewport: app loads and every step renders', async () => {
  const { ctx, page, errors } = await openApp({ width: 390, height: 844 });
  await chooseShape(page, 'rectangle');
  for (let i = 0; i < 7; i++) await page.locator('#nextBtn').click();
  await page.screenshot({ path: path.join(SHOTS, 'phone-review.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.1 per-edge railing finish ----
async function toRailingFinish(page) {
  await chooseShape(page, 'rectangle'); // edge 1 = house; edges 2, 3, 4 railed
  for (let i = 0; i < 5; i++) await page.locator('#nextBtn').click();
  await page.locator('[data-path="railTab"][data-value="finish"]').click();
}
const customCount = (page) => page.locator('#stepContent .rail-custom').count();
async function saveFile(page) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#saveBtn').click()]);
  const f = path.join(os.tmpdir(), `aos-rail-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await d.saveAs(f);
  return { file: f, data: JSON.parse(fs.readFileSync(f, 'utf8')) };
}

test('railing finish: one edge gets its own color, others keep theirs', async () => {
  const { ctx, page, errors } = await openApp();
  await toRailingFinish(page);
  const chips = page.locator('#stepContent [data-action="rail-target"]');
  assert.equal(await chips.count(), 4, 'All + 3 railed edges');
  assert.match(await chips.first().innerText(), /All railed edges/);

  await page.locator('[data-action="rail-target"][data-edge="2"]').click();
  assert.match(await page.locator('#stepContent .compact-status').innerText(), /Only Edge 3 changes/);
  await page.locator('[data-path="railColor"][data-value="Bronze"]').click();
  assert.equal(await customCount(page), 1);
  assert.match(await page.locator('[data-path="railColor"][data-value="Bronze"]').getAttribute('class'), /\bselected\b/);

  const { data } = await saveFile(page);
  assert.deepEqual(data.design.railOverrides, { 2: { railColor: 'Bronze' } });
  assert.equal(data.design.railColor, 'Textured Black');
  const segs = Object.fromEntries(data.design.perimeter.segments.map(s => [s.edge, s]));
  assert.equal(segs[2].color, 'Bronze');
  assert.equal(segs[1].color, 'Textured Black');

  await page.locator('#mode3d').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, 'railing-edge3-bronze-3d.png') });
  await page.locator('#mode2d').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, 'railing-edge3-bronze-2d.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('railing finish: undo and redo cover per-edge changes', async () => {
  const { ctx, page, errors } = await openApp();
  await toRailingFinish(page);
  await page.locator('[data-action="rail-target"][data-edge="1"]').click();
  await page.locator('[data-path="railColor"][data-value="White"]').click();
  assert.equal(await customCount(page), 1);
  await page.locator('#undoBtn').click();
  assert.equal(await customCount(page), 0);
  await page.locator('#redoBtn').click();
  assert.equal(await customCount(page), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('railing finish: whole-deck color clears color overrides but keeps product overrides', async () => {
  const { ctx, page, errors } = await openApp();
  await toRailingFinish(page);
  await page.locator('[data-action="rail-target"][data-edge="2"]').click();
  await page.locator('[data-path="railColor"][data-value="Bronze"]').click();
  await page.locator('[data-action="rail-target"][data-edge="3"]').click();
  await page.locator('[data-path="railStyle"][data-value="No rail product selected"]').click();
  assert.equal(await customCount(page), 2);
  assert.match(await page.locator('#stepContent .compact-status').innerText(), /Only Edge 4 changes/);

  await page.locator('[data-action="rail-target"][data-edge="all"]').click();
  assert.match(await page.locator('#stepContent .compact-status').innerText(), /including 2 edges with a custom finish/);
  await page.locator('[data-path="railColor"][data-value="White"]').click();
  const { data } = await saveFile(page);
  assert.equal(data.design.railColor, 'White');
  assert.deepEqual(data.design.railOverrides, { 3: { railStyle: 'No rail product selected' } });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('railing finish: "Use on all edges" and "Match other edges"', async () => {
  const { ctx, page, errors } = await openApp();
  await toRailingFinish(page);
  await page.locator('[data-action="rail-target"][data-edge="2"]').click();
  await page.locator('[data-path="railColor"][data-value="Bronze"]').click();
  await page.locator('[data-action="rail-match"]').click();
  assert.equal(await customCount(page), 0);

  await page.locator('[data-path="railColor"][data-value="Bronze"]').click(); // still Edge 3
  await page.locator('[data-action="rail-everywhere"]').click();
  assert.equal(await customCount(page), 0);
  const { data } = await saveFile(page);
  assert.equal(data.design.railColor, 'Bronze');
  assert.deepEqual(data.design.railOverrides, {});
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('railing finish: removing an edge railing drops its finish; save -> open restores the rest', async () => {
  const { ctx, page, errors } = await openApp();
  await toRailingFinish(page);
  await page.locator('[data-action="rail-target"][data-edge="1"]').click();
  await page.locator('[data-path="railColor"][data-value="White"]').click();
  await page.locator('[data-action="rail-target"][data-edge="3"]').click();
  await page.locator('[data-path="railColor"][data-value="Bronze"]').click();
  const { file } = await saveFile(page);

  const fresh = await openApp();
  await fresh.page.locator('#fileInput').setInputFiles(file);
  await fresh.page.waitForFunction(hasArea);
  for (let i = 0; i < 5; i++) await fresh.page.locator('#nextBtn').click();
  await fresh.page.locator('[data-path="railTab"][data-value="finish"]').click();
  assert.equal(await customCount(fresh.page), 2);

  // Turn off the Edge 4 railing via the existing locations controls' data path.
  await fresh.page.locator('[data-path="railTab"][data-value="locations"]').click();
  await fresh.page.locator('[data-action="rails-none"]').click();
  await fresh.page.locator('[data-path="railTab"][data-value="finish"]').click();
  assert.equal(await fresh.page.locator('#stepContent [data-action="rail-target"]').count(), 0);
  assert.match(await fresh.page.locator('#stepContent').innerText(), /No deck edges have railings yet/);
  const { data } = await saveFile(fresh.page);
  assert.deepEqual(data.design.railOverrides, {});
  assert.deepEqual([...errors, ...fresh.errors], []);
  await ctx.close(); await fresh.ctx.close();
});

test('railing finish: phone width keeps chips tappable and the page unscrolled sideways', async () => {
  const { ctx, page, errors } = await openApp({ width: 390, height: 844 });
  await toRailingFinish(page);
  const sizes = await page.locator('#stepContent [data-action="rail-target"]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  for (const [w, h] of sizes) assert.ok(h >= 44 && w >= 44, `chip ${w}x${h}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(SHOTS, 'phone-railing-finish.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('railing finish: tapping an edge on the 2D plan selects it; tapping again returns to all', async () => {
  const { ctx, page, errors } = await openApp(); // 1280x900, default 16x12 fitted to the canvas
  await toRailingFinish(page);
  assert.equal(await page.locator('#viewTip').innerText(), 'Tap a railed edge to give it its own finish');
  // Edge 3 is the 16 ft front edge: the bottom of the fitted plan, centered horizontally.
  const box = await page.locator('#planCanvas').boundingBox();
  const hit = await page.evaluate(() => {
    // Find the front edge's on-screen position from the drawn marker: scan the canvas
    // column through its center for the lowest dark-filled marker pixel.
    const c = document.getElementById('planCanvas'), g = c.getContext('2d'), x = Math.round(c.width / 2);
    const d = g.getImageData(x, 0, 1, c.height).data;
    for (let y = c.height - 1; y >= 0; y--) { const i = y * 4; if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 70 && d[i + 3] > 200) return { x, y: y - 6, w: c.width, h: c.height }; }
    return null;
  });
  assert.ok(hit, 'found the front edge marker');
  const px = box.x + hit.x * box.width / hit.w, py = box.y + hit.y * box.height / hit.h;
  await page.mouse.click(px, py);
  assert.match(await page.locator('[data-action="rail-target"][data-edge="2"]').getAttribute('class'), /\bselected\b/);
  await page.mouse.click(px, py);
  assert.match(await page.locator('[data-action="rail-target"][data-edge="all"]').getAttribute('class'), /\bselected\b/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.1 Free Draw ----
async function startFreeDraw(page) {
  if (await page.locator('#shapeOverlay').isHidden()) await page.locator('#startFromCanvas').click();
  await page.locator('#shapeOverlay [data-shape="free"]').click();
  const box = await page.locator('#planCanvas').boundingBox();
  // Same formula the app uses when Free Draw starts (feet -> CSS px).
  const scale = Math.min(Math.max(Math.min((box.width - 90) / 24, (box.height - 90) / 18), 7), 23);
  const o = { x: box.x + box.width / 2 - 8 * scale, y: box.y + box.height / 2 - 6 * scale };
  return (fx, fz) => page.mouse.click(o.x + fx * scale, o.y + fz * scale);
}
const cornersText = (page) => page.locator('#stepContent .compact-status').innerText();

test('free draw: three corners + tap near start closes a rectangle', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 12);
  assert.match(await cornersText(page), /3 corners/);
  await at(0.4, 0.3); // near the start pin, not on it
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
  const { data } = await saveFile(page);
  assert.equal(data.design.shape, 'free');
  assert.equal(data.design.points.length, 4);
  assert.ok(Math.abs(data.design.width - 16) < 0.3 && Math.abs(data.design.depth - 12) < 0.3, `${data.design.width} x ${data.design.depth}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('free draw: a slightly misaligned last corner is lined up, not jogged', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 12); await at(0.75, 12);
  await at(0.2, 0.2);
  assert.match(await page.locator('#dividerConfirmMessage').innerText(), /last corner moves .* along its edge/);
  await page.locator('#dividerConfirmAccept').click();
  const { data } = await saveFile(page);
  assert.equal(data.design.points.length, 4, 'still a 4-corner rectangle');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('free draw: 45° mode closes a chamfered deck with allowed angles', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await page.locator('[data-action="draw-mode"][data-value="45"]').click();
  await at(0, 0); await at(16, 0); await at(16, 12); await at(4, 12); await at(1.5, 9.5);
  await at(0.2, 0.2);
  await page.locator('#dividerConfirmAccept').click();
  const { data } = await saveFile(page);
  const W = data.design.width, D = data.design.depth;
  const pts = data.design.points.map(([x, z]) => [x * W, z * D]);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    assert.ok(Math.abs(deg / 45 - Math.round(deg / 45)) < 0.01, `edge ${i + 1} at ${deg.toFixed(1)}°`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('free draw: header undo/redo step through corners while drawing', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(12, 0); await at(12, 10);
  await page.locator('#undoBtn').click();
  assert.match(await cornersText(page), /2 corners/);
  await page.locator('#redoBtn').click();
  assert.match(await cornersText(page), /3 corners/);
  assert.equal(await page.locator('#redoBtn').isDisabled(), true);
  await page.locator('[data-action="undo-point"]').click();
  assert.match(await cornersText(page), /2 corners/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('free draw: closing shape then editing an exact width keeps it valid', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 12);
  await at(0.3, 0.3);
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
  const before = await area(page);
  const width = page.locator('#stepContent input[type=number]').first();
  await width.fill('20'); await width.dispatchEvent('change');
  await page.waitForFunction((b) => Number(document.getElementById('squareFeet').textContent.match(/(\d+)/)[1]) !== b, before);
  assert.equal(await area(page), 240);
  await page.locator('#undoBtn').click();
  assert.equal(await area(page), before);
  await page.screenshot({ path: path.join(SHOTS, 'freedraw-closed-edited.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('free draw: hovering near the start shows the closing preview (screenshot)', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 12); await at(0.5, 12);
  const box = await page.locator('#planCanvas').boundingBox();
  const scale = Math.min(Math.max(Math.min((box.width - 90) / 24, (box.height - 90) / 18), 7), 23);
  await page.mouse.move(box.x + box.width / 2 - 8 * scale + 6, box.y + box.height / 2 - 6 * scale + 5);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'freedraw-close-indicator.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});
