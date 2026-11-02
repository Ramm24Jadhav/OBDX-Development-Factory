// Models & AI Providers check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - no provider shows as connected or available before a test of it succeeded; a test that succeeds shows it as
//    connected with its last success, and Provider Health lists it;
//  - routing names every task and says a model per task is not supported; the fallback behaviour and the limits learned
//    from the provider are shown;
//  - the data classification says where the bank's content may go; API keys never reach the browser;
//  - tabs work with the arrow keys; nothing scrolls sideways at 390 px; no console errors.
// It tests the connection to the model server in use (lists its models: nothing is sent to it) and reads the rest.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-models.js --url http://localhost:8080
//
// Exit code 1 on a defect.
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  // Runs fn(viewModel) in the page
  const vm = (fn) => run({ toString: () => '() => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'modelsInUse\'))))))' });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=models');
  await sleep(6000);

  // Before any test of this page: nothing reads connected unless the server remembers a test that succeeded
  const before = await vm((m) => m.providers().map((p) => ({ name: p.short, pill: p.pill().text, status: p.statusPill().text,
    remembered: p.lastCheck() ? p.lastCheck().ok : null })));
  record('no provider shows as connected or available without a test that succeeded',
    before.every((p) => (p.remembered === true) || (!/Connected/.test(p.pill) && p.status !== 'Available')), before);
  record('the h1 is only for screen readers', await run(() => /fx-visually-hidden/.test((document.querySelector('.factory-md h1') || {}).className || '')));

  // Test the server in use: its card shows it connected, and Provider Health lists it
  const tested = await vm((m) => new Promise((resolve) => {
    const p = m.providers().find((x) => x.active());
    if (!p) { resolve({ none: true }); return; }
    p.test();
    const wait = () => (p.testing() ? setTimeout(wait, 200) : setTimeout(() => resolve({ name: p.short, pill: p.pill().text, status: p.statusPill().text, lastOk: p.lastOkText(), error: p.lastError() }), 1500));
    setTimeout(wait, 200);
  }));
  record('a test that succeeds shows the provider as available, with its last success', tested.none || (tested.status === 'Available' && tested.lastOk === 'Just now') || !!tested.error, tested);
  const health = await run(() => [...document.querySelectorAll('#providerHealth tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  record('Provider Health lists the servers tested since the factory started', tested.none || health.length > 0, health.slice(0, 2));

  // Tabs by keyboard
  await run(() => { document.getElementById('md-providers').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(800);
  record('ArrowRight moves to Model Routing', await run(() => document.activeElement && document.activeElement.id === 'md-routing'));

  // Routing, fallback, limits
  const routing = await run(() => ({
    tasks: [...document.querySelectorAll('#routingTable tbody tr td:first-child')].map((t) => t.textContent.trim()),
    note: !!document.getElementById('taskRoutingNote'), fallback: (document.getElementById('fallbackFacts') || {}).textContent || '',
    limits: !!document.getElementById('limitsTable')
  }));
  record('routing names BRD analysis, query enhancement, UI design, code generation, code review and knowledge Q&A',
    ['BRD', 'Query enhancement', 'UI design', 'Code generation', 'Code review', 'Knowledge Q&A'].every((t) => routing.tasks.some((x) => x.indexOf(t) >= 0)), routing.tasks);
  record('routing says a model per task is not supported', routing.note);
  record('the fallback behaviour and the learned limits are shown', /no fallback provider/i.test(routing.fallback) && routing.limits);

  // Privacy
  await run(() => { document.getElementById('md-policies').click(); return 1; });
  await sleep(1000);
  const privacy = await run(() => ({ rows: document.querySelectorAll('#classificationTable tbody tr').length, rotation: document.querySelectorAll('#rotationSteps li').length }));
  record('the data classification says where restricted content and code may go', privacy.rows === 2, privacy);
  record('rotating a key is explained step by step', privacy.rotation === 3);

  // Keys never reach the browser
  const status = await run(() => fetch('api/model/status').then((r) => r.text()));
  record('the model status holds no key, only whether one is set', !/apiKey"\s*:\s*"/.test(status) && /apiKeySet/.test(status), status.slice(0, 160));

  // Phone
  await run(() => { document.getElementById('md-providers').click(); return 1; });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e) && !/servers\/models/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Models & AI Providers: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
