// V5.3 R1 rail inset (owner, 11 Nov 2026) — in the app: railing posts 1½ in. inside the finished deck and
// stair edges. 3′ and 4′ stairs, an exact-width bump-out stair, corners, landing transitions, 2D/3D
// alignment and save/reopen. Engine geometry is checked in detail by tests/rail-inset-r1.test.js.
'use strict';
const test = require('node:test');
const H = require('./c6-helpers');
const { RAIL_LINE } = require('./rail-inset');
const { assert, VIEWPORTS, openDesign, step, intent, settle, model, saveFile, reopen, undo, redo } = H;
const h = H.harness(test);

const BUMP = { shape: 'free', width: 16, depth: 15, height: 4, houseEdges: [0], points: [[0, 0], [16, 0], [16, 12], [10, 12], [10, 15], [6, 15], [6, 12], [0, 12]].map(([x, z]) => [x / 16, z / 15]) };
const RECT = { shape: 'rectangle', width: 16, depth: 12, height: 4, houseEdges: [0], railEdges: [1, 2, 3] };
const LANDING = { shape: 'rectangle', width: 20, depth: 14, height: 7, houseEdges: [0], staircases: [{ id: 'a', edge: 2, width: 4, offset: 3, landing: { width: 6, depth: 5, elevation: 3, turn: 'left' }, rails: { left: true, right: true } }] };
const RAIL = /^(railing-post|stair-rail-post|top-rail|stair-top-rail)$/;
const setStairWidth = async (page, v) => { const w = page.locator('#stepContent input[data-stair-field="width"]'); await w.fill(v); await w.dispatchEvent('change'); await settle(page); };
// What the page is drawing: the 2D plan model's railing parts, the 3D model's, and whether they are one model.
const drawn = (page) => page.evaluate(() => { const T = window.AOSDeckStudioTest, s = T.scene3d(), c = T.colors(); return { same: c.same, plan: c.plan, view3d: c.view3d, stairs3d: s.parts.filter(p => /^stair-(rail-post|top-rail)$/.test(p.kind)).map(p => [p.kind, +p.x.toFixed(4), +p.z.toFixed(4)]) }; });
// 2D plan pixels: the colour drawn at a world point (device pixels).
const pixel = (page, x, z) => page.evaluate(([x, z]) => { const c = document.getElementById('planCanvas'), r = c.getBoundingClientRect(), s = window.AOSDeckStudioTest.toScreen(x, z), k = c.width / r.width;
  const d = c.getContext('2d').getImageData(Math.round((s[0] - r.left) * k), Math.round((s[1] - r.top) * k), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, z]);
const near = (a, hex, tol = 40) => { const b = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return a.every((v, i) => Math.abs(v - b[i]) <= tol); };
const measurementsOff = async (page) => { const b = page.locator('#measureBtn'); if (/ON/.test(await b.innerText())) { await b.click(); await settle(page); } };

async function checkPage(page, label) {
  const I = await intent(page), m = model(I), es = m.geometry.edges;
  // 2D and 3D draw the same railing parts from one model.
  const d = await drawn(page);
  assert.equal(d.same, true, `${label}: 2D and 3D share one model`);
  for (const k of ['railing-post', 'post-cap', 'top-rail', 'bottom-rail', 'baluster', 'stair-rail-post']) assert.deepEqual(d.view3d[k], d.plan[k], `${label}: ${k} same in 2D and 3D`);
  const want = m.parts.filter(p => /^stair-(rail-post|top-rail)$/.test(p.kind)).map(p => [p.kind, +p.x.toFixed(4), +p.z.toFixed(4)]);
  assert.deepEqual(d.stairs3d, want, `${label}: 3D stair railing at the engine positions`);
  // Every deck post RAIL_LINE inside its edge (house-wall ends excepted); counts follow the parts.
  for (const p of m.parts.filter(p => p.kind === 'railing-post')) {
    const dist = es.filter(e => !I.houseEdges.includes(e.i)).map(e => { const t = Math.max(0, Math.min(e.len, (p.x - e.a[0]) * e.t[0] + (p.z - e.a[1]) * e.t[1])); return Math.hypot(p.x - e.a[0] - e.t[0] * t, p.z - e.a[1] - e.t[1] * t); });
    assert.ok(Math.min(...dist) >= RAIL_LINE - 1e-6, `${label}: post ${p.x.toFixed(2)},${p.z.toFixed(2)} 1½ in. inside`);
  }
  assert.equal(m.counts.railPosts, m.parts.filter(p => /^(railing-post|stair-rail-post)$/.test(p.kind)).length, `${label}: rail post quantity`);
  assert.equal(m.counts.balusters, m.parts.filter(p => /baluster/.test(p.kind)).length, `${label}: baluster quantity`);
  return { I, m };
}

for (const vp of ['desktop', 'phone']) test(`R1 rail (${vp}): 3′ and 4′ stairs — stair posts 1½ in. inside both stair edges; 2D pixels and 3D on the inset lines${vp === 'desktop' ? '; save/reopen' : ''}`, async () => {
  const { ctx, page, errors } = await h.newPage(VIEWPORTS[vp]);
  await openDesign(page, { ...RECT, staircases: [{ id: 's', edge: 2, width: 3, offset: 0, rails: { left: true, right: true } }] }); await step(page, 2); await measurementsOff(page);
  for (const W of [3, 4]) {
    if (W === 4) await setStairWidth(page, '4');
    const { I, m } = await checkPage(page, `${vp} ${W}′`), g = m.geometry.stairs[0];
    assert.equal(I.staircases[0].width, W, 'selected width kept'); assert.equal(I.width, 16); assert.equal(I.depth, 12);
    const uv = (p) => [(p.x - g.base[0]) * g.tt[0] + (p.z - g.base[1]) * g.tt[1], (p.x - g.base[0]) * g.nn[0] + (p.z - g.base[1]) * g.nn[1]];
    const sp = m.parts.filter(p => p.kind === 'stair-rail-post');
    assert.ok(sp.length >= 2); for (const p of sp) assert.ok(Math.abs(Math.abs(uv(p)[0]) - (W / 2 - RAIL_LINE)) < 1e-6, `${W}′: stair post ${(Math.abs(uv(p)[0]) * 12).toFixed(2)} in. from centre`);
    // Shared posts at the top of the stair: the deck guard post stands on each stair railing line.
    for (const s of [-1, 1]) assert.ok(m.parts.some(p => p.kind === 'railing-post' && Math.abs(uv(p)[0] - s * (W / 2 - RAIL_LINE)) < 1e-6 && Math.abs(uv(p)[1] + RAIL_LINE) < 1e-6), `${W}′: shared top post ${s}`);
    // 2D plan: the posts are drawn where the model says (sample the post centres).
    for (const p of m.parts.filter(p => p.kind === 'railing-post').slice(0, 6)) assert.ok(near(await pixel(page, p.x, p.z), p.color), `${vp} ${W}′: 2D post drawn at ${p.x.toFixed(2)},${p.z.toFixed(2)} (${await pixel(page, p.x, p.z)})`);
    // Clear width between stair posts: 3′ → about 28 in. (reported for review), 4′ → about 40 in.
    const a = m.alerts.find(a => a.code === 'stair-rail-clear-width');
    if (W === 3) assert.match(a.message, /about 28 in\. is left between the posts/); else assert.equal(a, undefined);
    await page.screenshot({ path: H.path.join(H.SHOTS, `r1rail-${vp}-${W}ft.png`) });
  }
  await undo(page); assert.equal((await intent(page)).staircases[0].width, 3); await redo(page); assert.equal((await intent(page)).staircases[0].width, 4);
  await page.locator('#mode3d').click(); await page.waitForTimeout(400); await checkPage(page, `${vp} 3D`);
  await page.screenshot({ path: H.path.join(H.SHOTS, `r1rail-${vp}-3d.png`) });
  if (vp !== 'desktop') { assert.deepEqual(errors, []); await ctx.close(); return; } // save/reopen: desktop (the helper uses the desktop Projects menu)
  const { file, data } = await saveFile(page); assert.equal(data.design.schemaVersion, 6, 'schema v6');
  const r = await reopen(h, file, VIEWPORTS[vp]);
  const a = model(await intent(page)), b = model(await intent(r.page));
  assert.deepEqual(b.parts.filter(p => RAIL.test(p.kind)).map(({ id, ...p }) => p), a.parts.filter(p => RAIL.test(p.kind)).map(({ id, ...p }) => p), 'reopened railing identical');
  await checkPage(r.page, `${vp} reopened`);
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});

test('R1 rail: exact-width 4′ stair on a 4′ bump-out — corner posts on the inset lines carry the stair rails; framing and quantities', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, { ...BUMP, staircases: [{ id: 's', edge: 4, width: 4, offset: 0, rails: { left: true, right: true } }] }); await step(page, 2); await measurementsOff(page);
  const { I, m } = await checkPage(page, 'bump-out'), e = m.geometry.edges[4];
  assert.equal(I.staircases[0].width, 4); assert.equal(I.staircases[0].offset, 0);
  for (const s of [-1, 1]) { const c = [e.mid[0] + e.t[0] * s * (2 - RAIL_LINE) - e.n[0] * RAIL_LINE, e.mid[1] + e.t[1] * s * (2 - RAIL_LINE) - e.n[1] * RAIL_LINE];
    assert.ok(m.parts.some(p => p.kind === 'railing-post' && Math.hypot(p.x - c[0], p.z - c[1]) < 1e-6), `bump-out corner post ${s} on both inset lines`);
    assert.ok(near(await pixel(page, c[0], c[1]), m.parts.find(p => p.kind === 'railing-post').color), `2D corner post ${s}`); }
  const P = m.parts.filter(p => /rail-post|^railing-post/.test(p.kind));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) assert.ok(Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) >= .3, 'no doubled posts');
  await step(page, 6); const v = await page.evaluate(() => window.AOSDeckStudioTest.framingView()); assert.equal(v.plan['stair-stringer'], m.parts.filter(p => p.kind === 'stair-stringer').length, 'stringers unchanged in the framing view');
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1rail-bumpout-framing.png') });
  await step(page, 2); await page.screenshot({ path: H.path.join(H.SHOTS, 'r1rail-bumpout.png') });
  await page.locator('#mode3d').click(); await page.waitForTimeout(400); await checkPage(page, 'bump-out 3D'); await page.screenshot({ path: H.path.join(H.SHOTS, 'r1rail-bumpout-3d.png') });
  assert.deepEqual(errors, []); await ctx.close();
});

