// Changes check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the list comes first: a visible title with the answer (how many changes, how many wait), state chips with counts
//    that filter the list, a search, and compact rows (state, requirement, workspace, when, the next step, a menu);
//  - a change opens in place of the list: one header (title, a mono line with the change, the requirement, the
//    workspace and OBDX version, the status, at most one primary action), five stages, at most one problem bar;
//  - a partly written change says so (status and the problem bar) and is not shown as delivered;
//  - the files by state are chips over the tree (only the states some file has); a chip filters the tree, and the
//    arrow keys and Enter work in it;
//  - the open file's diff has line numbers and highlighting, split shows original and generated, and its details show
//    the requirement, the reason, the generation and the validation; the side panel has four tabs (arrow keys);
//  - Validation says in one line that there is no build yet instead of empty build panels;
//  - the change details sheet has the facts and the history; All changes goes back to the list;
//  - submitting or downloading an incomplete change asks first (cancelled here), and nothing is delivered.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-changes.js --url http://localhost:8080 [--workspace <id>]
//
// It cancels every dialog it opens, so it changes nothing. Exit code 1 on a defect.
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
  const key = async (k, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: vk });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: vk });
    await sleep(300);
  };
  const cancelDialog = () => run(() => { const d = document.querySelector('.fx-dialog'); const t = d ? d.querySelector('.fx-dialog-title').textContent : null;
    if (d) { d.querySelector('.fx-btn--secondary').click(); } return t; });
  const vm = (body) => run({ toString: () => '() => new Promise((resolve) => { const ko = window.require("knockout"); const m = ko.dataFor(document.querySelector(".factory-ch")); Promise.resolve((' + body + ')(m)).then(resolve); })' });

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=changes');
  await s.selectWorkspace(args.workspace);
  await sleep(5000);

  // ---- The list ----
  const list = await run(() => ({
    h1: ((document.querySelector('.factory-ch h1') || {}).textContent || '').trim(),
    h1Hidden: /fx-visually-hidden/.test((document.querySelector('.factory-ch h1') || {}).className || ''),
    lead: ((document.getElementById('changesLead') || {}).textContent || '').trim(),
    chips: [...document.querySelectorAll('#changeStateFilters .fx-chip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
    rows: [...document.querySelectorAll('#changeList > li')].map((li) => ({
      title: (li.querySelector('.factory-rq-row-title') || {}).textContent || '',
      sub: ((li.querySelector('.factory-rq-row-sub') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      state: !!li.querySelector('.fx-status'),
      ws: ((li.querySelector('.factory-ch-wsname') || {}).textContent || '').trim(),
      when: ((li.querySelector('.factory-rq-when') || {}).textContent || '').trim(),
      next: ((li.querySelector('.factory-rq-next, .factory-rq-row-done') || {}).textContent || '').trim(),
      menu: !!li.querySelector('fx-menu-button'),
      files: !!li.querySelector('.factory-ch-fileschip')
    })),
    workbench: !!document.getElementById('workbenchGrid'),
    search: !!document.getElementById('changeSearch')
  }));
  if (!list.rows.length) {
    record('the list shows the changes', false, 'no change in this workspace');
    s.close();
    process.exit(1);
  }
  record('the list comes first, not a change', !list.workbench);
  record('a visible title, with the answer in the lead', list.h1 === 'Changes' && !list.h1Hidden && /\d+ changes?/.test(list.lead), list.lead);
  record('state chips with counts lead the list', list.chips.length >= 2 && /^All \d+$/.test(list.chips[0]) && list.chips.slice(1).every((c) => /\s\d+$/.test(c)), list.chips);
  record('a search over the list', list.search);
  record('each row: state, mono line with the change and the requirement, workspace, when, the next step, a menu',
    list.rows.every((r) => r.state && /^CHG-\w+ · REQ-\w+/.test(r.sub) && r.ws && r.when && r.next && r.menu), list.rows[0]);
  // A chip filters the list
  if (list.chips.length > 2) {
    const picked = await run(() => { const c = document.querySelectorAll('#changeStateFilters .fx-chip')[1]; c.click(); return c.textContent.replace(/\s+/g, ' ').trim(); });
    await sleep(500);
    const shown = await run(() => ({ n: document.querySelectorAll('#changeList > li').length, pressed: document.querySelectorAll('#changeStateFilters .fx-chip')[1].getAttribute('aria-pressed') }));
    record('a state chip filters the list to its count', shown.pressed === 'true' && String(shown.n) === picked.split(' ').pop(), { chip: picked, rows: shown.n });
    await run(() => { document.querySelectorAll('#changeStateFilters .fx-chip')[0].click(); return 1; });
    await sleep(400);
  }
  await vm('(m) => { m.search("zz-no-such-change"); return 1; }');
  await sleep(400);
  record('the search filters, with a way to clear it', await run(() => document.querySelectorAll('#changeList > li').length === 0 && !!document.getElementById('changesNoMatch')));
  await vm('(m) => { m.clearFilters(); return 1; }');
  await sleep(400);

  // ---- One change: the first with files (a partly written one when there is one) ----
  const target = await vm('(m) => { const c = m.changes(); const p = c.find((x) => x.status === "GENERATED" && x.files.some((f) => f.status === "PENDING" || f.status === "FAILED")); const w = p || c.find((x) => x.files.length > 0); return w ? w.id : null; }');
  if (!target) {
    record('a change with files to open', false, 'none in this workspace');
    s.close();
    process.exit(1);
  }
  await run((id) => { document.querySelector('#changeList > li[data-change="' + id + '"] .factory-rq-open').click(); return 1; }, target);
  await sleep(3500);
  const top = await run(() => {
    const head = document.getElementById('changeSummary');
    const grid = document.getElementById('workbenchGrid');
    return {
      title: ((document.getElementById('changeTitle') || {}).textContent || '').trim(),
      first: !!head && !!grid && (head.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
      meta: ((document.getElementById('changeMeta') || {}).textContent || '').trim(),
      status: ((document.getElementById('changeStatus') || {}).textContent || '').trim(),
      primaries: document.querySelectorAll('#changeSummary .factory-rqd-headside .fx-btn--primary').length,
      steps: [...document.querySelectorAll('#changeStepper > li')].map((li) => li.querySelector('.factory-rqd-step-name').textContent.trim()),
      problems: document.querySelectorAll('#changeSummary .factory-rqd-problem').length,
      problem: ((document.getElementById('changeProblem') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      next: ((document.getElementById('nextAction') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      oldBanner: !!document.getElementById('partialGeneration'),
      list: !!document.getElementById('changeList'),
      back: !!document.getElementById('backToChanges'),
      h1: (document.querySelector('.factory-ch h1') || {}).className || ''
    };
  });
  record('the change opens in place of the list, with a way back', !!top.title && !top.list && top.back, top.title);
  record('the header comes before the panels', top.first);
  record('a mono line names the change, the requirement, the workspace and OBDX version', /^CHG-\w+ · REQ-\w+ · .+OBDX \d+\.x/.test(top.meta), top.meta);
  record('one status pill and at most one primary action in the header', !!top.status && top.primaries <= 1, { status: top.status, primaries: top.primaries });
  record('five stages: plan, approve, write code, build, deliver', top.steps.join('|') === 'Plan|Approve|Write code|Build|Deliver', top.steps);
  record('at most one problem bar, else the next step in one line', top.problems <= 1 && (top.problems === 1 || /^Next/.test(top.next)) && !top.oldBanner, { problem: top.problem.slice(0, 80), next: top.next.slice(0, 80) });
  record('the h1 is only for screen readers in a change', /fx-visually-hidden/.test(top.h1));
  const change = await vm('(m) => ({ status: m.detail().status, unwritten: m.unwritten().length, delivered: m.detail().deliveredRevision, builds: m.detail().builds.length })');
  if (change.status === 'GENERATED' && change.unwritten > 0) {
    record('a partly written change says so, in the status and the one problem bar', top.status === 'Partly written' && /^Partial generation/.test(top.problem), { status: top.status });
    record('its one primary action is Continue generation', await run(() => !!document.querySelector('#changeSummary .factory-rqd-headside #continueButton')));
  }

  // The files by state, over the tree
  const states = await run(() => [...document.querySelectorAll('#fileStates .factory-ch-fstate')].map((c) => ({ text: c.textContent.replace(/\s+/g, ' ').trim(), n: Number(c.querySelector('strong').textContent) })));
  record('the files by state are chips over the tree, only states some file has', states.length > 0 && states.every((c) => c.n > 0), states.map((c) => c.text));
  const tree = await run(() => [...document.querySelectorAll('#fileTree [role=treeitem]:not([aria-expanded])')].map((r) => r.querySelector('.factory-ch-badge').textContent.trim()));
  record('every file in the tree carries its state', tree.length > 0 && tree.every((b) => ['A', 'M', 'Cut off', 'Failed', 'Not written', 'Unchanged'].indexOf(b) >= 0), tree);
  if (states.length > 1) {
    await run(() => { document.querySelectorAll('#fileStates .factory-ch-fstate')[1].click(); return 1; });
    await sleep(500);
    const shown = await run(() => document.querySelectorAll('#fileTree [role=treeitem]:not([aria-expanded])').length);
    record('a state chip filters the tree to its files', shown === states[1].n, { chip: states[1].text, shown: shown });
    await run(() => { document.getElementById('clearTreeFilter').click(); return 1; });
    await sleep(500);
  }
  await run(() => { document.querySelector('#fileTree [role=treeitem]').focus(); return 1; });
  let target2 = null;
  for (let i = 0; i < 12 && !target2; i++) {
    await key('ArrowDown', 40);
    target2 = await run(() => { const a = document.activeElement; return a && !a.hasAttribute('aria-expanded') ? a.getAttribute('data-path') : null; });
  }
  await key('Enter', 13);
  await sleep(1500);
  const opened = await run(() => ({ path: ((document.querySelector('.factory-ch-path') || {}).textContent || '').trim(), focus: document.activeElement && document.activeElement.getAttribute('data-path') }));
  record('arrow keys and Enter open a file from the tree, focus stays there', !!target2 && opened.path === target2 && opened.focus === target2, { target: target2, opened: opened.path });

  // The file: highlighting, split, details
  const generated = await run(() => { const r = [...document.querySelectorAll('#fileTree [role=treeitem]:not([aria-expanded])')].find((x) => /^(A|M)$/.test(x.querySelector('.factory-ch-badge').textContent.trim())); if (r) { r.click(); } return !!r; });
  if (generated) {
    await sleep(1500);
    const code = await run(() => ({
      numbered: [...document.querySelectorAll('#codeLines .factory-ch-n')].some((n) => /\d/.test(n.textContent)),
      coloured: document.querySelectorAll('#codeLines [class^="fx-syn-"]').length
    }));
    record('the diff has line numbers and highlighting', code.numbered && code.coloured > 0, code);
  }
  await run(() => { document.getElementById('modeSplit').click(); return 1; });
  await sleep(700);
  record('split shows the original and the generated file', await run(() => /Original/.test((document.querySelector('.factory-ch-splithead') || {}).textContent || '')
    && document.querySelectorAll('#splitLines .factory-ch-srow').length > 0));
  await run(() => { document.getElementById('modeCode').click(); document.getElementById('wb-file').click(); return 1; });
  await sleep(500);
  const details = await run(() => [...document.querySelectorAll('#fileDetails dt')].map((d) => d.textContent.trim()));
  record('the file details show requirement, reason, generation and validation',
    ['Requirement', 'Reason', 'Generation', 'Validation'].every((k) => details.indexOf(k) >= 0), details);
  const cut = await run(() => { const r = [...document.querySelectorAll('#fileTree [role=treeitem]')].find((x) => /Cut off/.test(x.textContent)); if (r) { r.click(); } return !!r; });
  if (cut) {
    await sleep(1500);
    const kept = await run(() => ((document.getElementById('fileDetails') || {}).textContent || '').replace(/\s+/g, ' '));
    record('a cut-off file says its part is kept and Write again goes on from it', /part written so far is kept/.test(kept) && /goes on from it/.test(kept), kept.slice(0, 120));
  }

  // Side tabs: four, by keyboard
  const tabs = await run(() => [...document.querySelectorAll('.factory-ch-tabs [role=tab]')].map((t) => t.textContent.trim()));
  record('four side tabs: File, Validation, Plan, Assistant', tabs.join('|') === 'File|Validation|Plan|Assistant', tabs);
  await run(() => { document.getElementById('wb-file').focus(); return 1; });
  await key('ArrowRight', 39);
  record('ArrowRight moves along the side panel tabs', await run(() => document.activeElement && document.activeElement.id === 'wb-validation'));
  await sleep(400);
  const validation = await run(() => ({
    noBuild: !!document.getElementById('noBuildLine'), pipeline: [...document.querySelectorAll('#buildPipeline li strong')].map((x) => x.textContent.trim()),
    empties: !!document.getElementById('staticEmpty') || !!document.getElementById('testsEmpty'), checks: !!document.getElementById('fileChecks')
  }));
  if (!change.builds) {
    record('no build yet: one line, no empty build panels', validation.noBuild && !validation.pipeline.length && !validation.empties && validation.checks, validation);
  } else {
    record('a build: three stages, none never reported', validation.pipeline.length === 3 && validation.pipeline.indexOf('Static Analysis') < 0, validation.pipeline);
  }

  // The change details sheet
  await run(() => { document.getElementById('changeInfoButton').click(); return 1; });
  await sleep(900);
  const sheet = await run(() => ({ facts: [...document.querySelectorAll('#changeFacts dt')].map((d) => d.textContent.trim()), history: document.querySelectorAll('#changeHistory > li').length }));
  record('the details sheet has the facts and the history', sheet.facts.indexOf('Requirement') >= 0 && sheet.facts.indexOf('Requested') >= 0 && sheet.history > 0, sheet);
  await run(() => { const b = document.querySelector('.fx-sheet-close'); if (b) { b.click(); } return 1; });
  await sleep(500);

  // Delivery and the patch of an incomplete change ask first
  if (change.status === 'GENERATED' && change.unwritten > 0) {
    await vm('(m) => { m.moreAction({ detail: { value: "deliver" } }); return 1; }');
    await sleep(800);
    const deliverDialog = await cancelDialog();
    record('submitting an incomplete change asks first, with a warning', /incomplete/i.test(deliverDialog || ''), deliverDialog);
    await vm('(m) => { m.moreAction({ detail: { value: "patch" } }); return 1; }');
    await sleep(800);
    const patchDialog = await cancelDialog();
    record('downloading an incomplete patch asks first', /incomplete patch/i.test(patchDialog || ''), patchDialog);
    await sleep(800);
    const after = await vm('(m) => ({ status: m.detail().status, delivered: m.detail().deliveredRevision })');
    record('cancelling delivers nothing', after.status === 'GENERATED' && !after.delivered, after);
  } else if (change.status === 'GENERATED') {
    await run(() => { document.getElementById('deliverButton').click(); return 1; });
    await sleep(800);
    record('submitting for review asks first', /Submit for review/i.test(await cancelDialog() || ''));
  }

  // Phone: the change, then the list, without sideways scroll
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  record('no sideways scroll at 390 px (a change)', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));
  await run(() => { document.getElementById('backToChanges').click(); return 1; });
  await sleep(2500);
  record('All changes goes back to the list', await run(() => document.querySelectorAll('#changeList > li').length > 0 && !document.getElementById('workbenchGrid')));
  record('no sideways scroll at 390 px (the list)', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Changes: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
