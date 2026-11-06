// Build, Test & Review check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - one header: the change pickers, the title, a mono line, the verdict pill, one primary action and a menu with the
//    rest; one problem bar or one next line;
//  - five gate cards (build, unit tests, static checks, security checks, requirement coverage), each in one of six
//    states, integration tests as one line under them; the verdict is never "passed" while a gate has not run;
//  - three tabs (findings, runs and logs, checks and coverage) that work with the arrow keys;
//  - the findings belong to the last run only; they are compact rows (severity, check, file and line, message, linked)
//    with filter chips with counts, a search and a menu, and the finding beside them;
//  - runs are listed and compared, or one line says there are none (no empty panels);
//  - the checks per file and the coverage list the files and criteria, with chips;
//  - delivery and approvals, and the assistant, open in side panels;
//  - actions the server would refuse are disabled and say why; nothing scrolls sideways at 390 px.
// It only reads (opens pages, switches tabs, opens side panels).
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
  const vm = (fn, arg) => run({ toString: () => '(arg) => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.querySelector(\'.factory-bt\')), arg))))' }, arg);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=build');
  if (args.workspace) { await s.selectWorkspace(args.workspace); }
  await sleep(6000);
  const top = await run(() => ({
    verdict: ((document.getElementById('verdictStatus') || {}).textContent || '').trim(),
    gates: [...document.querySelectorAll('#gates [data-gate]')].map((g) => ({ key: g.getAttribute('data-gate'),
      state: g.querySelector('.fx-status').textContent.trim(), evidence: g.querySelector('.factory-bt-gateev').textContent.trim() })),
    integration: ((document.getElementById('integrationLine') || {}).textContent || '').trim(),
    h1: (document.querySelector('.factory-bt h1') || {}).className || '',
    pickers: !!document.getElementById('buildRequirement') && !!document.getElementById('buildChange'),
    title: ((document.getElementById('buildTitle') || {}).textContent || '').trim(),
    meta: ((document.getElementById('buildMeta') || {}).textContent || '').trim(),
    primaries: document.querySelectorAll('#qualityGate .fx-btn--primary').length,
    menu: !!document.getElementById('buildMoreButton'),
    problem: document.querySelectorAll('#buildProblem').length, next: document.querySelectorAll('#buildNext').length,
    tabs: [...document.querySelectorAll('.factory-bt [role=tab]')].map((t) => t.id),
    tablists: document.querySelectorAll('.factory-bt [role=tablist]').length,
    legend: !!document.querySelector('.factory-bt-legend'), aiCard: !!document.querySelector('.factory-row-main .factory-bt-ai')
  }));
  if (!top.gates.length) {
    record('a change with gates is shown', false, 'no change in this workspace');
    s.close();
    process.exit(1);
  }
  record('one header: pickers, title, mono line, one primary action and a menu',
    top.pickers && !!top.title && /CHG-/.test(top.meta) && top.primaries === 1 && top.menu, top);
  record('one problem bar or one next line, not both', top.problem + top.next === 1, { problem: top.problem, next: top.next });
  record('five gate cards: build, unit tests, static, security, coverage',
    top.gates.map((g) => g.key).join(',') === 'build,tests,static,security,coverage', top.gates.map((g) => g.key));
  record('integration tests are one line, not a card, and not passed', /^Integration tests: not run\./.test(top.integration), top.integration);
  record('every gate is in one of the six states', top.gates.every((g) => STATES.indexOf(g.state) >= 0), top.gates.map((g) => g.state));
  record('every gate says what its status comes from', top.gates.every((g) => g.evidence.length > 10));
  const notRun = await vm((m) => m.gates().filter((g) => g.status.state === 'NOT_RUN').length);
  record('the verdict is not "passed" while a gate has not run', !notRun || top.verdict !== 'Passed', { verdict: top.verdict, notRun: notRun });
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(top.h1));
  record('three tabs: findings, runs and logs, checks and coverage', top.tablists === 1 && top.tabs.join(',') === 'bt-findings,bt-runs,bt-checks', top.tabs);
  record('no legend paragraph and no assistant column (it is a side panel)', !top.legend && !top.aiCard);

  // Findings come from the last run only, and are compact rows with chips, a search and a menu
  const findings = await vm((m) => {
    const runs = m.runs();
    const last = runs.length ? runs[runs.length - 1] : null;
    const rows = [...document.querySelectorAll('#failureList > li')];
    return {
      buildState: m.gates()[0].status.text,
      buildRows: m.failures().filter((f) => f.check === 'build' || f.check === 'tests').length,
      lastErrors: last ? last.finalErrors.length : 0,
      total: m.failures().length, rows: rows.length,
      complete: rows.slice(0, 5).every((li) => li.querySelector('.fx-status') && li.querySelector('.factory-bt-fcheck') && li.querySelector('.factory-bt-fwhere')
        && li.querySelector('.factory-bt-fmsg') && li.querySelector('fx-menu-button')),
      chips: [...document.querySelectorAll('#failureChips .fx-chip')].map((c) => c.textContent.trim()),
      search: !!document.getElementById('failureSearch'), table: !!document.getElementById('failureTable'),
      detail: !!document.getElementById('failureDetail')
    };
  });
  record('build and test findings belong to the last run', findings.buildState !== 'Passed' || findings.buildRows === 0, findings);
  record('findings are compact rows: severity, check, file and line, message and a menu', findings.total === 0 || (findings.rows === findings.total && findings.complete && !findings.table), findings);
  record('filter chips with counts (All first, only checks with findings) and a search', findings.total === 0
    || (/^All \d+$/.test(findings.chips[0]) && findings.chips.slice(1).every((c) => /\s[1-9]\d*$/.test(c)) && findings.search), findings.chips);
  record('the selected finding shows beside the list', findings.total === 0 || findings.detail);
  if (findings.total > 1) {
    const chip = await run(() => { const c = document.querySelectorAll('#failureChips .fx-chip')[1]; if (c) { c.click(); } return c ? c.textContent.trim() : ''; });
    await sleep(500);
    const shown = await run(() => document.querySelectorAll('#failureList > li').length);
    record('a chip shows only its findings', shown === Number((chip.match(/(\d+)$/) || [])[1]), { chip: chip, shown: shown });
    await run(() => { document.querySelector('#failureChips .fx-chip').click(); return 1; });
    await run(() => { const b = document.querySelectorAll('#failureList .factory-bt-fopen')[1]; b.click(); return 1; });
    await sleep(400);
    const picked = await vm((m) => ({ sel: m.selectedFailure(), pos: (document.querySelector('#failureDetail .factory-bt-nav') || {}).textContent || '' }));
    record('clicking a row opens that finding beside the list', picked.sel === 1 && /2 of/.test(picked.pos), picked);
  }
  // A gate card's link filters the findings
  const linked = await run(() => { const l = document.querySelector('#gates .factory-bt-gatelink'); if (l) { l.click(); } return l ? l.closest('[data-gate]').getAttribute('data-gate') : ''; });
  if (linked) {
    await sleep(500);
    const f = await vm((m) => ({ filter: m.gateFilter(), tab: m.tab() }));
    record('a gate card\'s link shows its findings', f.filter === linked && f.tab === 'findings', { linked: linked, now: f });
    await vm((m) => { m.gateFilter('all'); return 1; });
  }

  // Tabs by keyboard
  await run(() => { document.getElementById('bt-findings').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(600);
  record('ArrowRight moves to the Runs and logs tab', await run(() => document.activeElement && document.activeElement.id === 'bt-runs'));

  // Runs and logs: the runs, or one line
  await tab('runs');
  const runs = await run(() => ({ rows: document.querySelectorAll('#runList > li').length, none: !!document.getElementById('noRunsLine'),
    states: [...document.querySelectorAll('#runList .fx-status')].map((x) => x.textContent.trim()), log: !!document.getElementById('buildLog'),
    compare: !!document.getElementById('runCompare') }));
  const runCount = await vm((m) => m.runs().length);
  if (runCount === 0) {
    record('no runs: one line, no empty run, log or compare panels', runs.none && !runs.rows && !runs.log && !runs.compare, runs);
  } else {
    record('runs are listed with their result, with the log and the comparison', runs.rows === runCount && runs.states.every((x) => STATES.indexOf(x) >= 0) && runs.log && runs.compare, runs);
    if (runCount > 1) {
      const diff = await run(() => [...document.querySelectorAll('#runCompare .factory-bt-diffkind')].map((x) => x.textContent.trim()));
      record('two runs are compared (result, new, fixed, still failing)', diff[0] === 'Result', diff);
    }
  }

  // Checks and coverage
  await tab('checks');
  const checks = await run(() => ({ rows: document.querySelectorAll('#checkList > li').length, chips: [...document.querySelectorAll('#checkChips .fx-chip')].map((c) => c.textContent.trim()),
    states: [...document.querySelectorAll('#coverageList .fx-status')].map((x) => x.textContent.trim()), noCriteria: !!document.getElementById('noCriteria'),
    download: !!document.getElementById('checksDownload') }));
  const fileCount = await vm((m) => m.detail().files.length);
  record('the checks list every planned file, with chips by result and a download', checks.rows === fileCount && (fileCount === 0 || /^All \d+$/.test(checks.chips[0])) && checks.download, checks);
  record('coverage lists the criteria and where they are named, or one line', checks.noCriteria || (checks.states.length > 0 && checks.states.every((x) => ['In a test', 'Only in code', 'Nowhere'].indexOf(x) >= 0)), checks);
  await tab('findings');

  // Side panels: delivery and approvals, the assistant
  await run(() => { document.getElementById('buildInfoButton').click(); return 1; });
  await sleep(800);
  const info = await run(() => ({ facts: [...document.querySelectorAll('#deliveryFacts dt')].map((d) => d.textContent.trim()), approvals: document.querySelectorAll('#approvalList li').length }));
  record('Delivery and approvals opens in a side panel with the facts and the approvals',
    ['Delivery', 'Branch', 'Delivered revision', 'Closed'].every((f) => info.facts.indexOf(f) >= 0) && info.approvals > 0, info);
  await run(() => { const b = document.querySelector('.fx-sheet-close'); if (b) { b.click(); } return 1; });
  await sleep(500);
  await run(() => { document.getElementById('buildAskButton').click(); return 1; });
  await sleep(800);
  record('the assistant opens in a side panel', await run(() => !!document.querySelector('#buildAssistant .factory-ai-input') && !!document.getElementById('buildAsk')));
  await run(() => { const b = document.querySelector('.fx-sheet-close'); if (b) { b.click(); } return 1; });
  await sleep(500);

  // Actions the server would refuse are disabled, with the reason; the menu offers the rest
  const actions = await vm((m) => {
    const d = m.detail();
    const items = m.moreItems().filter((x) => x.value);
    const p = m.primary();
    return { status: d.status, primary: p.id, allowed: p.allowed, why: p.why, canDeliver: m.canDeliver(), canCheck: m.canCheck(), canBuild: m.canBuild(), canFix: m.canFix(),
      building: d.buildStatus === 'BUILDING', menu: items.map((x) => x.value + (x.disabled ? '-' : '+')) };
  });
  record('Submit for review only for written code that is not delivered', actions.canDeliver === (actions.status === 'GENERATED' && !actions.building), actions);
  record('the quick checks only for written or delivered code', actions.canCheck === (['GENERATED', 'DELIVERED'].indexOf(actions.status) >= 0 && !actions.building), actions);
  record('writing a file again only before delivery', !actions.canFix || actions.status === 'GENERATED', actions);
  record('a disabled primary action says why', actions.allowed || !!actions.why, actions);
  record('the menu keeps patch, delivery, assistant, Changes and Impact Analysis',
    ['patch', 'info', 'ask', 'changes', 'impact'].every((v) => actions.menu.some((x) => x.indexOf(v) === 0)), actions.menu);

  // Phone
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  for (const t of ['findings', 'runs', 'checks']) {
    await tab(t);
    record('no sideways scroll at 390 px (' + t + ')', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));
  }

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Build, Test & Review: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
