// Requirements list check: drives a running factory in headless Edge or Chrome and checks what the list promises:
//  - the stage boxes count the requirements at each stage (Spec, Screens, Plan, Code, Done) as Home computes them
//    (dashboard.workflow), and a box filters the list to its stage (choosing it again shows all);
//  - one row per requirement the server returns, each with its ID, title, type, source document, a stage chip with
//    the four steps, the state and when it changed; the step is the one Home computes from the same data;
//  - choosing a row opens it beside the list (marked as current); the next-step link opens where it is taken;
//  - the chips (All, Needs you and each spec status) count and narrow the list; the search finds by ID and says when
//    nothing matches; the type and source filters offer only values that exist; "Clear" brings every row back;
//  - each row has a ⋯ menu (Open, the screens and the change when there are some, Delete, whose dialog is cancelled);
//  - New requirement opens a side panel with the document picker focused; an unreadable file (chosen or dropped) and a
//    document the server rejects are said in the panel; a readable one shows with Remove; Describe it focuses the text
//    box and waits for text; Close and Escape close it and give focus back;
//  - a viewer sees no New requirement and is told who takes the next step;
//  - offline, the list says it could not load and "Try again" recovers;
//  - Tab reaches the first row; no console errors; the Workspaces page asks for no profile a workspace cannot have.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-requirements.js --url http://localhost:8080
//
// It never creates, changes or deletes anything: the one upload it sends is an empty text file, which the server
// refuses before storing it, and the delete dialog is always cancelled. Exit code 1 on a defect.
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
  if (args.workspace) { await s.selectWorkspace(args.workspace); }
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
  const key = async (name, code) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, windowsVirtualKeyCode: code, code: name });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: code, code: name });
    await sleep(120);
  };
  const tab = () => key('Tab', 9);
  // Calls fn(vm, arg) in the page with the Requirements view model
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'reqListTitle\')), a))))' }, arg);
  const rows = () => run(() => [...document.querySelectorAll('.factory-rq-list > li')].map((li) => ({
    code: (li.querySelector('.factory-rq-code') || {}).textContent,
    title: (li.querySelector('.factory-rq-row-title') || {}).textContent,
    source: (li.querySelector('.factory-rq-row-srcname') || {}).textContent,
    type: (li.querySelector('.factory-rq-tag') || {}).textContent,
    status: ((li.querySelector('.factory-rq-row-chips .fx-badge') || {}).textContent || '').trim(),
    steps: li.querySelectorAll('.factory-rq-bar').length,
    stepText: (li.querySelector('.factory-rq-stagechip') || { getAttribute: () => '' }).getAttribute('aria-label'),
    when: ((li.querySelector('.factory-rq-when') || {}).textContent || '').trim(),
    menu: !!li.querySelector('fx-menu-button'),
    current: li.querySelector('.factory-rq-open').getAttribute('aria-current'),
    next: li.querySelector('.factory-rq-next') ? li.querySelector('.factory-rq-next').textContent.trim() : null
  })));

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=requirements');
  await sleep(2500);

  // ---------- The list against the server's data ----------
  const expected = await run(() => new Promise((resolve) => window.require(['services/api', 'services/dashboard', 'services/workspaceSelection', 'services/session'], (api, dashboard, sel, session) => {
    const id = sel.selectedId();
    Promise.all(['requirements', 'designs', 'changes/details'].map((p) => api.get('workspaces/' + id + '/' + p))).then(([reqs, designs, changes]) => resolve(reqs.map((r) => {
      const f = dashboard.workflow(r, designs, changes, id);
      return {
        code: 'REQ-' + r.id.replace(/-/g, '').slice(0, 4).toUpperCase(), title: r.title, source: r.fileName || 'Typed description', status: r.status,
        stepText: f.stepText, state: f.status.text, stage: f.finished ? 'done' : String(f.step),
        mine: !f.finished && !!f.perm && session.can(id, f.perm)
      };
    })));
  })));
  let list = await rows();
  record('one row per requirement', list.length === expected.length, { rows: list.length, server: expected.length });
  const heading = await run(() => document.getElementById('reqListTitle').textContent.replace(/\s+/g, ' ').trim());
  record('the heading counts them', heading.indexOf('(' + expected.length + ')') >= 0, heading);
  const lead = await run(() => document.getElementById('requirementsLead').textContent.trim());
  record('the lead says how many there are and how many need you', expected.length === 0 || (lead.indexOf(expected.length + ' requirement') === 0 && /need|needs you|none needs you/.test(lead)), lead);
  const mismatch = expected.filter((e) => {
    const r = list.find((x) => x.code === e.code);
    return !r || r.title !== e.title || r.source !== e.source || r.stepText !== e.stepText || r.status !== e.state || r.steps !== 4 || !r.type || !r.when || !r.menu;
  });
  record('each row: ID, title, type, source, the stage with its four steps, the state, when and a menu, as Home computes them', mismatch.length === 0, mismatch.slice(0, 2));
  record('the first requirement opens beside the list', list.length === 0 || list.filter((r) => r.current === 'true').length === 1, list.map((r) => r.current));

  // ---------- Stage boxes ----------
  if (expected.length) {
    const boxes = await run(() => [...document.querySelectorAll('#reqStages .factory-rq-stage')].map((b) => ({
      id: b.id.replace('reqStage-', ''), count: +b.querySelector('.factory-rq-stage-count').textContent, pressed: b.getAttribute('aria-pressed') })));
    const want = ['1', '2', '3', '4', 'done'].map((v) => ({ id: v, count: expected.filter((e) => e.stage === v).length }));
    record('five stage boxes count the requirements at each stage', JSON.stringify(boxes.map((b) => ({ id: b.id, count: b.count }))) === JSON.stringify(want), boxes);
    const busiest = want.slice().sort((a, b) => b.count - a.count)[0];
    await click('#reqStage-' + busiest.id);
    await sleep(400);
    let now = await rows();
    const pressed = await run((id) => document.getElementById('reqStage-' + id).getAttribute('aria-pressed'), busiest.id);
    record('a stage box filters the list to its stage', pressed === 'true' && now.length === busiest.count
      && now.every((r) => (expected.find((e) => e.code === r.code) || {}).stage === busiest.id), { stage: busiest.id, rows: now.length });
    const shown = await run(() => document.querySelector('.factory-rq-shown').textContent.trim());
    record('the list says how many are shown', shown === busiest.count + ' of ' + expected.length + ' shown', shown);
    await click('#reqStage-' + busiest.id);
    await sleep(400);
    record('choosing the box again shows every row', (await rows()).length === expected.length);
  }

  // ---------- Choosing a row ----------
  if (list.length > 1) {
    await click('.factory-rq-list > li:nth-child(2) .factory-rq-open');
    await sleep(1500);
    const shownTitle = await run(() => (document.getElementById('requirementDetailTitle') || {}).textContent || '');
    list = await rows();
    record('a chosen row opens beside the list and is marked current', shownTitle.indexOf(list[1].title.trim()) >= 0 && list[1].current === 'true', { shown: shownTitle.trim().slice(0, 60) });
  }

  // ---------- Chips, search and filters ----------
  if (list.length > 1) {
    const chips = await run(() => [...document.querySelectorAll('#reqStateFilters .fx-chip')].map((c) => ({ id: c.id.replace('reqChip-', ''), text: c.textContent.trim(), pressed: c.getAttribute('aria-pressed') })));
    const statuses = [...new Set(expected.map((e) => e.status))];
    const mine = expected.filter((e) => e.mine).length;
    const wantChips = ['all'].concat(mine ? ['mine'] : [], ['PROCESSING', 'READY', 'APPROVED', 'FAILED'].filter((x) => statuses.indexOf(x) >= 0));
    record('the chips: All, Needs you when something does, and each spec status that exists', JSON.stringify(chips.map((c) => c.id)) === JSON.stringify(wantChips) && chips[0].pressed === 'true', chips);
    const countsOk = chips.every((c) => {
      const n = +(c.text.match(/(\d+)$/) || [0, -1])[1];
      return c.id === 'all' ? n === expected.length : c.id === 'mine' ? n === mine : n === expected.filter((e) => e.status === c.id).length;
    });
    record('each chip counts its requirements', countsOk, chips.map((c) => c.text));
    const statusChip = chips.find((c) => c.id !== 'all' && c.id !== 'mine');
    if (statusChip) {
      await click('#reqChip-' + statusChip.id);
      await sleep(300);
      const now = await rows();
      record('a status chip narrows the list', now.length === expected.filter((e) => e.status === statusChip.id).length
        && now.every((r) => expected.find((e) => e.code === r.code).status === statusChip.id), { chip: statusChip.text, rows: now.length });
      await click('#reqChip-all');
      await sleep(300);
    }
    if (mine) {
      await click('#reqChip-mine');
      await sleep(300);
      const now = await rows();
      record('Needs you narrows the list to the steps that are yours', now.length === mine && now.every((r) => expected.find((e) => e.code === r.code).mine), now.map((r) => r.code));
      await click('#reqChip-all');
      await sleep(300);
    }

    const code = list[0].code;
    await vm((m, c) => { m.search(c); }, code);
    await sleep(300);
    let now = await rows();
    record('search by ID finds that requirement', now.length >= 1 && now.every((r) => r.code === code), now.map((r) => r.code));
    await vm((m) => { m.search('zzzz-no-such-requirement'); });
    await sleep(300);
    record('a search with no match says so', await run(() => !!document.getElementById('reqNoMatch')));
    await click('#reqNoMatch .fx-btn');
    await sleep(300);
    record('Clear brings every row back', (await rows()).length === expected.length);

    const options = await vm((m) => ({ type: m.showTypeFilter(), source: m.showSourceFilter(), sources: m.sourceOptions().map((o) => o.value) }));
    const sources = [...new Set(expected.map((e) => e.source))];
    record('the source filter offers only documents that exist', options.sources.length - 1 === sources.length, { options: options.sources.length - 1, sources: sources.length });
    if (options.type || options.source) {
      await click('#reqFilterButton');
      await sleep(300);
      record('the filter button shows the type or source filter', await run(() => !!document.querySelector('#reqFilters #reqSourceFilter, #reqFilters #reqTypeFilter')));
      if (options.source) {
        await vm((m, v) => { m.sourceFilter(v); }, options.sources[1]);
        await sleep(300);
        now = await rows();
        record('the source filter narrows the list', now.length > 0 && now.every((r) => r.source === options.sources[1]), { source: options.sources[1], rows: now.length });
        const badge = await run(() => (document.querySelector('#reqFilterButton .factory-rq-filtercount') || {}).textContent);
        record('the filter button counts the filters on', badge === '1', badge);
        record('Clear search and filters shows under the filters', await run(() => !!document.getElementById('reqClearFilters')));
        await click('#reqClearFilters');
        await sleep(300);
      }
      await click('#reqFilterButton');
      await sleep(200);
    }
    record('clearing the filters brings every row back', (await rows()).length === expected.length);
  }

  // ---------- The row menu ----------
  if (list.length) {
    // Opens the last row's menu (popups close on scrolling, so the scroll settles first; once more if it closed)
    const openRowMenu = async () => {
      for (let i = 0; i < 2; i++) {
        await run(() => { document.querySelector('.factory-rq-list > li:last-child .factory-rq-rowmenu button').scrollIntoView({ block: 'center' }); return 1; });
        await sleep(600);
        await click('.factory-rq-list > li:last-child .factory-rq-rowmenu button');
        await sleep(500);
        if (await run(() => document.querySelectorAll('.fx-menu [role^="menuitem"]').length > 0)) { return; }
      }
    };
    await openRowMenu();
    const items = await run(() => [...document.querySelectorAll('.fx-menu [role^="menuitem"]')].map((e) => e.textContent.trim()));
    const lastFlow = await vm((m) => { const r = m.rows()[m.rows().length - 1]; return { designs: r.flow.designs.length, change: !!r.flow.change, title: r.title }; });
    record('the ⋯ menu: Open, the screens and the change when there are some, Delete', items[0] === 'Open' && items[items.length - 1] === 'Delete'
      && (items.indexOf('Open the screens in the Design Studio') >= 0) === lastFlow.designs > 0 && (items.indexOf('Open the change') >= 0) === lastFlow.change, items);
    const before = await run(() => (document.getElementById('requirementDetailTitle') || {}).textContent || '');
    record('opening the ⋯ menu does not open the row', before.indexOf(lastFlow.title.trim()) < 0 || list.length === 1);
    await run(() => { const it = [...document.querySelectorAll('.fx-menu [role^="menuitem"]')].find((e) => e.textContent.trim() === 'Open'); it.click(); return 1; });
    await sleep(1500);
    const opened = await run(() => (document.getElementById('requirementDetailTitle') || {}).textContent || '');
    record('the menu\'s Open opens that requirement', opened.indexOf(lastFlow.title.trim()) >= 0, opened.trim().slice(0, 60));
    const canDelete = await vm((m) => m.canEdit());
    if (canDelete) {
      await openRowMenu();
      await run(() => { const it = [...document.querySelectorAll('.fx-menu [role^="menuitem"]')].find((e) => e.textContent.trim() === 'Delete'); it.click(); return 1; });
      await sleep(600);
      const dlg = await run(() => (document.querySelector('.fx-dialog') ? document.querySelector('.fx-dialog').textContent.replace(/\s+/g, ' ').trim() : null));
      record('Delete asks first, naming the requirement', !!dlg && /Delete REQ-/.test(dlg) && /cannot be undone/.test(dlg), dlg);
      await click('.fx-dialog-actions .fx-btn--secondary');
      await sleep(600);
      record('cancelling keeps it', (await rows()).length === expected.length && !(await run(() => !!document.querySelector('.fx-dialog'))));
    }
  }

  // ---------- Next step links ----------
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
  await click('#newRequirementButton');
  await sleep(700);
  let panel = await run(() => ({ shown: !!document.querySelector('#requirementCreate .fx-sheet'), focus: document.activeElement && document.activeElement.id,
    expanded: document.getElementById('newRequirementButton').getAttribute('aria-expanded'), upload: (document.getElementById('uploadButton') || {}).disabled,
    choice: (document.querySelector('#requirementCreate [aria-pressed="true"]') || {}).id }));
  record('New requirement opens a side panel on Upload a document, the file picker focused', panel.shown && panel.focus === 'reqFile' && panel.expanded === 'true' && panel.choice === 'source-upload', panel);
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
  await run(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'dropped.zip'));
    document.getElementById('chooseFileButton').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return 1;
  });
  await sleep(300);
  err = await run(() => (document.getElementById('createError') || {}).textContent || '');
  record('a dropped file is checked the same way', /dropped\.zip is not a document/.test(err), err.trim());
  await setFile('blank.txt', '   ');
  const ready = await run(() => ({ enabled: !document.getElementById('uploadButton').disabled, error: !!document.getElementById('createError'),
    chosen: (document.getElementById('chosenFileName') || {}).textContent || '', remove: !!document.getElementById('removeFileButton') }));
  record('a readable file clears the message, shows with Remove and enables Upload', ready.enabled && !ready.error && /^blank\.txt/.test(ready.chosen) && ready.remove, ready);
  await click('#uploadButton');
  await sleep(2000);
  err = await run(() => (document.getElementById('createError') || {}).textContent || '');
  record('a document the server refuses is said in the panel', err.trim().length > 0, err.trim());
  record('nothing was added', (await rows()).length === expected.length);
  await click('#removeFileButton');
  await sleep(300);
  record('Remove takes the file away again', await run(() => !document.getElementById('chosenFile') && document.getElementById('uploadButton').disabled));
  fs.rmSync(dir, { recursive: true, force: true });
  await click('#source-text');
  await sleep(400);
  panel = await run(() => ({ focus: document.activeElement && document.activeElement.id, disabled: document.getElementById('submitTextButton').disabled,
    choice: (document.querySelector('#requirementCreate [aria-pressed="true"]') || {}).id }));
  record('Describe it: the text box is focused and Draft waits for text', panel.focus === 'reqText' && panel.disabled && panel.choice === 'source-text', panel);
  await click('#requirementCreate .fx-sheet-close');
  await sleep(400);
  panel = await run(() => ({ shown: !!document.querySelector('#requirementCreate .fx-sheet'), focus: document.activeElement && document.activeElement.id }));
  record('Close hides the panel and gives focus back', !panel.shown && panel.focus === 'newRequirementButton', panel);
  await click('#newRequirementButton');
  await sleep(600);
  await key('Escape', 27);
  await sleep(300);
  record('Escape closes it too', await run(() => !document.querySelector('#requirementCreate .fx-sheet')));
  const menuNew = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => {
    const m = ko.dataFor(document.getElementById('reqListTitle'));
    m.pageMenu({ detail: { value: 'text' } });
    setTimeout(() => { resolve({ shown: !!document.querySelector('#requirementCreate .fx-sheet'), choice: (document.querySelector('#requirementCreate [aria-pressed="true"]') || {}).id }); m.createOpen(false); }, 400);
  })));
  record('the page menu\'s Describe a requirement opens the panel on Describe it', menuNew.shown && menuNew.choice === 'source-text', menuNew);
  await sleep(300);

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
        create: !!document.getElementById('newRequirementButton'),
        next: [...document.querySelectorAll('.factory-rq-next')].map((e) => e.textContent.trim()),
        action: !!document.getElementById('reqChip-mine'),
        you: document.querySelectorAll('.factory-rq-you').length
      };
      session.user(me);
      resolve(r);
    }, 800);
  })));
  record('viewer: no New requirement', !viewer.create, viewer);
  record('viewer: next steps say who takes them', viewer.next.every((t) => /^Waiting for|^Follow/.test(t)), viewer.next);
  record('viewer: nothing needs their action', !viewer.action && viewer.you === 0);
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
