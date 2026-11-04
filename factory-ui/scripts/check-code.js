// Code page check (the Code page and the former Knowledge Explorer are one page): drives a running factory in headless
// Edge or Chrome and checks what the page promises:
//  - the header: the index's revision and freshness in one pill (never "Up to date" without a check against the
//    repository), Check for new commits and Reindex (Manage code), and at most one problem bar with its fix;
//  - seven tabs (Explore, Search, Map, Business rules, Quick checks, Index, Settings) with the arrow keys, ?tab= in the
//    address, the old knowledge route opening Explore, and no Knowledge Explorer entry or "Open in Code" button left;
//  - Explore: the tree, a folder's files, the one viewer (coloured, sub-tabs), lines marked from a search hit and from an
//    AI citation (the AI is stood in for in the page: no model is asked), the files panel docked, hidden to a rail and
//    floating (Escape closes it, picking a file closes it), the side panel's rail, File details folding, and these
//    choices kept after a reload;
//  - Ask about the code: the quick actions, what it answers from, the AI-generated label, cited lines, manuals listed
//    apart, and the "Not answered" notice;
//  - Search: one search with every option, file names then the code, Show in Explore, Ctrl K landing on it;
//  - Map: the four views, a row opening its file on Explore at its lines; Business rules; Quick checks filters; Index;
//    Settings (stored secrets never filled in); requests from other pages (pageRequests.codeFile, codeTab);
//  - no sideways scroll at 1440, 1280, 1024, 768 and 390 px on any tab; offline search says what to do; no console errors.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-code.js --url http://localhost:8080 [--workspace <id>]
//
// Options: --out <folder for screenshots>  --query <search text, default payee>  --ask 1 (also sends one quick action to
// the configured model and expects an answer or the "Not answered" notice). Exit code 1 on a defect.
// It saves nothing: the only server actions are reads, searches, the SVN connection check and (with --ask) one question.
const fs = require('fs');
const path = require('path');
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const OUT = args.out ? path.resolve(args.out) : null;
const QUERY = args.query || 'payee';
const TABS = ['Explore', 'Search', 'Map', 'Business rules', 'Quick checks', 'Index', 'Settings'];

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const shot = async (name) => {
    if (!OUT) { return; }
    fs.mkdirSync(OUT, { recursive: true });
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const click = async (sel) => {
    const c = await run((q) => { const e = document.querySelector(q); if (!e || e.offsetParent === null) { return null; } e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    if (!c) { return false; }
    for (const t of ['mousePressed', 'mouseReleased']) { await cdp('Input.dispatchMouseEvent', { type: t, x: c.x, y: c.y, button: 'left', clickCount: 1 }); }
    await sleep(250);
    return true;
  };
  const KEYS = { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35, Escape: 27, Enter: 13, g: 71, k: 75 };
  const key = async (k, modifiers) => {
    const base = { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: KEYS[k], modifiers: modifiers || 0 };
    await cdp('Input.dispatchKeyEvent', Object.assign({ type: k.length === 1 ? 'keyDown' : 'rawKeyDown', text: k.length === 1 && !modifiers ? k : undefined }, base));
    await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
    await sleep(200);
  };
  const waitFor = async (fn, arg, tries) => { for (let i = 0; i < (tries || 20); i++) { if (await run(fn, arg)) { return true; } await sleep(500); } return false; };
  // Runs fn(viewModel, arg) in the page (the Code page's view model, from its Explore panel)
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => { const ko = window.require("knockout"); const m = ko.dataFor(document.getElementById("panel-explore")); Promise.resolve((' + fn.toString() + ')(m, a, ko)).then(resolve); })' }, arg);
  const size = (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h || 1000, deviceScaleFactor: 1, mobile: w < 768 });
  const openCode = async (suffix) => {
    await s.open(BASE + '/?ojr=code' + (suffix || ''));
    await waitFor(() => !!document.getElementById('panel-explore') && document.querySelectorAll('#indexFacts > div').length > 0, null, 30);
    await sleep(800);
  };
  const shown = (id) => run((x) => { const e = document.getElementById(x); return !!e && e.offsetParent !== null; }, id);
  const requests = [];
  s.onEvent((m) => { if (m.method === 'Network.requestWillBeSent') { requests.push(m.params.request.url); } });

  await size(1440, 1000);
  if (args.workspace) { await s.selectWorkspace(args.workspace); }
  // Start from the default layout (the choices this browser keeps)
  await run(() => { ['files', 'side', 'details'].forEach((k) => { try { localStorage.removeItem('factory.code.' + k); } catch (e) { /* none kept */ } }); return 1; });
  s.errors.length = 0;
  await openCode();
  const wsId = await run(() => window.require('services/workspaceSelection').selectedId());
  const server = await run(async (id) => ({
    index: await fetch('api/workspaces/' + id + '/index').then((r) => r.json()),
    files: await fetch('api/workspaces/' + id + '/files?limit=20000').then((r) => (r.ok ? r.json() : [])),
    inventory: await fetch('api/workspaces/' + id + '/inventory').then((r) => (r.ok ? r.text() : '')).then((t) => (t ? JSON.parse(t) : null))
  }), wsId);
  if (!server.index || server.index.indexedRevision === null || !server.files.length) {
    record('the workspace has indexed code to check', false, 'Import the code of this workspace first');
    s.close();
    process.exit(1);
  }

  // ---------- Header: the pill, the two buttons, at most one problem bar ----------
  const head = await run(() => ({
    h1: (document.querySelector('.factory-cd-head h1') || {}).textContent,
    lead: (document.querySelector('.factory-cd-lead') || {}).textContent || '',
    pill: (document.getElementById('indexPill') || {}).textContent.trim(),
    pillTitle: (document.getElementById('indexPill') || {}).title,
    buttons: ['checkHeadButton', 'importButton'].map((id) => { const b = document.getElementById(id); return b ? { inHead: !!b.closest('#codeHead'), disabled: b.disabled, text: b.textContent.trim() } : null; }),
    inIndex: !!document.querySelector('#panel-index #importButton, #panel-index #checkHeadButton')
  }));
  record('the header says Code and what the page is for', head.h1 === 'Code' && /code as the factory indexed it: explore it, search it, check it and set it up\./.test(head.lead), head.lead);
  const pillWant = await vm((m) => (m.headCheck() ? null : 'r' + m.indexedRevision() + ' · Not compared'));
  record('the pill shows the indexed revision and, without a check, "Not compared" (never "Up to date")', pillWant === null ? !!head.pill : head.pill === pillWant && !/Up to date/.test(head.pill), head.pill);
  record('Check for new commits and Reindex are in the header, not repeated on Index', head.buttons.every((b) => b && b.inHead) && !head.inIndex, head.buttons);
  const canManage = await vm((m) => m.canManage());
  record(canManage ? 'with Manage code both buttons work' : 'without Manage code both buttons are off, with the tip',
    canManage ? head.buttons.every((b) => !b.disabled) : head.buttons.every((b) => b.disabled) && await run(() => !!document.querySelector('#codeHead .fx-tip-wrap[data-fx-tip]')), head.buttons);
  // The problem bar follows the checks: nothing when all is fine, the most important error or warning otherwise
  const bar0 = await vm((m) => ({ bar: !!document.getElementById('codeProblem'), want: m.healthItems().some((i) => i.level !== 'info') }));
  record('no problem bar when nothing is wrong (and one when something is)', bar0.bar === bar0.want, bar0);
  const behind = await vm((m) => { m.headCheck({ ok: true, revision: m.indexedRevision() + 3, at: 'now' }); return 1; }).then(() => sleep(300)).then(() => run(() => ({
    bars: document.querySelectorAll('#codeProblem').length, text: ((document.getElementById('codeProblem') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    fix: ((document.getElementById('codeProblemFix') || {}).textContent || '').trim(), pill: document.getElementById('indexPill').textContent.trim() })));
  record('index behind: one problem bar with Reindex, and the pill says how far behind', behind.bars === 1 && /3 revisions behind\./.test(behind.text) && (behind.fix === 'Reindex' || !canManage) && /3 revisions behind/.test(behind.pill), behind);
  await vm((m) => { m.headCheck({ ok: false, error: 'The SVN server did not answer.', at: 'now' }); return 1; });
  await sleep(300);
  const broken = await run(() => ({ text: ((document.getElementById('codeProblem') || {}).textContent || '').replace(/\s+/g, ' ').trim(), css: (document.getElementById('codeProblem') || {}).className, pill: document.getElementById('indexPill').textContent.trim() }));
  await click('#codeProblemFix');
  const toSettings = await run(() => document.getElementById('tab-settings').getAttribute('aria-selected') === 'true');
  record('repository not reachable: an error bar whose fix opens Settings, the pill says Not reachable', /could not be read/.test(broken.text) && /is-error/.test(broken.css) && toSettings && /Not reachable/.test(broken.pill), broken);
  await vm((m) => { m.headCheck({ ok: true, revision: m.indexedRevision(), at: 'now' }); return 1; });
  await sleep(300);
  const fresh = await run(() => ({ bar: !!document.getElementById('codeProblem'), pill: document.getElementById('indexPill').textContent.trim() }));
  record('up to date: the pill says so', /Up to date/.test(fresh.pill), fresh);
  await vm((m) => { m.headCheck(null); delete window.require('services/workspaceSelection').headChecks[m.workspaceId()]; m.tab('explore'); return 1; });
  await sleep(300);

  // ---------- Tabs ----------
  const tabs = await run(() => [...document.querySelectorAll('.factory-cd [role="tablist"][aria-label="Code"] [role="tab"]')].map((t) => [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
  record('seven tabs in order', JSON.stringify(tabs) === JSON.stringify(TABS), tabs);
  const counts = await vm((m) => ({ map: (document.querySelector('#tab-map .factory-cd-cnt') || {}).textContent || '', apis: m.inventory() ? m.inventory().endpoints.length : 0,
    checks: (document.querySelector('#tab-checks .factory-cd-cnt') || {}).textContent || '', failed: m.failedRules() }));
  record('Map shows its API count and Quick checks its failed count', (counts.apis ? counts.map === counts.apis + (counts.apis === 1 ? ' API' : ' APIs') : !counts.map) && (counts.failed ? counts.checks === counts.failed + ' failed' : !counts.checks), counts);
  await run(() => { document.getElementById('tab-explore').focus(); return 1; });
  await key('ArrowRight');
  const r1 = await run(() => ({ focus: document.activeElement.id, panels: [...document.querySelectorAll('.factory-cd-body > [role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.id), url: location.search }));
  record('ArrowRight moves to Search and shows only its panel', r1.focus === 'tab-search' && r1.panels.length === 1 && r1.panels[0] === 'panel-search', r1);
  record('?tab= follows the tab', /[?&]tab=search/.test(r1.url), r1.url);
  await key('End');
  const r2 = await run(() => document.activeElement.id);
  await key('Home');
  const r3 = await run(() => document.activeElement.id);
  record('End and Home go to Settings and Explore', r2 === 'tab-settings' && r3 === 'tab-explore', [r2, r3]);
  await openCode('&tab=map');
  record('?tab=map opens Map', await run(() => document.getElementById('tab-map').getAttribute('aria-selected') === 'true'));
  await s.open(BASE + '/?ojr=knowledge');
  await waitFor(() => !!document.getElementById('panel-explore'), null, 20);
  const redirect = await run(() => ({ url: location.search, explore: document.getElementById('tab-explore').getAttribute('aria-selected') === 'true',
    sidebar: [...document.querySelectorAll('nav a, .factory-nav a')].map((a) => a.textContent.trim()).filter((t) => /Knowledge Explorer/.test(t)) }));
  record('the old knowledge route opens Code › Explore', /ojr=code/.test(redirect.url) && redirect.explore, redirect);
  record('no Knowledge Explorer entry in the sidebar', redirect.sidebar.length === 0, redirect.sidebar);
  const old = await run(() => [...document.querySelectorAll('button, a')].filter((b) => /^(Open in Code|Code page)$/.test(b.textContent.trim())).map((b) => b.textContent.trim()));
  record('no "Open in Code" or "Code page" buttons', old.length === 0, old);

  // ---------- Explore: tree, folder files, the viewer and its sub-tabs ----------
  await waitFor(() => document.querySelectorAll('#fileCode .factory-cd-line').length > 0, null, 30);
  const ex = await run(() => ({
    rows: document.querySelectorAll('#fileTree li').length,
    lines: document.querySelectorAll('#fileCode .factory-cd-line').length,
    coloured: document.querySelectorAll('#fileCode [class^="fx-syn-"]').length,
    title: document.getElementById('fileTitle').textContent.trim(),
    current: ((document.querySelector('#fileTree [aria-current="true"]') || {}).textContent || '').trim()
  }));
  record('the tree lists folders and the open file is current in it', ex.rows > 2 && ex.current === ex.title, ex);
  record('a file is open, coloured, in the viewer', ex.lines > 0 && ex.coloured > 0, ex);
  await run(() => { const t = document.querySelector('#fileTree button.is-dir[aria-expanded="true"]:not(.is-root)'); if (t) { t.click(); } return 1; });
  await run(() => { const t = [...document.querySelectorAll('#fileTree button.is-dir')].reverse().find((b) => b.getAttribute('aria-expanded') === 'false'); if (t) { t.click(); } return 1; });
  await sleep(400);
  const folder = await vm((m) => {
    const f = m.folder();
    const want = m.allFiles().filter((x) => x.path.indexOf(f ? f + '/' : '') === 0 && x.path.slice(f ? f.length + 1 : 0).indexOf('/') < 0).length;
    return { folder: f, mode: m.viewMode(), rows: document.querySelectorAll('#folderFiles tbody tr').length, want: want, checkboxes: document.querySelectorAll('#folderFiles input[type="checkbox"]').length };
  });
  record('picking a folder lists its files in the viewer, without checkboxes', folder.mode === 'folder' && folder.rows === folder.want && folder.checkboxes === 0, folder);
  await vm((m) => { const first = m.allFiles().find((x) => /\.java$/.test(x.path)) || m.allFiles()[0]; return m.openFile(first.path); });
  await sleep(500);
  await run(() => { document.getElementById('ft-code').focus(); return 1; });
  await key('ArrowRight');
  const sub = await run(() => ({ focus: document.activeElement.id, deps: !!document.getElementById('fileDeps') || !!document.querySelector('#fileViewBody .fx-empty') }));
  record('the viewer\'s sub-tabs move with the arrow keys (Code → Dependencies)', sub.focus === 'ft-deps' && sub.deps, sub);
  const subtabs = [];
  for (const t of ['usedby', 'apis', 'comments', 'code']) {
    await click('#ft-' + t);
    await sleep(t === 'usedby' ? 1500 : 300);
    subtabs.push(await run((x) => ({ tab: x, selected: document.getElementById('ft-' + x).getAttribute('aria-selected') === 'true',
      body: x === 'code' ? document.getElementById('fileCode').offsetParent !== null : !!document.querySelector('#fileViewBody ul, #fileViewBody .fx-empty, #fileViewBody p') }), t));
  }
  record('Mentioned in, Related APIs, Comments and Code each show their view', subtabs.every((x) => x.selected && x.body), subtabs);
  await shot('explore');

  // ---------- Search: options, grouping, the viewer, Show in Explore ----------
  await click('#tab-search');
  await click('#searchQuery input');
  await run((q) => { const i = document.querySelector('#searchQuery input'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; }, QUERY);
  await click('#searchButton');
  await waitFor(() => document.querySelectorAll('#searchResults li, #fileNameHits li').length > 0 || !!document.getElementById('noResults'), null, 30);
  const apiHits = await run(async (a) => (await fetch('api/workspaces/' + a.id + '/search?q=' + encodeURIComponent(a.q)).then((r) => r.json())).results, { id: wsId, q: QUERY });
  const se = await vm((m) => ({
    look: [...document.querySelectorAll('.factory-cd-searchopts .fx-chip')].map((c) => c.textContent.trim() + ':' + c.getAttribute('aria-pressed')),
    filters: ['filterModule', 'filterType', 'filterKind', 'filterMatch'].filter((id) => !!document.getElementById(id)).length,
    groups: [...document.querySelectorAll('.factory-cd-results .factory-cd-grp')].map((h) => h.textContent.replace(/\s*\(\d+\)$/, '')),
    fileHits: m.fileMatches().length, wantFiles: m.allFiles().filter((x) => m.searched().toLowerCase().split(/\s+/).every((w) => x.path.toLowerCase().indexOf(w) >= 0)).length,
    listed: document.querySelectorAll('#searchResults li').length, count: document.getElementById('resultCount').textContent.trim()
  }));
  record('one search with Look in (content, names, comments) and module, file type, category and matched by', se.look.length === 3 && /File content:true/.test(se.look[0]) && /Class and method names:true/.test(se.look[1]) && /Comments:false/.test(se.look[2]) && se.filters === 4, se.look);
  record('results grouped: file names first, then the code', (se.fileHits ? se.groups[0] === 'File names' : true) && se.groups[se.groups.length - 1] === 'In the code' && se.fileHits === Math.min(50, se.wantFiles), se);
  record('one entry in the code per search hit', se.listed === apiHits.length, { listed: se.listed, server: apiHits.length });
  const named = await vm((m) => { m.inNames(false); const n = m.filteredResults().length; const left = m.results().filter((r) => r.kind !== 'class' && r.kind !== 'method').length; m.inNames(true); return { n: n, left: left }; });
  record('Look in: turning off class and method names leaves the other pieces', named.n === named.left, named);
  const pick = Math.max(0, apiHits.findIndex((r) => r.startLine > 1));
  await click('#searchResults li:nth-child(' + (pick + 1) + ') button');
  await waitFor((p) => document.getElementById('searchViewerTitle').textContent.indexOf(p) === 0 && document.querySelectorAll('#searchCode .is-hit').length > 0, apiHits[pick].path.split('/').pop(), 20);
  const hit = await run(() => ({ title: document.getElementById('searchViewerTitle').textContent.trim(), first: +((document.querySelector('#searchCode .is-hit .factory-cd-n') || {}).textContent || 0),
    hits: document.querySelectorAll('#searchCode .is-hit').length, focus: document.activeElement === document.getElementById('searchCode'), current: !!document.querySelector('#searchResults .is-current[aria-current="true"]') }));
  const want = apiHits[pick];
  record('a hit opens in the viewer at its lines, marked, focus on the code', hit.first === want.startLine && hit.hits === want.endLine - want.startLine + 1 && hit.focus && hit.current, { want: [want.startLine, want.endLine], hit: hit });
  await shot('search');
  await click('#showInExplore');
  await waitFor(() => document.querySelectorAll('#fileCode .is-hit').length > 0, null, 20);
  const inExplore = await run(() => ({ explore: document.getElementById('tab-explore').getAttribute('aria-selected') === 'true', title: document.getElementById('fileTitle').textContent.trim(),
    hits: document.querySelectorAll('#fileCode .is-hit').length, strip: ((document.getElementById('markStrip') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    visible: (() => { const b = document.getElementById('fileCode'); const h = b.querySelector('.is-hit'); if (!h) { return false; } const br = b.getBoundingClientRect(); const hr = h.getBoundingClientRect(); return hr.top >= br.top && hr.top < br.bottom; })() }));
  record('Show in Explore opens the file there with the hit lines marked and in view', inExplore.explore && inExplore.title === want.path.split('/').pop() && inExplore.hits === want.endLine - want.startLine + 1 && inExplore.visible
    && /marked: matched by the search/.test(inExplore.strip), inExplore);
  await click('#clearMarks');
  record('Clear takes the marks away', await run(() => document.querySelectorAll('#fileCode .is-hit').length === 0 && !document.getElementById('markStrip')));

  // ---------- Ask about the code: one panel; the AI is stood in for here (no model is asked) ----------
  const askBefore = requests.filter((u) => /knowledge\/ask/.test(u)).length;
  const ask = await run(() => ({
    quick: [...document.querySelectorAll('.factory-cd-quick button')].map((b) => b.textContent.trim()),
    input: !!document.querySelector('#askInput input'), context: [...document.querySelectorAll('#askContext .fx-chip')].map((c) => c.textContent.trim())
  }));
  record('Ask about the code: five quick actions and a question box', JSON.stringify(ask.quick) === JSON.stringify(['Summary', 'Explain', 'Find usage', 'Suggest changes', 'Generate unit tests']) && ask.input, ask.quick);
  record('it says what it answers from: the open file, the index and the search results', ask.context.length >= 3 && ask.context.some((c) => /^the index/.test(c)) && ask.context.some((c) => /search result/.test(c)), ask.context);
  await vm((m, a, ko) => {
    const f = m.file();
    m.ai.messages.push({ mine: true, text: 'Explain: ' + f.path.split('/').pop(), about: { path: f.path, lineCount: f.lines || f.content.split('\n').length } });
    m.ai.messages.push({ mine: false, text: ko.observable('It reads the request (lines 2-4), then answers at line 3.'), meta: ko.observable('stand-in · 0.1s'), css: ko.observable('factory-ai-msg'),
      sources: ko.observable([{ n: 1, title: 'Payments User Manual', heading: 'Payees', obdxVersion: '25.2', pageFrom: 12 }]) });
    m.ai.messages.push({ mine: true, text: 'What does it call?', about: { path: f.path, lineCount: 3 } });
    m.ai.messages.push({ mine: false, failed: true, text: 'The factory does not send this workspace\'s code to a model outside the bank.', meta: 'Not answered', css: 'factory-ai-msg factory-ai-error' });
    return 1;
  });
  await sleep(500);
  const answer = await run(() => ({
    label: ((document.querySelector('.factory-cd-answer .factory-cd-ailabel') || {}).textContent || '').trim(),
    cites: [...document.querySelectorAll('.factory-cd-answer .factory-cd-cite')].map((b) => b.textContent.trim()),
    manuals: ((document.querySelector('.factory-cd-manuals') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    notice: ((document.querySelector('.factory-cd-notice') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    newChat: !!document.getElementById('askNewChat')
  }));
  record('an answer is marked AI-generated and lists its cited lines', /AI-generated/.test(answer.label) && JSON.stringify(answer.cites) === JSON.stringify(['2–4', '3']), answer);
  record('the OBDX Library\'s manuals are listed apart from the code', /Also from the OBDX Library/.test(answer.manuals) && /Payments User Manual: Payees/.test(answer.manuals), answer.manuals);
  record('a refusal shows as "Not answered", not as an answer', /^Not answered\./.test(answer.notice), answer.notice);
  await click('.factory-cd-answer .factory-cd-cite');
  await sleep(400);
  const cited = await run(() => ({ hits: [...document.querySelectorAll('#fileCode .is-hit .factory-cd-n')].map((n) => +n.textContent), strip: ((document.getElementById('markStrip') || {}).textContent || '').replace(/\s+/g, ' ').trim() }));
  record('a cited line range marks those lines in the viewer', JSON.stringify(cited.hits) === '[2,3,4]' && /Lines 2–4 marked: cited by Ask about the code/.test(cited.strip), cited);
  record('no model was asked by the stand-in', requests.filter((u) => /knowledge\/ask/.test(u)).length === askBefore);
  await click('#askNewChat');
  record('New chat empties the conversation', await vm((m) => m.ai.messages().length === 0));
  if (args.ask === '1') {
    await click('#quick-summary');
    const settled = await waitFor(() => !document.querySelector('.factory-ai-busy') && document.querySelectorAll('.factory-cd-answer, .factory-cd-notice').length > 0, null, 120);
    record('a quick action asks with the open file and gets an answer or the "Not answered" notice', settled && requests.some((u) => /knowledge\/ask/.test(u)));
    await vm((m) => { m.newChat(); return 1; });
  }

  // ---------- The files panel: docked, rail, floating; the side panel's rail; File details folding ----------
  await click('#filesHide');
  await sleep(300);
  const railed = await run(() => ({ rail: document.getElementById('filesRail').offsetParent !== null, panel: document.getElementById('filesPanel').offsetParent !== null, focus: document.activeElement.id }));
  record('Hide the files: a 48 px rail, focus on its Show button', railed.rail && !railed.panel && railed.focus === 'railShowFiles', railed);
  await click('#railFloatFiles');
  await sleep(400);
  const floating = await run(() => { const p = document.getElementById('filesPanel'); const r = p.getBoundingClientRect(); return { shown: p.offsetParent !== null, position: getComputedStyle(p).position, width: Math.round(r.width),
    pressed: document.getElementById('railFloatFiles').getAttribute('aria-pressed'), focus: !!document.activeElement.closest('#treeFilter') }; });
  record('Files over the code: a floating panel beside the rail, the filter focused', floating.shown && floating.position === 'absolute' && floating.width <= 300 && floating.pressed === 'true' && floating.focus, floating);
  await shot('explore-floating');
  await key('Escape');
  const escaped = await run(() => ({ panel: document.getElementById('filesPanel').offsetParent !== null, focus: document.activeElement.id }));
  record('Escape closes the floating files and focus goes back to the rail', !escaped.panel && escaped.focus === 'railFloatFiles', escaped);
  await click('#railFloatFiles');
  await sleep(300);
  await vm((m) => { const other = m.allFiles().find((x) => !m.file() || x.path !== m.file().path); m.treeFilter(other.path.split('/').pop()); return 1; });
  await sleep(400);
  await run(() => { const b = [...document.querySelectorAll('#fileTree button.is-file')].find((x) => x.getAttribute('aria-current') !== 'true'); if (b) { b.click(); } return 1; });
  await sleep(800);
  record('picking a file closes the floating files', await vm((m) => m.files() === 'rail' && document.getElementById('filesPanel').offsetParent === null));
  await vm((m) => { m.treeFilter(''); return 1; });
  await click('#hideSide');
  await sleep(300);
  const sideRail = await run(() => ({ rail: document.getElementById('sideRail').offsetParent !== null, panel: document.getElementById('sidePanel').offsetParent !== null, focus: document.activeElement.id,
    buttons: [...document.querySelectorAll('#sideRail button')].map((b) => b.getAttribute('aria-label')) }));
  record('Hide side panel folds it to a rail with show, File details and Ask', sideRail.rail && !sideRail.panel && sideRail.focus === 'railShowSide' && JSON.stringify(sideRail.buttons) === JSON.stringify(['Show the side panel', 'File details', 'Ask about the code']), sideRail);
  await shot('explore-rails');
  await click('#railAsk');
  await sleep(300);
  record('the rail\'s Ask opens the panel with the question box focused', await run(() => document.getElementById('sidePanel').offsetParent !== null && !!document.activeElement.closest('#askInput')));
  await click('#detailsToggle');
  await sleep(200);
  const folded = await run(() => ({ expanded: document.getElementById('detailsToggle').getAttribute('aria-expanded'), body: document.getElementById('detailsBody').offsetParent !== null,
    summary: ((document.getElementById('detailsSummary') || {}).textContent || '').trim() }));
  record('File details folds to one summary line', folded.expanded === 'false' && !folded.body && folded.summary.indexOf(' · ') > 0, folded);
  await click('#hideSide');
  await openCode();
  const kept = await vm((m) => ({ files: m.files(), side: m.sideOpen(), details: m.detailsOpen() }));
  record('the files rail, the side panel and File details stay as they were after a reload', kept.files === 'rail' && kept.side === false && kept.details === false, kept);
  await vm((m) => { m.files('docked'); m.sideOpen(true); m.detailsOpen(true); return 1; });
  await sleep(300);

  // ---------- Map: four views; a row opens its file on Explore at its lines ----------
  await click('#tab-map');
  await sleep(400);
  if (!server.inventory) {
    record('without a modernization scan Map asks to run it', await shown('mapEmpty'));
  } else {
    const views = await run(() => [...document.querySelectorAll('#mapView [role="radio"]')].map((b) => b.textContent.trim()));
    record('Map switches between APIs, Screens, Service calls and Diagram, with counts', views.length === 4 && /^APIs \d+$/.test(views[0]) && /^Screens \d+$/.test(views[1]) && /^Service calls \d+$/.test(views[2]) && views[3] === 'Diagram', views);
    const tables = [];
    for (const [v, id, n] of [['apis', 'apiTable', server.inventory.endpoints.length], ['screens', 'screenTable', server.inventory.screens.length], ['calls', 'callTable', server.inventory.calls.length], ['diagram', 'mapDiagram', -1]]) {
      await vm((m, x) => { m.mapView(x); return 1; }, v);
      await sleep(300);
      tables.push(await run((a) => ({ view: a.v, shown: document.getElementById(a.id).offsetParent !== null, rows: a.id === 'mapDiagram' ? document.querySelectorAll('#mapDiagram .factory-cd-drow').length : document.querySelectorAll('#' + a.id + ' tbody tr').length, want: a.n }), { v: v, id: id, n: n }));
      await shot('map-' + v);
    }
    record('each view shows its own list, one row per item of the scan', tables.every((t) => t.shown && (t.want < 0 ? t.rows > 0 : t.rows === t.want)), tables);
    await vm((m) => { m.mapView('apis'); return 1; });
    await sleep(300);
    if (server.inventory.endpoints.length) {
      const ep = server.inventory.endpoints[0];
      await click('#apiTable tbody tr:first-child td[data-label="Implementation"] button');
      await waitFor((p) => document.getElementById('fileTitle').textContent.trim() === p && document.querySelectorAll('#fileCode .is-hit').length > 0, ep.file.split('/').pop(), 20);
      const mapped = await run(() => ({ explore: document.getElementById('tab-explore').getAttribute('aria-selected') === 'true', title: document.getElementById('fileTitle').textContent.trim(),
        first: ((document.querySelector('#fileCode .is-hit .factory-cd-t') || {}).textContent || '').trim(), strip: ((document.getElementById('markStrip') || {}).textContent || '').replace(/\s+/g, ' ').trim() }));
      record('an API row opens its file on Explore with the method\'s lines marked', mapped.explore && mapped.title === ep.file.split('/').pop() && mapped.first.indexOf(ep.javaMethod) >= 0 && /the method the Map links/.test(mapped.strip), mapped);
    }
    await vm((m) => { const inv = m.inventory(); m.inventory(null); return new Promise((r) => setTimeout(() => { const ok = !!document.getElementById('mapEmpty'); m.inventory(inv); r(ok); }, 200)); }).then((ok) => record('with no scan Map asks to run the modernization scan', ok));
  }

  // ---------- Business rules ----------
  await click('#tab-rules');
  await sleep(300);
  const rules = await vm((m) => ({ rows: document.querySelectorAll('#ruleList tbody tr').length, all: m.bizRules().length, explain: !!document.getElementById('explainOpenFile') }));
  record('Business rules lists the requirements\' rules', rules.rows === rules.all, rules);
  record('the open file\'s logic is the Explain quick action of Ask about the code', rules.explain === true);
  const only = await vm((m) => { m.onlyOpenFile(true); const f = m.file(); const ok = m.bizRules().every((r) => r.paths.indexOf(f.path) >= 0); const n = document.querySelectorAll('#ruleList tbody tr').length; m.onlyOpenFile(false); return { ok: ok, n: n }; });
  record('"Only rules linked to the open file" narrows the list', only.ok, only);

  // ---------- Quick checks ----------
  await click('#tab-checks');
  await sleep(400);
  const ruleCheck = await vm((m) => {
    const all = document.querySelectorAll('#ruleTable tbody tr').length;
    m.ruleStatusFilter('OFF');
    const offRows = [...document.querySelectorAll('#ruleTable tbody tr')].map((tr) => tr.querySelector('[role="switch"]').getAttribute('aria-checked'));
    m.ruleStatusFilter('');
    const cat = (m.ruleCategories()[1] || {}).value;
    m.ruleCategory(cat || '');
    const catRows = [...document.querySelectorAll('#ruleTable tbody tr td[data-label="Category"]')].map((td) => td.textContent.trim());
    m.clearRuleFilters();
    return { all: all, offRows: offRows, cat: cat, catRows: catRows, total: m.checkRules().length };
  });
  record('quick checks list every rule', ruleCheck.all === ruleCheck.total && ruleCheck.total > 0, ruleCheck.total);
  record('status "Turned off" shows only rules that are off', ruleCheck.offRows.every((v) => v === 'false'), ruleCheck.offRows);
  record('a category shows only its rules', !ruleCheck.cat || (ruleCheck.catRows.length > 0 && ruleCheck.catRows.every((c) => c === ruleCheck.cat)), { cat: ruleCheck.cat, rows: ruleCheck.catRows.length });

  // ---------- Index ----------
  await click('#tab-index');
  await sleep(400);
  const ix = await run(() => {
    const facts = {};
    document.querySelectorAll('#indexFacts > div').forEach((d) => { facts[d.querySelector('dt').textContent.trim()] = d.querySelector('dd').textContent.trim(); });
    return { facts: facts, items: [...document.querySelectorAll('#healthList > li')].map((li) => ({ word: li.querySelector('.fx-badge').textContent.trim(), cls: li.className })),
      jobs: document.querySelectorAll('#jobTable tbody tr').length, langs: document.querySelectorAll('#languageList li').length };
  });
  record('Index: the figures match the server', ix.facts['Files'] === server.index.files.toLocaleString() && ix.facts['Indexed revision'] === 'r' + server.index.indexedRevision, ix.facts);
  record('Index: checks marked Error, Warning or Info, import history and files by type', ix.items.length > 0 && ix.items.every((i) => ['Error', 'Warning', 'Info'].indexOf(i.word) >= 0 && i.cls.indexOf('is-' + i.word.toLowerCase()) >= 0)
    && ix.jobs > 0 && ix.langs === Object.keys(server.index.filesByLanguage).length, { items: ix.items.length, jobs: ix.jobs, langs: ix.langs });
  await shot('index');

  // ---------- Settings ----------
  await click('#tab-settings');
  await sleep(400);
  const st = await vm((m) => ({ secrets: [...document.querySelectorAll('#panel-settings input[type="password"]')].map((i) => i.value), readOnlyNote: !!document.getElementById('settingsReadOnly'),
    inputsReadOnly: [...document.querySelectorAll('#panel-settings fx-input input')].every((i) => i.readOnly), canManage: m.canManage() }));
  record('stored passwords and tokens are never filled in', st.secrets.every((v) => v === ''), st.secrets.length + ' secret fields');
  record(st.canManage ? 'Settings can be changed with Manage code' : 'Settings are read-only without Manage code', st.canManage ? !st.readOnlyNote : st.readOnlyNote && st.inputsReadOnly, st);
  await shot('settings');

  // ---------- Requests from other pages ----------
  const target = server.files.find((f) => /\.java$/.test(f.path)) || server.files[0];
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
  await sleep(1500);
  await run((p) => { window.require('services/pageRequests').codeFile({ path: p, startLine: 2, endLine: 3 }); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' })); return 1; }, target.path);
  await waitFor(() => !!document.getElementById('fileCode') && document.querySelectorAll('#fileCode .is-hit').length > 0, null, 30);
  const linked = await run(() => ({ explore: document.getElementById('tab-explore').getAttribute('aria-selected') === 'true', title: document.getElementById('fileTitle').textContent.trim(),
    hits: [...document.querySelectorAll('#fileCode .is-hit .factory-cd-n')].map((n) => +n.textContent) }));
  record('a file asked for by another page (Modernization) opens on Explore with its lines marked', linked.explore && linked.title === target.path.split('/').pop() && JSON.stringify(linked.hits) === '[2,3]', linked);
  for (const [t, label] of [['settings', 'Settings'], ['index', 'Index'], ['health', 'Index']]) {
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
    await sleep(1200);
    await run((x) => { window.require('services/pageRequests').codeTab(x); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' })); return 1; }, t);
    const ok = await waitFor((l) => { const b = [...document.querySelectorAll('.factory-cd [role="tab"]')].find((x) => x.getAttribute('aria-selected') === 'true'); return b && [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() === l; }, label, 20);
    record('pageRequests.codeTab(\'' + t + '\') opens ' + label, ok);
  }
  // The palette's G K opens Code › Explore; Ctrl K's code search lands on Search with results
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
  await sleep(1500);
  await run(() => { document.activeElement.blur(); return 1; });
  await key('g');
  await key('k');
  const gk = await waitFor(() => /ojr=code/.test(location.search) && !!document.getElementById('tab-explore') && document.getElementById('tab-explore').getAttribute('aria-selected') === 'true', null, 20);
  record('G then K opens Code › Explore', gk, await run(() => location.search));
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
  await sleep(1500);
  await key('k', 2);
  await sleep(500);
  await run((q) => { const i = document.querySelector('.fx-cmd input'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; }, QUERY);
  await sleep(500);
  await key('Enter');
  const ck = await waitFor(() => !!document.getElementById('tab-search') && document.getElementById('tab-search').getAttribute('aria-selected') === 'true' && document.querySelectorAll('#searchResults li, #fileNameHits li').length > 0, null, 30);
  record('Ctrl K, then Enter on the code search, lands on Search with results', ck, await run(() => location.search));

  // ---------- No sideways scroll on any tab at five widths ----------
  const wide = [];
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844]]) {
    await size(w, h);
    await sleep(600);
    for (const t of ['explore', 'search', 'map', 'rules', 'checks', 'index', 'settings']) {
      await vm((m, x) => { m.tab(x); return 1; }, t);
      await sleep(350);
      const over = await run(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) { wide.push(w + ' ' + t + ' +' + over); }
    }
    if (w === 390) {
      await vm((m) => { m.tab('explore'); m.files('floating'); return 1; });
      await sleep(400);
      const sheet = await run(() => { const p = document.getElementById('filesPanel'); const r = p.getBoundingClientRect(); return { position: getComputedStyle(p).position, bottom: Math.round(window.innerHeight - r.bottom), width: Math.round(r.width) }; });
      record('390 px: floating files are a sheet at the bottom of the screen', sheet.position === 'fixed' && sheet.bottom <= 1 && sheet.width >= 380, sheet);
      await vm((m) => { m.files('docked'); return 1; });
      await shot('explore-390');
    }
  }
  record('no sideways scroll on any tab at 1440, 1280, 1024, 768 and 390 px', wide.length === 0, wide);
  await size(1440, 1000);

  // ---------- Offline search ----------
  await vm((m) => { m.tab('search'); return 1; });
  await sleep(300);
  const errorsBefore = s.errors.filter((e) => !/auth\/me/.test(e));
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('#searchButton');
  await waitFor(() => !!document.getElementById('searchError'), null, 10);
  const offline = await run(() => (document.getElementById('searchError') || {}).textContent || '');
  record('offline search says the factory could not be reached', /could not reach the factory/i.test(offline) && !/Failed to fetch/.test(offline), offline.trim());
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  record('nothing left busy after the failure', await waitFor(() => !document.querySelector('.is-busy, .fx-progressbar.is-on'), null, 10));
  s.errors.length = 0;
  errorsBefore.forEach((e) => s.errors.push(e));

  // Settings: the workspace sheet link
  await vm((m) => { m.tab('settings'); return 1; });
  await sleep(300);
  await click('#workspaceDetailsLink');
  record('"Workspace details" opens the workspace sheet on Workspaces', await waitFor(() => new URLSearchParams(location.search).get('ojr') === 'workspaces' && !!document.querySelector('#workspaceSheet .fx-sheet'), null, 20));
  record('the tab leaves the address with the page', await run(() => !new URLSearchParams(location.search).has('tab')), await run(() => location.search));
  await key('Escape');

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  console.log(defects ? defects + ' defect(s).' : 'No defects.');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
