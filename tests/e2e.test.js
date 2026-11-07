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
  assert.deepEqual(titles.map(t => t.trim()), ['Shape & Size', 'House & Height', 'Framing & Ledger', 'Stairs', 'Decking Layout', 'Decking Selection', 'Railings', 'Review & Present']);
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
  for (let i = 0; i < 5; i++) await page.locator('#nextBtn').click(); // Decking Selection
  await page.getByRole('button', { name: 'Silver Maple' }).first().click();
  for (let i = 0; i < 5; i++) await page.locator('#backBtn').click();
  for (let i = 0; i < 5; i++) await page.locator('#nextBtn').click();
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
  for (let i = 0; i < 6; i++) await page.locator('#nextBtn').click();
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
  for (let i = 0; i < 6; i++) await fresh.page.locator('#nextBtn').click();
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
  assert.match(msg, /Removed: 1 staircase, 1 custom railing finish/); assert.match(msg, /Kept: house walls on the same sides, deck height/);
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

// ---- V5.2 Group A — A1 defects and A2 section dimensions ----
const edgesOf = (page) => page.evaluate(() => window.AOSDeckStudioTest.edges());
async function tapPlan(page, x, z) { const [sx, sy] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [x, z]); await page.mouse.click(sx, sy); await page.waitForTimeout(150); }
async function tapEdgeLabel(page, i) { const e = (await edgesOf(page))[i]; await tapPlan(page, e.mid[0] + e.n[0] * 1.3, e.mid[1] + e.n[1] * 1.3); }
const toastText = (page) => page.locator('#toast').innerText();
async function reopen(page, ctx) {
  const { file, data } = await saveFile(page);
  const fresh = await openApp();
  await fresh.page.locator('#fileInput').setInputFiles(file);
  await fresh.page.waitForFunction(hasArea);
  return { fresh, data };
}

