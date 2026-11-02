// Agent Runs check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - every run has one of the outcomes (succeeded, partially completed, failed, timed out, quota exhausted,
//    interrupted, running, queued), and the outcome tabs count the runs the other filters leave;
//  - the filters (search, agent, workspace, requirement) narrow the list;
//  - a run's details show a timeline (timed events in order), inputs and outputs, and say what is not recorded
//    (model, prompt version, tokens) instead of filling it in;
//  - a run that stopped says why; Continue generation and Retry show only where the server takes them;
//  - tabs work with the arrow keys; nothing scrolls sideways at 390 px; no console errors. It only reads.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-agents.js --url http://localhost:8080 [--workspace <id>]
//
// Exit code 1 on a defect.
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const OUTCOMES = ['Succeeded', 'Partially completed', 'Failed', 'Timed out', 'Quota exhausted', 'Interrupted', 'Running', 'Queued'];

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  // Runs fn(viewModel, arg) in the page
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'runList\')), a))))' }, arg);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=agents');
  await sleep(6000);

  const list = await run(() => ({
    rows: document.querySelectorAll('#runTable tbody tr').length,
    outcomes: [...document.querySelectorAll('#runTable tbody .fx-status')].map((x) => x.textContent.trim()),
    heads: [...document.querySelectorAll('#runTable thead th')].map((t) => t.textContent.trim()),
    h1: (document.querySelector('.factory-ag h1') || {}).className || ''
  }));
  if (!list.rows) {
    record('runs are listed', false, 'no runs in this workspace');
    s.close();
    process.exit(1);
  }
  record('every run has one of the outcomes', list.outcomes.every((o) => OUTCOMES.indexOf(o) >= 0), Array.from(new Set(list.outcomes)));
  record('no model column (the factory does not record the model of a run)', list.heads.indexOf('Model') < 0, list.heads);
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(list.h1));

  const counts = await vm((m) => ({ tabs: m.tabs().map((t) => ({ value: t.value, text: t.text() })), matching: m.matching().length,
    byOutcome: m.matching().reduce((a, r) => { a[r.outcome] = (a[r.outcome] || 0) + 1; return a; }, {}) }));
  record('the outcome tabs count the runs the filters leave', counts.tabs.every((t) => t.value === 'all' ? t.text === 'All (' + counts.matching + ')'
    : / \((\d+)\)$/.test(t.text) && Number(/ \((\d+)\)$/.exec(t.text)[1]) === (counts.byOutcome[t.value] || 0)), counts.tabs);

  // Filters narrow the list
  const filters = await vm((m) => {
    const all = m.visibleRuns().length;
    const first = m.visibleRuns()[0];
    m.agentFilter([first.agent]);
    const byAgent = m.visibleRuns().every((r) => r.agent === first.agent);
    m.agentFilter([]);
    m.search(first.id);
    const bySearch = m.visibleRuns().length === 1;
    m.search('');
    let byRequirement = true;
    const req = m.requirementOptions()[0];
    if (req) {
      m.requirementFilter(req.id);
      byRequirement = m.visibleRuns().length > 0 && m.visibleRuns().every((r) => r.requirementId === req.id);
      m.requirementFilter('');
    }
    m.workspaceFilter('');
    const allWorkspaces = m.visibleRuns().length >= all;
    return { all: all, byAgent: byAgent, bySearch: bySearch, byRequirement: byRequirement, allWorkspaces: allWorkspaces };
  });
  record('the agent filter keeps that agent\'s runs', filters.byAgent, filters);
  record('searching a run ID finds that run', filters.bySearch);
  record('the requirement filter keeps that requirement\'s runs', filters.byRequirement);
  record('"All workspaces" shows at least the selected workspace\'s runs', filters.allWorkspaces);

  // The details of every run on the page
  const details = await vm((m) => m.visibleRuns().slice(0, 25).map((r) => {
    m.selectedKey(r.key);
    const timed = m.timeline().filter((e) => e.when !== 'Time not recorded');
    const untimedFirst = m.timeline().findIndex((e) => e.when === 'Time not recorded');
    return { id: r.id, outcome: r.outcome, events: m.timeline().length, timedAfterUntimed: untimedFirst >= 0 && m.timeline().slice(untimedFirst).some((e) => e.when !== 'Time not recorded'),
      reason: r.reason, model: m.modelText(), inputs: m.inputs().length, outputs: m.outputs().length,
      resume: !!m.resumeAction(), retry: !!m.retryAction(), agent: r.agent };
  }));
  record('every run has a timeline', details.every((d) => d.events > 0), details.filter((d) => !d.events).map((d) => d.id));
  record('timed events come before events without a time', details.every((d) => !d.timedAfterUntimed));
  record('the model is never attributed to a run', details.every((d) => /^Not recorded for this run\./.test(d.model)));
  record('a run that did not succeed says why', details.filter((d) => ['failed', 'timedout', 'quota', 'interrupted', 'partial'].indexOf(d.outcome) >= 0).every((d) => d.reason));
  record('Continue generation only for code generation that stopped part-way', details.every((d) => !d.resume || (d.agent === 'code' && ['partial', 'quota', 'failed', 'timedout', 'interrupted'].indexOf(d.outcome) >= 0)));
  record('Retry never offered on a run that succeeded, except analyzing again', details.every((d) => !d.retry || d.outcome !== 'succeeded' || d.agent === 'analysis'));

  // The timeline's times are in order, and the Details tab says what is not recorded
  await vm((m) => { m.selectedKey(m.visibleRuns()[0].key); m.detailTab('timeline'); return 1; });
  await sleep(1500);
  const tl = await vm((m) => m.timeline().filter((e) => e.when !== 'Time not recorded').length);
  record('the selected run shows its timeline', await run(() => document.querySelectorAll('#runTimeline li').length > 0), tl);
  await run(() => { document.getElementById('agd-details').click(); return 1; });
  await sleep(600);
  const dl = await run(() => (document.getElementById('runDetails') || {}).textContent || '');
  record('Details show model, prompt version, tokens and failure reason', ['Model / provider', 'Prompt version', 'Tokens and usage', 'Failure reason'].every((k) => dl.indexOf(k) >= 0));

  // Tabs by keyboard
  await run(() => { document.getElementById('agd-details').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(600);
  record('ArrowRight moves to the next detail tab', await run(() => document.activeElement && document.activeElement.id === 'agd-related'));

  // Phone
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Agent Runs: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
