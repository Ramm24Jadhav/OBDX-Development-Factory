// Modernization check: drives a running factory in headless Edge or Chrome, read-only, for every workspace with an
// analysis (?ojr=modernization-analysis, the Code analysis page under Modernization):
//  - one header with Run Analysis and the ⋯ menu; at most one problem bar, else one Next line;
//  - the answer first: with a React Native or React target, four boxes (converted, in progress, failed, not started)
//    whose counts add up to the modules and which filter the module list; the target card names the app and its pack;
//  - source and target versions each say where the value comes from;
//  - three tabs (arrow keys move between them), only the selected panel shows;
//  - Modules: one compact row per module with a size chip and a ⋯ menu, chips with counts and a search that filter
//    them, the module beside the list with its facts and Screens, Findings and Changes;
//  - Start a conversion opens a side panel with the new app, the app folder and the module, and changes nothing
//    until a button is pressed; History opens the last analysis in a side panel;
//  - findings carry the rule id and file lines; the plan never says the migration is complete and shows its gates;
//  - every opportunity is detected with a source and opens to its evidence;
//  - model-written text only in the assistant panel (closed by default, Escape closes it); no model call is made;
//  - with a new app, page data put into the page (nothing saved) shows a module's conversion from a change writing
//    into the app folder;
//  - the profile is asked for only when the code is indexed; no failed API calls or console errors; nothing scrolls
//    sideways at 390 px; Show in Code opens the file on Code › Explore.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-modernization.js --url http://localhost:8080 [--shots <dir>]
//
// Exit code 1 on a defect.
const fs = require('fs');
const path = require('path');
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const SHOTS = args.shots || args.out ? path.resolve(args.shots || args.out) : null;

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const shot = async (name) => {
    if (!SHOTS) { return; }
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const size = (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
  const requests = [];
  s.onEvent((m) => { if (m.method === 'Network.requestWillBeSent' && /\/api\//.test(m.params.request.url)) { requests.push({ url: m.params.request.url.replace(BASE, ''), method: m.params.request.method }); } });
  const writes = () => requests.filter((r) => r.method !== 'GET');
  const click = (sel) => run((q) => { const b = document.querySelector(q); if (!b) { return false; } b.click(); return true; }, sel);
  const vm = () => run(() => new Promise((r) => window.require(['knockout'], (ko) => { window.__mz = ko.dataFor(document.querySelector('.factory-mz')); r(1); })));

  const workspaces = await run(() => fetch('api/workspaces').then((r) => r.json()));
  for (const w of workspaces) {
    const label = w.name + ': ';
    await size(1440, 1000);
    await open(BASE + '/?ojr=overview');
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (sel) => { sel.selectedId(id); r(1); })), w.id);
    s.errors.length = 0;
    requests.length = 0;
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'modernization-analysis' })); return 1; });
    await sleep(7000);
    const has = await run(() => !!document.querySelector('#mzModuleList'));
    if (!has) {
      const empty = await run(() => ({ start: !!document.querySelector('#modernizationEmpty'), steps: document.querySelectorAll('.factory-mz-steps li').length }));
      record(label + 'no analysis: the start card says so with its three steps', empty.start && empty.steps === 3, empty);
      continue;
    }
    await vm();
    const page = await run(() => {
      const q = (sel) => Array.from(document.querySelectorAll(sel));
      return {
        h1: q('.factory-mz h1').length, tablists: q('.factory-mz [role=tablist]').length, tabs: q('.factory-mz [role=tab]').map((t) => t.id),
        problems: q('#mzProblem').length, next: q('#mzNext').length,
        ends: q('.factory-mz-end').map((e) => ({ label: e.querySelector('.factory-mz-endlabel').textContent, src: (e.querySelector('.factory-mz-src') || {}).textContent || '' })),
        target: (document.querySelector('#mzTargetChannel .factory-mz-targetname') || {}).textContent || '',
        boxes: q('#mzBoxes button').map((b) => Number(b.querySelector('.factory-rq-stage-count').textContent)),
        rows: q('#mzModuleList > li').length, menus: q('#mzModuleList > li fx-menu-button').length, sizeChips: q('#mzModuleList > li .factory-ov-pill-red, #mzModuleList > li .factory-ov-pill-amber, #mzModuleList > li .factory-ov-pill-green').length,
        modules: window.__mz.modules().length, newApp: window.__mz.newApp(),
        detail: (document.getElementById('mzModuleTitle') || {}).textContent || '', facts: q('#mzModuleFacts > div').length, subtabs: q('.factory-mz-subtabs button').length,
        aiOutside: q('.factory-mz .fx-badge').filter((b) => /AI/.test(b.textContent) && !b.closest('fx-sheet')).length,
        sheetOpen: !!document.querySelector('#moAssistant .fx-sheet')
      };
    });
    record(label + 'one title, one row of three tabs', page.h1 === 1 && page.tablists === 1 && page.tabs.join() === 'mo-modules,mo-findings,mo-plan', page.tabs);
    record(label + 'one problem bar or one next line', page.problems + page.next === 1, page);
    record(label + 'source and target versions say where each value comes from', page.ends.length === 3 && page.ends.every((e) => e.src.trim()), page.ends);
    record(label + 'the target card names the app', !!page.target.trim(), page.target);
    record(label + (page.newApp ? 'four boxes whose counts add up to the modules' : 'no conversion boxes without a new app'),
      page.newApp ? page.boxes.length === 4 && page.boxes.reduce((a, b) => a + b, 0) === page.modules : page.boxes.length === 0, page.boxes);
    record(label + 'one compact row per module with a size chip and a menu', page.rows === page.modules && page.menus === page.rows && page.sizeChips === page.rows, page);
    record(label + 'the module beside the list with facts and three sub-tabs', !!page.detail && page.facts === 3 && page.subtabs === 3, page);
    record(label + 'no AI text outside the assistant; the assistant starts closed', page.aiOutside === 0 && !page.sheetOpen, page);
    const visible = await run(() => Array.from(document.querySelectorAll('.factory-mz [role=tabpanel]')).filter((p) => p.offsetParent !== null).map((p) => p.id));
    record(label + 'only the selected tab panel shows', visible.length === 1 && visible[0] === 'mo-panel-modules', visible);
    await shot(w.name + '-modules-1440');

    // Chips with counts and the search filter the rows
    const chips = await run(() => Array.from(document.querySelectorAll('#mzModuleChips button')).map((b) => ({ id: b.id, n: Number((b.textContent.match(/(\d+)\s*$/) || [])[1]) })));
    record(label + 'module chips carry counts', chips.length > 0 && chips.every((c) => !isNaN(c.n)), chips);
    if (chips.length > 1) {
      await click('#' + chips[1].id);
      await sleep(300);
      const n = await run(() => document.querySelectorAll('#mzModuleList > li').length);
      record(label + 'a chip filters the rows to its count', n === chips[1].n, { chip: chips[1], rows: n });
      await click('#mzChip-all');
      await sleep(200);
    }
    const first = await run(() => window.__mz.modules()[0]);
    await run((t) => { window.__mz.moduleSearch(t); return 1; }, first.screens[0].name);
    await sleep(300);
    const searched = await run(() => Array.from(document.querySelectorAll('#mzModuleList .factory-rq-row-title')).map((t) => t.textContent.trim()));
    record(label + 'the search finds a module by a screen name', searched.indexOf(first.name) >= 0, searched);
    await run(() => { window.__mz.moduleSearch('no-such-module-xyz'); return 1; });
    await sleep(300);
    record(label + 'no match: one line and a way back', await run(() => !!document.getElementById('mzModulesEmpty')));
    await run(() => { window.__mz.clearModuleFilters(); return 1; });
    await sleep(300);
    // A row opens its module beside the list; the sub-tabs switch
    const last = await run(() => { const rows = document.querySelectorAll('#mzModuleList > li .factory-rq-open'); rows[rows.length - 1].click(); return rows[rows.length - 1].querySelector('.factory-rq-row-title').textContent.trim(); });
    await sleep(300);
    record(label + 'a row opens its module beside the list', (await run(() => document.getElementById('mzModuleTitle').textContent.trim())) === last, last);
    const screens = await run(() => document.querySelectorAll('#mzScreens > li').length);
    record(label + 'the module lists its screens', screens > 0, screens);
    await click('#mzSub-changes');
    await sleep(200);
    record(label + 'the Changes sub-tab says one line when there are none, or lists them',
      await run(() => !!document.querySelector('#mzModule .factory-mz-none') || document.querySelectorAll('#mzModule .factory-mz-rows > li').length > 0));
    await click('#mzSub-screens');

    // Start a conversion: a side panel; nothing is saved by opening it
    const before = writes().length;
    await click('#mzStartButton');
    await sleep(600);
    const sheet = await run(() => ({
      open: !!document.querySelector('#mzStart .fx-sheet'), choices: document.querySelectorAll('#mzChoices button').length,
      folder: !!document.getElementById('mzAppFolder'), module: !!document.getElementById('mzConvertModule'),
      write: !!document.getElementById('mzWriteRequirement'), starter: (document.getElementById('mzStarter') || {}).getAttribute ? document.getElementById('mzStarter').getAttribute('href') : ''
    }));
    record(label + 'Start a conversion: the new app, its folder, a module', sheet.open && sheet.choices >= 1 && sheet.folder && sheet.module && sheet.write && /starter\.zip$/.test(sheet.starter), sheet);
    record(label + 'opening the start panel saves nothing', writes().length === before, writes().slice(before));
    await run(() => { document.querySelector('#mzStart .fx-sheet-backdrop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; });
    await sleep(400);
    record(label + 'Escape closes the start panel', !(await run(() => !!document.querySelector('#mzStart .fx-sheet'))));
    await click('#mzHistoryButton');
    await sleep(500);
    const hist = await run(() => document.querySelectorAll('#mzHistoryFacts > div').length);
    record(label + 'History opens the last analysis in a side panel', hist === 2, hist);
    await run(() => { document.querySelector('#mzHistory .fx-sheet-backdrop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; });
    await sleep(300);

    // Arrow keys move between the tabs
    await run(() => { const t = document.getElementById('mo-modules'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return 1; });
    await sleep(300);
    record(label + 'arrow keys move to the next tab', await run(() => document.getElementById('mo-findings').getAttribute('aria-selected') === 'true'));

    // Findings: rule ids and lines; severity chips with counts
    await click('#mo-findings');
    await sleep(500);
    const f = await run(() => Array.from(document.querySelectorAll('#findingList > li')).map((r) => r.textContent.replace(/\s+/g, ' ')));
    record(label + 'findings show the rule id and lines', f.every((t) => /lines \d+-\d+/.test(t)), f.length + ' rows');
    record(label + 'compatibility rows from the version packs', await run(() => document.querySelectorAll('#compatTable > div').length) > 0);
    if (f.length) {
      const sev = await run(() => Array.from(document.querySelectorAll('#mzSeverityChips button')).map((b) => b.textContent.trim()));
      record(label + 'severity chips with counts', sev.length === 3 && sev.every((t) => /\d+$/.test(t)), sev);
    }
    await shot(w.name + '-findings-1440');

    // Plan: gates and no completion claim; opportunities with a source and their evidence
    await click('#mo-plan');
    await sleep(500);
    const plan = await run(() => ({
      status: document.getElementById('mzCompletion').textContent.trim(),
      gates: Array.from(document.querySelectorAll('#mzGates li')).map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
      pre: document.querySelectorAll('#mzPrerequisites li').length,
      rollback: document.querySelectorAll('#mzRollback li').length,
      opps: Array.from(document.querySelectorAll('.factory-mz-opp')).map((o) => ({ id: o.id, src: (o.querySelector('.factory-mz-src') || {}).textContent || '' }))
    }));
    const status = plan.status.replace(/^Status\s*/, '');
    record(label + 'the plan does not say the migration is complete', /^Not complete/.test(status) && !/\bmigration (is )?complete\b/i.test(status.replace('does not record a migration as complete', '')), status);
    record(label + 'prerequisites, gates and rollback listed', plan.pre > 0 && plan.gates.length > 0 && plan.rollback > 0, plan);
    record(label + 'every opportunity is detected with a source', plan.opps.every((o) => /^(Detected|Version pack)/.test(o.src.trim())), plan.opps);
    if (plan.opps.length) {
      const ev = await run((id) => { const d = document.getElementById(id); d.open = true; return d.querySelectorAll('.factory-mz-evidence li').length; }, plan.opps[0].id);
      record(label + 'an opportunity opens to its evidence', ev > 0, ev);
    }
    await shot(w.name + '-plan-1440');

    // The assistant opens and Escape closes it (nothing is asked)
    await click('#moAssistantButton');
    await sleep(400);
    const opened = await run(() => !!document.querySelector('#moAssistant .fx-sheet'));
    await run(() => { document.querySelector('#moAssistant .fx-sheet-backdrop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; });
    await sleep(400);
    record(label + 'the assistant opens and Escape closes it', opened && !(await run(() => !!document.querySelector('#moAssistant .fx-sheet'))));
    record(label + 'no model call', !requests.some((r) => /knowledge\/ask/.test(r.url)));
    record(label + 'nothing saved', writes().length === 0, writes());
    record(label + 'profile asked for only when the code is indexed', w.indexedRevision != null || !requests.some((r) => /\/profile$/.test(r.url)));
    record(label + 'no failed API calls or console errors', s.errors.length === 0, s.errors.slice(0, 3));

    // A new app, put into the page only (nothing saved): the boxes count a change writing into the app folder
    await click('#mo-modules');
    const sim = await run(() => {
      const m = window.__mz;
      const name = m.modules()[0].name;
      m.channel({ target: 'react-native', title: 'React Native (iOS and Android)', preview: 'react-native', appFolder: 'mobile', appFolderExists: true });
      m.changes([{ id: '00000000-0000-0000-0000-000000000001', title: 'Convert ' + name, status: 'DELIVERED', buildStatus: null, closedReason: null, updatedAt: new Date().toISOString(),
        deliveredRevision: 9, files: [{ path: 'mobile/src/screens/' + name + '/OverviewScreen.tsx' }], plan: null }]);
      return name;
    });
    await sleep(500);
    const simPage = await run((name) => {
      const m = window.__mz;
      const row = m.modules().find((x) => x.name === name);
      return { done: Number(document.querySelector('#mzBox-done .factory-rq-stage-count').textContent), key: row.conversion.key, rowChip: !!document.querySelector('#mzModuleList > li .fx-status'), target: document.querySelector('#mzTargetChannel .factory-mz-targetname').textContent.trim() };
    }, sim);
    record(label + 'with a new app, a delivered change into its folder counts its module as converted', simPage.done >= 1 && simPage.key === 'done' && simPage.rowChip && simPage.target === 'React Native', simPage);
    await click('#mzBox-done');
    await sleep(300);
    const filtered = await run(() => ({ rows: document.querySelectorAll('#mzModuleList > li').length, pressed: document.getElementById('mzBox-done').getAttribute('aria-pressed') }));
    record(label + 'a box filters the modules', filtered.pressed === 'true' && filtered.rows === simPage.done, filtered);
    await click('#mzBox-done');
    await shot(w.name + '-converted-1440');

    // Phone width: nothing scrolls sideways on any tab
    await size(390, 844);
    for (const t of ['modules', 'findings', 'plan']) {
      await click('#mo-' + t);
      await sleep(400);
      const over = await run(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const shown = await run(() => Array.from(document.querySelectorAll('.factory-mz [role=tabpanel]')).filter((p) => p.offsetParent !== null).map((p) => p.id));
      record(label + t + ' panel alone shows', shown.length === 1 && shown[0] === 'mo-panel-' + t, shown);
      record(label + t + ' fits 390 px', over <= 0, over);
    }
    await click('#mo-modules');
    await shot(w.name + '-modules-390');

    // Show in Code: the first finding's file on Code › Explore
    await size(1440, 1000);
    await click('#mo-findings');
    await sleep(300);
    const target = await run(() => { const b = document.querySelector('#findingList > li .fx-btn--secondary'); if (!b) { return null; } const p = b.closest('li').getAttribute('data-path'); b.click(); return p; });
    if (target) {
      await sleep(5000);
      // Code › Explore: the file's name in the viewer's title, its folder under it
      const shown = await run((p) => location.search.indexOf('ojr=code') >= 0 && ((document.getElementById('fileTitle') || {}).textContent || '').trim() === p.split('/').pop()
        && ((document.getElementById('viewerFacts') || {}).textContent || '').indexOf(p.split('/').slice(0, -1).join('/') || 'Top level') === 0, target);
      record(label + 'Show in Code opens the file on Code › Explore', shown, target);
    }
  }
  s.close();
  process.stdout.write('\n' + (defects ? defects + ' defect(s).' : 'No defects.') + '\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