test('R1 rail: corners and a landing stair — corner posts where the inset lines meet; landing guards and flight rails inset; transitions share posts', async () => {
  const { ctx, page, errors } = await h.newPage();
  await openDesign(page, { shape: 'L', width: 24, depth: 18, height: 4, houseEdges: [0], staircases: [] }); await step(page, 2); await measurementsOff(page);
  let { m } = await checkPage(page, 'L'); const es = m.geometry.edges;
  const line = (e, p) => (p.x - e.a[0]) * e.n[0] + (p.z - e.a[1]) * e.n[1];
  for (let i = 1; i < es.length - 1; i++) { const e = es[i], o = es[i + 1]; if (m.intent.houseEdges.includes(o.i)) continue;
    assert.ok(m.parts.some(p => p.kind === 'railing-post' && Math.abs(line(e, p) + RAIL_LINE) < 1e-6 && Math.abs(line(o, p) + RAIL_LINE) < 1e-6), `L corner ${e.i + 1}/${o.i + 1}`); }
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1rail-L-corners.png') });
  await openDesign(page, LANDING); await step(page, 2); await measurementsOff(page);
  ({ m } = await checkPage(page, 'landing'));
  const L = m.geometry.stairs[0].landing;
  for (const t of L.transitions) assert.ok(m.parts.some(p => /rail-post/.test(p.kind) && Math.hypot(p.x - t.post[0], p.z - t.post[1]) < 1e-6), 'a post at every rail transition');
  for (const s of L.guards) for (const pt of [s.a, s.b]) assert.ok(pt[1] >= L.v0 + RAIL_LINE - 1e-6 && pt[1] <= L.v1 - RAIL_LINE + 1e-6 && Math.abs(pt[0]) <= L.width / 2 - RAIL_LINE + 1e-6, 'landing guard 1½ in. inside the landing');
  await page.screenshot({ path: H.path.join(H.SHOTS, 'r1rail-landing.png') });
  await page.locator('#mode3d').click(); await page.waitForTimeout(400); await checkPage(page, 'landing 3D'); await page.screenshot({ path: H.path.join(H.SHOTS, 'r1rail-landing-3d.png') });
  const { file } = await saveFile(page); const r = await reopen(h, file); await checkPage(r.page, 'landing reopened');
  assert.deepEqual((await intent(r.page)).staircases, (await intent(page)).staircases, 'landing stair reopens unchanged');
  assert.deepEqual([...errors, ...r.errors], []); await ctx.close(); await r.ctx.close();
});
