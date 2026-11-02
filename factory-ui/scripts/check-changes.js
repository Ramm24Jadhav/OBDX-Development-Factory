// Changes workbench check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the change comes first: name, workspace and OBDX version, status, counts of created, modified, cut off, failed,
//    not written and unchanged files, the validation state and the next action;
//  - a partly written change says so (status and banner) and is not shown as delivered;
//  - the tree marks every file by its state, a count filters it, and the arrow keys and Enter work in it;
//  - the open file's diff has line numbers and highlighting, split shows original and generated, and its details show
//    the requirement, the reason, the generation and the validation;
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

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=changes');
  await sleep(6000);
  const top = await run(() => {
    const summary = document.getElementById('changeSummary');
    const grid = document.getElementById('workbenchGrid');
    return {
      title: ((document.querySelector('.factory-ch-title') || {}).textContent || '').trim(),
      first: !!summary && !!grid && (summary.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
      meta: ((document.getElementById('changeMeta') || {}).textContent || '').trim(),
      status: ((document.getElementById('changeStatus') || {}).textContent || '').trim(),
      counts: [...document.querySelectorAll('.factory-ch-count')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
      validation: ((document.getElementById('validationTitle') || {}).textContent || '').trim(),
      next: ((document.getElementById('nextAction') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      partial: ((document.getElementById('partialGeneration') || {}).textContent || '').trim(),
      h1: (document.querySelector('.factory-ch h1') || {}).className || ''
    };
  });
  if (!top.title) {
    record('a change is shown', false, 'no change in this workspace');
    s.close();
    process.exit(1);
  }
  record('the change comes first, before the panels', top.first);
  record('workspace and OBDX version are named', /OBDX \d+\.x/.test(top.meta), top.meta);
  record('six file counts: created, modified, cut off, failed, not written, unchanged',
    top.counts.length === 6 && /Created/.test(top.counts[0]) && /Unchanged/.test(top.counts[5]), top.counts);
  record('the validation state and the next action show', !!top.validation && /^Next/.test(top.next), { validation: top.validation, next: top.next.slice(0, 80) });
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(top.h1));
  const change = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => {
    const vm = ko.dataFor(document.getElementById('changeSummary'));
    resolve({ status: vm.detail().status, unwritten: vm.unwritten().length, delivered: vm.detail().deliveredRevision });
  })));
  if (change.status === 'GENERATED' && change.unwritten > 0) {
    record('a partly written change says so', top.status === 'Partly written' && /^Partial generation/.test(top.partial), { status: top.status });
  }

  // The tree: states, filter, keyboard
  const tree = await run(() => [...document.querySelectorAll('#fileTree [role=treeitem]:not([aria-expanded])')].map((r) => r.querySelector('.factory-ch-badge').textContent.trim()));
  record('every file in the tree carries its state', tree.length > 0 && tree.every((b) => ['A', 'M', 'Cut off', 'Failed', 'Not written', 'Unchanged'].indexOf(b) >= 0), tree);
  const pendingCount = await run(() => { const c = document.querySelector('.factory-ch-count-pending strong'); return c ? Number(c.textContent) : 0; });
  if (pendingCount) {
    await run(() => { document.querySelector('.factory-ch-count-pending').click(); return 1; });
    await sleep(500);
    const shown = await run(() => [...document.querySelectorAll('#fileTree [role=treeitem]:not([aria-expanded]) .factory-ch-badge')].map((b) => b.textContent.trim()));
    record('a count filters the tree to its files', shown.length === pendingCount && shown.every((b) => b === 'Not written'), shown);
    await run(() => { document.getElementById('clearTreeFilter').click(); return 1; });
    await sleep(500);
  }
  await run(() => { document.querySelector('#fileTree [role=treeitem]').focus(); return 1; });
  let target = null;
  for (let i = 0; i < 12 && !target; i++) {
    await key('ArrowDown', 40);
    target = await run(() => { const a = document.activeElement; return a && !a.hasAttribute('aria-expanded') ? a.getAttribute('data-path') : null; });
  }
  await key('Enter', 13);
  await sleep(1500);
  const opened = await run(() => ({ path: ((document.querySelector('.factory-ch-path') || {}).textContent || '').trim(), focus: document.activeElement && document.activeElement.getAttribute('data-path') }));
  record('arrow keys and Enter open a file from the tree, focus stays there', !!target && opened.path === target && opened.focus === target, { target: target, opened: opened.path });

  // The file: highlighting, split, details
  const code = await run(() => ({
    numbered: [...document.querySelectorAll('#codeLines .factory-ch-n')].some((n) => /\d/.test(n.textContent)),
    coloured: document.querySelectorAll('#codeLines [class^="fx-syn-"]').length
  }));
  record('the diff has line numbers and highlighting', code.numbered && code.coloured > 0, code);
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

  // Side tabs by keyboard
  await run(() => { document.getElementById('wb-file').focus(); return 1; });
  await key('ArrowRight', 39);
  record('ArrowRight moves along the side panel tabs', await run(() => document.activeElement && document.activeElement.id === 'wb-validation'));

  // Delivery and the patch of an incomplete change ask first
  if (change.status === 'GENERATED' && change.unwritten > 0) {
    await run(() => { document.getElementById('deliverButton').click(); return 1; });
    await sleep(800);
    const deliverDialog = await cancelDialog();
    record('submitting an incomplete change asks first, with a warning', /incomplete/i.test(deliverDialog || ''), deliverDialog);
    await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => { ko.dataFor(document.getElementById('changeSummary')).moreAction({ detail: { value: 'patch' } }); resolve(1); })));
    await sleep(800);
    const patchDialog = await cancelDialog();
    record('downloading an incomplete patch asks first', /incomplete patch/i.test(patchDialog || ''), patchDialog);
    await sleep(800);
    const after = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => {
      const d = ko.dataFor(document.getElementById('changeSummary')).detail(); resolve({ status: d.status, delivered: d.deliveredRevision });
    })));
    record('cancelling delivers nothing', after.status === 'GENERATED' && !after.delivered, after);
  } else if (change.status === 'GENERATED') {
    await run(() => { document.getElementById('deliverButton').click(); return 1; });
    await sleep(800);
    record('submitting for review asks first', /Submit for review/i.test(await cancelDialog() || ''));
  }

  // Phone: the summary wraps, nothing scrolls sideways
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Changes workbench: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
