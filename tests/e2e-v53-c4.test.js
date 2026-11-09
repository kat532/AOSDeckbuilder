// V5.3 C4 (owner authorization 8 Nov 2026): customer PDF and in-app preview.
// The preview and the downloaded PDF are both drawn from one document description. These tests read
// the downloaded file with an independent reader (tests/pdf-inspect.js) and, where installed, with
// qpdf / pdftotext / pdftoppm, and compare it with what the preview shows.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { CENSUS_DESIGN } = require('./ui-census');
const { loadEngine } = require('./engine');
const { designs } = require('./baseline/designs');
const { inspectPdf, readPgm } = require('./pdf-inspect');

const ROOT = path.join(__dirname, '..');
const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(ROOT, 'test-results', 'screenshots'), PDFS = path.join(ROOT, 'test-results', 'pdf');
const ALL = designs(loadEngine());
const has = (cmd) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
const TOOLS = { qpdf: has('qpdf'), pdftotext: has('pdftotext'), pdftoppm: has('pdftoppm') };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const NB = ' ';
// The app's feet-inches format as the PDF prints it: 12' 6" (no-break space).
const ftin = (v) => { const a = Math.abs(v); let f = Math.floor(a + 1e-5), i = Math.round((a - f) * 12); if (i >= 12) { f++; i = 0; } return `${v < 0 ? '-' : ''}${f}'${NB}${i}"`; };

const SAMPLES = {
  'basic-rectangle': { ...ALL['default-rect-16x12'], project: 'Basic rectangle deck' },
  'L-shape-with-stairs': { ...ALL['L-24x18'], project: 'L-shaped deck with stairs', staircases: [{ id: 'a', edge: 2, width: 4, offset: 0, rails: { left: true, right: true } }, { id: 'b', edge: 3, width: 5, offset: 0, landing: { width: 6, depth: 5, elevation: 2, turn: 'left' }, rails: { left: true, right: true } }] },
  'angled-custom': { ...ALL['free-hexagon'], project: 'Angled custom deck' },
  'patio-walkway': { ...CENSUS_DESIGN, project: 'Deck with patio and walkway' },
};

