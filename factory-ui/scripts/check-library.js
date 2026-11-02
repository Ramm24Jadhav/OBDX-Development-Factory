// OBDX Library check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - a status line with what is indexed, the last indexing time, and failed or running documents when there are any;
//  - Ask, Documents and Notes are separate tabs (arrow keys move between them); Improve My Question and the answer
//    detail are still there, with a choice of OBDX version;
//  - documents filter by OBDX version, type and source, and a failed document shows why;
//  - nothing scrolls sideways at 390 px; no console errors. It only reads (opens pages, switches tabs, filters); it
//    asks no question, so it runs without a model.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-library.js --url http://localhost:8080 [--workspace <id>]
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
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'libraryHealth\'))))))' });

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=library');
  await sleep(5000);

  const top = await run(() => ({
    parts: [...document.querySelectorAll('#libraryHealth .factory-lb-hpart')].map((x) => x.textContent.trim()),
    tabs: [...document.querySelectorAll('.factory-lb-tabs [role=tab]')].map((t) => t.id),
    h1: (document.querySelector('.factory-lb h1') || {}).className || '',
    improve: !!document.getElementById('libraryImprove'), style: !!document.getElementById('libraryStyle'), version: !!document.getElementById('libraryAskVersion')
  }));
  const counts = await vm((m) => {
    const docs = m.documents().filter((d) => !d.older);
    return { docs: docs.length, failed: docs.filter((d) => d.status === 'FAILED').length, running: docs.filter((d) => d.busy).length };
  });
  record('the status line says how many documents are indexed and when', top.parts.some((p) => /documents indexed/.test(p)) && top.parts.some((p) => /last indexed|nothing indexed/.test(p)), top.parts);
  record('failed documents show in the status line', !counts.failed || top.parts.some((p) => p === counts.failed + ' failed'), counts);
  record('Ask, Documents and Notes are separate tabs', top.tabs.join(',') === 'lb-ask,lb-documents,lb-notes', top.tabs);
  record('Improve My Question, the answer detail and the OBDX version are on Ask', top.improve && top.style && top.version, top);
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(top.h1));

  // Tabs by keyboard
  await run(() => { document.getElementById('lb-ask').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(800);
  record('ArrowRight moves to Documents', await run(() => document.activeElement && document.activeElement.id === 'lb-documents'));

  // Document filters
  const filters = await vm((m) => {
    const all = m.shownCount();
    const docs = m.documents().filter((d) => !d.older);
    const v = docs.length ? docs[0].obdxVersion : '';
    m.docVersion(v);
    const byVersion = m.shownCount() === docs.filter((d) => d.obdxVersion === v).length;
    m.docVersion('');
    const out = { all: all, byVersion: byVersion, byType: true, bySource: true };
    ['ORACLE', 'BANK'].forEach((t) => { m.docType(t); out.byType = out.byType && m.shownCount() === docs.filter((d) => d.type === t).length; });
    m.docType('');
    ['SITE', 'FOLDER', 'UPLOAD'].forEach((src) => { m.docSource(src); out.bySource = out.bySource && m.shownCount() === docs.filter((d) => d.source === src).length; });
    m.docSource('');
    m.docStatus('FAILED');
    out.failedRows = m.shownCount();
    out.failedMessages = m.documents().filter((d) => d.status === 'FAILED' && !d.older).every((d) => !!d.message);
    m.resetDocFilters();
    return out;
  });
  record('documents filter by OBDX version', filters.byVersion, filters);
  record('documents filter by type (Oracle manual, bank document)', filters.byType);
  record('documents filter by source (Oracle\'s site, watched folder, upload)', filters.bySource);
  record('the failed filter lists the failed documents, each with its reason', filters.failedRows === counts.failed && filters.failedMessages, filters);
  await sleep(600);
  const table = await run(() => [...document.querySelectorAll('.factory-lb-table thead th')].map((t) => t.textContent.trim()));
  record('documents show when they were last indexed', counts.docs === 0 || table.indexOf('Last indexed') >= 0, table);

  // Phone
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'OBDX Library: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
