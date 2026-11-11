'use strict';
// V5.3 C6: shared browser helpers for the Steps 5–8 tests (read-only access to the app).
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { loadEngine } = require('./engine');
const { designs } = require('./baseline/designs');

const ROOT = path.join(__dirname, '..');
const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(ROOT, 'test-results', 'screenshots');
const CORE = loadEngine().DeckCore;
const ALL = designs(loadEngine());

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } };

function harness(test) {
  const h = { browser: null };
  test.before(async () => { h.browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); fs.mkdirSync(SHOTS, { recursive: true }); });
  test.after(async () => { await h.browser?.close(); });
  h.newPage = async (viewport = VIEWPORTS.desktop) => {
    const touch = viewport.width < 800;
    const ctx = await h.browser.newContext({ viewport, acceptDownloads: true, hasTouch: touch, isMobile: touch }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(APP); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
    return { ctx, page, errors, press: (l) => (touch ? l.tap() : l.click()) };
  };
  return h;
}
async function openDesign(page, design) {
  const f = path.join(os.tmpdir(), `aos-c6-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ design }));
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
}
const step = async (page, id) => { await page.locator(`#stepdots [data-step="${id}"]`).click(); await page.waitForTimeout(250); };
const intent = (page) => page.evaluate(() => window.AOSDeckStudioTest.intent());
const colors = (page) => page.evaluate(() => window.AOSDeckStudioTest.colors());
async function settle(page) { await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(120); }
async function click(page, sel, press) { const l = page.locator(sel); assert.equal(await l.count(), 1, `one control: ${sel}`); await (press ? press(l) : l.click()); await settle(page); }
async function saveFile(page) {
  const [d] = await Promise.all([page.waitForEvent('download'), (async () => { await page.locator('#openBtn').click(); await page.locator('#projectsDialog [data-action="project-download"]').click(); })()]);
  const f = path.join(os.tmpdir(), `aos-c6-dl-${Date.now()}-${Math.random().toString(36).slice(2)}.json`); await d.saveAs(f); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  return { file: f, data: JSON.parse(fs.readFileSync(f, 'utf8')) };
}
async function reopen(h, file, viewport) { const p = await h.newPage(viewport); await p.page.locator('#fileInput').setInputFiles(file); await settle(p.page); return p; }
const undo = async (page) => { await page.locator('#undoBtn').click(); await settle(page); };
const redo = async (page) => { await page.locator('#redoBtn').click(); await settle(page); };

// Engine model of a design, as plain JSON.
// Each model is built in a fresh engine instance: the engine keeps internal beam/joist caches between
// calls, which change how geometry.beams/joists serialize (parts, counts, stats and materials do not).
const model = (design) => { const C = loadEngine().DeckCore; return JSON.parse(JSON.stringify(C.make(C.sanitize(structuredClone(design))))); };
// Replace every occurrence of the given names and their hex colors with one token, so two models
// can be compared for everything except which of those colors was chosen.
function canon(obj, names, palettes) {
  let s = JSON.stringify(obj);
  const tokens = [];
  for (const n of names) { tokens.push(n); for (const p of palettes) if (p[n]) tokens.push(p[n]); }
  for (const t of tokens.sort((a, b) => b.length - a.length)) s = s.split(t).join('§');
  return JSON.parse(s);
}
// Remove fields from a plain object (top level).
const without = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

module.exports = { assert, fs, os, path, ROOT, SHOTS, CORE, ALL, VIEWPORTS, harness, openDesign, step, intent, colors, settle, click, saveFile, reopen, undo, redo, model, canon, without };
