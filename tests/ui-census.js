// V5.3 C0/C1: control census and reachability.
// census(page, mode) drives the app through every step, tab and editing state of a design that uses
// every feature, records each control in the settings panel and the app chrome, and tests whether a
// person can reach and press each panel control by scrolling the panel the way they would:
//   mode 'wheel' — mouse wheel / touchpad over the panel;  mode 'touch' — finger drags on the panel.
// A control is reachable when, at some scroll position, its centre is inside the visible panel and is
// the element actually hit there (not covered by the Back/Next bar or anything else).
'use strict';

const CENSUS_DESIGN = {
  project: 'V5.3 census deck', shape: 'rectangle', width: 20, depth: 14, height: 6, houseEdges: [0], borderCount: 1, dividerMode: 'double',
  decking: 'Brown Oak', border: 'Stone Ash', siding: 'shake', houseColor: 'Sandstone', railEdges: [1, 2, 3], railOverrides: { 2: { railColor: 'White' } },
  openings: [{ id: 'd', type: 'door', edge: 0, offset: -6.5 }, { id: 'p', type: 'patio', edge: 0, offset: 1, width: 6 }, { id: 'w', type: 'window', edge: 0, offset: 7, width: 3, height: 4, sill: 3 }],
  staircases: [{ id: 'a', edge: 2, width: 4, offset: 3, landing: { width: 6, depth: 5, elevation: 3, turn: 'left' }, rails: { left: true, right: true } }, { id: 'b', edge: 1, width: 4, offset: 0, rails: { left: true, right: false } }],
  surfaces: [{ id: 'p1', type: 'patio', x: -3, z: 21, width: 14, length: 10 }, { id: 'w1', type: 'walkway', x: 9, z: 30, width: 4, length: 12, angle: 15 }],
};

const step = (id) => async (page) => { await page.locator(`#stepdots [data-step="${id}"]`).click(); await page.waitForTimeout(250); };
const tab = (path, value) => async (page) => { await page.locator(`#stepContent [data-path="${path}"][data-value="${value}"]`).click(); await page.waitForTimeout(200); };
const act = (sel) => async (page) => { await page.locator(`#stepContent ${sel}`).first().click(); await page.waitForTimeout(200); };
const tapPlan = (fn) => async (page) => { const p = await page.evaluate(fn); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(250); };
const edgeMid = (i) => `(() => { const e = window.AOSDeckStudioTest.edges()[${i}]; return window.AOSDeckStudioTest.toScreen(e.mid[0], e.mid[1]); })()`;
const vertex = (i) => `(() => { const e = window.AOSDeckStudioTest.edges()[${i}]; return window.AOSDeckStudioTest.toScreen(e.a[0], e.a[1]); })()`;
async function seq(page, ...fns) { for (const f of fns) await f(page); }

// Each state starts from Shape & Size with the census design loaded.
const STATES = [
  ['1 Shape & Size', (p) => seq(p, step(0))],
  ['1 Shape & Size · edge selected', (p) => seq(p, step(0), tapPlan(edgeMid(1)))],
  ['1 Shape & Size · corner selected', (p) => seq(p, step(0), tapPlan(vertex(2)))],
  ['2 House & Height · Walls & doors', (p) => seq(p, step(1), tab('houseTab', 'walls'))],
  ['2 House & Height · Siding & color', (p) => seq(p, step(1), tab('houseTab', 'look'))],
  ['3 Framing & Ledger', (p) => seq(p, step(6))],
  ['3 Framing & Ledger · measurements', (p) => seq(p, step(6), act('[data-action="framing-details"]'))],
  ['4 Stairs · stair with landing', (p) => seq(p, step(2))],
  ['4 Stairs · second stair', (p) => seq(p, step(2), act('[data-action="stair-next"]'))],
  ['5 Decking Layout · Board direction', (p) => seq(p, step(3), tab('layoutTab', 'direction'))],
  ['5 Decking Layout · Border & dividers', (p) => seq(p, step(3), tab('layoutTab', 'border'))],
  ['6 Decking Selection · Main decking', (p) => seq(p, step(4), tab('finishTab', 'field'))],
  ['6 Decking Selection · Border / stair accent', (p) => seq(p, step(4), tab('finishTab', 'accent'))],
  ['7 Railings · locations', (p) => seq(p, step(5), tab('railTab', 'locations'))],
  ['7 Railings · finish, all edges', (p) => seq(p, step(5), tab('railTab', 'finish'))],
  ['7 Railings · finish, custom edge', (p) => seq(p, step(5), tab('railTab', 'finish'), act('[data-action="rail-target"][data-edge="2"]'))],
  // V5.3 C2: patios and walkways have their own step (ID 8), shown before Review (now step 9).
  ['8 Patio & Walkway', (p) => seq(p, step(8))],
  ['9 Review & Present', (p) => seq(p, step(7))],
  // V5.3 C3: Review's Internal view (Materials and Framing tabs).
  ['9 Review & Present · Internal · Materials', (p) => seq(p, step(7), act('[data-path="reviewMode"][data-value="internal"]'), act('[data-path="reviewTab"][data-value="materials"]'))],
  ['9 Review & Present · Internal · Framing', (p) => seq(p, step(7), act('[data-path="reviewMode"][data-value="internal"]'), act('[data-path="reviewTab"][data-value="framing"]'))],
  // V5.3 C3: Shape & Size opened from Review's Available Adjustments shows Return to Review. Kept last:
  // the way back stays on offer until Review is reached again.
  ['1 Shape & Size · opened from Review', (p) => seq(p, step(7), act('[data-action="adjust"][data-adjust="0"]'))],
];

