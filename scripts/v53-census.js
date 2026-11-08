// V5.3 C0/C1: run the control census and reachability check on a build at six screen sizes.
// Usage: node scripts/v53-census.js <index.html> <out.json>
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright-core');
const { census } = require('../tests/ui-census');
const VIEWPORTS = [
  ['desktop 1440×900', { width: 1440, height: 900 }, 'wheel'],
  ['laptop 1280×720', { width: 1280, height: 720 }, 'wheel'],
  ['tablet landscape 1180×820 (touch)', { width: 1180, height: 820 }, 'touch'],
  ['tablet portrait 820×1180 (touch)', { width: 820, height: 1180 }, 'touch'],
  ['phone 390×844 (touch)', { width: 390, height: 844 }, 'touch'],
  ['short phone 375×667 (touch)', { width: 375, height: 667 }, 'touch'],
];
(async () => {
  const [html, out] = process.argv.slice(2), APP = 'file://' + path.resolve(html);
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const result = { build: html, viewports: {} };
  for (const [name, vp, mode] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: mode === 'touch', isMobile: vp.width < 800 }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const cdp = mode === 'touch' ? await ctx.newCDPSession(page) : null;
    // start screen (no design yet)
    await page.goto(APP); await page.waitForFunction(() => window.DeckCore);
    const start = await page.evaluate(() => [...document.querySelectorAll('#emptyOverlay button, #stepContent button')].filter(b => b.getBoundingClientRect().width).map(b => (b.dataset.shape ? 'shape=' + b.dataset.shape : b.id || b.innerText.trim())));
    const c = await census(page, { APP, fs, os, path, mode, cdp });
    const states = {}; let total = 0, bad = 0;
    for (const [s, v] of Object.entries(c.states)) { const visible = v.controls.filter(x => !x.hidden); total += visible.length; bad += v.unreachable.length;
      states[s] = { controls: visible.length, unreachable: v.unreachable, scrollable: v.scroll.max > 0 && v.scroll.overflowY !== 'hidden', overflowY: v.scroll.overflowY, contentTallerThanPanelBy: Math.max(0, v.scroll.max), footerMoved: v.footerMoved }; }
    result.viewports[name] = { totalControls: total, unreachable: bad, states, start, errors };
    if (name.startsWith('desktop')) result.inventory = { chrome: c.chrome, start, states: Object.fromEntries(Object.entries(c.states).map(([s, v]) => [s, v.controls.map(x => ({ key: x.key, label: x.label, disabled: x.disabled, hidden: x.hidden }))])) };
    console.log(`${name}: ${total} panel controls, ${bad} unreachable${errors.length ? ', errors: ' + errors.length : ''}`);
    await ctx.close();
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  await browser.close();
})();