let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(PDFS, { recursive: true }); });
test.after(async () => { await browser?.close(); });
async function newPage(viewport = { width: 1440, height: 900 }, init) {
  const touch = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: touch, isMobile: touch }); if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  return { ctx, page, errors, press: (loc) => (touch ? loc.tap() : loc.click()), touch };
}
async function openDesign(page, design) {
  const f = path.join(os.tmpdir(), `aos-c4-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
}
async function download(page, run) { const [d] = await Promise.all([page.waitForEvent('download'), run()]); const f = path.join(os.tmpdir(), `aos-c4-dl-${Date.now()}-${Math.random().toString(36).slice(2)}`); await d.saveAs(f); return { name: d.suggestedFilename(), buf: fs.readFileSync(f), file: f }; }
const step = async (page, id) => { await page.locator(`#stepdots [data-step="${id}"]`).click(); await page.waitForTimeout(250); };
const pdfInfo = (page) => page.evaluate(() => window.AOSDeckStudioTest.pdf());
const ready = (page) => page.waitForFunction(() => !document.getElementById('pdfDownloadBtn').disabled || !!document.querySelector('.pdf-problem'), null, { timeout: 60000 });
async function openPreview(page, press = (l) => l.click()) { const b = page.locator('#stepContent [data-action="pdf-preview"]'); await b.scrollIntoViewIfNeeded(); await press(b); await ready(page); return pdfInfo(page); }
const getPdf = (page) => download(page, () => page.locator('#pdfDownloadBtn').click());
const designFile = async (page) => JSON.parse((await download(page, async () => { const b = page.locator('#stepContent [data-action="download-json"]'); await b.scrollIntoViewIfNeeded(); await b.click(); })).buf.toString());
const editorState = (page) => page.evaluate(() => ({ camera: window.AOSDeckStudioTest.camera(), step: document.getElementById('stepTitle').textContent, mode: [...document.querySelectorAll('#stepContent [data-path="reviewMode"]')].find(b => b.classList.contains('selected'))?.dataset.value ?? null,
  dims: document.getElementById('measureBtn').innerText.trim(), undo: document.getElementById('undoBtn').disabled, redo: document.getElementById('redoBtn').disabled, plan2d: document.getElementById('planCanvas').classList.contains('visible'), scroll: document.getElementById('stepContent').scrollTop }));

test('C4 preview opens and closes on desktop, tablet and phone; pages fit the screen; Zoom, Escape and Close; Review is unchanged', async () => {
  for (const [vp, size] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]]) {
    const { ctx, page, errors, press } = await newPage(size);
    await openDesign(page, CENSUS_DESIGN); await step(page, 7);
    const btn = page.locator('#stepContent [data-action="pdf-preview"]'); assert.equal((await btn.innerText()).trim(), 'Preview customer PDF');
    await btn.scrollIntoViewIfNeeded(); const before = await editorState(page); // the Review panel scrolled to the button, as a person would
    const info = await openPreview(page, press);
    assert.equal(info.open, true); assert.equal(await page.locator('#pdfPreview').isVisible(), true);
    assert.equal(await page.locator('#pdfPreviewTitle').innerText(), 'Customer PDF preview');
    assert.equal(await page.locator('#pdfPages canvas.pdf-page').count(), info.doc.pages.length); assert.equal(info.doc.pages.length, 2);
    for (const b of ['#pdfDownloadBtn', '#pdfCloseBtn', '#pdfZoomBtn']) { const r = await page.locator(b).boundingBox(); assert.ok(r && r.x >= 0 && r.x + r.width <= size.width && r.y >= 0 && r.height >= 36, `${vp}: ${b} on screen and large enough`); }
    const fit = await page.evaluate(() => [...document.querySelectorAll('#pdfPages canvas')].map(c => { const r = c.getBoundingClientRect(); return [r.left, r.right, r.width / r.height]; }));
    for (const [l, r, a] of fit) { assert.ok(l >= 0 && r <= innerWidthOf(size) + 1, `${vp}: page fits the width`); assert.ok(Math.abs(a - 792 / 612) < .01, 'page proportions are US Letter landscape'); }
    await page.screenshot({ path: path.join(SHOTS, `c4-${vp}-pdf-preview.png`) });
    await page.evaluate(() => { document.getElementById('pdfPages').scrollTop = 1e6; }); await page.waitForTimeout(100);
    if (vp !== 'tablet') await page.screenshot({ path: path.join(SHOTS, `c4-${vp}-pdf-preview-page2.png`) });
    // Zoom in: wider pages scroll sideways inside the preview; Fit to screen again.
    await press(page.locator('#pdfZoomBtn')); assert.equal(await page.locator('#pdfZoomBtn').getAttribute('aria-pressed'), 'true');
    assert.ok(await page.evaluate(() => document.querySelector('#pdfPages canvas').getBoundingClientRect().width) >= 1099);
    if (vp === 'phone') await page.screenshot({ path: path.join(SHOTS, 'c4-phone-pdf-preview-zoomed.png') });
    await press(page.locator('#pdfZoomBtn')); assert.equal(await page.locator('#pdfZoomBtn').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, true, 'no page-level sideways scroll');
    // Close, then Escape.
    await press(page.locator('#pdfCloseBtn')); await page.waitForTimeout(150);
    assert.equal(await page.locator('#pdfPreview').isHidden(), true); assert.deepEqual(await editorState(page), before, `${vp}: Review exactly as before`);
    await openPreview(page, press); await page.keyboard.press('Escape'); await page.waitForTimeout(150); assert.equal(await page.locator('#pdfPreview').isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), 'pdf-preview', 'focus returns to the button that opened it');
    assert.deepEqual(await editorState(page), before);
    assert.deepEqual(errors, []); await ctx.close();
  }
});
function innerWidthOf(size) { return size.width; }

