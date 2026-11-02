// Build, Test & Review check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - a verdict and six gates (build, unit tests, integration tests, static checks, security checks, requirement
//    coverage), each in one of six states, and the verdict is never "passed" while a gate has not run;
//  - the findings belong to the last run only, with severity, check, file and line, and linked criteria;
//  - runs are listed, and two runs can be compared;
//  - coverage lists the acceptance criteria with the files that name them;
//  - actions the server would refuse are disabled and say why; tabs work with the arrow keys; nothing scrolls sideways
//    at 390 px. It only reads (opens pages, switches tabs).
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-build.js --url http://localhost:8080 [--workspace <id>]
//
// Exit code 1 on a defect.
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const STATES = ['Not run', 'Running', 'Passed', 'Passed with warnings', 'Failed', 'Blocked'];

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const tab = async (name) => { await run((t) => { document.getElementById('bt-' + t).click(); return 1; }, name); await sleep(900); };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=build');
  await sleep(6000);
  const top = await run(() => ({
    verdict: ((document.getElementById('verdictStatus') || {}).textContent || '').trim(),
    gates: [...document.querySelectorAll('#gates [data-gate]')].map((g) => ({ key: g.getAttribute('data-gate'),
      state: g.querySelector('.fx-status').textContent.trim(), evidence: g.querySelector('.factory-bt-gateev').textContent.trim() })),
    h1: (document.querySelector('.factory-bt h1') || {}).className || ''
  }));
  if (!top.gates.length) {
    record('a change with gates is shown', false, 'no change in this workspace');
    s.close();
    process.exit(1);
  }
  record('six gates: build, unit tests, integration tests, static, security, coverage',
    top.gates.map((g) => g.key).join(',') === 'build,tests,integration,static,security,coverage', top.gates.map((g) => g.key));
  record('every gate is in one of the six states', top.gates.every((g) => STATES.indexOf(g.state) >= 0), top.gates.map((g) => g.state));
  record('every gate says what its status comes from', top.gates.every((g) => g.evidence.length > 10));
  const notRun = top.gates.filter((g) => g.state === 'Not run').length;
  record('the verdict is not "passed" while a gate has not run', !notRun || top.verdict !== 'Passed', { verdict: top.verdict, notRun: notRun });
  record('integration tests are not shown as passed (nothing reports them)', top.gates.find((g) => g.key === 'integration').state === 'Not run');
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(top.h1));

  // Findings come from the last run only
  const findings = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => {
    const vm = ko.dataFor(document.getElementById('qualityGate'));
    const runs = vm.runs();
    const last = runs.length ? runs[runs.length - 1] : null;
    resolve({
      buildState: vm.gates()[0].status.text,
      buildRows: vm.failures().filter((f) => f.check === 'build' || f.check === 'tests').length,
      lastErrors: last ? last.finalErrors.length : 0,
      heads: [...document.querySelectorAll('#failureTable thead th')].map((t) => t.textContent.trim()).filter(Boolean)
    });
  })));
  record('build and test findings belong to the last run', findings.buildState !== 'Passed' || findings.buildRows === 0, findings);
  record('findings show severity, check, file and line, summary and linked items',
    ['Severity', 'Check', 'File and line', 'Summary', 'Linked'].every((h) => findings.heads.indexOf(h) >= 0), findings.heads);

  // Tabs by keyboard
  await run(() => { document.getElementById('bt-gates').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(600);
  record('ArrowRight moves to the Runs tab', await run(() => document.activeElement && document.activeElement.id === 'bt-history'));

  // Runs and compare
  await tab('history');
  const runs = await run(() => ({ rows: document.querySelectorAll('#runTable tbody tr').length,
    states: [...document.querySelectorAll('#runTable tbody .fx-status')].map((x) => x.textContent.trim()) }));
  record('runs are listed with their result', runs.rows > 0 && runs.states.every((x) => STATES.indexOf(x) >= 0), runs);
  if (runs.rows > 1) {
    const diff = await run(() => [...document.querySelectorAll('#runCompare .factory-bt-diffkind')].map((x) => x.textContent.trim()));
    record('two runs are compared (result, new, fixed, still failing)', diff[0] === 'Result', diff);
  }

  // Coverage
  await tab('coverage');
  const cov = await run(() => ({ rows: document.querySelectorAll('#coverageTable tbody tr').length,
    states: [...document.querySelectorAll('#coverageTable tbody .fx-status')].map((x) => x.textContent.trim()) }));
  record('coverage lists the criteria and where they are named', cov.rows === 0 || cov.states.every((x) => ['In a test', 'Only in code', 'Nowhere'].indexOf(x) >= 0), cov);

  // Actions the server would refuse are disabled, with the reason
  const actions = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => {
    const vm = ko.dataFor(document.getElementById('qualityGate'));
    const d = vm.detail();
    resolve({ status: d.status, deliver: !document.getElementById('submitReviewButton').disabled, check: !document.getElementById('checkAgainButton').disabled,
      build: !document.getElementById('rebuildButton').disabled, canFix: vm.canFix(), jenkins: !!(vm.jenkins() && vm.jenkins().mode), building: d.buildStatus === 'BUILDING' });
  })));
  record('Submit for Review only for written code that is not delivered', actions.deliver === (actions.status === 'GENERATED' && !actions.building), actions);
  record('the quick checks only for written or delivered code', actions.check === (['GENERATED', 'DELIVERED'].indexOf(actions.status) >= 0 && !actions.building), actions);
  record('writing a file again only before delivery', !actions.canFix || actions.status === 'GENERATED', actions);

  // Phone
  await tab('gates');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Build, Test & Review: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
