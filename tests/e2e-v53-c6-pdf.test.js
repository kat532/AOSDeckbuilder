'use strict';
// V5.3 C6: the C4 customer PDF is unchanged by C6 — for identical designs, the C6 build produces the same
// document (text, image bytes and checks) as the protected C5 build; and C5-era schema 6 files open unchanged.
const test = require('node:test');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const H = require('./c6-helpers');
const { assert, fs, os, path, ROOT, ALL, openDesign, step, intent } = H;
const { CENSUS_DESIGN } = require('./ui-census');
const h = H.harness(test);
const C5_HTML = path.join(os.tmpdir(), `aos-c6-c5-${process.pid}.html`), C5_APP = pathToFileURL(C5_HTML).href;
test.before(() => fs.writeFileSync(C5_HTML, execFileSync('git', ['show', 'checkpoint/v5.3-c5:index.html'], { cwd: ROOT })));
test.after(() => fs.rmSync(C5_HTML, { force: true }));

async function pdfOf(app, design) {
  const { ctx, page, errors } = await h.newPage(H.VIEWPORTS.desktop);
  if (app) { await page.goto(app); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest); }
  await openDesign(page, design); await step(page, 7);
  await page.locator('#stepContent [data-action="pdf-preview"]').click(); await page.waitForFunction(() => !document.getElementById('pdfDownloadBtn').disabled, null, { timeout: 60000 });
  const d = (await page.evaluate(() => window.AOSDeckStudioTest.pdf())).doc; assert.deepEqual(errors, []); await ctx.close();
  return { pages: d.pages.map(p => ({ texts: p.texts, images: p.images })), images: Object.fromEntries(Object.entries(d.images).map(([k, v]) => [k, crypto.createHash('sha256').update(v.url).digest('hex')])), checks: d.checks };
}
const DESIGNS = {
  census: CENSUS_DESIGN,
  'patio, walkway, landing, openings': ALL['b3-showcase'],
  'L, double frame, dividers, diagonal': ALL['b2-diagonal-double-frame-dividers'],
  'custom railing finish': ALL['rails-custom-finish'],
};
for (const [name, design] of Object.entries(DESIGNS)) {
  test(`C6 customer PDF identical to the C5 build: ${name}`, async () => {
    const c6 = await pdfOf(null, design), c5 = await pdfOf(C5_APP, design);
    assert.deepEqual(c6, c5);
  });
}

test('C6 a design file saved by the C5 build (schema 6) opens in C6 with the identical design', async () => {
  const p5 = await h.newPage(); await p5.page.goto(C5_APP); await p5.page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  await openDesign(p5.page, ALL['b3-showcase']);
  const { file, data } = await H.saveFile(p5.page); assert.equal(data.schemaVersion, 6); await p5.ctx.close();
  const r = await H.reopen(h, file);
  assert.deepEqual(await intent(r.page), JSON.parse(JSON.stringify(data.design)));
  const again = await H.saveFile(r.page);
  for (const k of ['design', 'componentModel', 'counts', 'alerts']) assert.deepEqual(again.data[k], data[k], `C6 re-save unchanged: ${k}`);
  assert.deepEqual(r.errors, []); await r.ctx.close();
});
