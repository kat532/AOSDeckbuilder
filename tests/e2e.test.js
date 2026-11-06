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
    await page.waitForTimeout(200);
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
