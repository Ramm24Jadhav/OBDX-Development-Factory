// Knowledge Explorer check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the index bar shows the indexed revision and a freshness state, and freshness is never "Up to date" without a
//    check against the repository (none is run here, so it must say not checked unless the Code page checked);
//  - the project tree, folder files and the viewer work, and the viewer colours with the shared syntax classes;
//  - file details offer Open in Code, which opens the Code page's viewer on that file;
//  - search lists matching file names from the index and the indexed code;
//  - AI answers (when one is shown) are marked as AI-generated; nothing scrolls sideways at 390 px; tabs work with the
//    arrow keys; no console errors. It only reads (opens pages, switches tabs, searches).
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-knowledge.js --url http://localhost:8080 [--workspace <id>]
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
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'indexBar\'))))))' });

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=knowledge');
  await sleep(6000);

  const bar = await run(() => ({
    facts: (document.getElementById('indexFacts') || {}).textContent || '',
    fresh: ((document.getElementById('indexFreshness') || {}).textContent || '').trim(),
    h1: (document.querySelector('.factory-kn-page h1') || {}).className || '',
    kpis: document.querySelectorAll('.factory-kn-page .factory-kpis').length
  }));
  record('the index bar shows the indexed revision', /Index at r\d+|Not imported/.test(bar.facts), bar.facts);
  record('freshness is not "Up to date" without a repository check in this session', bar.fresh !== 'Up to date' || await vm((m) => !!m.headCheck()), bar.fresh);
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(bar.h1));

  const code = await run(() => ({
    tree: document.querySelectorAll('.factory-kn-tree li').length,
    lines: document.querySelectorAll('#fileCode .factory-kn-line').length,
    syn: document.querySelectorAll('#fileCode [class^="fx-syn-"]').length,
    old: document.querySelectorAll('#fileCode [class^="factory-kn-kw"], #fileCode [class^="factory-hl-"]').length
  }));
  if (!code.lines) {
    record('a file is open in the viewer', false, 'no indexed files in this workspace');
    s.close();
    process.exit(1);
  }
  record('the project tree lists folders', code.tree > 1, code.tree);
  record('the viewer colours with the shared syntax classes', code.syn > 0 && code.old === 0, code);

  // Tabs by keyboard
  await run(() => { document.getElementById('kn-code').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(600);
  record('ArrowRight moves to the Search tab', await run(() => document.activeElement && document.activeElement.id === 'kn-search'));

  // Search: file names and the indexed code
  const name = await vm((m) => { const f = m.file(); const base = f.path.split('/').pop().replace(/\.\w+$/, ''); m.query(base); m.search(); return base; });
  await sleep(3500);
  const found = await run(() => ({ files: [...document.querySelectorAll('#fileNameHits li .factory-link-sm')].map((b) => b.textContent.trim()),
    code: document.querySelectorAll('.factory-cp-result').length, error: (document.getElementById('knowledgeSearchError') || {}).textContent || '' }));
  record('search lists the file whose name matches', found.files.some((p) => p.indexOf(name) >= 0), found.files.slice(0, 3));
  record('search answers without an error', !found.error, found.error);

  // AI answers shown are marked
  const ai = await run(() => ({ shown: !!document.getElementById('insightText'), marked: !!document.querySelector('#insightBlock .fx-badge') }));
  record('an AI answer is marked as AI-generated', !ai.shown || ai.marked, ai);

  // Open in Code opens the Code page's viewer on the file
  await vm((m) => { m.tab('code'); return 1; });
  await sleep(1200);
  const path = await vm((m) => m.file().path);
  await run(() => { document.getElementById('openInCode').click(); return 1; });
  await sleep(6000);
  const opened = await run(() => ({ page: location.search, viewer: ((document.getElementById('viewerTitle') || {}).textContent || '').trim() }));
  record('Open in Code shows the file in the Code page', /ojr=code/.test(opened.page) && opened.viewer.indexOf(path) >= 0, opened);

  // Phone
  await open(BASE + '/?ojr=knowledge');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(5000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Knowledge Explorer: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