test('C4 Finish opens the preview; when the PDF cannot be made, Finish explains why (no download)', async () => {
  { const { ctx, page, errors } = await newPage(); await openDesign(page, CENSUS_DESIGN); await step(page, 7);
    assert.equal((await page.locator('#nextBtn').innerText()).replace(/\s+/g, ' ').trim(), 'Finish ✓');
    await page.locator('#nextBtn').click(); await ready(page);
    const info = await pdfInfo(page); assert.equal(info.open, true); assert.equal(info.doc.pages.length, 2); assert.equal(await page.locator('#pdfDownloadBtn').isEnabled(), true);
    await page.screenshot({ path: path.join(SHOTS, 'c4-desktop-finish-opens-preview.png') });
    assert.deepEqual(errors, []); await ctx.close(); }
  // A browser that cannot draw the finished 3D view: Finish says so instead of making an incomplete PDF.
  const { ctx, page } = await newPage(undefined, () => { const orig = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = function (t, q) { if (t === 'image/jpeg' && this.width === 1600) throw new Error('blocked for test'); return orig.call(this, t, q); }; });
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await page.locator('#nextBtn').click(); await ready(page);
  assert.equal(await page.locator('#pdfPreviewTitle').innerText(), 'Customer PDF not available');
  assert.match(await page.locator('#pdfPages .pdf-problem').innerText(), /finished 3D view could not be drawn/);
  assert.equal(await page.locator('#pdfDownloadBtn').isDisabled(), true); assert.equal(await page.locator('#pdfPages canvas').count(), 0);
  await page.screenshot({ path: path.join(SHOTS, 'c4-desktop-pdf-not-available.png') });
  await page.locator('#pdfCloseBtn').click(); assert.equal(await page.locator('#stepTitle').innerText(), 'Review & Present'); assert.equal(downloaded, false);
  await ctx.close();
});

