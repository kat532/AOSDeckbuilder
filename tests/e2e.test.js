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
// V5.1: Save project stores the project; a .json file comes from Projects › Download current.
async function downloadViaProjects(page) {
  await page.locator('#openBtn').click();
  await page.locator('#projectsDialog [data-action="project-download"]').click();
}

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
  const width = page.locator('#stepContent input[data-field="width"]').first();
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
  const [download] = await Promise.all([page.waitForEvent('download'), downloadViaProjects(page)]);
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
  const [again] = await Promise.all([fresh.page.waitForEvent('download'), downloadViaProjects(fresh.page)]);
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
  const [d] = await Promise.all([page.waitForEvent('download'), downloadViaProjects(page)]);
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
  const width = page.locator('#stepContent input[data-field="width"]').first();
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

// ---- V5.1 clickable steps ----
const stepBtn = (page, name) => page.locator(`#stepdots [data-step]`, { hasText: name });

test('steps: locked until a shape exists, then every step can be opened directly', async () => {
  const { ctx, page, errors } = await openApp();
  assert.equal(await page.locator('#stepdots [data-step]').count(), 8);
  assert.equal(await stepBtn(page, 'Railings').isDisabled(), true);
  await chooseShape(page, 'rectangle');
  await stepBtn(page, 'Railings').click();
  assert.equal((await page.locator('#stepTitle').innerText()).trim(), 'Railings');
  await stepBtn(page, 'House').click();
  assert.equal((await page.locator('#stepTitle').innerText()).trim(), 'House & Height');
  assert.equal(await stepBtn(page, 'Railings').getAttribute('class').then(c => /\bdone\b/.test(c)), true, 'visited step marked done');
  assert.equal(await stepBtn(page, 'House').getAttribute('aria-current'), 'step');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('steps: fix the deck size from Railings and come back without losing railing work', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  await stepBtn(page, 'Railings').click();
  await page.locator('[data-path="railTab"][data-value="finish"]').click();
  await page.locator('[data-action="rail-target"][data-edge="2"]').click();
  await page.locator('[data-path="railColor"][data-value="Bronze"]').click();

  await stepBtn(page, 'Shape').click();
  const width = page.locator('#stepContent input[data-field="width"]').first();
  await width.fill('20'); await width.dispatchEvent('change');
  await page.waitForFunction(() => /240 SQ FT/.test(document.getElementById('squareFeet').textContent));

  await stepBtn(page, 'Railings').click();
  assert.equal((await page.locator('#stepTitle').innerText()).trim(), 'Railings');
  const { data } = await saveFile(page);
  assert.equal(data.design.width, 20);
  assert.deepEqual(data.design.railOverrides, { 2: { railColor: 'Bronze' } });
  assert.deepEqual(data.design.railEdges, [1, 2, 3]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('steps: locked while free drawing', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  await page.locator('#stepContent [data-action="choose-shape"]').click();
  await page.locator('#shapeOverlay [data-shape="free"]').click();
  await page.locator('#dividerConfirmAccept').click(); // Change deck shape? -> Start Drawing
  assert.equal(await stepBtn(page, 'Decking').isDisabled(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('steps: a framing warning marks the Framing step', async () => {
  const { ctx, page, errors } = await openApp();
  const big = { application: 'AOS Deck Studio', design: { shape: 'U', width: 40, depth: 24, height: 9, houseEdges: [0], staircases: [{ id: 's1', enabled: true, edge: 2, width: 6, offset: 0, rails: { left: true, right: true } }] } };
  const file = path.join(os.tmpdir(), `aos-bigU-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(big));
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(hasArea);
  assert.match(await stepBtn(page, 'Framing').getAttribute('class'), /\battention\b/);
  assert.doesNotMatch(await stepBtn(page, 'Decking').getAttribute('class'), /\battention\b/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('steps: phone width keeps step buttons tappable', async () => {
  const { ctx, page, errors } = await openApp({ width: 390, height: 844 });
  await chooseShape(page, 'rectangle');
  const sizes = await page.locator('#stepdots [data-step]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  for (const [w, h] of sizes) assert.ok(h >= 34 && w >= 26, `step button ${w}x${h}`);
  await page.locator('#stepdots [data-step="5"]').click();
  assert.equal((await page.locator('#stepTitle').innerText()).trim(), 'Railings');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(SHOTS, 'phone-steps.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.1 measurements ----
const planDims = (page) => page.locator('#planCanvas').getAttribute('aria-label');

test('measurements: All shows edge lengths and stair width + position, live', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle'); // 16 x 12
  await stepBtn(page, 'Stairs').click();
  let dims = await planDims(page);
  assert.match(dims, /16′/); assert.match(dims, /12′/);
  await page.locator('[data-action="stair-add"]').click();
  dims = await planDims(page);
  assert.match(dims, /4′ 0″ wide/);
  // A centered 4 ft stair on a 16 ft or 12 ft edge leaves equal offsets on both sides.
  assert.ok(/(^|, )6′ 0″(,|\.)/.test(dims) || /(^|, )4′ 0″(,|\.)/.test(dims), dims);
  const w = page.locator('#stepContent input').first();
  await w.fill('6'); await w.dispatchEvent('change');
  await page.waitForFunction(() => /6′ 0″ wide/.test(document.getElementById('planCanvas').getAttribute('aria-label')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('measurements: divider distance from the house updates when the divider moves', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  const w = page.locator('#stepContent input[data-field="width"]').first(); // make room for a divider
  await w.fill('24'); await w.dispatchEvent('change');
  await stepBtn(page, 'Layout').click();
  await page.locator('[data-path="deckLine"][data-value="vertical"]').click(); // boards run out from the house
  await page.locator('[data-path="layoutTab"][data-value="border"]').click();
  await page.locator('[data-action="divider-add"]').click();
  let dims = await planDims(page);
  const before = dims.match(/(\d+′(?: \d+″)?) from house/);
  assert.ok(before, dims);
  const slider = page.locator('[data-divider-slider]');
  await slider.evaluate(el => { el.value = String(Number(el.min) + (Number(el.max) - Number(el.min)) * 0.2); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  dims = await planDims(page);
  const after = dims.match(/(\d+′(?: \d+″)?) from house/);
  assert.ok(after, dims);
  assert.notEqual(after[1], before[1], 'label follows the divider');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('measurements: Selected shows only the selected railing edge; Off hides; choice is remembered', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  await stepBtn(page, 'Railings').click();
  await page.locator('[data-path="railTab"][data-value="finish"]').click();
  await page.locator('#measureBtn').click();
  assert.match(await page.locator('#measureBtn').innerText(), /Selected/i);
  assert.match(await planDims(page), /overall/, 'nothing selected: overall size');
  await page.locator('[data-action="rail-target"][data-edge="2"]').click();
  assert.equal(await planDims(page), '2D plan. Dimensions: 16′ 0″.');
  await page.locator('#measureBtn').click();
  assert.equal(await planDims(page), '2D plan. Dimensions hidden.');
  await page.reload();
  await page.waitForFunction(() => window.DeckCore);
  assert.match(await page.locator('#measureBtn').innerText(), /Off/i);
  await page.locator('#measureBtn').click(); // back to All for other tests sharing this browser profile
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.1 projects: autosave, recent projects, reopen, duplicate, delete ----
// Standalone HTML mode (no Claude viewer): projects live in this browser's storage.
const saveStatus = (page) => page.locator('#saveStatus').innerText();
const waitSaved = (page) => page.waitForFunction(() => /Saved/.test(document.getElementById('saveStatus').textContent), null, { timeout: 8000 });
async function renameProject(page, name) {
  await page.locator('#projectName').fill(name);
  await page.locator('#projectName').dispatchEvent('change');
}
async function makeProject(page, name) {
  await chooseShape(page, 'rectangle');
  await renameProject(page, name);
  await stepBtn(page, 'Stairs').click();
  await page.locator('[data-action="stair-add"]').click();
  await stepBtn(page, 'Railings').click();
  await page.locator('[data-path="railTab"][data-value="finish"]').click();
  await page.locator('[data-action="rail-target"][data-edge="1"]').click();
  await page.locator('[data-path="railColor"][data-value="White"]').click();
  await waitSaved(page);
}

test('projects: autosave, close and reopen from Recent projects keeps stairs, railings and size', async () => {
  const { ctx, page, errors } = await openApp();
  await makeProject(page, 'Smith backyard');
  const { data: before } = await saveFile(page);
  await page.close();

  const again = await ctx.newPage(); // reopening the application in the same browser
  await again.goto(APP); await again.waitForFunction(() => window.DeckCore);
  const recent = again.locator('#recentProjects .recent-item', { hasText: 'Smith backyard' });
  await recent.waitFor();
  await recent.click();
  await again.waitForFunction(() => /\d+ SQ FT/.test(document.getElementById('squareFeet').textContent));
  assert.equal(await again.locator('#projectName').inputValue(), 'Smith backyard');
  const { data: after } = await saveFile(again);
  assert.deepEqual(after.design, before.design);
  assert.equal(after.design.staircases.length, 1);
  assert.deepEqual(after.design.railOverrides, { 1: { railColor: 'White' } });
  assert.equal(await again.locator('#undoBtn').isDisabled(), true, 'opening starts a fresh undo history');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('projects: explicit Save says where it saved; edits to an opened project are saved', async () => {
  const { ctx, page, errors } = await openApp();
  await makeProject(page, 'Jones deck');
  await page.locator('#saveBtn').click();
  await page.waitForFunction(() => /Saved “Jones deck” in this browser/.test(document.getElementById('toast').textContent));
  await page.reload(); await page.waitForFunction(() => window.DeckCore);
  await page.locator('#recentProjects .recent-item', { hasText: 'Jones deck' }).click();
  const w = page.locator('#stepContent input[data-field="width"]').first();
  await w.fill('22'); await w.dispatchEvent('change');
  await waitSaved(page);
  await page.reload(); await page.waitForFunction(() => window.DeckCore);
  await page.locator('#recentProjects .recent-item', { hasText: 'Jones deck' }).click();
  assert.equal(await page.locator('#stepContent input[data-field="width"]').first().inputValue(), '22′ 0″');
  assert.equal(await page.locator('#recentProjects .recent-item').count().then(() => true), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('projects: duplicate is independent; delete asks first; new project keeps the list', async () => {
  const { ctx, page, errors } = await openApp();
  await makeProject(page, 'Original deck');
  await page.locator('#openBtn').click();
  const row = (name) => page.locator('#projectsList .project-row', { has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) });
  await row('Original deck').locator('[data-action="project-duplicate"]').click();
  await row('Original deck \\(copy\\)').waitFor();
  assert.equal(await page.locator('#projectsList .project-row').count(), 2);
  await row('Original deck \\(copy\\)').locator('[data-action="project-open"]').click();
  const w = page.locator('#stepContent input[data-field="width"]').first();
  await w.fill('30'); await w.dispatchEvent('change');
  await waitSaved(page);

  await page.locator('#openBtn').click();
  assert.match(await row('Original deck').innerText(), /192 sq ft/, 'original untouched');
  assert.match(await row('Original deck \\(copy\\)').innerText(), /Open now/);
  await row('Original deck').locator('[data-action="project-delete"]').click();
  assert.match(await row('Original deck').innerText(), /Delete for good\?/);
  await row('Original deck').locator('[data-action="project-delete-no"]').click();
  assert.equal(await page.locator('#projectsList .project-row').count(), 2, 'Keep cancels');
  await row('Original deck').locator('[data-action="project-delete"]').click();
  await row('Original deck').locator('[data-action="project-delete-yes"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#projectsList .project-row').length === 1);

  await page.locator('[data-action="project-new"]').click();
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true);
  assert.equal(await page.locator('#recentProjects .recent-item').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('projects: opening a .json file adds it as a new project', async () => {
  const { ctx, page, errors } = await openApp();
  const file = path.join(os.tmpdir(), `aos-import-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ design: { shape: 'L', width: 24, depth: 18, height: 4, houseEdges: [0], project: 'Imported L' } }));
  await page.locator('#openBtn').click();
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(hasArea);
  await waitSaved(page);
  await page.locator('#openBtn').click();
  assert.match(await page.locator('#projectsList').innerText(), /Imported L/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('projects: blocked browser storage shows "Not saved" instead of failing silently', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore);
  await chooseShape(page, 'rectangle');
  await page.waitForFunction(() => /Not saved/.test(document.getElementById('saveStatus').textContent), null, { timeout: 8000 });
  await page.locator('#saveBtn').click();
  await page.waitForFunction(() => /Not saved: this browser is blocking storage/.test(document.getElementById('toast').textContent));
  assert.match(await page.locator('#saveStatus').getAttribute('title'), /Download current/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('steps: typing a project name then clicking a step opens that step on the first click', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  await page.locator('#projectName').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Lake house');
  await stepBtn(page, 'Stairs').click(); // the name field commits on blur during this click
  assert.equal((await page.locator('#stepTitle').innerText()).trim(), 'Stairs');
  assert.equal(await page.locator('#projectName').inputValue(), 'Lake house');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Claude preview mode, using a stand-in for the viewer's db/user/downloads capabilities
// (the real runtime only exists inside claude.ai). Exercises the same code path the preview takes.
async function openAppWithViewerStub({ canWrite = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(({ canWrite }) => {
    const store = (window.__stubStore = window.__stubStore || new Map()), saves = (window.__stubSaves = []);
    const snap = (id, v) => ({ id, exists: v !== undefined, data: () => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))), metadata: { fromCache: false, hasPendingWrites: false } });
    const db = {
      collection(path) {
        if (!/^data\/users\/viewer-1$/.test(path)) throw new TypeError('unexpected collection ' + path);
        return {
          async get() { const docs = [...store.entries()].map(([k, v]) => snap(k, v)); return { docs, size: docs.length, empty: !docs.length }; },
          doc(id) { return {
            async get() { return snap(id, store.get(id)); },
            async set(v) { if (!canWrite) throw { code: 'invalid_argument', message: 'no write' }; store.set(id, JSON.parse(JSON.stringify(v))); },
            async delete() { store.delete(id); },
          }; },
        };
      },
    };
    const user = { async id() { return 'viewer-1'; } };
    const downloads = { async save(r) { saves.push({ filename: r.filename, size: String(r.data).length }); return { status: 'saved' }; } };
    window.claude = { use: async (name) => ({ db, user, downloads }[name] || null) };
  }, { canWrite });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore);
  return { ctx, page, errors };
}

test('projects (preview): saves to the viewer’s private project space and downloads through the viewer', async () => {
  const { ctx, page, errors } = await openAppWithViewerStub();
  await chooseShape(page, 'rectangle');
  await renameProject(page, 'Preview deck');
  await waitSaved(page);
  assert.match(await page.locator('#saveStatus').getAttribute('title'), /to your projects/);
  const stored = await page.evaluate(() => [...window.__stubStore.values()]);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Preview deck');
  assert.equal(stored[0].design.width, 16);
  await page.locator('#openBtn').click();
  assert.match(await page.locator('#projectsWhere').innerText(), /Only you can see them/);
  await page.locator('#projectsDialog [data-action="project-download"]').click();
  await page.waitForFunction(() => window.__stubSaves.length === 1);
  assert.match(await page.evaluate(() => window.__stubSaves[0].filename), /^Preview_deck_AOS_Deck\.json$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('projects (preview): a viewer who cannot write gets browser saving and is told so', async () => {
  const { ctx, page, errors } = await openAppWithViewerStub({ canWrite: false });
  await chooseShape(page, 'rectangle');
  await waitSaved(page);
  assert.match(await page.locator('#saveStatus').getAttribute('title'), /in this browser/);
  assert.match(await page.locator('#toast').innerText(), /saved in this browser instead/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('free draw: an angled deck keeps its angles; width explains, edge length edit works', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  for (const [x, z] of [[0, 0], [16, 0], [16, 9], [13, 12], [3, 12], [0, 9]]) await at(x, z);
  await at(0.3, 0.3);
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
  const area0 = await area(page);

  const w = page.locator('#stepContent input[data-field="width"]').first();
  await w.fill('20'); await w.dispatchEvent('change');
  assert.match(await page.locator('#toast').innerText(), /would bend this shape's angled edges/);
  assert.equal(await area(page), area0, 'shape unchanged');

  // Find the topmost editable dimension label (red-outlined) and tap it.
  const box = await page.locator('#planCanvas').boundingBox();
  const hit = await page.evaluate(() => {
    const c = document.getElementById('planCanvas'), g = c.getContext('2d'), { width: W, height: H } = c, d = g.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
      if (Math.abs(d[i] - 226) < 14 && Math.abs(d[i + 1] - 152) < 16 && Math.abs(d[i + 2] - 159) < 16) return { x: x + 6, y: y + 12, W, H }; }
    return null;
  });
  assert.ok(hit, 'found an editable length label');
  await page.mouse.click(box.x + hit.x * box.width / hit.W, box.y + hit.y * box.height / hit.H);
  const apply = page.locator('[data-action="apply-edge-length"]');
  await apply.waitFor();
  const input = page.locator('#stepContent input').first();
  await input.fill('20'); await apply.click();
  await page.waitForFunction((a) => Number(document.getElementById('squareFeet').textContent.match(/(\d+)/)[1]) !== a, area0);
  // Every edge still on a 45° multiple after the edit.
  const { data } = await saveFile(page);
  const W = data.design.width, D = data.design.depth, pts = data.design.points.map(([x, z]) => [x * W, z * D]);
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    assert.ok(Math.abs(deg / 45 - Math.round(deg / 45)) < 0.01, `edge ${i + 1} at ${deg.toFixed(2)}°`); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.1 Phase A corrections ----
test('corrections: free draw has no angle buttons; edges snap on their own and show the corner angle', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  assert.equal(await page.locator('[data-action="draw-mode"]').count(), 0, 'angle-mode buttons removed');
  assert.match(await page.locator('#stepContent .shape-help').innerText(), /snap to square, 45° and 22.5°/);
  const box = await page.locator('#planCanvas').boundingBox();
  const scale = Math.min(Math.max(Math.min((box.width - 90) / 24, (box.height - 90) / 18), 7), 23);
  const toPx = (fx, fz) => [box.x + box.width / 2 - 8 * scale + fx * scale, box.y + box.height / 2 - 6 * scale + fz * scale];
  const label = () => page.locator('#planCanvas').getAttribute('aria-label');
  await at(0, 0); await at(16, 0);
  await page.mouse.move(...toPx(16.3, 8));          // slightly off vertical -> square corner
  assert.match(await label(), /next edge 8′ 0″ · corner 90°/);
  await at(16.3, 8);
  await page.mouse.move(...toPx(12.2, 12.1));       // roughly 45°, no mode change needed
  assert.match(await label(), /corner 135°/);
  await at(12.2, 12.1);
  await page.mouse.move(...toPx(4, 12));            // back to square in the same drawing
  assert.match(await label(), /corner 135°/);
  await at(4, 12);
  await at(0.3, 0.3);
  await page.locator('#dividerConfirmAccept').click();
  const { data } = await saveFile(page);
  const W = data.design.width, D = data.design.depth, pts = data.design.points.map(([x, z]) => [x * W, z * D]);
  const degs = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; });
  for (const d of degs) assert.ok(Math.abs(d / 22.5 - Math.round(d / 22.5)) < 0.01, `edge at ${d.toFixed(2)}°`);
  assert.ok(degs.some(d => Math.abs(Math.abs(d) % 90 - 45) < 0.01), 'kept the 45° edge');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('corrections: an inside corner reads 270°', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  const box = await page.locator('#planCanvas').boundingBox();
  const scale = Math.min(Math.max(Math.min((box.width - 90) / 24, (box.height - 90) / 18), 7), 23);
  const toPx = (fx, fz) => [box.x + box.width / 2 - 8 * scale + fx * scale, box.y + box.height / 2 - 6 * scale + fz * scale];
  await at(0, 0); await at(18, 0); await at(18, 6); await at(10, 6);
  await page.mouse.move(...toPx(10, 13));
  assert.match(await page.locator('#planCanvas').getAttribute('aria-label'), /corner 270°/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('corrections: Shape & Size instructions are the new, readable wording', async () => {
  const { ctx, page, errors } = await openApp({ width: 390, height: 844 });
  await chooseShape(page, 'rectangle');
  const help = page.locator('#stepContent .shape-help');
  assert.equal(await help.locator('strong').innerText(), 'Edit your deck shape');
  assert.equal(await help.locator('p').innerText(), 'Tap a dimension to enter an exact measurement. Drag an edge or corner to reshape your deck. Tap a corner to add an angled cut.');
  const size = await help.locator('p').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  assert.ok(size >= 13 && size <= 14, `font ${size}px`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('corrections: Change Deck Shape confirms, can be kept, and undo restores stairs and railings', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  await stepBtn(page, 'Stairs').click(); await page.locator('[data-action="stair-add"]').click();
  await stepBtn(page, 'Railings').click(); await page.locator('[data-path="railTab"][data-value="finish"]').click();
  await page.locator('[data-action="rail-target"][data-edge="2"]').click(); await page.locator('[data-path="railColor"][data-value="Bronze"]').click();
  await stepBtn(page, 'Shape').click();
  const btn = page.locator('#stepContent [data-action="choose-shape"]');
  assert.equal((await btn.innerText()).trim(), 'Change Deck Shape');
  await btn.click(); await page.locator('#shapeOverlay [data-shape="L"]').click();
  const msg = await page.locator('#dividerConfirmMessage').innerText();
  assert.match(msg, /Removed: 1 staircase, 1 custom railing finish/); assert.match(msg, /Kept: deck height/);
  assert.equal(await page.locator('#dividerConfirmCancel').innerText(), 'Keep Current Shape');
  await page.locator('#dividerConfirmCancel').click();
  assert.equal(await area(page), 192, 'kept the rectangle');
  await btn.click(); await page.locator('#shapeOverlay [data-shape="L"]').click();
  await page.locator('#dividerConfirmAccept').click();
  assert.notEqual(await area(page), 192);
  await page.locator('#undoBtn').click();
  assert.equal(await area(page), 192);
  const { data } = await saveFile(page);
  assert.equal(data.design.staircases.length, 1);
  assert.deepEqual(data.design.railOverrides, { 2: { railColor: 'Bronze' } });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('corrections: dimensions display and accept feet and inches; geometry keeps exact values', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  const w = page.locator('#stepContent input[data-field="width"]');
  assert.equal(await w.inputValue(), '16′ 0″');
  await w.fill('21 3'); await w.dispatchEvent('change');
  assert.equal(await page.locator('#stepContent input[data-field="width"]').inputValue(), '21′ 3″');
  assert.match(await page.locator('#planCanvas').getAttribute('aria-label'), /21′ 3″/);
  const d = page.locator('#stepContent input[data-field="depth"]');
  await d.fill(`12' 6"`); await d.dispatchEvent('change');
  const { data } = await saveFile(page);
  assert.equal(data.design.width, 21.25); assert.equal(data.design.depth, 12.5);
  await page.locator('#stepContent input[data-field="width"]').fill('abc');
  await page.locator('#stepContent input[data-field="width"]').dispatchEvent('change');
  assert.match(await page.locator('#toast').innerText(), /Enter a length like/);
  await stepBtn(page, 'House').click();
  assert.equal(await page.locator('#stepContent input[data-field="height"]').inputValue(), '4′ 0″');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.1 framing timing: light preview while dragging, full rebuild on commit ----
async function openDeckFile(page, design) {
  const file = path.join(os.tmpdir(), `aos-deck-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify({ design }));
  await page.locator('#openBtn').click();
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(() => window.AOSDeckStudioTest?.framingStatus() === 'current');
}
const BIG = { shape: 'free', width: 48, depth: 42, height: 8, houseEdges: [0], project: 'Big angled',
  points: [[12, 0], [36, 0], [48, 12], [48, 30], [36, 42], [12, 42], [0, 30], [0, 12]].map(([x, z]) => [x / 48, z / 42]) };

test('framing timing: dragging an edge is light; framing rebuilds once on release', async () => {
  const { ctx, page, errors } = await openApp({ width: 1280, height: 900 });
  await openDeckFile(page, BIG);
  const edges = await page.evaluate(() => window.AOSDeckStudioTest.edges());
  const e = edges.find(x => Math.abs(x.n[1]) > 0.99 && x.len > 20); // a long straight edge
  const [sx, sy] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), e.mid);
  const [ox, oy] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [e.mid[0] + e.n[0], e.mid[1] + e.n[1]]);
  await page.evaluate(() => { window.__moves = []; let t0 = 0;
    addEventListener('pointermove', () => { t0 = performance.now(); }, true);
    document.getElementById('planCanvas').addEventListener('pointermove', () => { if (t0) window.__moves.push(performance.now() - t0); }); });
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(sx + (ox - sx) * k * 0.1, sy + (oy - sy) * k * 0.1);
  assert.equal(await page.evaluate(() => window.AOSDeckStudioTest.isPreview()), true, 'preview while dragging');
  assert.equal(await page.locator('#framingStatus').innerText(), 'FRAMING: UPDATE NEEDED');
  const moves = await page.evaluate(() => window.__moves);
  await page.mouse.up();
  await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current');
  assert.equal(await page.evaluate(() => window.AOSDeckStudioTest.isPreview()), false);
  assert.equal(await page.locator('#framingStatus').innerText(), 'FRAMING CURRENT');
  const worst = Math.max(...moves.slice(1)), avg = moves.slice(1).reduce((a, b) => a + b, 0) / (moves.length - 1);
  console.log(`# 48x42 edge drag: ${moves.length} moves, avg ${avg.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
  assert.ok(avg < 25, `average move ${avg.toFixed(1)} ms`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('framing timing: cosmetic changes reuse the cached framing; structural ones recalculate', async () => {
  const { ctx, page, errors } = await openApp();
  await openDeckFile(page, { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0] });
  const c0 = await page.evaluate(() => window.AOSDeckStudioTest.framingCache());
  await stepBtn(page, 'Railings').click();
  await page.locator('[data-path="railTab"][data-value="finish"]').click();
  await page.locator('[data-path="railColor"][data-value="Bronze"]').click();
  const c1 = await page.evaluate(() => window.AOSDeckStudioTest.framingCache());
  assert.equal(c1.misses, c0.misses, 'railing color did not recalculate framing');
  assert.ok(c1.hits > c0.hits);
  await stepBtn(page, 'House').click();
  const h = page.locator('#stepContent input[data-field="height"]');
  await h.fill('7'); await h.dispatchEvent('change');
  const c2 = await page.evaluate(() => window.AOSDeckStudioTest.framingCache());
  assert.ok(c2.misses > c1.misses || c2.hits > c1.hits, 'height change was evaluated');
  await page.locator('#undoBtn').click(); // undo -> same inputs as before -> cache hit
  const c3 = await page.evaluate(() => window.AOSDeckStudioTest.framingCache());
  assert.equal(c3.misses, c2.misses, 'undo reused a cached result');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('framing timing: free drawing never runs the framing generator', async () => {
  const { ctx, page, errors } = await openApp();
  const c0 = await page.evaluate(() => window.AOSDeckStudioTest.framingCache());
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 12); await at(0, 12);
  await page.mouse.move(400, 400); await page.mouse.move(420, 410);
  const c1 = await page.evaluate(() => window.AOSDeckStudioTest.framingCache());
  assert.equal(c1.hits + c1.misses, c0.hits + c0.misses);
  assert.deepEqual(errors, []);
  await ctx.close();
});
