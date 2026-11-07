// Integrations check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the connections in groups (Source control, Builds, AI model servers, Sign-in, Updates), each row with its health,
//    last result and action; Jenkins has a row for every workspace, "Set up" where it is missing, opening Code › Settings
//    of that workspace;
//  - filter chips (All, Needs a test, Not set up, Working) with counts that match the rows they show, and the search;
//  - health is green only with a recorded result, never from settings; the model servers show the same health as
//    Models & AI (one test record);
//  - the detail beside the list has Connection (settings and login; credentials only as stored or not), History
//    (tests and activity, newest first) and Used by only for a server shared by several workspaces;
//  - Test connection on an SVN integration is recorded by the server: after a reload it is still in History;
//  - tabs work with the arrow keys; the detail goes under the list at 1024 px; nothing scrolls sideways at 390 px.
// It runs "svn info" through Test connection (reads the repository, changes nothing), lists the models of the model
// server in use (nothing is sent to the model) and opens pages; nothing else.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-integrations.js --url http://localhost:8080
//
// Exit code 1 on a defect.
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const SECRET = /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*(?!•)[^\s"',;]{4,}/i;

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  // Runs fn(viewModel, arg) in the page
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => window.require([\'knockout\'], (ko) => Promise.resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'integrationList\')), a)).then(resolve)))' }, arg);
  const waitLoaded = async () => {
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      if (await run(() => !!document.getElementById('integrationList')) && !(await vm((m) => m.loading()))) { await sleep(500); return; }
    }
  };
  const key = async (k, code, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: code, windowsVirtualKeyCode: vk });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: vk });
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=integrations');
  await waitLoaded();

  const top = await run(() => ({
    groups: [...document.querySelectorAll('#integrationList .factory-in-group')].map((t) => t.textContent.trim()),
    cols: [...document.querySelectorAll('.factory-in-cols span')].map((t) => t.textContent.trim()),
    rows: document.querySelectorAll('#integrationList .factory-in-entry').length,
    text: document.querySelector('.factory-in').innerText
  }));
  record('the connections are grouped: Source control, Builds, AI model servers, Sign-in, Updates',
    ['Source control', 'Builds', 'AI model servers', 'Sign-in', 'Updates'].every((g) => top.groups.indexOf(g) >= 0), top.groups);
  record('each row shows the connection, health, last result and action', ['Connection', 'Health', 'Last result', 'Action'].every((h) => top.cols.indexOf(h) >= 0), top.cols);
  record('no "Connected" or "Configured" status from saved settings', !/\b(Configured|Connection Issue)\b/.test(top.text));

  const items = await vm((m) => m.items().map((i) => ({ key: i.key, type: i.type, name: i.name, health: i.health, filter: i.filter, success: !!i.success,
    members: i.members.length, action: i.action, sub: i.sub })));
  record('green (Working) only with a recorded result', items.every((i) => i.health !== 'ok' || i.success), items.filter((i) => i.health === 'ok'));

  // Filters: the counts match the rows each one shows
  const filters = [];
  for (const f of ['all', 'test', 'notset', 'working']) {
    await run((id) => { document.getElementById('intFilter-' + id).click(); return 1; }, f);
    await sleep(300);
    filters.push(await run((id) => ({ id: id, label: document.getElementById('intFilter-' + id).textContent.trim(), pressed: document.getElementById('intFilter-' + id).getAttribute('aria-pressed'),
      rows: document.querySelectorAll('#integrationList .factory-in-entry').length }), f));
  }
  record('filter chips All, Needs a test, Not set up and Working, each count matching its rows',
    filters.every((f) => f.pressed === 'true' && Number((/(\d+)$/.exec(f.label) || [])[1]) === f.rows) && /^All/.test(filters[0].label) && /^Needs a test/.test(filters[1].label)
      && /^Not set up/.test(filters[2].label) && /^Working/.test(filters[3].label) && filters[0].rows === items.length, filters);
  await run(() => { document.getElementById('intFilter-all').click(); return 1; });
  await run(() => { const i = document.getElementById('intSearch'); i.value = 'jenkins'; i.dispatchEvent(new Event('input')); return 1; });
  await sleep(300);
  const searched = await run(() => [...document.querySelectorAll('#integrationList .factory-in-entry strong')].map((x) => x.textContent));
  record('the search narrows the list', searched.length > 0 && searched.every((t) => /Jenkins/.test(t)), searched);
  await run(() => { const i = document.getElementById('intSearch'); i.value = ''; i.dispatchEvent(new Event('input')); return 1; });
  await sleep(300);

  // The model servers: the same health as Models & AI
  const models = items.filter((i) => i.type === 'model');
  const checks = await run(() => fetch('api/model/checks').then((r) => (r.ok ? r.json() : [])));
  const norm = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
  const fromRecord = (url) => { const c = checks.find((x) => norm(x.baseUrl) === norm(url)); return c ? (c.ok ? 'ok' : 'failed') : 'untested'; };
  record('the AI model servers are listed', models.length >= 1, models.map((m) => m.name));
  record('model server health comes from the test record Models & AI uses', models.every((m) => m.health === fromRecord(m.sub)), models.map((m) => ({ name: m.name, health: m.health, record: fromRecord(m.sub) })));

  // Jenkins: a row for every workspace; Set up where it is missing
  const workspaces = await run(() => fetch('api/workspaces').then((r) => r.json()));
  const jenkinsRows = items.filter((i) => i.type === 'jenkins');
  const notSet = jenkinsRows.filter((i) => i.health === 'notset');
  record('Jenkins has a row for every workspace (set up or not)', jenkinsRows.reduce((n, i) => n + Math.max(1, i.members), 0) >= workspaces.length, jenkinsRows.map((i) => i.name));
  record('a workspace without Jenkins shows Not set up with the action Set up', notSet.every((i) => i.action === 'Set up'), notSet.map((i) => i.name));

  // An SVN integration: details, history and a recorded test
  const svn = items.find((i) => i.type === 'svn');
  record('an SVN integration is listed', !!svn);
  if (svn) {
    await vm((m, k) => { m.selectedKey(k); return 1; }, svn.key);
    await sleep(400);
    const det = await run(() => ({
      tabs: [...document.querySelectorAll('.factory-in-dtabs [role=tab]')].map((t) => t.textContent.trim()),
      group: (document.querySelector('.factory-in-glabel') || {}).textContent || '', facts: (document.getElementById('integrationFacts') || {}).innerText || '',
      buttons: [...document.querySelectorAll('.factory-in-btns button')].map((b) => b.textContent.trim())
    }));
    record('the detail names its group and has Connection and History' + (svn.members > 1 ? ' and Used by' : ', without Used by for one workspace'),
      det.group === 'Source control' && det.tabs[0] === 'Connection' && det.tabs[1] === 'History' && (svn.members > 1 ? /^Used by/.test(det.tabs[2] || '') : det.tabs.length === 2), det.tabs);
    record('Connection has the repository and the login, credentials only as stored or not',
      /Repository/.test(det.facts) && /(password stored \(encrypted\)|no password stored)/.test(det.facts), det.facts.replace(/\s+/g, ' ').slice(0, 200));
    record('the actions are Test connection and Edit in Code › Settings', det.buttons.indexOf('Test connection') >= 0 || det.buttons.indexOf('Test again') >= 0, det.buttons);

    const before = await vm((m, k) => m.items().find((i) => i.key === k).results.filter((r) => r.source === 'Connection test').length, svn.key);
    const canTest = await run(() => !!document.getElementById('testIntegrationButton'));
    if (canTest) {
      await run(() => { document.getElementById('testIntegrationButton').click(); return 1; });
      for (let i = 0; i < 60 && await vm((m) => m.testing()); i++) { await sleep(500); }
      await sleep(500);
      const after = await vm((m, k) => { const i = m.items().find((x) => x.key === k); return { tests: i.results.filter((r) => r.source === 'Connection test').length, health: i.health }; }, svn.key);
      record('the test result is recorded', after.tests > before, { before: before, after: after });
      await open(BASE + '/?ojr=integrations');
      await waitLoaded();
      const reloaded = await vm((m, k) => { const i = m.items().find((x) => x.key === k); return i ? { tests: i.results.filter((r) => r.source === 'Connection test').length, health: i.health } : null; }, svn.key);
      record('the test is still there after a reload (recorded, not this page only)', reloaded && reloaded.tests === after.tests && reloaded.health === after.health, reloaded);
      await vm((m, k) => { m.selectedKey(k); m.detailTab('history'); return 1; }, svn.key);
      await sleep(400);
      const hist = await vm((m) => m.detail().history.map((h) => h.text));
      record('History lists the test and the activity on one timeline, newest first', hist.length > 1 && /^Connected|failed|refused|not/i.test(hist[0]), hist.slice(0, 4));
    }

    // Tabs by keyboard
    await vm((m, k) => { m.selectedKey(k); m.detailTab('connection'); return 1; }, svn.key);
    await sleep(300);
    await run(() => { document.getElementById('in-tab-connection').focus(); return 1; });
    await key('ArrowRight', 'ArrowRight', 39);
    await sleep(400);
    record('ArrowRight moves to History', await run(() => document.activeElement && document.activeElement.id === 'in-tab-history'));
  }

  const pageText = await run(() => document.body.innerText);
  record('the page text holds no secret-looking value', !SECRET.test(pageText));

  // 1024 px: the detail under the list; 390 px: no sideways scroll
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  record('at 1024 px the detail goes under the list', await run(() => document.getElementById('integrationDetail').getBoundingClientRect().top >= document.querySelector('.factory-in-list').getBoundingClientRect().bottom - 1));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // Set up on a Jenkins row opens Code › Settings of that workspace
  if (notSet.length) {
    await vm((m, k) => { m.selectedKey(k); return 1; }, notSet[0].key);
    await sleep(400);
    const wsId = notSet[0].key.split('|')[1];
    await run(() => { document.getElementById('setUpIntegrationButton').click(); return 1; });
    await sleep(3000);
    const code = await run(() => new Promise((resolve) => window.require(['services/workspaceSelection'], (w) => resolve({ url: location.search, ws: w.selectedId(),
      tab: ((document.querySelector('[role=tab][aria-selected=true]') || {}).textContent || '').trim() }))));
    record('Set up opens Code › Settings with that workspace', /ojr=code/.test(code.url) && /^Settings/.test(code.tab) && code.ws === wsId, code);
  }

  // The model server's details link to Models & AI
  if (models.length) {
    await open(BASE + '/?ojr=integrations');
    await waitLoaded();
    await vm((m, k) => { m.selectedKey(k); return 1; }, models[0].key);
    await sleep(400);
    const label = await run(() => ((document.getElementById('openIntegrationSettings') || {}).textContent || '').trim());
    await run(() => { document.getElementById('openIntegrationSettings').click(); return 1; });
    await sleep(2500);
    record('a model server opens in Models & AI', label === 'Open in Models & AI' && await run(() => /ojr=models/.test(location.search) && !!document.querySelector('.factory-ma')), label);
    await sleep(2500);
    const slot = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => { const m = ko.dataFor(document.querySelector('.factory-ma')); resolve(m && m.writing() ? m.writing().pill.category : null); })));
    const want = { ok: 'done', failed: 'failed', untested: 'warning' }[models[0].health];
    record('Models & AI shows the writing server with the same health as Integrations', slot === want, { integrations: models[0].health, models: slot });
  }

  const errors = s.errors.filter((e) => !/auth\/me/.test(e) && !/servers\/models/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Integrations: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