for (const [name, design] of Object.entries(SAMPLES)) test(`C4 ${name}: the downloaded file is a valid, readable PDF whose text and images exactly match the preview; AOS branding and project name`, async (t) => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, design); await step(page, 7);
  const info = await openPreview(page), doc = info.doc;
  const dl = await getPdf(page); fs.copyFileSync(dl.file, path.join(PDFS, `${name}.pdf`));
  assert.match(dl.name, /_AOS_Deck_Concept\.pdf$/); assert.equal(dl.buf.subarray(0, 5).toString(), '%PDF-');
  const pdf = inspectPdf(dl.buf);
  assert.deepEqual(pdf.problems, [], 'PDF structure (header, xref, trailer, streams, %%EOF)');
  assert.equal(pdf.pages.length, doc.pages.length);
  for (const [i, pg] of pdf.pages.entries()) {
    assert.deepEqual(pg.mediaBox, [0, 0, 792, 612], 'US Letter landscape'); assert.deepEqual(pg.fonts, ['Helvetica', 'Helvetica-Bold'], 'standard fonts, nothing to download');
    assert.deepEqual(pg.texts, doc.pages[i].texts, `page ${i + 1}: same text, same order as the preview`);
    assert.deepEqual(pg.images.map(m => m.name.replace(/^Im/, '')), doc.pages[i].images.map(m => String(Object.keys(doc.images).indexOf(m.id) + 1)));
    for (const [k, im] of pg.images.entries()) { const want = doc.images[doc.pages[i].images[k].id], bytes = Buffer.from(want.url.split(',')[1], 'base64');
      assert.equal(sha(im.bytes), sha(bytes), `page ${i + 1}: image ${doc.pages[i].images[k].id} is byte-identical to the preview's`);
      assert.equal(im.filter, 'DCTDecode'); assert.deepEqual([im.w, im.h, im.jpeg.w, im.jpeg.h, im.jpeg.comps], [want.w, want.h, want.w, want.h, 3]); }
    // Branding and identification on every page.
    assert.ok(pg.images.length >= 1 && doc.pages[i].images[0].id === 'logo', 'AOS Home Solutions logo in the header'); assert.ok(pg.texts.includes(doc.project), 'project name');
    assert.ok(pg.texts.includes(`AOS Home Solutions · ${doc.project}`)); assert.ok(pg.texts.includes(`Page ${i + 1} of ${pdf.pages.length}`));
  }
  assert.equal(doc.project, design.project); assert.match(pdf.info, /\/Author \(AOS Home Solutions\)/); assert.match(pdf.info, new RegExp(`/Title \\(${design.project} - AOS deck design concept\\)`));
  assert.ok(pdf.pages[0].texts.includes('Deck Design Concept') && pdf.pages[1].texts.includes('Dimensioned Deck Plan'));
  assert.ok(pdf.pages[0].images.some(m => m.w === 1600 && m.h === 1000), 'finished 3D image, 1600×1000');
  assert.ok(dl.buf.length < 2.5e6, `reasonable size (${dl.buf.length} bytes)`);
  if (TOOLS.qpdf) assert.match(execFileSync('qpdf', ['--check', dl.file]).toString(), /No syntax or stream encoding errors found/);
  if (TOOLS.pdftotext) { const t = execFileSync('pdftotext', ['-layout', dl.file, '-']).toString(); assert.ok(t.includes(design.project) && t.includes('Deck Design Concept') && t.includes('Page 2 of 2'), 'pdftotext reads the text'); }
  if (TOOLS.pdftoppm) { const base = path.join(os.tmpdir(), `aos-c4-r-${process.pid}-${name}`); execFileSync('pdftoppm', ['-r', '24', '-gray', dl.file, base]);
    for (let i = 1; i <= pdf.pages.length; i++) { const f = fs.readdirSync(os.tmpdir()).find(x => x.startsWith(path.basename(base)) && x.endsWith(`-${i}.pgm`)), g = readPgm(fs.readFileSync(path.join(os.tmpdir(), f)));
      assert.equal(g.w, Math.round(792 * 24 / 72)); const px = [...g.px], mean = px.reduce((a, b) => a + b, 0) / px.length, sd = Math.sqrt(px.reduce((a, b) => a + (b - mean) ** 2, 0) / px.length);
      assert.ok(sd > 25, `page ${i} renders with content (pixel spread ${sd.toFixed(1)})`); } }
  if (!TOOLS.qpdf || !TOOLS.pdftotext || !TOOLS.pdftoppm) t.diagnostic(`external PDF tools missing: ${Object.entries(TOOLS).filter(([, v]) => !v).map(([k]) => k).join(', ')} (independent reader checks still ran)`);
  // Page 1 content: the four figures and the selections.
  const t1 = doc.pages[0].texts, saved = await (async () => { await page.locator('#pdfCloseBtn').click(); return designFile(page); })(), st = (await page.evaluate((d) => window.DeckCore.make(window.DeckCore.sanitize(d)).stats, saved.design));
  for (const k of ['deckArea', 'stairArea', 'totalArea', 'totalRailLF']) assert.ok(t1.includes(st[k].toFixed(1)), `page 1 shows ${k} ${st[k].toFixed(1)}`);
  for (const l of ['Deck sq ft', 'Stair sq ft', 'Total sq ft', 'Railing linear ft', 'YOUR SELECTIONS', 'DECKING', `${saved.design.collection} · ${saved.design.decking}`, 'RAILING']) assert.ok(t1.includes(l), `page 1: ${l}`);
  assert.match(t1.join(' '), /Preliminary design concept for discussion only\. This is not a construction drawing, an engineered plan or a price quote\./, 'disclaimer');
  assert.match(doc.pages[1].texts.join(' '), /Final site measurements and construction details must be verified by AOS Home Solutions before construction\./, 'plan verification note');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C4 the finished 3D image uses its own presentation camera: identical whatever view the editor shows, and the editor view comes back exactly', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  const img = async () => { const i = await openPreview(page); const u = i.doc.images.view3d; await page.locator('#pdfCloseBtn').click(); await page.waitForTimeout(100); return { sha: sha(Buffer.from(u.url.split(',')[1], 'base64')), camera: u.camera, w: u.w, h: u.h }; };
  const a = await img();
  // Change everything about the editor's 3D view: orbit, zoom, pan, framing view.
  const box = await page.locator('#glCanvas').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 220, cy - 80, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -400); await page.waitForTimeout(150);
  await page.locator('#structureToggle').click(); await page.waitForTimeout(200);
  const before = await editorState(page); assert.equal(before.camera.showStructure, true);
  const b = await img();
  assert.equal(b.sha, a.sha, 'same image regardless of the editor camera and framing view');
  assert.deepEqual([a.w, a.h], [1600, 1000]); assert.equal(a.camera.el, .48);
  assert.ok(Math.abs(a.camera.az - .56) < 1e-9, 'yard-side view of a house on the top edge (az 0.56 rad)');
  assert.deepEqual(await editorState(page), before, 'editor camera, framing view, dimensions setting and step restored');
  // Rendered from the yard side for a house on another edge too.
  await openDesign(page, { ...CENSUS_DESIGN, houseEdges: [1], openings: [], staircases: [] }); await step(page, 7);
  const c = await img(); assert.ok(Math.abs(c.camera.az - (Math.atan2(-1, 0) + .56)) < 1e-6, `house on the right edge: camera from the left (${c.camera.az})`);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C4 the PDF plan has its own dimensions: identical with Dims All or Off, any 2D zoom/pan, any open selection; the settings stay as they were', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, SAMPLES['L-shape-with-stairs']); await step(page, 7);
  const texts = async () => { const i = await openPreview(page); await page.locator('#pdfCloseBtn').click(); await page.waitForTimeout(100); return { t: i.doc.pages[1].texts, checks: i.doc.checks }; };
  const a = await texts();
  // Dims Off, a zoomed and panned 2D plan, an edge editor left open on Shape & Size.
  await step(page, 0); await page.locator('#mode2d').click();
  for (let k = 0; k < 4 && (await page.locator('#measureBtn').innerText()).trim() !== 'DIMS OFF'; k++) await page.locator('#measureBtn').click();
  assert.equal((await page.locator('#measureBtn').innerText()).trim(), 'DIMS OFF');
  await page.locator('#zoomIn').click(); await page.locator('#zoomIn').click();
  const p = await page.evaluate(() => { const e = window.AOSDeckStudioTest.edges()[1]; return window.AOSDeckStudioTest.toScreen(e.mid[0], e.mid[1]); }); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(200);
  assert.equal(await page.locator('#stepContent [data-action="done-edge"]').count(), 1);
  await step(page, 7); await page.locator('#stepContent [data-action="pdf-preview"]').scrollIntoViewIfNeeded(); const before = await editorState(page);
  const b = await texts();
  assert.deepEqual(b.t, a.t, 'plan page identical'); assert.deepEqual(b.checks, a.checks);
  assert.deepEqual(await editorState(page), before); assert.equal((await page.locator('#measureBtn').innerText()).trim(), 'DIMS OFF', 'the app keeps Dims Off');
  await step(page, 0); assert.equal(await page.locator('#stepContent [data-action="done-edge"]').count(), 1, 'the edge editor is still open');
  assert.deepEqual(errors, []); await ctx.close();
});

