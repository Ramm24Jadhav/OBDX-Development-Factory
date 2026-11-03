// Design Studio check: drives a running factory in headless Edge or Chrome and checks what the Studio promises:
//  - the workflow bar has its five stages, one of them current;
//  - arrow keys, Home and End move through the flow's nodes, and the screen under the focus is shown;
//  - arrow keys move through the selected screen's tabs, each with its own panel;
//  - approving all screens, one screen or a requirement's screens, and reopening a screen, each ask first, and Cancel
//    changes nothing;
//  - Edit draws the designer inside the page (no board, title or Screens tab of its own, the library and the flow fold
//    away, one preview at a time, no invented sample values); an unsaved change is asked about on switching to Review,
//    opening another screen and leaving the page; Ctrl+Z outside the editor leaves it alone; Escape with nothing
//    selected goes back to Review; at 390 px Edit says to use a wider screen and Review still works;
//  - + New screen offers a blank screen (asks for its name; Cancel creates nothing) and an import; the screen's More
//    menu has share, import and delete, and Delete asks first;
//  - "Screens without a BRD" (in a workspace that has some) lists them without stages, and approving one asks first;
//  - old links: the designer route opens the Studio, and a screen asked for with pageRequests.design opens in Edit; the
//    menu says Design Studio; ?ojr=studio&requirement=<id>&screen=<id> opens that screen, the address follows the
//    selection, and another page's address keeps none of it;
//  - the editor's canvas shows the BRD's values only: each field value is the screen's default or a named value, a
//    "to be confirmed" mark or a run-time note, and none of the preview's sample values appears;
//  - the unsaved-change question also comes for the BRD picker, an upload (stubbed), another workspace and Back;
//  - Save: a refused save (stubbed 500) says why and keeps the changes, a save makes a new version; Save and approve
//    saves first, an unsupported-components refusal (stubbed 409) asks again, Cancel approves nothing, Approve Anyway
//    retries with ?unsupported=true; the screen is reopened at the end.
// A missing precondition (no editable screen, nothing to approve, no screen without a BRD) is a defect, not a skip.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-studio.js --url http://localhost:8080 [--workspace <id>]
//
// It picks a BRD with screens that are not all approved. It SAVES: two new versions of one draft screen, and approves and
// reopens it; use it only on a factory whose data is a copy. Other confirmations are cancelled. Exit code 1 on a defect.
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const KEYS = { ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Escape: 27, Enter: 13 };

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const key = async (k, modifiers) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: KEYS[k], modifiers: modifiers || 0 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: KEYS[k], modifiers: modifiers || 0 });
    await sleep(300);
  };
  const dialog = () => run(() => { const d = document.querySelector('.fx-dialog'); return d ? (d.querySelector('h2, .fx-dialog-title') || d).textContent.trim().slice(0, 60) : null; });
  const cancel = async () => { await run(() => { const b = document.querySelector('.fx-dialog .fx-btn--secondary'); if (b) { b.click(); } return 1; }); await sleep(700); };
  const statuses = () => run(() => [...document.querySelectorAll('.factory-studio-node')].map((n) => n.classList.contains('is-approved')).join(','));
  const confirm = async () => { await run(() => { const b = document.querySelector('.fx-dialog .fx-dialog-actions .fx-btn:not(.fx-btn--secondary)'); if (b) { b.click(); } return 1; }); await sleep(500); };
  // Stubbed answers for some requests (DevTools Fetch domain): match(request) picks them; every other request goes on
  const stubs = [];
  s.onEvent((m) => {
    if (m.method !== 'Fetch.requestPaused') { return; }
    const p = m.params;
    const st = stubs.find((x) => x.match(p.request));
    if (st) {
      st.hits.push(p.request.url);
      cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: st.status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(st.body)).toString('base64') });
    } else {
      cdp('Fetch.continueRequest', { requestId: p.requestId });
    }
  });
  const stub = async (match, status, body) => {
    const st = { match: match, status: status, body: body, hits: [] };
    stubs.push(st);
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
    return st;
  };
  const unstub = async (st) => { stubs.splice(stubs.indexOf(st), 1); if (stubs.length === 0) { await cdp('Fetch.disable'); } };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  await s.selectWorkspace(args.workspace || null);
  // A BRD with screens that are not all approved (else one with screens)
  const brd = await run(async () => {
    const get = (p) => fetch('api/' + p, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
    const w = await new Promise((r) => window.require(['services/workspaceSelection'], r));
    const pr = await new Promise((r) => window.require(['services/pageRequests'], r));
    const list = (await get('workspaces/' + w.selectedId() + '/requirements')) || [];
    let found = null;
    let approved = null;
    for (const r of list.filter((x) => x.status === 'APPROVED')) {
      const flow = await get('requirements/' + r.id + '/design-flow');
      if (flow && flow.screens.length > 1) {
        const open = flow.screens.some((x) => x.status !== 'APPROVED');
        if (!found || (open && found.allApproved)) { found = { id: r.id, title: r.title, screens: flow.screens.length, allApproved: !open }; }
      }
      if (flow && !approved && flow.screens.some((x) => x.status === 'APPROVED')) { approved = r.id; }
    }
    if (found) { pr.studio(found.id); found.approvedBrd = approved; }
    return found;
  });
  record('a BRD with screens to check', !!brd, brd || 'none in this workspace');
  if (!brd) { s.close(); process.exit(1); }
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); return 1; });
  await sleep(4500);

  // The workflow bar
  const bar = await run(() => ({
    steps: [...document.querySelectorAll('.factory-studio-stepper-item strong')].map((x) => x.textContent.trim()),
    current: document.querySelectorAll('.factory-studio-stepper-item[aria-current="step"]').length,
    brd: !!document.getElementById('studioBrd'),
    next: (document.getElementById('studioNext') || {}).textContent || ''
  }));
  record('the workflow bar has the five stages', bar.steps.join(',') === 'BRD,Spec,Screens,Approve,Code', bar.steps);
  record('one stage is current', bar.current === 1, bar.current);
  record('the BRD picker and the next action show', bar.brd && bar.next.trim().length > 0, bar.next.replace(/\s+/g, ' ').trim().slice(0, 80));

  // The flow's nodes: arrow keys, Home and End
  const nodes = await run(() => [...document.querySelectorAll('.factory-studio-node')].map((n) => n.getAttribute('data-studio-node')));
  record('the flow shows the screens as nodes', nodes.length > 1, nodes.length);
  const nodeState = () => run(() => ({
    focused: document.activeElement && document.activeElement.getAttribute('data-studio-node'),
    pressed: (document.querySelector('.factory-studio-node[aria-pressed="true"]') || { getAttribute: () => null }).getAttribute('data-studio-node'),
    title: (document.getElementById('studioScreenTitle') || {}).textContent || ''
  }));
  await run(() => { const n = document.querySelector('.factory-studio-node[aria-pressed="true"]') || document.querySelector('.factory-studio-node'); n.focus(); return 1; });
  const start = await nodeState();
  await key('ArrowRight');
  const moved = await nodeState();
  const at = nodes.indexOf(start.pressed);
  record('ArrowRight moves to the next node and shows it', moved.focused === nodes[Math.min(at + 1, nodes.length - 1)] && moved.pressed === moved.focused, { from: start.pressed, to: moved });
  await key('End');
  const end = await nodeState();
  record('End moves to the last node', end.pressed === nodes[nodes.length - 1] && end.focused === end.pressed, end.pressed);
  await key('Home');
  const home = await nodeState();
  record('Home moves to the first node', home.pressed === nodes[0] && home.focused === home.pressed, home.pressed);

  // The selected screen's tabs
  const tabs = await run(() => [...document.querySelectorAll('.factory-studio-tabs [role=tab]')].map((t) => t.id));
  record('the selected screen has its tabs', tabs.length >= 2, tabs);
  await run(() => { const t = document.querySelector('.factory-studio-tabs [role=tab][aria-selected="true"]'); t.focus(); return 1; });
  await key('ArrowRight');
  const tab = await run(() => {
    const t = document.activeElement;
    return { focused: t && t.id, selected: t && t.getAttribute('aria-selected'), panel: !!document.getElementById(t.getAttribute('aria-controls')) };
  });
  record('ArrowRight moves to the next tab and shows its panel', tab.focused === tabs[1] && tab.selected === 'true' && tab.panel, tab);
  await key('Home');
  record('Home goes back to the first tab', await run((first) => document.activeElement && document.activeElement.id === first, tabs[0]));

  // Approving all asks first; Cancel changes nothing
  const before = await statuses();
  const approveAll = await run(() => { const b = document.getElementById('studioNextAction'); if (b && /Approve all/.test(b.textContent)) { b.click(); return true; } return false; });
  if (approveAll) {
    await sleep(600);
    const asked = await dialog();
    record('Approve all asks first', !!asked, asked);
    await cancel();
    record('cancelling approves nothing', (await statuses()) === before && !(await dialog()));
  } else {
    record('Approve all is offered (the BRD must have screens to approve and you the Approve permission)', false, 'precondition missing');
  }
  // Approving one screen and a requirement's screens ask first too (services/designActions)
  for (const [id, what] of [['studioApproveScreen', 'Approve screen'], ['studioApproveGroup', 'Approving the group']]) {
    const clicked = await run((b) => { const e = document.getElementById(b); if (e) { e.click(); } return !!e; }, id);
    if (!clicked) { record(what + ' is offered (precondition: a screen to approve and the Approve permission)', false, 'precondition missing'); continue; }
    await sleep(600);
    const asked = await dialog();
    record(what + ' asks first', !!asked, asked);
    await cancel();
    record(what + ': cancelling approves nothing', (await statuses()) === before && !(await dialog()));
  }
  // Reopen asks first: a BRD with an approved screen
  if (brd.approvedBrd) {
    await run((id) => new Promise((r) => window.require(['services/pageRequests'], (pr) => { pr.studio(id); r(1); })), brd.approvedBrd);
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
    await sleep(1500);
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); return 1; });
    await sleep(4000);
    await run(() => { const n = [...document.querySelectorAll('.factory-studio-node.is-approved')][0]; if (n) { n.click(); } return 1; });
    await sleep(1200);
    const reopen = await run(() => { const b = document.getElementById('studioReopenScreen'); if (b) { b.click(); } return !!b; });
    if (reopen) {
      await sleep(600);
      const asked = await dialog();
      record('Reopen asks first', !!asked, asked);
      await cancel();
      record('cancelling keeps the screen approved', await run(() => !!document.getElementById('studioReopenScreen') && !document.querySelector('.fx-dialog')));
    } else {
      record('Reopen is offered for an approved screen', false);
    }
  }

  // ---------- Edit: the designer inside the Studio ----------
  await run((id) => new Promise((r) => window.require(['services/pageRequests'], (pr) => { pr.studio(id); r(1); })), brd.id);
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
  await sleep(1500);
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); return 1; });
  await sleep(4000);
  // A screen that can be changed
  await run(() => { const n = [...document.querySelectorAll('.factory-studio-node')].find((x) => !x.classList.contains('is-approved')); if (n) { n.click(); } return 1; });
  await sleep(1000);
  const frames = () => run(() => ({
    review: document.querySelectorAll('iframe[data-studio-screen]').length,
    editor: document.querySelectorAll('#studioEditor iframe.factory-dz-frame').length,
    all: document.querySelectorAll('.factory-page iframe').length
  }));
  record('Review shows one preview', JSON.stringify(await frames()) === JSON.stringify({ review: 1, editor: 0, all: 1 }), await frames());
  await run(() => { document.getElementById('studioMode-edit').click(); return 1; });
  await sleep(6000);
  const edit = await run(() => ({
    pressed: document.getElementById('studioMode-edit').getAttribute('aria-pressed'),
    module: !!document.querySelector('#studioEditor .factory-dz'),
    library: !!document.querySelector('.factory-studio-nav') || !!document.querySelector('.factory-studio-map'),
    tabs: [...document.querySelectorAll('#studioEditor #leftPanel [role=tab]')].map((t) => t.textContent.trim()),
    board: !!document.getElementById('designBoard'),
    ownTitle: [...document.querySelectorAll('h1')].some((h) => /Visual Designer/.test(h.textContent)),
    journey: !!document.querySelector('#studioEditor #journeyStrip'),
    loaded: !!document.querySelector('#studioEditor #designLayers, #studioEditor #designPalette')
  }));
  record('Edit draws the designer inside the Studio', edit.pressed === 'true' && edit.module && edit.loaded, edit);
  record('the requirements and the flow fold away; the journey strip shows the flow', !edit.library && edit.journey);
  record('the editor has no board, title or Screens tab of its own', !edit.board && !edit.ownTitle && edit.tabs.join(',') === 'Components,Layers', edit.tabs);
  record('Edit has one preview: the editor\'s', JSON.stringify(await frames()) === JSON.stringify({ review: 0, editor: 1, all: 1 }), await frames());
  // Every value the editor's canvas shows in a field is the BRD's (the screen's default or a named value), a "to be
  // confirmed" mark or a run-time note; none of the preview's invented samples appears
  await sleep(1500);
  const values = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => {
    const vm = ko.dataFor(document.querySelector('#studioEditor .factory-dz'));
    const model = vm && vm.working ? vm.working() : null;
    const frame = document.querySelector('#studioEditor iframe.factory-dz-frame');
    const doc = frame && frame.contentDocument;
    if (!model || !doc || !doc.body) { resolve({ error: 'no model or canvas' }); return; }
    const PLACEHOLDERS = ['Option 1', 'Option 2', 'Column 1', 'Column 2'];
    const norm = (v) => String(v === null || v === undefined ? '' : v).trim();
    const num = (v) => Number(norm(v).replace(/[,₹$\s]/g, ''));
    const bad = [];
    let fields = 0;
    let shown = 0;
    model.sections.reduce((all, s) => all.concat(s.components), []).forEach((c) => {
      const el = doc.querySelector('[data-cid="' + c.id + '"]');
      if (!el) { return; }
      fields++;
      const allowed = [c.defaultValue, c.placeholder, 'To be confirmed by the analyst', '—'].concat((c.options || []).filter((o) => PLACEHOLDERS.indexOf(o) < 0)).map(norm).filter(Boolean);
      el.querySelectorAll('input, textarea').forEach((input) => {
        if (/^(radio|checkbox|hidden|button)$/i.test(input.type)) { return; }
        const v = norm(input.value);
        if (!v) { return; }
        shown++;
        const ok = allowed.indexOf(v) >= 0 || /loaded at run time/i.test(v) || (!isNaN(num(v)) && allowed.some((a) => num(a) === num(v)));
        if (!ok) { bad.push((c.label || c.name) + ' = "' + v + '"'); }
      });
    });
    const samples = /Priya Sharma|Rahul Verma|xxxx\d{4}|Sample value|ORD-2026|DMAT-|HDFC0001234|ABCPK1234F|Monthly investment|Rent for October|Mumbai|₹1,520\.40|₹3,912\.75|example\.com|Infosys|\(INR\)/;
    const found = (doc.body.textContent.match(samples) || [])[0] || null;
    resolve({ fields: fields, shown: shown, bad: bad.slice(0, 5), sample: found });
  })));
  record('the editor\'s canvas shows the BRD\'s values only (field values match the screen\'s, no invented samples)',
    !values.error && values.fields > 0 && values.bad.length === 0 && !values.sample, values);

  const editable = await run(() => !!document.querySelector('#undoButton'));
  if (editable) {
    // An unsaved change: move the first component down in Layers
    await run(() => { document.getElementById('leftTab-layers').click(); return 1; });
    await sleep(600);
    const firstId = await run(() => { const row = document.querySelector('#designLayers [data-cid]'); if (row) { row.click(); } return row ? row.getAttribute('data-cid') : null; });
    await sleep(600);
    await run((id) => { document.querySelector('#designLayers [data-cid="' + id + '"]').focus(); return 1; }, firstId);
    await key('ArrowDown', 1);
    await sleep(800);
    const unsaved = () => run(() => !!document.querySelector('.factory-dz-unsaved'));
    record('a change in Edit is unsaved', await unsaved());
    // Ctrl+Z outside the editor (the Studio's own header) leaves it alone
    await run(() => { document.getElementById('studioBackToFlow').focus(); return 1; });
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await sleep(600);
    record('Ctrl+Z outside the editor does not undo in it', await unsaved());
    // Each way out asks first: Review, another screen of the journey, another page
    for (const [what, act] of [
      ['switching to Review', () => { document.getElementById('studioMode-review').click(); return 1; }],
      ['opening another screen of the journey', () => { const b = [...document.querySelectorAll('#studioEditor .factory-dz-stepbtn')].find((x) => !x.disabled); if (b) { b.click(); } return !!b; }],
      ['leaving the page', () => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; }]
    ]) {
      const did = await run(act);
      await sleep(1200);
      const asked = await dialog();
      record(what + ' with unsaved changes asks first', did && !!asked, did ? asked : 'precondition missing: no other screen in the journey');
      await cancel();
      const kept = await run(() => ({ page: new URLSearchParams(location.search).get('ojr'), edit: document.getElementById('studioMode-edit') && document.getElementById('studioMode-edit').getAttribute('aria-pressed') }));
      record('cancelling keeps Edit and the changes', kept.page === 'studio' && kept.edit === 'true' && await unsaved(), kept);
    }
    // ... and the BRD picker, an upload (the upload is stubbed), another workspace, and the browser's Back
    await run(() => new Promise((r) => window.require(['knockout'], (ko) => { window.__studioVm = ko.dataFor(document.querySelector('.factory-studio-canvas')); r(1); })));
    const other = await run(() => (window.__studioVm.requirementOptions().map((o) => o.value).find((v) => v !== window.__studioVm.requirementId()) || null));
    const otherWorkspace = await run(() => new Promise((r) => window.require(['services/workspaceSelection'], (w) => r((w.options().map((o) => o.value).find((v) => v !== w.selectedId())) || null))));
    const stillHere = () => run((rid) => ({
      brd: window.__studioVm.requirementId() === rid, pick: window.__studioVm.brdPick() === rid,
      edit: (document.getElementById('studioMode-edit') || { getAttribute: () => null }).getAttribute('aria-pressed'),
      unsaved: !!document.querySelector('.factory-dz-unsaved'), page: !!document.querySelector('.factory-studio'), url: location.search.slice(0, 40)
    }), brd.id);
    const upload = await stub((r) => r.method === 'POST' && /\/api\/workspaces\/[^/]+\/requirements$/.test(r.url), 200, { id: other, title: 'Stub BRD' });
    for (const [what, act] of [
      ['another BRD in the picker', () => { window.__studioVm.brdPick(window.__studioVm.requirementOptions().map((o) => o.value).find((v) => v !== window.__studioVm.requirementId())); return 1; }],
      ['an uploaded BRD', () => { window.__studioVm.chosenFile(new File(['A stub BRD'], 'stub-brd.txt', { type: 'text/plain' })); window.__studioVm.upload(); return 1; }],
      ['another workspace', null],
      ['the browser\'s Back', () => { history.back(); return 1; }]
    ]) {
      if (what === 'another workspace') {
        await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), otherWorkspace);
      } else {
        await run(act);
      }
      await sleep(1800);
      const asked = await dialog();
      record(what + ' with unsaved changes asks first', !!asked && (what !== 'another BRD in the picker' || !!other) && (what !== 'another workspace' || !!otherWorkspace), asked || 'no question');
      await cancel();
      await sleep(600);
      const kept = await stillHere();
      const ws = await run(() => new Promise((r) => window.require(['services/workspaceSelection'], (w) => r(w.selectedId()))));
      record('cancelling keeps the BRD, Edit and the changes', kept.brd && kept.pick && kept.edit === 'true' && kept.unsaved && kept.page
        && (what !== 'another workspace' || ws !== otherWorkspace), Object.assign(kept, { workspace: ws === otherWorkspace ? 'switched' : 'kept' }));
    }
    record('the upload was the stub (no BRD was stored)', upload.hits.length === 1, upload.hits.length);
    await unstub(upload);
    await run(() => { document.querySelector('#undoButton').click(); return 1; });
    await sleep(800);
    record('Undo brings back the saved version', !(await unsaved()));

    // Save: a refused save keeps the changes and says so; a save keeps them as a new version
    const move = async () => {
      await run(() => { document.getElementById('leftTab-layers').click(); return 1; });
      await sleep(400);
      const id = await run(() => { const row = document.querySelector('#designLayers [data-cid]'); row.click(); return row.getAttribute('data-cid'); });
      // Selecting draws the tree again: focus the new row
      await sleep(600);
      await run((cid) => { document.querySelector('#designLayers [data-cid="' + cid + '"]').focus(); return 1; }, id);
      await key('ArrowDown', 1);
      await sleep(700);
      record('a change to save is unsaved', await unsaved());
    };
    const version = () => run(() => new Promise((r) => window.require(['knockout'], (ko) => { const vm = ko.dataFor(document.querySelector('#studioEditor .factory-dz')); r(vm.detail() ? vm.detail().currentVersion : null); })));
    await move();
    const refused = await stub((r) => r.method === 'PUT' && /\/api\/designs\/[^/]+\/model$/.test(r.url), 500, { detail: 'Stub: the server refused the save' });
    await run(() => { document.getElementById('saveDesignButton').click(); return 1; });
    await sleep(1500);
    const failed = await run(() => ({ error: ((document.getElementById('designError') || {}).textContent || '').trim(), unsaved: !!document.querySelector('.factory-dz-unsaved') }));
    record('a refused save says why and keeps the changes', /refused the save/.test(failed.error) && failed.unsaved, failed);
    await unstub(refused);
    const v0 = await version();
    await run(() => { document.getElementById('saveDesignButton').click(); return 1; });
    await sleep(2500);
    const v1 = await version();
    record('Save keeps the changes as a new version', v1 === v0 + 1 && !(await unsaved()), { before: v0, after: v1 });

    // Save and approve, with the unsupported-components refusal (stubbed 409) and its retry with ?unsupported=true
    await move();
    const approves = [];
    const refuse = await stub((r) => r.method === 'POST' && /\/designs\/approve/.test(r.url) && (approves.push(r.url), !/unsupported=true/.test(r.url)), 409,
      { detail: 'Unsupported components: oj-select-one is not supported in OBDX 25.x (a stub for this check)' });
    await run(() => { document.getElementById('studioApproveScreen').click(); return 1; });
    await sleep(800);
    record('Approve with unsaved changes offers to save first', /Save the changes first/.test(await dialog() || ''), await dialog());
    await confirm();
    await sleep(2500);
    record('then asks to approve the saved version', /Approve this screen/.test(await dialog() || ''), await dialog());
    await confirm();
    await sleep(1500);
    record('an unsupported-components refusal asks again', /Approve unsupported components/.test(await dialog() || ''), await dialog());
    await cancel();
    await sleep(800);
    const notYet = await run(() => ({ approve: !!document.getElementById('studioApproveScreen'), unsaved: !!document.querySelector('.factory-dz-unsaved') }));
    record('cancelling approves nothing, and the changes are saved', notYet.approve && !notYet.unsaved, notYet);
    await run(() => { document.getElementById('studioApproveScreen').click(); return 1; });
    await sleep(800);
    await confirm();
    await sleep(1500);
    await confirm();
    await sleep(3000);
    const approved = await run(() => ({ reopen: !!document.getElementById('studioReopenScreen'), dialog: !!document.querySelector('.fx-dialog') }));
    record('Approve Anyway approves with ?unsupported=true', approved.reopen && approves.some((u) => /unsupported=true/.test(u)), { approved: approved, requests: approves.map((u) => u.replace(/^.*\/api\//, '')) });
    await unstub(refuse);
    // Back to a draft for the next run
    await run(() => { const b = document.getElementById('studioReopenScreen'); if (b) { b.click(); } return 1; });
    await sleep(800);
    await confirm();
    await sleep(2500);
    record('Reopen makes it a draft again', await run(() => !!document.getElementById('studioApproveScreen')));
    // Escape with nothing selected goes back to Review
    await run(() => { const row = document.querySelector('#designLayers [data-layer="screen"]'); row.click(); row.focus(); return 1; });
    await sleep(500);
    await key('Escape');
    await sleep(1200);
    const back = await run(() => document.getElementById('studioMode-review').getAttribute('aria-pressed'));
    record('Escape with nothing selected goes back to Review', back === 'true', back);
    record('Review has its preview back', JSON.stringify(await frames()) === JSON.stringify({ review: 1, editor: 0, all: 1 }), await frames());
  } else {
    record('an editable screen to check Edit with (seed a draft screen you may change)', false, 'precondition missing: the screen is read-only');
  }

  // Phones: Edit says to use a wider screen; Review still works
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1500);
  await run(() => { document.getElementById('studioMode-edit').click(); return 1; });
  await sleep(1500);
  const phone = await run(() => ({ text: (document.getElementById('studioEditNarrow') || {}).textContent || '', editor: !!document.querySelector('#studioEditor') }));
  record('Edit at 390 px says to use a wider screen', /Use a wider screen to edit this screen/.test(phone.text) && !phone.editor, phone.text.replace(/\s+/g, ' ').trim().slice(0, 60));
  await run(() => { document.getElementById('studioMode-review').click(); return 1; });
  await sleep(1500);
  record('Review works at 390 px', JSON.stringify(await frames()) === JSON.stringify({ review: 1, editor: 0, all: 1 }), await frames());
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // ---------- Old links and real links ----------
  // The designer route redirects; a screen asked for by another page (pageRequests.design) opens in Edit
  const target = await run(async (id) => {
    const flow = await fetch('api/requirements/' + id + '/design-flow', { credentials: 'same-origin' }).then((r) => r.json());
    return flow.screens[flow.screens.length - 1];
  }, brd.id);
  await run((id) => new Promise((r) => window.require(['services/pageRequests'], (pr) => { pr.design(id); r(1); })), target.id);
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'designer' })); return 1; });
  await sleep(7000);
  const old = await run(() => ({
    page: new URLSearchParams(location.search).get('ojr'),
    heading: (document.querySelector('.factory-page h1') || {}).textContent || '',
    edit: (document.getElementById('studioMode-edit') || { getAttribute: () => null }).getAttribute('aria-pressed'),
    name: ((document.querySelector('#studioScreenTitle') || {}).textContent || '').trim(), loaded: !!document.querySelector('#studioEditor #designLayers, #studioEditor #designPalette'),
    nav: [...document.querySelectorAll('.factory-nav-link .factory-nav-label')].map((x) => x.textContent.trim()).filter((t) => /Design/.test(t))
  }));
  record('the designer route opens the Design Studio', old.page === 'studio' && /Design Studio/.test(old.heading), old);
  record('a screen asked for by another page opens in Edit', old.edit === 'true' && old.name === target.name && old.loaded, { name: old.name, wanted: target.name });
  record('the menu says Design Studio, with no Visual Designer', old.nav.indexOf('Design Studio') >= 0 && old.nav.indexOf('Visual Designer') < 0, old.nav);
  await run(() => { const b = document.getElementById('studioMode-review'); if (b) { b.click(); } return 1; });
  await sleep(1200);
  // A real link: ?ojr=studio&requirement=&screen= opens that screen, and the address follows the selection
  await open(BASE + '/?ojr=studio&requirement=' + brd.id + '&screen=' + target.id);
  await sleep(5000);
  const link = await run(() => ({
    pressed: (document.querySelector('.factory-studio-node[aria-pressed="true"]') || { getAttribute: () => null }).getAttribute('data-studio-node'),
    search: location.search
  }));
  record('?ojr=studio&screen= opens that screen', link.pressed === target.id, link);
  await run(() => { const n = document.querySelector('.factory-studio-node'); if (n) { n.click(); } return 1; });
  await sleep(800);
  const followed = await run(() => ({ first: document.querySelector('.factory-studio-node').getAttribute('data-studio-node'), search: location.search }));
  record('the address follows the selected screen', followed.search.indexOf('screen=' + followed.first) >= 0 && followed.search.indexOf('ojr=studio') >= 0, followed.search);
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
  await sleep(2000);
  const after = await run(() => location.search);
  record('another page\'s address keeps no screen of the Studio', !/screen=|requirement=/.test(after), after);
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); return 1; });
  await sleep(4500);

  // ---------- + New screen and the selected screen's More menu ----------
  const menu = async (sel) => {
    await run((q) => { const b = document.querySelector(q + ' button'); if (b) { b.click(); } return 1; }, sel);
    await sleep(500);
    return run((q) => [...document.querySelectorAll(q + ' [role=menuitem]')].map((m) => m.textContent.trim()), sel);
  };
  const pick = async (sel, label) => { await run((a) => { const m = [...document.querySelectorAll(a.sel + ' [role=menuitem]')].find((x) => x.textContent.trim() === a.label); if (m) { m.click(); } return 1; }, { sel: sel, label: label }); await sleep(700); };
  const newItems = await menu('#studioNew');
  record('+ New screen offers a blank screen and an import', newItems.indexOf('Blank screen') >= 0 && newItems.some((t) => /^Import/.test(t)), newItems);
  await pick('#studioNew', 'Blank screen');
  record('Blank screen asks for its name first', await run(() => !!document.getElementById('studioNewPanel') && !!document.querySelector('#studioNewName')));
  await run(() => { const b = [...document.querySelectorAll('#studioNewPanel button')].find((x) => x.textContent.trim() === 'Cancel'); if (b) { b.click(); } return 1; });
  await sleep(500);
  record('Cancel creates nothing', await run(() => !document.getElementById('studioNewPanel')));
  const moreItems = await menu('#studioScreenMore');
  record('the screen\'s More menu has share, import and delete', ['Share for review', 'Delete screen'].every((t) => moreItems.indexOf(t) >= 0) && moreItems.some((t) => /^Import/.test(t)), moreItems);
  await pick('#studioScreenMore', 'Delete screen');
  const askedDelete = await dialog();
  record('Delete screen asks first', !!askedDelete, askedDelete);
  await cancel();

  // ---------- Screens without a BRD (a workspace that has some) ----------
  const loose = await run(async () => {
    const get = (p) => fetch('api/' + p, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : []));
    for (const w of await get('workspaces')) {
      const ids = (await get('workspaces/' + w.id + '/requirements')).map((r) => r.id);
      const list = (await get('workspaces/' + w.id + '/designs')).filter((d) => !d.requirementId || ids.indexOf(d.requirementId) < 0);
      if (list.length) { return { workspace: w.id, count: list.length }; }
    }
    return null;
  });
  if (loose) {
    await s.selectWorkspace(loose.workspace);
    await run(() => new Promise((r) => window.require(['services/pageRequests'], (pr) => { pr.studio('none'); r(1); })));
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
    await sleep(1500);
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); return 1; });
    await sleep(5000);
    const none = await run(() => ({
      brd: ((document.getElementById('studioBrd') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      stepper: !!document.querySelector('.factory-studio-stepper'),
      nodes: document.querySelectorAll('.factory-studio-node').length,
      next: ((document.getElementById('studioNext') || {}).textContent || '').replace(/\s+/g, ' ').trim()
    }));
    record('"Screens without a BRD" lists the blank and imported screens', /Screens without a BRD/.test(none.brd + ' ' + none.next) && none.nodes === loose.count && !none.stepper, none);
    const approve = await run(() => { const b = document.getElementById('studioApproveScreen'); if (b) { b.click(); } return !!b; });
    if (approve) {
      await sleep(600);
      const asked = await dialog();
      record('approving a screen without a BRD asks first', !!asked, asked);
      await cancel();
    } else {
      record('a screen without a BRD to approve', false, 'precondition missing: no Approve button');
    }
    await s.selectWorkspace(args.workspace || null);
  } else {
    record('a workspace with screens without a BRD (seed a blank screen)', false, 'precondition missing');
  }

  // The stubbed refusals are expected; anything else is a defect
  const stubbed = ['HTTP 500 /api/designs/', 'HTTP 409 /api/requirements/'];
  const errors = s.errors.filter((e) => !/auth\/me/.test(e) && !(stubbed.some((x) => e.indexOf(x) === 0) && /\/model$|\/designs\/approve$/.test(e)));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Design Studio: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