test('A1 D1: a free-draw corner whose edge would cross an earlier edge is refused with the reason', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 12); await at(8, 12);
  await at(8, -6); // straight down through the first edge
  assert.match(await toastText(page), /would cross edge 1/);
  assert.match(await cornersText(page), /4 corners/);
  await at(4, 12); // a legal corner is still accepted afterward
  assert.match(await cornersText(page), /5 corners/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('A1 D1: closing an outline that would cross itself says so and adds no far-away corner', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(0, 12); await at(16, 12); // the closing edge would cut back across
  await at(0.3, 0.3);
  assert.equal(await page.locator('#dividerConfirm').isVisible(), false, 'no close confirmation is offered');
  assert.match(await toastText(page), /Cannot close yet: The closing edge would cross edge 2/);
  assert.doesNotMatch(await toastText(page), /directions are allowed/);
  assert.ok(await page.evaluate(() => !document.getElementById('squareFeet').textContent.match(/\d+ SQ FT/)), 'still drawing; no deck created');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('A1 D2: typing a corner cut size then pressing Apply works with no page error', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'L');
  const P = await page.evaluate(() => window.AOSDeckStudioTest.edges().map(e => e.a));
  await tapPlan(page, P[1][0], P[1][1]);
  await page.locator('#cornerSizeInput').fill(`2' 0"`);
  await page.locator('[data-action="apply-corner"]').click(); // blur -> change -> render while rendering
  await page.waitForTimeout(300);
  const after = await edgesOf(page);
  assert.equal(after.length, 7, 'the 45° cut added one corner');
  assert.ok(after.some(e => Math.abs(e.len - Math.SQRT2 * 2) < 0.02), 'a 2 ft × 2 ft cut: angled edge 2.83 ft');
  // Inside corner with 22.5° (fills the notch) also applies cleanly.
  const P2 = await page.evaluate(() => window.AOSDeckStudioTest.edges().map(e => e.a));
  const inner = P2.findIndex((p, i) => { const a = P2[(i - 1 + P2.length) % P2.length], b = P2[(i + 1) % P2.length]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) < 0; });
  await tapPlan(page, P2[inner][0], P2[inner][1]);
  await page.locator('[data-action="corner-angle"][data-value="22.5"]').click();
  await page.locator('#cornerSizeInput').fill(`1' 6"`);
  await page.locator('[data-action="apply-corner"]').click();
  await page.waitForTimeout(300);
  assert.equal((await edgesOf(page)).length, 8);
  await page.locator('#mode3d').click(); await page.waitForTimeout(500);
  const { fresh, data } = await reopen(page, ctx);
  assert.equal(data.design.points.length, 8);
  assert.equal((await edgesOf(fresh.page)).length, 8, 'both cuts survive save and reopen');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('A1 D3: refused edge lengths say why, and nothing changes', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'L');
  const before = (await edgesOf(page)).map(e => e.len);
  await tapEdgeLabel(page, 1);
  const field = page.locator('#stepContent input[data-edge-field="length"]');
  await field.fill('0.1'); await page.locator('[data-action="apply-edge-length"]').click();
  assert.match(await toastText(page), /Edge 2 must be at least 0′ 7¼″\. .* is too short; no change made/);
  await field.fill(`0' 7"`); await page.locator('[data-action="apply-edge-length"]').click();
  assert.match(await toastText(page), /at least 0′ 7¼″\. 0′ 7″ is too short/);
  await field.fill(`45' 0"`); await page.locator('[data-action="apply-edge-length"]').click();
  assert.match(await toastText(page), /Edge 2 can't be 45′ 0″: .*48 × 42 ft editor range.*No change made/);
  await field.fill('abc'); await page.locator('[data-action="apply-edge-length"]').click();
  assert.match(await toastText(page), /Enter feet and inches/);
  assert.deepEqual((await edgesOf(page)).map(e => e.len), before);
  await field.fill(`4' 0"`); await page.locator('[data-action="apply-edge-length"]').click(); // a valid one still works
  assert.ok(Math.abs((await edgesOf(page))[1].len - 4) < 1e-9);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('A1 D4: changing deck shape keeps every house wall on the same side', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  await stepBtn(page, 'House').click();
  const r = (await edgesOf(page))[1]; // right side
  await tapPlan(page, r.mid[0], r.mid[1]);
  let { data } = await saveFile(page);
  assert.deepEqual(data.design.houseEdges, [0, 1]);
  await stepBtn(page, 'Shape').click();
  await page.locator('[data-action="choose-shape"]').click();
  await page.locator('#shapeOverlay [data-shape="L"]').click();
  assert.match(await page.locator('#dividerConfirmMessage').innerText(), /Kept: house walls on the same sides/);
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
  ({ data } = await saveFile(page));
  const es = await edgesOf(page);
  assert.equal(data.design.houseEdges.length, 2);
  const sides = data.design.houseEdges.map(i => es[i].n.map(Math.round).join(','));
  assert.deepEqual(sides.sort(), ['0,-1', '1,0'].sort(), 'house walls stay on the house side and the right side');
  assert.ok(!data.design.railEdges.some(i => data.design.houseEdges.includes(i)), 'no railing on a house wall');
  await page.locator('#undoBtn').click();
  ({ data } = await saveFile(page));
  assert.equal(data.design.shape, 'rectangle', 'Undo restores the rectangle');
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [shape, edits, expectArea] of [
  ['T', [['t-main', `5' 0"`], ['t-ext', `6' 0"`]], 16 * 5 + 6 * 7],
  ['U', [['u-main', `4' 6"`], ['u-left', `4' 0"`], ['u-right', `5' 0"`]], 16 * 4.5 + (4 + 5) * 7.5],
]) {
  test(`A2: ${shape}-shape section dimensions are exact, reshape the deck and survive save/reopen`, async () => {
    const { ctx, page, errors } = await openApp();
    await chooseShape(page, shape);
    assert.match(await page.locator('#stepContent').innerText(), new RegExp(`${shape}-SHAPE SECTIONS`, 'i'));
    for (const [key, v] of edits) {
      const f = page.locator(`#stepContent input[data-section-field="${key}"]`);
      await f.fill(v); await f.dispatchEvent('change');
      await page.waitForTimeout(150);
      assert.equal(await page.locator(`#stepContent input[data-section-field="${key}"]`).inputValue(), v.replace(`'`, '′').replace(`"`, '″'));
    }
    assert.ok(Math.abs((await area(page)) - expectArea) <= 0.5, `area ${await area(page)} vs ${expectArea}`);
    // Overall size still edits independently and the sections keep their exact sizes.
    const width = page.locator('#stepContent input[data-field="width"]');
    await width.fill('20'); await width.dispatchEvent('change'); await page.waitForTimeout(200);
    for (const [key, v] of edits) assert.equal(await page.locator(`#stepContent input[data-section-field="${key}"]`).inputValue(), v.replace(`'`, '′').replace(`"`, '″'), `${key} kept after overall width change`);
    // A section that leaves too little room is refused with the reason.
    const main = page.locator(`#stepContent input[data-section-field="${shape === 'T' ? 't-main' : 'u-main'}"]`);
    await main.fill('11'); await main.dispatchEvent('change');
    assert.match(await toastText(page), /at least 2′ 0″.*No change made/);
    await page.locator('#mode3d').click(); await page.waitForTimeout(500);
    const { fresh, data } = await reopen(page, ctx);
    await fresh.page.locator('#mode2d').click();
    for (const [key, v] of edits) assert.equal(await fresh.page.locator(`#stepContent input[data-section-field="${key}"]`).inputValue(), v.replace(`'`, '′').replace(`"`, '″'), `${key} after reopen`);
    assert.equal(data.design.points.length, 8);
    assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
    await fresh.ctx.close(); await ctx.close();
  });
}

test('A2: L-shape section fields (existing) edit the leg and main depth exactly', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'L');
  const leg = page.locator('#stepContent input[data-l-leg-field="leg"]'), main = page.locator('#stepContent input[data-l-leg-field="main"]');
  await leg.fill(`7' 0"`); await leg.dispatchEvent('change'); await page.waitForTimeout(150);
  await main.fill(`6' 0"`); await main.dispatchEvent('change'); await page.waitForTimeout(150);
  assert.equal(await area(page), 16 * 6 + 7 * 6);
  const { fresh } = await reopen(page, ctx);
  assert.equal(await fresh.page.locator('#stepContent input[data-l-leg-field="leg"]').inputValue(), '7′ 0″');
  assert.equal(await fresh.page.locator('#stepContent input[data-l-leg-field="main"]').inputValue(), '6′ 0″');
  assert.deepEqual(errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('owner irregular deck (V5.2 fixture) opens, keeps every setting and survives save/reopen', async () => {
  const owner = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'owner-irregular-deck.json'), 'utf8'));
  const { ctx, page, errors } = await openApp();
  await openDeckFile(page, owner.design);
  assert.equal(await area(page), 614);
  const { fresh, data } = await reopen(page, ctx);
  for (const k of ['points', 'houseEdges', 'railEdges', 'railStyle', 'railColor', 'decking', 'border', 'deckLine', 'height', 'supportMode', 'beamStyle'])
    assert.deepEqual(data.design[k], owner.design[k], k);
  assert.equal(await area(fresh.page), 614);
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

// ---- Checkpoint 1 verification (owner request 7 Nov 2026) ----
const sideKey = (e) => e.n.map(v => Math.round(v)).join(',');
async function changeShape(page, shape) {
  await stepBtn(page, 'Shape').click();
  await page.locator('[data-action="choose-shape"]').click();
  await page.locator(`#shapeOverlay [data-shape="${shape}"]`).click();
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
}

test('checkpoint: hand-drawn concave U closes as drawn (8 corners, 150 sq ft)', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  for (const [x, z] of [[0, 0], [16, 0], [16, 12], [11, 12], [11, 5], [5, 5], [5, 12], [0, 12]]) await at(x, z);
  assert.match(await cornersText(page), /8 corners/);
  await at(0.3, 0.3);
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
  assert.equal(await area(page), 150);
  assert.equal((await edgesOf(page)).length, 8);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('checkpoint: near-touching edges are allowed; an edge that touches is refused', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 12); await at(8, 12);
  await at(8, 0); // ends ON edge 1: touching
  assert.match(await toastText(page), /would cross edge 1/);
  assert.match(await cornersText(page), /4 corners/);
  await at(8, 1); // 1 ft clear of edge 1: allowed
  assert.match(await cornersText(page), /5 corners/);
  await at(4, 1); await at(4, 12); await at(0, 12);
  await at(0.3, 0.3);
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
  assert.equal(await area(page), 16 * 12 - 4 * 11, 'deep notch kept, 1 ft from the house edge');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('checkpoint: angled 45° outline closes with allowed angles and no far corner', async () => {
  const { ctx, page, errors } = await openApp();
  const at = await startFreeDraw(page);
  await at(0, 0); await at(16, 0); await at(16, 9); await at(13, 12); await at(3, 12);
  await at(0.3, 0.3); // last 45° corner is filled in by closing
  assert.match(await page.locator('#dividerConfirmMessage').innerText(), /One corner is added|lines up|Confirm/);
  await page.locator('#dividerConfirmAccept').click();
  await page.waitForFunction(hasArea);
  const es = await edgesOf(page);
  assert.equal(es.length, 6);
  for (const e of es) { const a = Math.atan2(e.t[1], e.t[0]) / (Math.PI / 4); assert.ok(Math.abs(a - Math.round(a)) < 1e-6, 'edge on the 45° grid'); }
  const xs = es.map(e => e.a[0]), zs = es.map(e => e.a[1]);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 16.01 && Math.max(...zs) - Math.min(...zs) <= 12.01, 'nothing added outside the drawing');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('checkpoint: house walls and ledgers keep their sides through rectangle → L → U → T → rectangle', async () => {
  const { ctx, page, errors } = await openApp();
  await openDeckFile(page, { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0, 1, 3], ledgerEdges: [0, 3], supportMode: 'ledger' });
  const want = { house: ['-1,0', '0,-1', '1,0'], ledger: ['-1,0', '0,-1'] };
  for (const shape of ['L', 'U', 'T', 'rectangle']) {
    await changeShape(page, shape);
    const { data } = await saveFile(page), es = await edgesOf(page);
    const sides = (list) => list.map(i => sideKey(es[i])).sort();
    assert.deepEqual(sides(data.design.houseEdges), want.house, `${shape}: house walls`);
    assert.deepEqual(sides(data.design.ledgerEdges), want.ledger, `${shape}: ledgers`);
    for (const i of data.design.houseEdges) {
      const same = es.filter(e => sideKey(e) === sideKey(es[i]));
      assert.ok(same.every(e => e.mid[0] * e.n[0] + e.mid[1] * e.n[1] <= es[i].mid[0] * es[i].n[0] + es[i].mid[1] * es[i].n[1] + 1e-6), `${shape}: wall is the outermost edge on its side`);
    }
    assert.ok(!data.design.railEdges.some(i => data.design.houseEdges.includes(i)), `${shape}: no railing on a house wall`);
    await stepBtn(page, 'Framing').click();
    assert.match(await page.locator('#stepTitle').innerText(), /Framing & Ledger/);
    await page.locator('#mode3d').click(); await page.waitForTimeout(300); await page.locator('#mode2d').click();
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('checkpoint: corner editor applies several typed and slider cuts with no page errors', async () => {
  const { ctx, page, errors } = await openApp();
  await chooseShape(page, 'rectangle');
  for (let k = 0; k < 4; k++) {
    const es = await edgesOf(page);
    const corner = es.find(e => es.every(x => Math.hypot(x.a[0] - e.a[0], x.a[1] - e.a[1]) < 1e-9 || true) && Math.abs(Math.abs(e.a[0]) - 8) < 1e-6 && (Math.abs(e.a[1]) < 1e-6 || Math.abs(e.a[1] - 12) < 1e-6));
    await tapPlan(page, corner.a[0], corner.a[1]);
    if (k % 2) { const s = page.locator('input[data-corner-slider]'); await s.fill('1.5'); await s.dispatchEvent('change'); }
    else await page.locator('#cornerSizeInput').fill(`1' 6"`);
    await page.locator('[data-action="apply-corner"]').click();
    await page.waitForTimeout(250);
    assert.equal((await edgesOf(page)).length, 5 + k, `cut ${k + 1} applied`);
  }
  assert.equal(await area(page), Math.round(192 - 4 * 1.125));
  const { fresh, data } = await reopen(page, ctx);
  assert.equal(data.design.points.length, 8);
  assert.equal((await edgesOf(fresh.page)).length, 8);
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('checkpoint: T and U section edges are exact in the geometry and in the saved file', async () => {
  const { ctx, page, errors } = await openApp();
  for (const [shape, edits, expect] of [
    ['T', [['t-main', `5' 0"`], ['t-ext', `6' 0"`]], { side: 5, ext: 6, stem: 7 }],
    ['U', [['u-main', `4' 6"`], ['u-left', `4' 0"`], ['u-right', `5' 0"`]], { left: 4, right: 5, arm: 7.5 }],
  ]) {
    if (shape === 'T') await chooseShape(page, 'T'); else await changeShape(page, 'U');
    for (const [key, v] of edits) { const f = page.locator(`#stepContent input[data-section-field="${key}"]`); await f.fill(v); await f.dispatchEvent('change'); await page.waitForTimeout(150); }
    const L = (await edgesOf(page)).map(e => e.len), has = (v) => L.some(x => Math.abs(x - v) < 1e-9);
    for (const v of Object.values(expect)) assert.ok(has(v), `${shape}: an edge of exactly ${v} ft (${L.map(x => x.toFixed(4)).join(', ')})`);
    const { fresh, data } = await reopen(page, ctx);
    const L2 = (await edgesOf(fresh.page)).map(e => e.len);
    assert.deepEqual(L2.map(x => +x.toFixed(9)), L.map(x => +x.toFixed(9)), `${shape}: identical after reopen`);
    assert.equal(data.design.shape, shape);
    await fresh.ctx.close();
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.2 Group A — A3: full-width stairs and landings ----
async function toStairs(page, design) {
  await openDeckFile(page, design);
  await stepBtn(page, 'Stairs').click();
}
const stairPanel = (page) => page.locator('#stepContent').innerText();
async function stairField(page, key, v) { const f = page.locator(`#stepContent input[data-stair-field="${key}"]`); await f.fill(v); await f.dispatchEvent('change'); await page.waitForTimeout(150); }
async function views(page) { // 2D -> 3D finished -> 3D framing-only -> back
  await page.locator('#mode3d').click(); await page.waitForTimeout(500);
  await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
  await page.locator('#structureToggle').click(); await page.locator('#mode2d').click(); await page.waitForTimeout(200);
}

test('A3: full-width stair spans the edge, follows a width change, survives save/reopen and turns off again', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], staircases: [{ id: 'a', edge: 2, width: 4, offset: 0 }] });
  await page.locator('[data-action="stair-full"]').click();
  assert.match(await toastText(page), /spans the full 16′ 0″ edge/);
  assert.equal(await page.locator('#stepContent input[data-stair-field="width"]').inputValue(), '16′ 0″');
  assert.ok(await page.locator('#stepContent input[data-stair-field="width"]').isDisabled());
  assert.match(await page.locator('#planCanvas').getAttribute('aria-label'), /16′ 0″ wide/);
  await views(page);
  // The deck gets wider: the stair follows its edge.
  await stepBtn(page, 'Shape').click();
  const w = page.locator('#stepContent input[data-field="width"]'); await w.fill('20'); await w.dispatchEvent('change'); await page.waitForTimeout(200);
  let { data } = await saveFile(page);
  assert.equal(data.design.staircases[0].fullWidth, true);
  assert.equal(data.design.staircases[0].width, 20);
  const { fresh } = await reopen(page, ctx);
  await stepBtn(fresh.page, 'Stairs').click();
  assert.equal(await fresh.page.locator('#stepContent input[data-stair-field="width"]').inputValue(), '20′ 0″');
  await fresh.page.locator('[data-action="stair-full"]').click();
  assert.equal(await fresh.page.locator('#stepContent input[data-stair-field="width"]').inputValue(), '4′ 0″');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('A3: landing with width, depth and height; riser-snapped height; 2D/3D/framing; save, reopen and undo', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, { shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], staircases: [{ id: 'a', edge: 2, width: 4, offset: 0 }] });
  await page.locator('[data-action="stair-landing"]').click();
  assert.match(await toastText(page), /Landing added halfway down/);
  await stairField(page, 'landingWidth', `6' 0"`);
  await stairField(page, 'landingDepth', `5' 0"`);
  await stairField(page, 'landingElevation', `3' 2"`);
  assert.match(await toastText(page), /Landing set to 3′ 0″ above grade so every riser is the same height \(7¼ in\.\)/);
  const text = await stairPanel(page);
  assert.match(text, /10 risers · 5 \+ 5/);
  assert.match(text, /Upper flight: 5 risers down to the landing\. Lower flight: 5 risers to grade/);
  assert.match(text, /not an approved structure/);
  assert.match(await page.locator('#planCanvas').getAttribute('aria-label'), /Landing 6′ 0″ × 5′ 0″ · 3′ 0″ high/);
  await views(page);
  // Framing step lists the landing separately and keeps the review flag.
  await stepBtn(page, 'Review').click();
  assert.match(await page.locator('#stepContent').innerText(), /1 landing with 4 posts, 4 footings and \d+ framing members \(concept, not approved\)/);
  const { fresh, data } = await reopen(page, ctx);
  assert.deepEqual(data.design.staircases[0].landing, { width: 6, depth: 5, elevation: 3 });
  await stepBtn(fresh.page, 'Stairs').click();
  assert.equal(await fresh.page.locator('#stepContent input[data-stair-field="landingDepth"]').inputValue(), '5′ 0″');
  // 3 recorded changes (the 3′ 2″ height snapped to the 3′ 0″ default): undo all of them.
  for (let i = 0; i < 6 && await page.locator('#undoBtn').isEnabled(); i++) await page.locator('#undoBtn').click();
  await stepBtn(page, 'Stairs').click();
  assert.match(await stairPanel(page), /Landing \+/, 'Undo returns to a straight stair');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('A3: landing limits explain themselves; low decks cannot add one', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, { shape: 'rectangle', width: 16, depth: 12, height: 2, houseEdges: [0], staircases: [{ id: 'a', edge: 2, width: 4, offset: 0 }] });
  assert.ok(await page.locator('[data-action="stair-landing"]').isDisabled());
  assert.match(await stairPanel(page), /A landing needs at least four risers: a deck about 2′ 7″ high or more/);
  // Raise the deck: now a landing is allowed, and bad sizes are refused with the reason.
  await stepBtn(page, 'House').click();
  const h = page.locator('#stepContent input[data-field="height"]'); await h.fill('6'); await h.dispatchEvent('change');
  await stepBtn(page, 'Stairs').click();
  await page.locator('[data-action="stair-landing"]').click();
  await stairField(page, 'landingWidth', `2' 0"`);
  assert.match(await toastText(page), /Landing width must be from 4′ 0″ \(the stair width\) to 12′ 0″/);
  await stairField(page, 'landingDepth', `20' 0"`);
  assert.match(await toastText(page), /Landing depth must be from 3′ 0″ to 12′ 0″/);
  await stairField(page, 'landingElevation', `7' 0"`);
  assert.match(await toastText(page), /between grade and the deck \(6′ 0″\)/);
  assert.equal(await page.locator('#stepContent input[data-stair-field="landingWidth"]').inputValue(), '4′ 0″', 'nothing changed');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('A3: a landing stair and plain stairs together; a landing that would hit another stair is refused', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, { shape: 'rectangle', width: 24, depth: 14, height: 6, houseEdges: [0], staircases: [
    { id: 'a', edge: 2, width: 4, offset: -3 }, { id: 'b', edge: 2, width: 4, offset: 4 }, { id: 'c', edge: 1, width: 4, offset: 0 }] });
  await page.locator('[data-action="stair-landing"]').click(); // stair 1
  await stairField(page, 'landingWidth', `6' 0"`); // stair 1 landing spans 6 ft to 0 ft left of center
  await page.locator('[data-action="stair-next"]').click();
  await page.locator('[data-action="stair-landing"]').click(); // stair 2 (4 ft right of center) gets a 4 ft landing: fits
  assert.match(await toastText(page), /Landing added/);
  await stairField(page, 'landingWidth', `10' 0"`); // would reach 1 ft into stair 1's landing
  assert.match(await toastText(page), /Not enough room: this stair or its landing would overlap another staircase/);
  let { data } = await saveFile(page);
  assert.equal(data.design.staircases.length, 3);
  assert.deepEqual(data.design.staircases.map(s => Boolean(s.landing)), [true, true, false]);
  await views(page);
  const { fresh, data: d2 } = await reopen(page, ctx);
  assert.deepEqual(d2.design.staircases.map(s => s.landing?.width ?? null), [6, 4, null]);
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('A3: older single-flight and multi-stair projects open unchanged', async () => {
  const { ctx, page, errors } = await openApp();
  await openDeckFile(page, { shape: 'rectangle', width: 20, depth: 14, height: 5, houseEdges: [0], stairs: { enabled: true, edge: 2, width: 4, offset: 0, rails: { left: true, right: true } } });
  let { data } = await saveFile(page);
  assert.equal(data.design.staircases.length, 1);
  assert.ok(!('landing' in data.design.staircases[0]) && !('fullWidth' in data.design.staircases[0]));
  await stepBtn(page, 'Stairs').click();
  assert.match(await stairPanel(page), /Full edge width \+/);
  assert.match(await stairPanel(page), /Landing \+/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.2 Group A — Checkpoint 3: landing decking direction and A4 turning stairs ----
const LANDING_DECK = (landing = {}, over = {}) => ({ shape: 'rectangle', width: 24, depth: 14, height: 7, houseEdges: [0], deckLine: 'horizontal', borderCount: 1,
  staircases: [{ id: 'a', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, landing: { width: 6, depth: 5, elevation: 3.5, ...landing } }], ...over });
const pressed = (page, act) => page.locator(`#stepContent [data-action="${act}"][aria-pressed="true"]`).getAttribute('data-value');
async function planPixel(page, x, z) { // the 2D plan's color at a deck point
  const [sx, sy] = await page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [x, z]);
  return page.evaluate(([sx, sy]) => { const c = document.getElementById('planCanvas'), r = c.getBoundingClientRect(), k = c.width / r.width; return Array.from(c.getContext('2d').getImageData(Math.round(sx * k), Math.round(sy * k), 1, 1).data.slice(0, 3)); }, [sx - (await page.locator('#planCanvas').boundingBox()).x, sy - (await page.locator('#planCanvas').boundingBox()).y]);
}

test('CP3: landing decking direction — five options, Match follows the main deck, an override stays; save/reopen and undo/redo', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, LANDING_DECK());
  const opts = await page.locator('#stepContent [data-action="landing-deckline"]').allInnerTexts();
  assert.deepEqual(opts.map(t => t.replace(/^\W+\s*/, '').trim()), ['Match main deck', 'Horizontal', 'Vertical', 'Diagonal left', 'Diagonal right']);
  assert.equal(await pressed(page, 'landing-deckline'), 'match', 'new and existing landings start on Match main deck');
  assert.match(await stairPanel(page), /Follows the main deck's board direction \(now horizontal\)/);
  assert.match(await stairPanel(page), /Uses the main deck's Brown Oak boards with a single Stone Ash picture frame/);
  // Main deck turned to outward boards: the Match landing follows.
  await stepBtn(page, 'Layout').click();
  await page.locator('#stepContent [data-path="deckLine"][data-value="vertical"]').click();
  await stepBtn(page, 'Stairs').click();
  assert.match(await stairPanel(page), /\(now vertical\)/);
  // An explicit direction is independent of the main deck afterwards.
  await page.locator('#stepContent [data-action="landing-deckline"][data-value="diagonal-right"]').click();
  assert.equal(await pressed(page, 'landing-deckline'), 'diagonal-right');
  await stepBtn(page, 'Layout').click();
  await page.locator('#stepContent [data-path="deckLine"][data-value="horizontal"]').click();
  let { data } = await saveFile(page);
  assert.equal(data.design.deckLine, 'horizontal');
  assert.equal(data.design.staircases[0].landing.deckLine, 'diagonal-right', 'override kept when the main deck changes');
  // Undo the main change, then the landing choice: back to Match. Redo brings the choice back.
  await page.locator('#undoBtn').click(); await page.locator('#undoBtn').click();
  await stepBtn(page, 'Stairs').click();
  assert.equal(await pressed(page, 'landing-deckline'), 'match');
  await page.locator('#redoBtn').click();
  await stepBtn(page, 'Stairs').click();
  assert.equal(await pressed(page, 'landing-deckline'), 'diagonal-right');
  // Picking Match again removes the override from the saved record.
  for (const v of ['horizontal', 'vertical', 'diagonal-left']) {
    await page.locator(`#stepContent [data-action="landing-deckline"][data-value="${v}"]`).click();
    assert.equal(await pressed(page, 'landing-deckline'), v);
  }
  ({ data } = await saveFile(page));
  assert.equal(data.design.staircases[0].landing.deckLine, 'diagonal-left');
  const { fresh } = await reopen(page, ctx);
  await stepBtn(fresh.page, 'Stairs').click();
  assert.equal(await pressed(fresh.page, 'landing-deckline'), 'diagonal-left', 'reopened with the same direction');
  await fresh.page.locator('#stepContent [data-action="landing-deckline"][data-value="match"]').click();
  const again = await saveFile(fresh.page);
  assert.ok(!('deckLine' in again.data.design.staircases[0].landing));
  await views(fresh.page);
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('CP3: landing decking colors follow the main deck in the 2D plan', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, LANDING_DECK({ width: 8, depth: 6 }, { borderCount: 2 }));
  assert.equal(await page.evaluate(() => window.AOSDeckStudioTest.framingStatus()), 'current');
  const e = (await edgesOf(page))[2], P = (u, v) => [e.mid[0] + e.t[0] * u + e.n[0] * v, e.mid[1] + e.t[1] * u + e.n[1] * v];
  // Upper flight run for a 7 ft deck with the landing at 3′ 6″ (11 risers, 6 above): 5 treads.
  const v0 = 5 * 11 / 12, frame = (u, v) => planPixel(page, ...P(u, v0 + v));
  const colors = await page.evaluate(() => ({ field: window.DeckCore.PALETTES['Brown Oak'], border: window.DeckCore.PALETTES['Stone Ash'] }));
  const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 26);
  // Corners of the double picture frame are the border color; the middle of the landing is field color (sample a few spots, skipping gaps).
  // (clear of the guard rail drawn 1 in. inside the landing edge)
  assert.ok(near(await frame(-3.65, 0.3), hex(colors.border)), 'outer frame course at the corner');
  assert.ok(near(await frame(3.65, 5.7), hex(colors.border)), 'outer frame course at the far corner');
  await page.screenshot({ path: path.join(SHOTS, 'cp3-colors.png') });
  const mids = await Promise.all([[-2.4, 1.6], [2.4, 4.3], [-2.4, 4.3]].map(([u, v]) => frame(u, v)));
  assert.ok(mids.filter(c => near(c, hex(colors.field))).length >= 2, 'field boards in the middle ' + JSON.stringify([mids, hex(colors.field)]));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('CP3: left and right turns from the staircase editor; depth and collision limits explain themselves; save/reopen/undo', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, LANDING_DECK({ width: 4, depth: 3 }, { staircases: [
    { id: 'a', edge: 2, width: 4, offset: -4, rails: { left: true, right: true }, landing: { width: 4, depth: 3, elevation: 3.5 } },
    { id: 'b', edge: 2, width: 4, offset: 3, rails: { left: true, right: true } }] }));
  assert.equal(await pressed(page, 'stair-turn'), 'straight');
  // One way runs into stair b and is refused; the other way fits, deepening the landing to the stair width.
  const tries = {};
  for (const t of ['left', 'right']) {
    await page.locator(`#stepContent [data-action="stair-turn"][data-value="${t}"]`).click();
    tries[t] = await toastText(page);
    if (await pressed(page, 'stair-turn') === t) { await page.locator('#stepContent [data-action="stair-turn"][data-value="straight"]').click(); }
  }
  const bad = Object.keys(tries).find(t => /Not enough room: this stair or its landing would overlap another staircase/.test(tries[t]));
  const good = bad === 'left' ? 'right' : 'left';
  assert.ok(bad, 'the colliding turn is refused');
  assert.match(tries[good], new RegExp(`Lower flight turns ${good}\\. Landing depth set to 4′ 0″ so the lower flight fits`));
  await page.locator(`#stepContent [data-action="stair-turn"][data-value="${good}"]`).click();
  assert.equal(await pressed(page, 'stair-turn'), good);
  assert.match(await stairPanel(page), new RegExp(`turns 90° to your ${good} as you walk down`));
  assert.equal(await page.locator('#stepContent input[data-stair-field="landingDepth"]').inputValue(), '4′ 0″');
  assert.match(await page.locator('#planCanvas').getAttribute('aria-label'), new RegExp(`Landing 4′ 0″ × 4′ 0″ · 3′ 2″ high · turns ${good}`));
  await stairField(page, 'landingDepth', `3' 0"`);
  assert.match(await toastText(page), /A turning stair needs a landing at least as deep as the stair is wide \(4′ 0″\)/);
  await stairField(page, 'width', `13' 0"`);
  assert.match(await toastText(page), /Turning stairs can be up to 12′ 0″ wide/);
  await views(page);
  await stepBtn(page, 'Review').click();
  assert.match(await page.locator('#stepContent').innerText(), /1 landing \(1 turning\) with \d+ posts.*Landing decking: \d+ field boards, [\d.]+ LF \(order \d+ LF with waste\) \+ 4 picture-frame boards/);
  let { data } = await saveFile(page);
  assert.equal(data.design.staircases[0].landing.turn, good);
  assert.equal(data.design.staircases.length, 2);
  const { fresh } = await reopen(page, ctx);
  await stepBtn(fresh.page, 'Stairs').click();
  assert.equal(await pressed(fresh.page, 'stair-turn'), good);
  for (let i = 0; i < 6 && await page.locator('#undoBtn').isEnabled(); i++) await page.locator('#undoBtn').click();
  await stepBtn(page, 'Stairs').click();
  assert.equal(await pressed(page, 'stair-turn'), 'straight', 'Undo returns to the straight landing');
  await page.locator('#redoBtn').click(); await stepBtn(page, 'Stairs').click();
  assert.equal(await pressed(page, 'stair-turn'), good, 'Redo turns it again');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('CP3: a turn that would run back over the deck is refused with a reason', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, { shape: 'U', width: 24, depth: 20, height: 7, houseEdges: [0], staircases: [
    { id: 'u', edge: 3, width: 3, offset: 3, rails: { left: true, right: true }, landing: { width: 3, depth: 3, elevation: 3.5, turn: 'left' } }] });
  assert.equal(await pressed(page, 'stair-turn'), 'left');
  await page.locator('#stepContent [data-action="stair-turn"][data-value="right"]').click();
  assert.match(await toastText(page), /That doesn't fit: the turned lower flight or landing would run back over the deck\. Try turning left/);
  assert.equal(await pressed(page, 'stair-turn'), 'left', 'nothing changed');
  await page.locator('#stepContent [data-action="stair-turn"][data-value="straight"]').click();
  assert.match(await toastText(page), /would run back over the deck/, 'a straight landing here would cross the notch into the other arm');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('CP3: an A3 landing project opens straight, on Match main deck, and saves back unchanged', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, { shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], staircases: [{ id: 'a', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, landing: { width: 6, depth: 5, elevation: 3 } }] });
  assert.equal(await pressed(page, 'stair-turn'), 'straight');
  assert.equal(await pressed(page, 'landing-deckline'), 'match');
  const { data } = await saveFile(page);
  assert.deepEqual(data.design.staircases[0].landing, { width: 6, depth: 5, elevation: 3 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('CP3: finished and framing-only 3D render the turning stair; the landing controls fit a phone', async () => {
  for (const turn of ['left', 'right']) {
    const { ctx, page, errors } = await openApp();
    await toStairs(page, LANDING_DECK({ turn }));
    await page.locator('#mode3d').click(); await page.waitForTimeout(700);
    const finished = await page.locator('#glCanvas').screenshot();
    await page.locator('#structureToggle').click(); await page.waitForTimeout(500);
    const framing = await page.locator('#glCanvas').screenshot();
    assert.ok(finished.length > 20000 && framing.length > 20000, 'both views drew');
    assert.ok(!finished.equals(framing), 'framing-only differs from finished');
    fs.writeFileSync(path.join(SHOTS, `cp3-${turn}-finished.png`), finished); fs.writeFileSync(path.join(SHOTS, `cp3-${turn}-framing.png`), framing);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  const { ctx, page, errors } = await openApp({ width: 390, height: 844 });
  // (the Projects button is hidden on a phone: open the file the way the phone menu does)
  const file = path.join(os.tmpdir(), `aos-cp3-${Date.now()}.json`); fs.writeFileSync(file, JSON.stringify({ design: LANDING_DECK({ turn: 'left' }) }));
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(() => window.AOSDeckStudioTest?.framingStatus() === 'current');
  await stepBtn(page, 'Stairs').click();
  for (const act of ['stair-turn', 'landing-deckline']) {
    const btns = page.locator(`#stepContent [data-action="${act}"]`);
    for (let i = 0; i < await btns.count(); i++) {
      await btns.nth(i).scrollIntoViewIfNeeded();
      const b = await btns.nth(i).boundingBox();
      assert.ok(b.height >= 30 && b.x >= 0 && b.x + b.width <= 390, `${act} ${i} is a usable size on a phone ${JSON.stringify(b)}`);
    }
  }
  await page.locator('#stepContent [data-action="landing-deckline"][data-value="vertical"]').click();
  assert.equal(await pressed(page, 'landing-deckline'), 'vertical');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.2 Group A — Checkpoint 3 corrections: connected stair/landing railings, landing frame blocking ----
const scene3d = (page) => page.evaluate(() => window.AOSDeckStudioTest.scene3d());
async function orbit(page, dx, dy) { const b = await page.locator('#glCanvas').boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(250); }
function railGaps(scene) { // rail ends (plan + height) that do not finish on a post
  const posts = scene.parts.filter(p => p.kind === 'stair-rail-post'), bad = [];
  for (const r of scene.parts.filter(p => p.kind === 'stair-top-rail' || p.kind === 'stair-bottom-rail')) {
    const t = [Math.cos(-r.yaw), Math.sin(-r.yaw)], hl = r.w / 2 * Math.cos(r.rz || 0), dy = r.w / 2 * Math.abs(Math.sin(r.rz || 0));
    for (const e of [{ x: r.x - t[0] * hl, z: r.z - t[1] * hl, y: r.y + dy }, { x: r.x + t[0] * hl, z: r.z + t[1] * hl, y: r.y - dy }]) {
      const near = posts.filter(p => Math.hypot(p.x - e.x, p.z - e.z) <= 0.105 + 1e-9 && p.y + p.h / 2 >= e.y - 1e-9 && p.y - p.h / 2 <= e.y + 1e-9);
      // The deck-side end of an upper flight finishes on a deck railing post (not in this list); allow ends at the deck height.
      if (!near.length && !(Math.abs(e.y - 7 - 2.78) < 0.2 || Math.abs(e.y - 7 - 0.58) < 0.2)) bad.push(`${r.kind}/${r.connect} @ ${e.x.toFixed(2)},${e.z.toFixed(2)},${e.y.toFixed(2)}`);
    }
  }
  return bad;
}

test('CP3 fix: finished 3D railings run unbroken from the upper flight through the landing to the lower flight (straight, left, right; several angles incl. overhead)', async () => {
  for (const turn of ['straight', 'left', 'right']) {
    const { ctx, page, errors } = await openApp();
    await toStairs(page, LANDING_DECK(turn === 'straight' ? {} : { turn }));
    await page.locator('#mode3d').click(); await page.waitForTimeout(600);
    let sc = await scene3d(page);
    assert.equal(sc.showStructure, false, 'finished view');
    assert.deepEqual(railGaps(sc), [], `${turn}: rail ends without a post`);
    assert.equal(sc.parts.filter(p => p.connect === 'landing-transition').length, 4, `${turn}: four transition posts (two per flight)`);
    const shots = [];
    for (const [i, [dx, dy]] of [[0, 0], [260, 0], [-520, 60], [0, 600]].entries()) { // default, two sides, overhead
      if (dx || dy) await orbit(page, dx, dy);
      const png = await page.locator('#glCanvas').screenshot(); shots.push(png);
      fs.writeFileSync(path.join(SHOTS, `cp3fix-rails-${turn}-${i}.png`), png);
    }
    for (let i = 1; i < shots.length; i++) assert.ok(!shots[i].equals(shots[i - 1]), 'each angle drew a different view');
    // Each rail side on its own: turning the left rail off keeps the right side connected.
    await page.locator('#mode2d').click();
    await page.locator('#stepContent [data-action="stair-rail"][data-side="left"]').click(); await page.waitForTimeout(200);
    await page.locator('#mode3d').click(); await page.waitForTimeout(400);
    sc = await scene3d(page);
    assert.deepEqual(railGaps(sc), [], `${turn}: right side alone still connected`);
    assert.equal(sc.parts.filter(p => p.kind === 'stair-top-rail' && p.connect === 'stair-guard').length, 2, 'one rail per flight on the right');
    const { data } = await saveFile(page);
    assert.deepEqual(data.design.staircases[0].rails, { left: false, right: true });
    await page.locator('#undoBtn').click(); await page.waitForTimeout(300);
    assert.equal((await scene3d(page)).parts.filter(p => p.kind === 'stair-top-rail' && p.connect === 'stair-guard').length, 4, 'Undo restores both sides');
    await page.locator('#redoBtn').click(); await page.waitForTimeout(300);
    assert.equal((await scene3d(page)).parts.filter(p => p.kind === 'stair-top-rail' && p.connect === 'stair-guard').length, 2, 'Redo');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('CP3 fix: framing-only 3D shows the landing picture-frame support; it follows the frame choice and board direction', async () => {
  const { ctx, page, errors } = await openApp();
  await toStairs(page, LANDING_DECK({ deckLine: 'diagonal-left', width: 7, depth: 6 }));
  await page.locator('#mode3d').click(); await page.waitForTimeout(500);
  await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
  let sc = await scene3d(page);
  assert.equal(sc.showStructure, true, 'framing-only view');
  const count = (s) => ({ blocks: s.parts.filter(p => p.kind === 'landing-blocking').length, fieldEnd: s.parts.filter(p => p.kind === 'landing-blocking' && p.role === 'field-end').length, supports: s.parts.filter(p => p.role === 'frame-support').length, flats: s.parts.filter(p => p.kind === 'landing-flat-2x6').length });
  const single = count(sc);
  // (B2 finding #1: mitered corners are now carried by the flat 2x6 runs, not separate miter blocks.)
  assert.ok(single.supports >= 2 && single.fieldEnd > 0 && single.flats === 2, 'support joists, flat 2x6 runs and field-end blocking');
  assert.ok(sc.parts.filter(p => p.kind === 'landing-blocking').every(p => p.group === 'stair-framing'), 'drawn in framing-only 3D');
  for (const [i, [dx, dy]] of [[0, 0], [0, 600], [300, -200]].entries()) { if (dx || dy) await orbit(page, dx, dy); fs.writeFileSync(path.join(SHOTS, `cp3fix-blocking-${i}.png`), await page.locator('#glCanvas').screenshot()); }
  // Double frame: more support; no frame: none.
  await stepBtn(page, 'Layout').click();
  await page.locator('#stepContent [data-path="layoutTab"][data-value="border"]').click();
  await page.locator('#stepContent [data-path="borderCount"][data-value="2"]').click(); await page.waitForTimeout(400);
  const dbl = count(await scene3d(page));
  assert.ok(dbl.supports > single.supports, 'double frame: a support joist under each joint');
  await page.locator('#stepContent [data-path="borderCount"][data-value="0"]').click(); await page.waitForTimeout(400);
  assert.deepEqual(count(await scene3d(page)), { blocks: 0, fieldEnd: 0, supports: 0, flats: 0 }, 'no frame: no frame support');
  await page.locator('#undoBtn').click(); await page.waitForTimeout(400);
  assert.deepEqual(count(await scene3d(page)), dbl, 'Undo brings the double-frame support back');
  // Square board layouts have no field-board ends on the header sides.
  await stepBtn(page, 'Stairs').click();
  await page.locator('#stepContent [data-action="landing-deckline"][data-value="horizontal"]').click(); await page.waitForTimeout(400);
  assert.equal(count(await scene3d(page)).fieldEnd, 0);
  await stepBtn(page, 'Review').click();
  assert.match(await page.locator('#stepContent').innerText(), /framing members \(concept, not approved\), plus \d+ flat 2×6 runs \([\d.]+ LF\)/);
  const { fresh } = await reopen(page, ctx);
  await fresh.page.locator('#mode3d').click(); await fresh.page.waitForTimeout(400);
  assert.deepEqual(count(await scene3d(fresh.page)), count(await scene3d(page)), 'reopened with the same landing framing');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

// ---- V5.2 Group B — B1: house doors and windows ----
const openingsOf = (page) => page.evaluate(() => window.AOSDeckStudioTest.openings());
const housePanel = (page) => page.locator('#stepContent').innerText();
async function openingField(page, key, v) { const f = page.locator(`#stepContent input[data-opening-field="${key}"]`); await f.fill(v); await f.dispatchEvent('change'); await page.waitForTimeout(200); }
async function toHouse(page, design) { await openDeckFile(page, design); await stepBtn(page, 'House').click(); }
async function openingScreen(page, o, along = 0) { const e = (await edgesOf(page))[o.edge]; const x = e.mid[0] + e.t[0] * (o.offset + along) + e.n[0] * 0.12, z = e.mid[1] + e.t[1] * (o.offset + along) + e.n[1] * 0.12; return page.evaluate(([x, z]) => window.AOSDeckStudioTest.toScreen(x, z), [x, z]); }
const RECT_HOUSE = { shape: 'rectangle', width: 20, depth: 14, height: 4, houseEdges: [0] };

test('B1: add a door, patio door and window; presets, typed sizes and limits; drag along the wall; delete; Undo/Redo; save/reopen; 3D', async () => {
  const { ctx, page, errors } = await openApp();
  await toHouse(page, { ...RECT_HOUSE, width: 28 });
  assert.match(await housePanel(page), /DOORS & WINDOWS[\s\S]*none yet/);
  await page.locator('#stepContent [data-action="opening-add"][data-value="door"]').click();
  assert.match(await toastText(page), /Door added to the top wall/);
  await page.locator('#stepContent [data-action="opening-add"][data-value="patio"]').click();
  await page.locator('#stepContent [data-action="opening-add"][data-value="window"]').click();
  let o = await openingsOf(page);
  assert.equal(o.length, 3); assert.ok(o.every(x => x.status === 'ok' && x.edge === 0), 'all placed on the house wall without overlapping');
  assert.match(await housePanel(page), /Window 3 of 3 · top wall/);
  // Preset and typed sizes, with limits explained.
  await page.locator('#stepContent select[data-opening-preset]').selectOption('24x36');
  assert.match(await toastText(page), /Window set to 24″ × 36″/);
  await openingField(page, 'sill', `5' 6"`);
  assert.match(await toastText(page), /top of a window can be at most 8′ 0″ above the deck/);
  await openingField(page, 'width', `9' 0"`);
  assert.match(await toastText(page), /Window width must be from 1′ 0″ to 8′ 0″/);
  await openingField(page, 'sill', `3' 6"`);
  o = await openingsOf(page); assert.equal(o[2].sill, 3.5); assert.equal(o[2].width, 2);
  // Too wide for the room left on the wall: refused with the reason.
  await page.locator('#stepContent [data-action="opening-prev"]').click(); // patio door
  await openingField(page, 'width', `12' 0"`);
  assert.match(await toastText(page), /overlap another opening on the top wall|doesn't fit/);
  // Type change keeps it on the wall.
  await page.locator('#stepContent [data-action="opening-type"][data-value="window"]').click();
  assert.match(await toastText(page), /Changed to a window/);
  await page.locator('#undoBtn').click(); await page.waitForTimeout(200);
  o = await openingsOf(page); assert.equal(o[1].type, 'patio', 'Undo restores the patio door');
  await page.locator('#redoBtn').click(); await page.waitForTimeout(200);
  assert.equal((await openingsOf(page))[1].type, 'window', 'Redo');
  await page.locator('#undoBtn').click(); await page.waitForTimeout(200);
  // Drag the door 2 ft along the wall in 2D.
  o = await openingsOf(page);
  // Drag the opening with the most room 2 ft toward its free side (the others are in the way otherwise).
  const roomFor = (k, dir) => Math.min(14 - 0.25 - o[k].width / 2 - dir * o[k].offset, ...o.filter((x, j) => j !== k && dir * (x.offset - o[k].offset) > 0).map(x => dir * (x.offset - o[k].offset) - (x.width + o[k].width) / 2 - 1 / 3));
  const pick = [0, 1, 2].flatMap(k => [1, -1].map(dir => ({ k, dir, r: roomFor(k, dir) }))).sort((x, y) => y.r - x.r)[0];
  assert.ok(pick.r >= 2, 'room to drag 2 ft');
  const d0 = o[pick.k], dir = pick.dir;
  const [sx, sy] = await openingScreen(page, d0), [tx, ty] = await openingScreen(page, d0, 2 * dir);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
  const d1 = (await openingsOf(page))[pick.k];
  assert.ok(Math.abs(d1.offset - d0.offset - 2 * dir) < 0.2, `dragged ${d1.offset - d0.offset} ft`);
  assert.equal((await openingsOf(page)).length, 3, 'tapping an opening does not toggle the house wall');
  assert.deepEqual((await page.evaluate(() => window.AOSDeckStudioTest.edges())).length, 4);
  // 3D draws them, cut into the wall.
  await page.locator('#mode3d').click(); await page.waitForTimeout(600);
  const sc = await scene3d(page);
  assert.ok(sc.parts.some(p => p.kind === 'door-slab') && sc.parts.filter(p => p.kind === 'opening-glass').length >= 3);
  fs.writeFileSync(path.join(SHOTS, 'b1-openings-3d.png'), await page.locator('#glCanvas').screenshot());
  await page.locator('#mode2d').click();
  // Save / reopen.
  const { fresh, data } = await reopen(page, ctx);
  assert.equal(data.design.openings.length, 3);
  assert.deepEqual((await openingsOf(fresh.page)).map(x => [x.type, x.status]), [['door', 'ok'], ['patio', 'ok'], ['window', 'ok']]);
  // Delete, then Undo brings it back.
  await stepBtn(page, 'House').click();
  await page.locator('#stepContent [data-action="opening-remove"]').click();
  assert.match(await toastText(page), /deleted\. Undo restores it/);
  assert.equal((await openingsOf(page)).length, 2);
  await page.locator('#undoBtn').click(); await page.waitForTimeout(200);
  assert.equal((await openingsOf(page)).length, 3);
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('B1: several house walls (L-shape): choose the wall, move an opening between walls, overlap and fit refused', async () => {
  const { ctx, page, errors } = await openApp();
  await toHouse(page, { shape: 'L', width: 24, depth: 18, height: 5, houseEdges: [0, 3] });
  const walls = await page.locator('#stepContent [data-action="opening-wall"]').allInnerTexts();
  assert.deepEqual(walls, ['Top wall', 'Left wall']);
  await page.locator('#stepContent [data-action="opening-wall"][data-value="3"]').click();
  await page.locator('#stepContent [data-action="opening-add"][data-value="door"]').click();
  assert.match(await toastText(page), /Door added to the left wall/);
  // The 7′ 7″ wall has no room for a 3 ft window beside the door.
  await page.locator('#stepContent [data-action="opening-add"][data-value="window"]').click();
  assert.match(await toastText(page), /No room on the left wall for a 3′ 0″ wide window/);
  // Move the door to the top wall; then a 6 ft patio door fits on the left wall.
  await page.locator('#stepContent [data-action="opening-move-wall"][data-value="0"]').click();
  assert.match(await toastText(page), /Moved to the top wall/);
  await page.locator('#stepContent [data-action="opening-add"][data-value="patio"]').click();
  assert.match(await toastText(page), /Patio door added to the left wall/);
  const o = await openingsOf(page);
  assert.deepEqual(o.map(x => [x.type, x.edge, x.status]), [['door', 0, 'ok'], ['patio', 3, 'ok']]);
  await page.locator('#stepContent [data-action="opening-prev"]').click(); // the door, now on the top wall
  // Position typed past the end of the wall is refused.
  await openingField(page, 'offset', `11' 0"`);
  assert.match(await toastText(page), /doesn't fit: the top wall is 24′ 0″ long/);
  await page.locator('#mode3d').click(); await page.waitForTimeout(600);
  fs.writeFileSync(path.join(SHOTS, 'b1-L-two-walls.png'), await page.locator('#glCanvas').screenshot());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('B1: openings stay on their walls through size changes, shape changes, wall toggles and save/reopen; a hand-drawn outline keeps them hidden', async () => {
  const { ctx, page, errors } = await openApp();
  await toHouse(page, { ...RECT_HOUSE, houseEdges: [0, 1], openings: [{ id: 'a', type: 'door', edge: 0, offset: -5, width: 3, height: 80 / 12 }, { id: 'b', type: 'window', edge: 1, offset: 1, width: 3, height: 4, sill: 3 }] });
  // Deck wider: both stay on their walls.
  await stepBtn(page, 'Shape').click();
  const w = page.locator('#stepContent input[data-field="width"]'); await w.fill('26'); await w.dispatchEvent('change'); await page.waitForTimeout(300);
  let o = await openingsOf(page);
  assert.deepEqual(o.map(x => [x.id, x.edge, x.offset, x.status]), [['a', 0, -5, 'ok'], ['b', 1, 1, 'ok']]);
  // Narrow deck: the door no longer fits, so it is hidden (kept) and the panel says why.
  await w.fill('8'); await w.dispatchEvent('change'); await page.waitForTimeout(300);
  o = await openingsOf(page); assert.equal(o[0].status, 'off-wall');
  await stepBtn(page, 'House').click();
  await page.locator('#stepContent [data-action="opening-prev"]').click();
  assert.match(await housePanel(page), /Hidden: It no longer fits on its wall/);
  await page.locator('#undoBtn').click(); await page.waitForTimeout(300);
  assert.equal((await openingsOf(page))[0].status, 'ok', 'Undo restores the width and the door');
  // Change shape: rectangle -> L. Walls keep their sides and openings follow.
  await changeShape(page, 'L');
  o = await openingsOf(page);
  assert.ok(o.every(x => x.status === 'ok'), JSON.stringify(o));
  const es = await edgesOf(page);
  assert.deepEqual(o.map(x => es[x.edge].n.map(Math.round)), [[0, -1], [1, 0]], 'door on the top wall, window on the right wall');
  // Removing a house wall hides its openings (kept); adding it back shows them again.
  await stepBtn(page, 'House').click();
  const right = o[1].edge, re = es[right], tapWall = () => tapPlan(page, re.mid[0] - re.t[0] * 3 + re.n[0] * 0.1, re.mid[1] - re.t[1] * 3 + re.n[1] * 0.1);
  await tapWall();
  assert.match(await toastText(page), /House wall removed\. Its 1 door\/window is kept but hidden/);
  assert.equal((await openingsOf(page))[1].status, 'not-house-wall');
  await tapWall();
  assert.equal((await openingsOf(page))[1].status, 'ok');
  const { fresh } = await reopen(page, ctx);
  assert.ok((await openingsOf(fresh.page)).every(x => x.status === 'ok'));
  // Redrawing the outline by hand: walls must be chosen again, so the openings are kept but hidden.
  await stepBtn(fresh.page, 'Shape').click();
  await fresh.page.locator('[data-action="choose-shape"]').click();
  await fresh.page.locator('#shapeOverlay [data-shape="free"]').click();
  assert.match(await fresh.page.locator('#dividerConfirm').innerText(), /doors and windows \(hidden until you place them on a house wall\)/);
  await fresh.page.locator('#dividerConfirmAccept').click();
  const box = await fresh.page.locator('#planCanvas').boundingBox(), sc = Math.min(Math.max(Math.min((box.width - 90) / 24, (box.height - 90) / 18), 7), 23);
  const at = (fx, fz) => fresh.page.mouse.click(box.x + box.width / 2 - 8 * sc + fx * sc, box.y + box.height / 2 - 6 * sc + fz * sc);
  await at(0, 0); await at(16, 0); await at(16, 12); await at(0, 12); await at(0.3, 0.3);
  if (await fresh.page.locator('#dividerConfirmAccept').isVisible()) await fresh.page.locator('#dividerConfirmAccept').click();
  await fresh.page.waitForFunction(hasArea);
  const hidden = await openingsOf(fresh.page);
  assert.equal(hidden.length, 2); assert.ok(hidden.every(x => x.status === 'no-wall'), JSON.stringify(hidden));
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('B1: phone-size screen: the controls fit and an opening can be added, selected in 2D and resized', async () => {
  const { ctx, page, errors } = await openApp({ width: 390, height: 844 });
  const file = path.join(os.tmpdir(), `aos-b1-${Date.now()}.json`); fs.writeFileSync(file, JSON.stringify({ design: { ...RECT_HOUSE, openings: [{ id: 'a', type: 'door', edge: 0, offset: -5, width: 3, height: 80 / 12 }] } }));
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(() => window.AOSDeckStudioTest?.framingStatus() === 'current');
  await stepBtn(page, 'House').click();
  await page.locator('#stepContent [data-action="opening-add"][data-value="window"]').click();
  for (const sel of ['[data-action="opening-add"]', '[data-action="opening-type"]', 'input[data-opening-field]', '[data-action="opening-remove"]']) {
    const els = page.locator(`#stepContent ${sel}`);
    for (let i = 0; i < await els.count(); i++) { await els.nth(i).scrollIntoViewIfNeeded(); const b = await els.nth(i).boundingBox(); assert.ok(b.height >= 30 && b.x >= 0 && b.x + b.width <= 390, `${sel} ${i} fits a phone`); }
  }
  // Tap the door in the plan to select it.
  const [x, y] = await openingScreen(page, (await openingsOf(page))[0]);
  await page.mouse.click(x, y); await page.waitForTimeout(200);
  assert.match(await housePanel(page), /Door 1 of 2/);
  await openingField(page, 'width', `2' 8"`);
  assert.ok(Math.abs((await openingsOf(page))[0].width - 32 / 12) < 1e-3);
  assert.equal((await page.evaluate(() => window.AOSDeckStudioTest.edges())).length, 4);
  fs.writeFileSync(path.join(SHOTS, 'b1-phone.png'), await page.screenshot());
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.2 Group B — B2: decking layout and appearance ----
const deckingOf = (page) => page.evaluate(() => window.AOSDeckStudioTest.decking());
async function toLayout(page, design, tab) { await openDeckFile(page, design); await stepBtn(page, 'Layout').click(); if (tab) await page.locator(`#stepContent [data-path="layoutTab"][data-value="${tab}"]`).click(); }
const B2_DECK = { shape: 'rectangle', width: 20, depth: 14, height: 4, houseEdges: [0], borderCount: 1 };

test('B2: four labelled directions; diagonal left and right are mirror images in 2D and 3D; Undo/Redo; save/reopen', async () => {
  const { ctx, page, errors } = await openApp();
  await toLayout(page, B2_DECK);
  const labels = await page.locator('#stepContent [data-path="deckLine"]').allInnerTexts();
  assert.deepEqual(labels.map(t => t.replace(/^\W+\s*/, '').trim()), ['Horizontal', 'Vertical', 'Diagonal left', 'Diagonal right']);
  const axes = {};
  for (const dl of ['horizontal', 'vertical', 'diagonal-left', 'diagonal-right']) {
    await page.locator(`#stepContent [data-path="deckLine"][data-value="${dl}"]`).click(); await page.waitForTimeout(300);
    assert.equal(await page.locator(`#stepContent [data-path="deckLine"][aria-pressed="true"]`).getAttribute('data-value'), dl);
    const dk = await deckingOf(page); axes[dl] = dk.plan.axis;
    assert.equal(dk.plan.direction, dl);
    fs.writeFileSync(path.join(SHOTS, `b2-${dl}-2d.png`), await page.locator('#planCanvas').screenshot());
  }
  const [l, r] = [axes['diagonal-left'], axes['diagonal-right']];
  assert.ok(l[0] * l[1] > 0 && r[0] * r[1] < 0 && Math.abs(l[1] - -r[1]) < 1e-9 || Math.abs(l[0] + r[0]) < 1e-9, 'mirror images');
  assert.match(await page.locator('#stepContent').innerText(), /Diagonal right: boards run at 45° like ⟋/);
  // 3D draws the same boards.
  await page.locator('#mode3d').click(); await page.waitForTimeout(600);
  let dk = await deckingOf(page);
  assert.equal(dk.view3d.direction, 'diagonal-right'); assert.equal(dk.view3d.finish, dk.plan.finish);
  fs.writeFileSync(path.join(SHOTS, 'b2-diagonal-right-3d.png'), await page.locator('#glCanvas').screenshot());
  await page.locator('#mode2d').click();
  await page.locator('#undoBtn').click(); await page.waitForTimeout(300);
  assert.equal((await deckingOf(page)).plan.direction, 'diagonal-left', 'Undo');
  await page.locator('#redoBtn').click(); await page.waitForTimeout(300);
  assert.equal((await deckingOf(page)).plan.direction, 'diagonal-right', 'Redo');
  const { fresh, data } = await reopen(page, ctx);
  assert.equal(data.design.deckLine, 'diagonal-right');
  assert.equal((await deckingOf(fresh.page)).plan.direction, 'diagonal-right');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('B2: an older project with the single diagonal opens unchanged and shows which diagonal it is', async () => {
  const { ctx, page, errors } = await openApp();
  await toLayout(page, { ...B2_DECK, deckLine: 'diagonal' });
  const dk = await deckingOf(page);
  assert.ok(['diagonal-left', 'diagonal-right'].includes(dk.plan.direction));
  assert.equal(await page.locator('#stepContent [data-path="deckLine"][aria-pressed="true"]').getAttribute('data-value'), dk.plan.direction);
  const { data } = await saveFile(page);
  assert.equal(data.design.deckLine, 'diagonal', 'saved back as it was until the owner picks a direction');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('B2: picture frame none/single/double, house walls excluded unless switched on; take-off in Review', async () => {
  const { ctx, page, errors } = await openApp();
  await toLayout(page, { ...B2_DECK, deckLine: 'diagonal-left' }, 'border');
  let m = (await deckingOf(page)).plan.materials.decking;
  assert.equal(m.pictureFrame.pieces, 3, 'single frame on the three open edges');
  assert.match(await page.locator('#stepContent').innerText(), /Along house walls/i);
  await page.locator('#stepContent [data-path="frameHouseWalls"][data-value="true"]').click(); await page.waitForTimeout(300);
  m = (await deckingOf(page)).plan.materials.decking;
  assert.equal(m.pictureFrame.pieces, 4); assert.equal(m.pictureFrame.houseWalls, true);
  await page.locator('#stepContent [data-path="borderCount"][data-value="2"]').click(); await page.waitForTimeout(300);
  m = (await deckingOf(page)).plan.materials.decking;
  assert.equal(m.pictureFrame.pieces, 8, 'double frame on all four edges');
  assert.ok((await deckingOf(page)).plan.materials.supplementalBlocking.fieldEndBlocks > 0, 'diagonal boards: blocking under field ends');
  fs.writeFileSync(path.join(SHOTS, 'b2-double-frame-house-2d.png'), await page.locator('#planCanvas').screenshot());
  await page.locator('#mode3d').click(); await page.waitForTimeout(500);
  await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
  assert.ok((await deckingOf(page)).view3d.blocks > 0, 'blocking drawn in framing-only 3D');
  fs.writeFileSync(path.join(SHOTS, 'b2-blocking-framing.png'), await page.locator('#glCanvas').screenshot());
  await page.locator('#structureToggle').click(); await page.locator('#mode2d').click();
  await stepBtn(page, 'Review').click();
  assert.match(await page.locator('#stepContent').innerText(), /Decking \(diagonal left\): field \d+ LF in \d+ pieces .*order \d+ LF with 15% waste\); picture frame \d+ LF, 8 boards .*supplemental blocks under field-board ends \(concept\)/);
  const { fresh, data } = await reopen(page, ctx);
  assert.equal(data.design.frameHouseWalls, true); assert.equal(data.design.borderCount, 2);
  assert.equal((await deckingOf(fresh.page)).plan.materials.decking.pictureFrame.pieces, 8);
  await stepBtn(page, 'Layout').click(); await page.locator('#stepContent [data-path="layoutTab"][data-value="border"]').click();
  await page.locator('#stepContent [data-path="frameHouseWalls"][data-value="false"]').click(); await page.waitForTimeout(300);
  const { data: d2 } = await saveFile(page);
  assert.equal('frameHouseWalls' in d2.design, false, 'switched off: not written');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});

test('B2: dividers are kept (never silently removed) through size and direction changes, with an explanation', async () => {
  const { ctx, page, errors } = await openApp();
  await toLayout(page, { ...B2_DECK, width: 44, dividerMode: 'single', dividerPositions: [0.45, 0.55] }, 'border');
  assert.match(await page.locator('#stepContent').innerText(), /Longest field-board run without a divider: \d+′/);
  assert.equal((await deckingOf(page)).plan.dividers, 2);
  // Narrow the deck: the two dividers (now 9.6 in. apart) are too close together; one is set aside, not deleted.
  await stepBtn(page, 'Shape').click();
  const w = page.locator('#stepContent input[data-field="width"]'); await w.fill('8'); await w.dispatchEvent('change'); await page.waitForTimeout(2800);
  assert.match(await toastText(page), /Dividers adjusted for this size\/direction: 1 set aside \(kept, restored when there is room\)/);
  assert.equal((await deckingOf(page)).plan.dividers, 1);
  await w.fill('44'); await w.dispatchEvent('change'); await page.waitForTimeout(300);
  assert.equal((await deckingOf(page)).plan.dividers, 2, 'restored');
  for (const dl of ['vertical', 'diagonal-right']) {
    await stepBtn(page, 'Layout').click(); await page.locator('#stepContent [data-path="layoutTab"][data-value="direction"]').click();
    await page.locator(`#stepContent [data-path="deckLine"][data-value="${dl}"]`).click(); await page.waitForTimeout(300);
    const { data } = await saveFile(page);
    assert.deepEqual(data.design.dividerPositions, [0.45, 0.55], `${dl}: the saved dividers are unchanged`);
  }
  await page.locator('#stepContent [data-path="layoutTab"][data-value="border"]').click();
  fs.writeFileSync(path.join(SHOTS, 'b2-dividers-diagonal-2d.png'), await page.locator('#planCanvas').screenshot());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('B2: a landing on Match main deck follows diagonal left and right; an independent one stays put', async () => {
  const { ctx, page, errors } = await openApp();
  await toLayout(page, { ...B2_DECK, height: 7, staircases: [
    { id: 'a', edge: 2, width: 4, offset: -5, rails: { left: true, right: true }, landing: { width: 6, depth: 5, elevation: 3.5 } },
    { id: 'b', edge: 2, width: 4, offset: 5, rails: { left: true, right: true }, landing: { width: 6, depth: 5, elevation: 3.5, deckLine: 'vertical' } }] });
  for (const dl of ['diagonal-left', 'diagonal-right']) {
    await page.locator(`#stepContent [data-path="deckLine"][data-value="${dl}"]`).click(); await page.waitForTimeout(300);
    await stepBtn(page, 'Stairs').click();
    assert.match(await page.locator('#stepContent').innerText(), new RegExp(`Follows the main deck's board direction \\(now ${dl.replace('-', ' ')}\\)`));
    await page.locator('#stepContent [data-action="stair-next"]').click();
    assert.equal(await page.locator('#stepContent [data-action="landing-deckline"][aria-pressed="true"]').getAttribute('data-value'), 'vertical');
    await page.locator('#stepContent [data-action="stair-prev"]').click();
    await stepBtn(page, 'Layout').click();
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- V5.2 B2 owner finding #1: flat-laid 2x6 under the landing picture frame ----
test('B2 fix: framing-only 3D draws the landing flat 2x6 runs; they follow the frame choice; listed in Review', async () => {
  const { ctx, page, errors } = await openApp();
  await toLayout(page, { ...B2_DECK, height: 7, borderCount: 1, staircases: [{ id: 'a', edge: 2, width: 4, offset: 0, rails: { left: true, right: true }, landing: { width: 6, depth: 5, elevation: 3.5, turn: 'left' } }] }, 'border');
  await page.locator('#mode3d').click(); await page.waitForTimeout(500);
  const flats = async () => (await scene3d(page)).parts.filter(p => p.kind === 'landing-flat-2x6');
  let f = await flats();
  assert.equal(f.length, 2, 'single frame: a flat 2x6 on each side running with the joists');
  assert.ok(f.every(p => Math.abs(p.d - 5.5 / 12) < 1e-9 && Math.abs(p.h - 1.5 / 12) < 1e-9 && p.group === 'stair-framing'), 'laid flat');
  fs.writeFileSync(path.join(SHOTS, 'b2fix-landing-finished.png'), await page.locator('#glCanvas').screenshot());
  await page.locator('#structureToggle').click(); await page.waitForTimeout(400);
  assert.equal((await scene3d(page)).showStructure, true);
  fs.writeFileSync(path.join(SHOTS, 'b2fix-landing-framing.png'), await page.locator('#glCanvas').screenshot());
  await page.locator('#structureToggle').click(); await page.locator('#mode2d').click();
  await page.locator('#stepContent [data-path="borderCount"][data-value="2"]').click(); await page.waitForTimeout(400);
  assert.equal((await flats()).length, 4, 'double frame: two per side');
  await page.locator('#stepContent [data-path="borderCount"][data-value="0"]').click(); await page.waitForTimeout(400);
  assert.equal((await flats()).length, 0, 'no frame: none');
  await page.locator('#undoBtn').click(); await page.waitForTimeout(400);
  assert.equal((await flats()).length, 4, 'Undo');
  await stepBtn(page, 'Review').click();
  assert.match(await page.locator('#stepContent').innerText(), /framing members \(concept, not approved\), plus 4 flat 2×6 runs \([\d.]+ LF\)/);
  const { fresh } = await reopen(page, ctx);
  await fresh.page.locator('#mode3d').click(); await fresh.page.waitForTimeout(400);
  assert.equal((await scene3d(fresh.page)).parts.filter(p => p.kind === 'landing-flat-2x6').length, 4, 'reopened');
  assert.deepEqual(errors, []); assert.deepEqual(fresh.errors, []);
  await fresh.ctx.close(); await ctx.close();
});
