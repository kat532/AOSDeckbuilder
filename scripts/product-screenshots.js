#!/usr/bin/env node
// Before/after 3D screenshots for the product-library integration (review aid; not a test).
//   CHROME_PATH=... node scripts/product-screenshots.js <before.html> <after.html> <outdir>
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { loadEngine } = require('../tests/engine');
const { designs } = require('../tests/baseline/designs');
const [before, after, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const BASE = designs(loadEngine())['multi-stair'];
const V = '2026-11-11.1';
const deck = (brandId, lineId, colorId, frame) => ({ libraryVersion: V, brandId, lineId, colorId, ...(frame ? { frameColorId: frame } : {}) });
const rail = (brandId, systemId, modelId, finishId, extra = {}) => ({ libraryVersion: V, brandId, systemId, modelId, finishId, edges: {}, stairs: {}, ...extra });
const COMBOS = [
  ['1-trex-spiced-rum-westbury-black', deck('trex', 'trex-transcend', 'trex-transcend--spiced-rum', 'trex-transcend--tiki-torch'), null],
  ['2-tt-vintage-coastline-westbury-bronze', deck('timbertech', 'timbertech-vintage', 'timbertech-vintage--coastline', 'timbertech-vintage--english-walnut'), rail('westbury', 'westbury-tuscany', 'westbury-tuscany--c10', 'westbury--bronze-fine-texture')],
  ['3-tt-legacy-pecan-rdi-avalon-black', deck('timbertech', 'timbertech-legacy', 'timbertech-legacy--pecan', 'timbertech-legacy--espresso'), rail('rdi-railing', 'rdi-avalon', 'rdi-avalon--square-balusters', 'rdi--matte-black')],
  ['4-ms-meridian-citadel-westbury-white', deck('moistureshield', 'moistureshield-meridian', 'moistureshield-meridian--citadel', 'moistureshield-meridian--mariner'), rail('westbury', 'westbury-tuscany', 'westbury-tuscany--c10', 'westbury--white-fine-texture')],
  ['5-deckorators-voyage-costa-rdi-bronze', deck('deckorators', 'deckorators-voyage', 'deckorators-voyage--costa', 'deckorators-voyage--khaya'), rail('rdi-railing', 'rdi-avalon', 'rdi-avalon--square-balusters', 'rdi--matte-bronze')],
  ['6-brown-treated-aos-wood', deck('treated-wood', 'aos-treated-brown', 'aos-treated-brown--brown-treated'), rail('aos-wood-railing', 'aos-wood-railing', 'aos-wood-railing--ttop-alum', 'aos-wood--brown-treated', { mounting: 'in-deck' })],
];
async function shot(browser, html, design, file) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(html)).href);
  await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  const f = path.join(os.tmpdir(), `aos-shot-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f);
  await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current');
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await page.locator('#mode3d').click(); await page.waitForTimeout(900);
  await page.locator('#viewport').screenshot({ path: file });
  await ctx.close();
  if (errors.length) console.log(file, errors);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await shot(browser, before, BASE, path.join(out, '0-before-original-beta-concept.png'));
  for (const [name, d, r] of COMBOS) {
    const design = { ...structuredClone(BASE), catalogDecking: d };
    if (r) design.catalogRailing = r;
    await shot(browser, after, design, path.join(out, `${name}.png`));
  }
  await browser.close();
  console.log('screenshots written to', out);
})();