// Every perimeter edge, angled ones included, is dimensioned with its true length, or numbered and
// listed; labels never overlap and never leave the plan area. All 35 baseline designs plus samples.
const PLAN_DESIGNS = { ...Object.fromEntries(Object.entries(ALL)), ...Object.fromEntries(Object.entries(SAMPLES).map(([k, v]) => [`sample ${k}`, v])) };
test(`C4 every deck edge is dimensioned on the plan for all ${Object.keys(PLAN_DESIGNS).length} test designs (angled edges, L/T/U, bump-outs, multiple stairs, landings, patio, walkway); no clipped or overlapping labels`, async (t) => {
  const { ctx, page, errors } = await newPage();
  let tagged = 0, inside = 0;
  for (const [name, design] of Object.entries(PLAN_DESIGNS)) {
    await openDesign(page, design); await step(page, 7);
    const info = await openPreview(page); assert.ok(info.doc, `${name}: PDF available`);
    const edges = await page.evaluate(() => window.AOSDeckStudioTest.edges()), c = info.doc.checks, plan = info.doc.pages.slice(1).flatMap(p => p.texts);
    assert.equal(c.edges, edges.length); assert.equal(c.labels.length, edges.length, `${name}: one dimension per edge`);
    assert.deepEqual(c.labels.map(l => l.edge).sort((x, y) => x - y), edges.map(e => e.i), `${name}: every edge exactly once`);
    assert.equal(c.overlaps, 0, `${name}: no overlapping labels`); assert.equal(c.outside, 0, `${name}: no label outside the plan area`);
    for (const l of c.labels) { const e = edges[l.edge];
      if (l.tag) { tagged++; assert.ok(plan.includes(`Edge ${e.i + 1}: ${ftin(e.len)}`), `${name}: numbered edge ${e.i + 1} listed with its length`); }
      else { assert.equal(l.text, ftin(e.len), `${name}: edge ${e.i + 1} shows ${ftin(e.len)}`); assert.ok(plan.includes(ftin(e.len))); }
      if (l.side === 'inside') inside++; }
    for (const l of c.labels) for (const k of [l.box.x, l.box.y, l.box.w, l.box.h]) assert.ok(Number.isFinite(k));
    const q = info.doc; // stairs, landings, patio and walkway present on the plan page
    if (design.staircases?.length || design.stairs?.enabled) assert.ok(plan.some(t => /^S1: /.test(t)), `${name}: stairs listed`);
    if ((design.staircases || []).some(s => s.landing)) assert.ok(plan.some(t => /landing /.test(t)) && plan.includes('Landing outline'), `${name}: landing shown`);
    if (design.surfaces?.length) assert.ok(plan.includes('PATIO & WALKWAY') && plan.some(t => /^Patio: /.test(t)), `${name}: patio listed`);
    if (design.houseEdges?.length) assert.ok(plan.includes('House wall') && plan.includes('HOUSE'), `${name}: house wall reference`);
    await page.locator('#pdfCloseBtn').click();
    assert.ok(q.pages.length >= 2);
  }
  t.diagnostic(`numbered edges: ${tagged}; dimensions placed inside the deck: ${inside}`);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C4 multi-stair, landing, patio and walkway design: everything appears on both pages', async () => {
  const { ctx, page, errors } = await newPage();
  const design = { ...SAMPLES['patio-walkway'], staircases: [...CENSUS_DESIGN.staircases, { id: 'c', edge: 3, width: 3, offset: 2, rails: { left: true, right: true } }] };
  await openDesign(page, design); await step(page, 7);
  const info = await openPreview(page), [p1, p2] = info.doc.pages.map(p => p.texts);
  assert.ok(p1.some(t => /^3 staircases · /.test(t)) && p1.some(t => /^Landing 6'.0" × 5'.0", turns left$/.test(t)), 'stairs and landing on page 1');
  assert.ok(p1.includes(`Patio 14'${NB}0" × 10'${NB}0"`) && p1.includes(`Walkway 4'${NB}0" × 12'${NB}0"`), 'patio and walkway on page 1');
  for (const s of ['S1', 'S2', 'S3']) assert.ok(p2.includes(s), `${s} marked on the plan`);
  assert.ok(p2.some(t => /^S1: 4'.0" wide on edge 3; landing 6'.0" ×/.test(t)) && p2.includes('Patio / walkway') && p2.includes('Landing outline'));
  await page.screenshot({ path: path.join(SHOTS, 'c4-desktop-pdf-preview-multistair.png') });
  const pdf = inspectPdf((await getPdf(page)).buf); assert.deepEqual(pdf.problems, []); assert.deepEqual(pdf.pages[1].texts, p2);
  assert.deepEqual(errors, []); await ctx.close();
});

test('C4 previewing and downloading change nothing: project data, schema 6, undo/redo history, step, mode, camera, dimensions setting', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  // One real edit first (railing color), so undo has something to undo.
  await page.locator('#stepContent [data-action="adjust"][data-adjust="5"]').click(); await page.locator('#stepContent [data-path="railTab"][data-value="finish"]').click();
  await page.locator('#stepContent [data-path="railColor"][data-value="Bronze"]').click(); await page.waitForTimeout(250); await page.locator('#stepContent [data-action="return-review"]').click(); await page.waitForTimeout(300);
  const d0 = await designFile(page), s0 = await editorState(page), ls0 = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, k.startsWith('aosDeckStudio.projects') ? null : localStorage.getItem(k)])));
  for (let k = 0; k < 2; k++) { await openPreview(page); await getPdf(page); await page.locator('#pdfZoomBtn').click(); await page.locator('#pdfCloseBtn').click(); await page.waitForTimeout(150); }
  await page.locator('#nextBtn').click(); await ready(page); await page.locator('#pdfCloseBtn').click();
  const d1 = await designFile(page);
  for (const k of ['design', 'componentModel', 'counts', 'alerts', 'schemaVersion', 'structuralStatus', 'projectId']) assert.deepEqual(d1[k], d0[k], `project file unchanged: ${k}`);
  assert.equal(d1.schemaVersion, 6); assert.ok(!('camera' in d1.design) && !('pdf' in d1.design) && !('measure' in d1.design), 'no export-only settings in the project');
  assert.deepEqual(await editorState(page), s0, 'editor state unchanged');
  assert.equal(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, k.startsWith('aosDeckStudio.projects') ? null : localStorage.getItem(k)]))), ls0, 'no new stored settings');
  // Undo still undoes the railing edit (nothing was added to the history); redo re-applies it.
  await page.locator('#undoBtn').click(); await page.waitForTimeout(250); assert.equal((await designFile(page)).design.railColor, 'Textured Black');
  await page.locator('#redoBtn').click(); await page.waitForTimeout(250); assert.equal((await designFile(page)).design.railColor, 'Bronze');
  assert.equal(await page.locator('#redoBtn').isDisabled(), true, 'nothing else in the history');
  assert.deepEqual(errors, []); await ctx.close();
});

