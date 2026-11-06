// Loads the engine modules from index.html into an isolated Node VM so they can be
// tested without a browser. Only the non-DOM modules are loaded; the app controller
// (last script) is exercised by the browser tests in e2e.test.js.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');

const ENGINE_GLOBALS = ['AOSFramingSolver', 'AOSSharedSupport', 'AOSGeometry', 'DeckCore', 'AOSShape'];

function inlineScripts(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) if (!/\bsrc=/.test(m[1])) out.push(m[2]);
  return out;
}

function loadEngine(htmlPath = HTML_PATH) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = inlineScripts(html);
  const window = {};
  window.window = window;
  const ctx = vm.createContext({ window, console, structuredClone, Math, JSON, Number, Array, Object, Set, Map, String, Boolean, Error, Infinity, NaN, isFinite, parseFloat, parseInt });
  for (const code of scripts) {
    // Each engine module is an IIFE ending in `})(window);` and publishes one global.
    // The app controller touches the DOM, so it is skipped here.
    if (/const titles=\[/.test(code)) continue;
    vm.runInContext(code, ctx, { filename: 'index.html' });
  }
  for (const g of ENGINE_GLOBALS) if (!window[g]) throw new Error(`Engine global ${g} was not defined by index.html`);
  return window;
}

const r = (v, d = 4) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
function roundDeep(v) {
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)]));
  return r(v);
}

// A stable, human-reviewable summary of everything the model produces. Any change in
// part counts, quantities, framing stats or alerts shows up as a golden-file diff.
function snapshot(win, intent) {
  const model = win.DeckCore.make(intent);
  const kinds = {};
  for (const p of model.parts) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
  const { boardCourseWidthsFt, optimizerCandidates, ...stats } = model.stats || {};
  // JSON round trip: VM-realm objects have a foreign prototype, which strict deepEqual rejects.
  return JSON.parse(JSON.stringify(roundDeep({
    partCount: model.parts.length,
    partsByKind: Object.fromEntries(Object.entries(kinds).sort()),
    counts: model.counts,
    stats: { ...stats, boardCourseCount: boardCourseWidthsFt ? boardCourseWidthsFt.length : 0, optimizerCandidates },
    alerts: (model.alerts || []).map(a => `${a.level}: ${a.message}`),
  })));
}

module.exports = { loadEngine, snapshot, inlineScripts, HTML_PATH, ROOT };
