// Requirements list check: drives a running factory in headless Edge or Chrome and checks what the list promises:
//  - one row per requirement the server returns, each with its ID, title, source document, type, spec status and the
//    four workflow steps, the step being the one Home computes (dashboard.workflow) from the same data;
//  - choosing a row opens it beside the list (marked as current); the next-step link opens where it is taken;
//  - search and filters narrow the list, offer only values that exist, and "Clear" brings every row back;
//  - Upload BRD/FSD opens its panel with the file picker focused; an unreadable file and a document the server
//    rejects are said in the panel; Cancel closes it and gives focus back; New requirement needs some text;
//  - a viewer sees no Upload or New requirement and is told who takes the next step;
//  - offline, the list says it could not load and "Try again" recovers;
//  - Tab reaches the first row; no console errors; the Workspaces page asks for no profile a workspace cannot have.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-requirements.js --url http://localhost:8080
//
// It never creates, changes or deletes anything: the one upload it sends is an empty text file, which the server
// refuses before storing it. Exit code 1 on a defect.
const fs = require('fs');
const os = require('os');
const path = require('path');
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
  const click = async (sel) => {
    const c = await run((q) => { const e = document.querySelector(q); if (!e) { return null; } e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    if (!c) { return false; }
    for (const t of ['mousePressed', 'mouseReleased']) { await cdp('Input.dispatchMouseEvent', { type: t, x: c.x, y: c.y, button: 'left', clickCount: 1 }); }
    return true;
  };
  const tab = async () => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', windowsVirtualKeyCode: 9, code: 'Tab' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', windowsVirtualKeyCode: 9, code: 'Tab' });
    await sleep(100);
  };
  // Calls fn(vm, arg) in the page with the Requirements view model
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'reqListTitle\')), a))))' }, arg);
  const rows = () => run(() => [...document.querySelectorAll('.factory-rq-list > li')].map((li) => ({
    code: (li.querySelector('.factory-rq-code') || {}).textContent,
    title: (li.querySelector('.factory-rq-row-title') || {}).textContent,
    source: (li.querySelector('.factory-rq-row-srcname') || {}).textContent,
    type: (li.querySelector('.factory-rq-tag') || {}).textContent,
    status: (li.querySelector('.factory-rq-row-top .fx-badge') || {}).textContent,
    steps: li.querySelectorAll('.factory-rq-step').length,
    stepText: (li.querySelector('.factory-rq-row-foot span') || {}).textContent,
    current: li.querySelector('.factory-rq-open').getAttribute('aria-current'),
    next: li.querySelector('.factory-rq-next') ? li.querySelector('.factory-rq-next-act').textContent.trim() : null
  })));

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=requirements');
  await sleep(2500);

  // ---------- The list against the server's data ----------
  const expected = await run(() => new Promise((resolve) => window.require(['services/api', 'services/dashboard', 'services/workspaceSelection'], (api, dashboard, sel) => {
    const id = sel.selectedId();
    Promise.all(['requirements', 'designs', 'changes/details'].map((p) => api.get('workspaces/' + id + '/' + p))).then(([reqs, designs, changes]) => resolve(reqs.map((r) => ({
      code: 'REQ-' + r.id.replace(/-/g, '').slice(0, 4).toUpperCase(), title: r.title, source: r.fileName || 'Typed description',
      stepText: dashboard.workflow(r, designs, changes, id).stepText
    }))));
  })));
  let list = await rows();
  record('one row per requirement', list.length === expected.length, { rows: list.length, server: expected.length });
  const heading = await run(() => document.getElementById('reqListTitle').textContent.replace(/\s+/g, ' ').trim());
  record('the heading counts them', heading.indexOf('(' + expected.length + ')') >= 0, heading);
  const mismatch = expected.filter((e) => {
    const r = list.find((x) => x.code === e.code);
    return !r || r.title !== e.title || r.source !== e.source || r.stepText !== e.stepText || r.steps !== 4 || !r.type || !r.status;
  });
  record('each row: ID, title, source, type, status and the four steps as Home computes them', mismatch.length === 0, mismatch.slice(0, 2));
  record('the first requirement opens beside the list', list.length === 0 || list.filter((r) => r.current === 'true').length === 1, list.map((r) => r.current));

  // ---------- Choosing a row ----------
  if (list.length > 1) {
    await click('.factory-rq-list > li:nth-child(2) .factory-rq-open');
    await sleep(1500);
    const shown = await run(() => (document.getElementById('requirementDetailTitle') || {}).textContent || '');
    list = await rows();
    record('a chosen row opens beside the list and is marked current', shown.indexOf(list[1].title.trim()) >= 0 && list[1].current === 'true', { shown: shown.trim().slice(0, 60) });
  }

  // ---------- Search and filters ----------
  if (list.length > 1) {
    const code = list[0].code;
    await vm((m, c) => { m.search(c); }, code);
    await sleep(300);
    let now = await rows();
    record('search by ID finds that requirement', now.length >= 1 && now.every((r) => r.code === code), now.map((r) => r.code));
    await vm((m) => { m.search('zzzz-no-such-requirement'); });
    await sleep(300);
    const none = await run(() => !!document.getElementById('reqNoMatch'));
    record('a search with no match says so', none);
    await click('#reqNoMatch .fx-btn');
    await sleep(300);
    record('Clear brings every row back', (await rows()).length === expected.length);

    await click('#reqFilterButton');
    await sleep(300);
    const options = await vm((m) => ({ status: m.statusOptions().map((o) => o.value), stage: m.stageOptions().map((o) => o.value), type: m.showTypeFilter(), source: m.showSourceFilter() }));
    record('the filters show', await run(() => !!document.querySelector('#reqFilters #reqStatusFilter')));
    const statuses = [...new Set(list.map((r) => r.status))];
    record('the status filter offers only statuses that exist', options.status.length - 1 === statuses.length, { options: options.status, shown: statuses });
    const value = options.status[1];
    await vm((m, v) => { m.statusFilter(v); }, value);
    await sleep(300);
    now = await rows();
    const word = await vm((m, v) => m.statusOptions().find((o) => o.value === v).label.replace(/ \(\d+\)$/, ''), value);
    record('the status filter narrows the list', now.length > 0 && now.every((r) => r.status.trim() === word), { filter: word, rows: now.map((r) => r.status) });
    const badge = await run(() => (document.querySelector('#reqFilterButton .factory-rq-filtercount') || {}).textContent);
    record('the filter button counts the filters on', badge === '1', badge);
    await vm((m) => { m.clearFilters(); });
    await sleep(300);
    record('clearing the filters brings every row back', (await rows()).length === expected.length);
  }

  // ---------- Next step links ----------
  list = await rows();
  const nextOnPage = await vm((m) => {
    const r = m.rows().find((x) => x.next && x.flow.target === 'requirement');
    return r ? { code: r.code, title: r.title, questions: !!r.flow.questions } : null;
  });
  if (nextOnPage) {
    await run((code) => { const li = [...document.querySelectorAll('.factory-rq-list > li')].find((x) => x.querySelector('.factory-rq-code').textContent === code); li.querySelector('.factory-rq-next').click(); return 1; }, nextOnPage.code);
    await sleep(1500);
    const o = await run(() => ({ title: (document.getElementById('requirementDetailTitle') || {}).textContent || '', part: (document.querySelector('.factory-rq-subtabs [aria-selected="true"]') || {}).id || '' }));
    record('the next-step link opens the requirement' + (nextOnPage.questions ? ' at its open questions' : ''),
      o.title.indexOf(nextOnPage.title.trim()) >= 0 && (!nextOnPage.questions || o.part === 'part-questions'), o);
  }
  const elsewhere = await vm((m) => {
    const r = m.rows().find((x) => x.next && x.flow.target !== 'requirement');
    return r ? { code: r.code, target: r.flow.target } : null;
  });
  if (elsewhere) {
    await run((code) => { const li = [...document.querySelectorAll('.factory-rq-list > li')].find((x) => x.querySelector('.factory-rq-code').textContent === code); li.querySelector('.factory-rq-next').click(); return 1; }, elsewhere.code);
    await sleep(2500);
    const page = await run(() => new URLSearchParams(location.search).get('ojr'));
    record('the next-step link opens ' + elsewhere.target, page === (elsewhere.target === 'studio' ? 'studio' : 'changes'), page);
    await open(BASE + '/?ojr=requirements');
    await sleep(2500);
  }

  // ---------- New requirement ----------
  await click('#uploadTabButton');
  await sleep(500);
  let panel = await run(() => ({ shown: !!document.getElementById('requirementCreate'), focus: document.activeElement && document.activeElement.id, expanded: document.getElementById('uploadTabButton').getAttribute('aria-expanded'), upload: document.getElementById('uploadButton').disabled }));
  record('Upload BRD/FSD opens its panel with the file picker focused', panel.shown && panel.focus === 'reqFile' && panel.expanded === 'true', panel);
  record('Upload waits for a file', panel.upload === true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-rq-'));
  const setFile = async (name, content) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    const doc = await cdp('DOM.getDocument', { depth: -1 });
    const node = await cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#reqFile' });
    await cdp('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [file] });
    await sleep(500);
  };
  await setFile('notes.exe', 'x');
  let err = await run(() => (document.getElementById('createError') || {}).textContent || '');
  record('an unreadable file is refused in the panel with what to choose', /not a document the factory can read.*Choose a Word/.test(err), err.trim());
  await setFile('blank.txt', '   ');
  const ready = await run(() => !document.getElementById('uploadButton').disabled && !document.getElementById('createError'));
  record('a readable file clears the message and enables Upload', ready);
  await click('#uploadButton');
  await sleep(2000);
  err = await run(() => (document.getElementById('createError') || {}).textContent || '');
  record('a document the server refuses is said in the panel', err.trim().length > 0, err.trim());
  record('nothing was added', (await rows()).length === expected.length);
  fs.rmSync(dir, { recursive: true, force: true });
  await click('#switchToText');
  await sleep(400);
  panel = await run(() => ({ focus: document.activeElement && document.activeElement.id, disabled: document.getElementById('submitTextButton').disabled }));
  record('Describe it instead: the text box is focused and Draft waits for text', panel.focus === 'reqText' && panel.disabled, panel);
  await click('#closeCreateButton');
  await sleep(400);
  panel = await run(() => ({ shown: !!document.getElementById('requirementCreate'), focus: document.activeElement && document.activeElement.id }));
  record('Close hides the panel and gives focus back', !panel.shown && panel.focus === 'newRequirementButton', panel);

  // ---------- Keyboard ----------
  await run(() => { const i = document.getElementById('reqSearch'); i.focus(); return 1; });
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
    await tab();
    reached = await run(() => !!document.activeElement && document.activeElement.classList.contains('factory-rq-open'));
  }
  record('Tab from the search reaches the first row', reached || expected.length === 0);

  // ---------- Viewer ----------
  const viewer = await run(() => new Promise((resolve) => window.require(['services/session', 'services/workspaceSelection'], (session, sel) => {
    const me = session.user();
    session.user(Object.assign({}, me, { admin: false, memberships: [{ workspaceId: sel.selectedId(), role: 'VIEWER', permissions: ['VIEW', 'COMMENT'] }] }));
    setTimeout(() => {
      const r = {
        upload: !!document.getElementById('uploadTabButton'), create: !!document.getElementById('newRequirementButton'),
        next: [...document.querySelectorAll('.factory-rq-next-act')].map((e) => e.textContent.trim()),
        action: !!document.getElementById('reqActionFilter')
      };
      session.user(me);
      resolve(r);
    }, 800);
  })));
  record('viewer: no Upload BRD/FSD or New requirement', !viewer.upload && !viewer.create, viewer);
  record('viewer: next steps say who takes them', viewer.next.every((t) => /^Waiting for|^Follow/.test(t)), viewer.next);
  record('viewer: nothing needs their action', !viewer.action);
  await sleep(1500);

  // ---------- Offline ----------
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await vm((m) => { m.retryList(); });
  await sleep(1200);
  const offline = await run(() => { const e = document.getElementById('reqListError'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; });
  record('offline: the list says it could not load and what to do', !!offline && /Check your connection/.test(offline), offline);
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('#reqListError .fx-btn');
  await sleep(2500);
  const back = await run(() => ({ error: !!document.getElementById('reqListError'), rows: document.querySelectorAll('.factory-rq-list > li').length, busy: document.querySelectorAll('.is-busy').length }));
  record('Try again recovers with nothing left busy', !back.error && back.rows === expected.length && !back.busy, back);

  const ignore = (e) => /auth\/me|failed request|net::ERR_INTERNET_DISCONNECTED|Failed to fetch|HTTP 400 \/api\/workspaces\/[^/]+\/requirements$/.test(e);
  const errors = s.errors.filter((e) => !ignore(e));
  record('no console errors (besides the offline test and the refused upload)', errors.length === 0, errors.slice(0, 4));

  // ---------- Workspaces: no profile request for a workspace without one ----------
  const before = s.errors.length;
  await open(BASE + '/?ojr=workspaces');
  await sleep(3500);
  const profile404 = s.errors.slice(before).filter((e) => /\/profile/.test(e));
  record('Workspaces: no 404 for a profile that does not exist', profile404.length === 0, profile404);

  s.close();
  console.log(defects ? defects + ' defect(s).' : 'No defects.');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