test('C4 existing exports still work beside the PDF: customer concept (.html), design file (.json), Projects download, Save project; C3 modes, shortcuts and Return to Review', async () => {
  const { ctx, page, errors } = await newPage();
  await openDesign(page, CENSUS_DESIGN); await step(page, 7);
  const buttons = await page.locator('#stepContent [data-section="downloads"] button').allInnerTexts();
  assert.deepEqual(buttons.map(t => t.trim()), ['Preview customer PDF', 'Download customer concept (.html)', 'Download design file (.json)']);
  const html = await download(page, () => page.locator('#stepContent [data-action="export-concept"]').click());
  assert.match(html.name, /_AOS_Concept\.html$/); assert.match(html.buf.toString(), /<title>AOS Deck Concept<\/title>/); assert.match(html.buf.toString(), /src="data:image\/png/);
  const j = await designFile(page); assert.equal(j.schemaVersion, 6);
  const pj = JSON.parse((await download(page, async () => { await page.locator('#openBtn').click(); await page.locator('#projectsDialog [data-action="project-download"]').click(); })).buf.toString()); await page.keyboard.press('Escape');
  delete pj.date; delete j.date; assert.deepEqual(pj, j);
  await page.locator('#saveBtn').click(); await page.waitForTimeout(300); assert.match(await page.locator('#toast').innerText(), /Saved/);
  assert.equal(await page.locator('#stepContent [data-action="adjust"]').count(), 8);
  await page.locator('#stepContent [data-path="reviewMode"][data-value="internal"]').click(); assert.equal(await page.locator('#stepContent [data-action="pdf-preview"]').count(), 1, 'the PDF preview is also offered in Internal mode');
  await page.locator('#stepContent [data-path="reviewMode"][data-value="customer"]').click();
  await page.locator('#stepContent [data-action="adjust"][data-adjust="8"]').click(); await page.locator('#stepContent [data-action="return-review"]').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#progressText').innerText(), 'Step 9 of 9');
  assert.deepEqual(errors, []); await ctx.close();
});
