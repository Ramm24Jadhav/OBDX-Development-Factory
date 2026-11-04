// Integrations check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - a catalogue of connections with scope, health, last success and last error; no KPI tiles, no environment table;
//  - health is green only with a recorded result (test, import, build, sign-in or update check), never from settings;
//  - Test connection on an SVN integration is recorded by the server: after a reload it is still in Tests;
//  - the detail separates connection, login (authentication), tests, activity and workspaces; credentials show only as
//    stored or not; a workspace's Settings opens the Code page on Settings;
//  - tabs work with the arrow keys; nothing scrolls sideways at 390 px; no console errors.
// It runs "svn info" through Test connection (reads the repository, changes nothing) and opens pages; nothing else.
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
  // Runs fn(viewModel) in the page
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'integrationList\')), a))))' }, arg);
  const waitLoaded = async () => {
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      if (await run(() => !!document.getElementById('integrationList')) && !(await vm((m) => m.loading()))) { return; }
    }
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=integrations');
  await waitLoaded();

  const top = await run(() => ({
    cols: [...document.querySelectorAll('.factory-in-cols span')].map((t) => t.textContent.trim()),
    kpis: document.querySelectorAll('.factory-in .fx-kpi, .factory-in .factory-kpis').length,
    env: !!document.getElementById('envTable'),
    rows: document.querySelectorAll('#integrationList .factory-in-entry').length,
    text: document.querySelector('.factory-in').innerText
  }));
  record('the list shows integration, scope, health, last success and last error',
    ['Integration', 'Scope', 'Health', 'Last success', 'Last error'].every((h) => top.cols.indexOf(h) >= 0), top.cols);
  record('no KPI tiles and no environment table', top.kpis === 0 && !top.env);
  record('there are integrations to show', top.rows > 0, top.rows);
  record('no "Connected" or "Configured" status from saved settings', !/\b(Configured|Connection Issue)\b/.test(top.text));

  const health = await vm((m) => m.items().map((i) => ({ name: i.name, health: i.health, success: !!i.success, scope: i.scope, members: i.members.length })));
  record('green (Reached) only with a recorded result', health.every((i) => i.health !== 'ok' || i.success), health);
  record('every integration names its scope', health.every((i) => !!i.scope));

  // An SVN integration: details, workspaces and a recorded test
  const svnKey = await vm((m) => { const i = m.items().find((x) => x.type === 'svn'); if (i) { m.selectedKey(i.key); } return i ? i.key : null; });
  record('an SVN integration is listed', !!svnKey);
  if (svnKey) {
    await sleep(400);
    const tabs = await run(() => [...document.querySelectorAll('.factory-in-dtabs [role=tab]')].map((t) => t.textContent.trim()));
    record('the detail separates connection, login (authentication), tests, activity and workspaces',
      ['Connection', 'Login', 'Tests', 'Activity'].every((t) => tabs.indexOf(t) >= 0) && tabs.some((t) => /^Workspaces/.test(t)), tabs);
    await vm((m) => { m.detailTab('auth'); return 1; });
    await sleep(300);
    const auth = await run(() => document.getElementById('integrationPanel').innerText);
    record('credentials show only as stored or not', /Password\s+(Stored \(encrypted\)|Not stored)/.test(auth), auth.replace(/\s+/g, ' ').slice(0, 120));

    const before = await vm((m, key) => m.items().find((i) => i.key === key).tests.length, svnKey);
    const canTest = await run(() => !!document.getElementById('testIntegrationButton'));
    record('Test connection is offered to an administrator', canTest);
    if (canTest) {
      await run(() => { document.getElementById('testIntegrationButton').click(); return 1; });
      for (let i = 0; i < 60 && await vm((m) => m.testing()); i++) { await sleep(500); }
      await sleep(500);
      const after = await vm((m, key) => { const i = m.items().find((x) => x.key === key); return { tests: i.tests.length, health: i.health }; }, svnKey);
      record('the test result shows in Tests', after.tests > before, { before: before, after: after });
      // Reload: the result was recorded by the server
      await open(BASE + '/?ojr=integrations');
      await waitLoaded();
      const reloaded = await vm((m, key) => { const i = m.items().find((x) => x.key === key); return i ? { tests: i.tests.length, health: i.health } : null; }, svnKey);
      record('the test is still there after a reload (recorded, not session only)', reloaded && reloaded.tests === after.tests && reloaded.health === after.health, reloaded);
      await vm((m, key) => { m.selectedKey(key); m.detailTab('tests'); return 1; }, svnKey);
      await sleep(300);
      record('Tests lists the test', await run(() => !!document.querySelector('#integrationTests li')));
    }

    // Tabs by keyboard
    await vm((m) => { m.detailTab('connection'); return 1; });
    await sleep(300);
    await run(() => { document.getElementById('in-tab-connection').focus(); return 1; });
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await sleep(400);
    record('ArrowRight moves to Login', await run(() => document.activeElement && document.activeElement.id === 'in-tab-auth'));
  }

  const pageText = await run(() => document.body.innerText);
  record('the page text holds no secret-looking value', !SECRET.test(pageText));

  // Phone
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // A workspace's Settings opens the Code page on Settings
  if (svnKey) {
    await vm((m, key) => { m.selectedKey(key); m.detailTab('workspaces'); return 1; }, svnKey);
    await sleep(400);
    await run(() => { const b = [...document.querySelectorAll('#integrationWorkspaces button')].find((x) => x.textContent.trim() === 'Settings'); b.click(); return 1; });
    await sleep(3000);
    const code = await run(() => ({ url: location.search, tab: (document.querySelector('[role=tab][aria-selected=true]') || {}).textContent || '' }));
    record('Settings opens Code > Settings', /ojr=code/.test(code.url) && /^Settings/.test(code.tab.trim()), code);
  }

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Integrations: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