// Stable identity of a control: tag + id + its data-* attributes (or its text when it has none).
const KEY_FN = `(el) => { const d = [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value).sort();
  const t = (el.innerText || el.getAttribute('aria-label') || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  return [el.tagName.toLowerCase(), el.id ? '#' + el.id : '', d.join(' ') || (el.type === 'text' || el.tagName === 'SELECT' ? '' : 'text=' + t)].filter(Boolean).join(' '); }`;

async function panelControls(page) {
  return page.evaluate((keyFn) => { const key = eval(keyFn), root = document.getElementById('stepContent');
    return [...root.querySelectorAll('button, input, select, textarea, [role="button"]')].map(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { key: key(el), label: (el.innerText || el.getAttribute('aria-label') || el.closest('label')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50), disabled: el.disabled === true,
        hidden: r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' }; }); }, KEY_FN);
}
// Controls whose centre is inside the visible panel and actually receives a click there.
async function hittable(page) {
  return page.evaluate((keyFn) => { const key = eval(keyFn), root = document.getElementById('stepContent'), box = root.closest('.inspector-content') || root, vb = box.getBoundingClientRect();
    const footer = document.querySelector('.inspector-footer')?.getBoundingClientRect(), out = [];
    for (const el of root.querySelectorAll('button, input, select, textarea, [role="button"]')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 12);
      if (cx < vb.left || cx > vb.right || cy < vb.top || cy > vb.bottom || cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      if (footer && cy >= footer.top && cy <= footer.bottom) continue;
      const hit = document.elementFromPoint(cx, cy); if (hit && (hit === el || el.contains(hit) || hit.contains(el) && hit.tagName === 'LABEL')) out.push(key(el)); }
    return out; }, KEY_FN);
}
async function panelScrollState(page) { return page.evaluate(() => { const b = document.querySelector('.inspector-content'); return { top: b.scrollTop, max: b.scrollHeight - b.clientHeight, overflowY: getComputedStyle(b).overflowY }; }); }
async function footerBox(page) { return page.evaluate(() => { const r = document.querySelector('.inspector-footer').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }); }

// Scroll the panel like a person (wheel or finger), collecting every control that becomes pressable.
async function reachable(page, mode, cdp) {
  const seen = new Set(await hittable(page)), b = await page.locator('.inspector-content').boundingBox(), foot0 = await footerBox(page);
  const x = b.x + b.width / 2, y = b.y + Math.min(b.height / 2, 80);
  let last = -1, moved = 0, footerMoved = false;
  for (let k = 0; k < 40; k++) {
    if (mode === 'touch') { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y + 60 }] });
      for (let s = 1; s <= 6; s++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 60 - s * 15 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else { await page.mouse.move(x, y); await page.mouse.wheel(0, 90); }
    await page.waitForTimeout(80);
    const st = await panelScrollState(page); for (const k2 of await hittable(page)) seen.add(k2);
    const f = await footerBox(page); if (f[0] !== foot0[0] || f[1] !== foot0[1]) footerMoved = true;
    if (st.top === last) { if (++moved >= 2) break; } else { moved = 0; last = st.top; }
  }
  return { seen, footerMoved };
}

async function openCensusDesign(page, APP, fs, os, path) {
  const f = path.join(os.tmpdir(), `aos-census-${process.pid}-${Date.now()}.json`); fs.writeFileSync(f, JSON.stringify({ design: CENSUS_DESIGN }));
  await page.goto(APP); await page.waitForFunction(() => window.DeckCore && window.AOSDeckStudioTest);
  await page.locator('#fileInput').setInputFiles(f); await page.waitForFunction(() => window.AOSDeckStudioTest.framingStatus() === 'current'); await page.waitForTimeout(300);
}

// Returns { states: { name: { controls, unreachable, scroll, footerMoved } }, chrome: [...] }.
async function census(page, { APP, fs, os, path, mode = 'wheel', cdp = null, states = STATES }) {
  await openCensusDesign(page, APP, fs, os, path);
  const out = { states: {}, chrome: [] };
  out.chrome = await page.evaluate((keyFn) => { const key = eval(keyFn); return [...document.querySelectorAll('header button, header input, .progressbar button, .workspace-top button, .camera-tools button, #structureToggle, .inspector-footer button')].map(key); }, KEY_FN);
  for (const [name, go] of states) {
    await go(page);
    await page.evaluate(() => { const b = document.querySelector('.inspector-content'); b.scrollTop = 0; });
    const controls = await panelControls(page), scroll = await panelScrollState(page), r = await reachable(page, mode, cdp);
    const unreachable = controls.filter(c => !c.hidden && !r.seen.has(c.key)).map(c => c.key);
    out.states[name] = { controls, unreachable: [...new Set(unreachable)], scroll, footerMoved: r.footerMoved };
  }
  return out;
}

module.exports = { census, CENSUS_DESIGN, STATES };
