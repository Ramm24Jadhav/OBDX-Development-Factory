// AI Prompt Library check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - editable templates (version pack recipes) and protected system prompts (the factory's own) show apart, each
//    with its kind, agent or task, version, status and approval; no review counts are made up;
//  - a prompt's details give purpose, model, last updated, approval and lifecycle; a template compares with the other
//    OBDX version's pack; nothing that looks like a secret is shown;
//  - Edit stays disabled with its reason; tabs work with the arrow keys; nothing scrolls sideways at 390 px; no console
//    errors. It only reads (opens tabs and prompts).
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-prompts.js --url http://localhost:8080 [--workspace <id>]
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
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'promptTable\')), a))))' }, arg);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=prompts');
  await sleep(6000);

  const top = await run(() => ({
    heads: [...document.querySelectorAll('#promptTable thead th')].map((t) => t.textContent.trim()),
    intro: (document.getElementById('promptGovernance') || {}).textContent || '',
    kpis: document.querySelectorAll('.factory-pr-page .factory-kpis').length,
    h1: (document.querySelector('.factory-pr-page h1') || {}).className || ''
  }));
  record('the table shows kind and approval, agent / task, version and status',
    ['Name', 'Agent / task', 'Version', 'Status · kind · approval'].every((h) => top.heads.indexOf(h) >= 0), top.heads);
  record('the page says how many templates and protected system prompts there are, and no made-up review counts',
    /editable templates/.test(top.intro) && /protected system prompts/.test(top.intro) && top.kpis === 0, top.intro.replace(/\s+/g, ' ').slice(0, 160));
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(top.h1));

  const kinds = await vm((m) => {
    const all = m.items();
    m.tab('editable');
    const editable = m.visible().every((x) => x.kind === 'template') && m.visible().length > 0;
    m.tab('Built-in Task');
    const system = m.visible().every((x) => x.kind === 'system') && m.visible().length > 0;
    m.tab('all');
    return { editable: editable, system: system, statuses: Array.from(new Set(all.map((x) => x.status.text))), agents: all.every((x) => !!x.agent), approval: all.every((x) => !!x.approval) };
  });
  record('editable templates and protected system prompts show apart', kinds.editable && kinds.system, kinds);
  record('every prompt names its agent or task and its approval', kinds.agents && kinds.approval);
  record('statuses are only what the factory records (In effect, Protected)', kinds.statuses.every((t) => t === 'In effect' || t === 'Protected'), kinds.statuses);

  // Details of the first template
  const details = await run(() => (document.getElementById('promptFacts') || {}).textContent || '');
  record('details give purpose, agent, model, version, last updated, approval and lifecycle',
    ['Purpose', 'Agent / task', 'Model', 'Version', 'Last updated', 'Approval', 'Lifecycle'].every((k) => details.indexOf(k) >= 0));
  record('Edit stays disabled', await run(() => document.getElementById('editTemplateButton').disabled));

  // Versions
  await vm((m) => { m.tab('editable'); m.selectedKey(m.visible()[0].key); m.detailTab('versions'); return 1; });
  let compare = null;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    compare = await vm((m) => m.versionCompare());
    if (compare.state !== 'loading') { break; }
  }
  record('a template is compared with the other OBDX version\'s pack', compare.state === 'ok' || compare.state === 'missing', { state: compare.state, text: compare.text });

  // No secrets anywhere the prompts are shown
  const leaks = await vm((m) => m.items().filter((x) => [x.guidance].concat(x.templates.map((t) => t.content)).some((t) => /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*(?!•)[^\s"',;]{4,}/i.test(t))).map((x) => x.title));
  record('nothing that looks like a secret is shown', leaks.length === 0, leaks);
  const pageText = await run(() => document.body.innerText);
  record('the page text holds no secret-looking value', !SECRET.test(pageText));

  // Tabs by keyboard
  await vm((m) => { m.tab('all'); return 1; });
  await sleep(500);
  await run(() => { document.getElementById('pr-all').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(600);
  record('ArrowRight moves to Editable templates', await run(() => document.activeElement && document.activeElement.id === 'pr-editable'));

  // Phone
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'AI Prompt Library: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
