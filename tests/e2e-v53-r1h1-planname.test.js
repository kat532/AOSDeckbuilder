'use strict';
// V5.3 C6 owner R1 hotfix 1 — a valid plan name typed on the start screen is used by every start route:
// (A) choosing a shape directly in the Shape & Size panel, (B) Start Designing → shape popup, (C) Enter in
// the name field → shape popup. Blank / whitespace names are still refused on every route.
const test = require('node:test');
const H = require('./c6-helpers');
const { assert, VIEWPORTS, intent, settle } = H;
const h = H.harness(test);

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('aosDeckStudio.projects.v1') || '{}'));
const waitSaved = (page) => page.waitForFunction(() => /Saved/.test(document.getElementById('saveStatus').textContent), null, { timeout: 8000 });
const started = (page) => page.waitForFunction(() => /\d+ SQ FT/.test(document.getElementById('squareFeet').textContent)).then(() => settle(page));
const panelShape = (page, s = 'rectangle') => page.locator(`#stepContent [data-shape="${s}"]`);

for (const vp of ['desktop', 'tablet', 'phone']) {
  const touch = VIEWPORTS[vp].width < 800;
  test(`R1h1 (${vp}${touch ? ', touch' : ''}): name typed, then Rectangle in the Shape & Size panel — the named plan starts (the reported blocker)`, async () => {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    assert.equal(await panelShape(page).count(), 1, 'the panel offers shapes on a fresh plan');
    if (touch) { await page.locator('#newPlanName').tap(); await page.keyboard.type('Garcia – 5 Elm Ct'); } else await page.locator('#newPlanName').fill('Garcia – 5 Elm Ct');
    await panelShape(page).scrollIntoViewIfNeeded(); await press(panelShape(page));
    await started(page);
    const I = await intent(page);
    assert.equal(I.shape, 'rectangle'); assert.equal(I.project, 'Garcia – 5 Elm Ct');
    assert.equal(await page.locator('#projectName').inputValue(), 'Garcia – 5 Elm Ct');
    assert.equal(await page.locator('#emptyOverlay').isVisible(), false);
    assert.doesNotMatch(await page.locator('#toast').innerText(), /Enter a plan name first/);
    await waitSaved(page);
    assert.deepEqual(Object.values(await stored(page)).map(r => r.name), ['Garcia – 5 Elm Ct']);
    assert.deepEqual(errors, []); await ctx.close();
  });

  test(`R1h1 (${vp}${touch ? ', touch' : ''}): Start Designing → shape popup, and Enter in the name field → shape popup, both start the named plan`, async () => {
    for (const how of ['button', 'enter']) {
      const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
      const name = `Plan by ${how}`;
      if (touch) { await page.locator('#newPlanName').tap(); await page.keyboard.type(name); } else await page.locator('#newPlanName').fill(name);
      if (how === 'button') await press(page.locator('#startFromCanvas')); else await page.locator('#newPlanName').press('Enter');
      assert.equal(await page.locator('#shapeOverlay').isVisible(), true, `${how}: shape popup opens`);
      await press(page.locator('#shapeOverlay [data-shape="L"]'));
      await started(page);
      const I = await intent(page); assert.equal(I.shape, 'L'); assert.equal(I.project, name);
      await waitSaved(page); assert.deepEqual(Object.values(await stored(page)).map(r => r.name), [name]);
      assert.deepEqual(errors, []); await ctx.close();
    }
  });
}

test('R1h1: blank or whitespace names are refused on every route (panel shape, Start Designing, Enter); nothing is created', async () => {
  for (const vp of ['desktop', 'phone']) {
    const { ctx, page, errors, press } = await h.newPage(VIEWPORTS[vp]);
    for (const blank of ['', '   ']) {
      await page.locator('#newPlanName').fill(blank);
      await press(panelShape(page));
      assert.equal(await intent(page), null, `${vp} panel "${blank}": no plan`);
      assert.match(await page.locator('#newPlanError').innerText(), /Enter a plan name first/);
      await page.locator('#newPlanError').evaluate(e => { e.textContent = ''; });
      await press(page.locator('#startFromCanvas'));
      assert.equal(await page.locator('#shapeOverlay').isHidden(), true, `${vp} button "${blank}": no popup`);
      assert.match(await page.locator('#newPlanError').innerText(), /Enter a plan name/);
      await page.locator('#newPlanName').press('Enter');
      assert.equal(await page.locator('#shapeOverlay').isHidden(), true, `${vp} Enter "${blank}": no popup`);
    }
    assert.deepEqual(await stored(page), {}, 'nothing saved');
    assert.deepEqual(errors, []); await ctx.close();
  }
});

test('R1h1: a name typed after a refusal works; the plan name is trimmed; New Plan, saved plans and unsaved-changes protection unchanged', async () => {
  const { ctx, page, errors } = await h.newPage();
  await panelShape(page).click(); assert.equal(await intent(page), null);
  await page.locator('#newPlanName').fill('  First plan  '); await panelShape(page, 'U').click(); await started(page);
  assert.equal((await intent(page)).project, 'First plan'); assert.equal((await intent(page)).shape, 'U');
  await waitSaved(page); const firstId = Object.keys(await stored(page))[0], first = (await stored(page))[firstId];
  // change something and immediately ask for a new plan: the R1 protection still asks
  const w = page.locator('#stepContent input[data-field="width"]').first(); await w.fill('30'); await w.dispatchEvent('change');
  await page.locator('#newPlanBtn').click(); assert.equal(await page.locator('#unsavedDialog').isVisible(), true);
  await page.locator('#unsavedCancel').click(); assert.equal((await intent(page)).width, 30, 'Cancel keeps the change');
  await waitSaved(page); await page.locator('#newPlanBtn').click();
  assert.equal(await page.locator('#emptyOverlay').isVisible(), true); assert.equal(await page.locator('#newPlanName').inputValue(), '', 'fresh, empty name');
  await page.locator('#newPlanName').fill('Second plan'); await panelShape(page).click(); await started(page);
  await waitSaved(page);
  const all = await stored(page);
  assert.equal(Object.keys(all).length, 2, 'separate project');
  assert.equal(all[firstId].name, 'First plan'); assert.equal(all[firstId].design.width, 30); assert.equal(all[firstId].design.shape, first.design.shape);
  assert.equal(Object.values(all).find(r => r.id !== firstId).name, 'Second plan');
  // reopening the first plan asks nothing and does not rename it
  await page.locator('#openBtn').click(); await page.locator('#projectsList .project-row', { hasText: 'First plan' }).locator('[data-action="project-open"]').click(); await settle(page);
  assert.equal((await intent(page)).project, 'First plan'); assert.equal((await intent(page)).width, 30);
  assert.deepEqual(errors, []); await ctx.close();
});
