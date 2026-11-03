// Design Studio check: drives a running factory in headless Edge or Chrome and checks what the Studio promises:
//  - the workflow bar has its five stages, one of them current;
//  - arrow keys, Home and End move through the flow's nodes, and the screen under the focus is shown;
//  - arrow keys move through the selected screen's tabs, each with its own panel;
//  - approving all screens, one screen or a requirement's screens, and reopening a screen, each ask first, and Cancel
//    changes nothing;
//  - Edit draws the designer inside the page (no board, title or Screens tab of its own, the library and the flow fold
//    away, one preview at a time, no invented sample values); an unsaved change is asked about on switching to Review,
//    opening another screen and leaving the page; Ctrl+Z outside the editor leaves it alone; Escape with nothing
//    selected goes back to Review; at 390 px Edit says to use a wider screen and Review still works.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-studio.js --url http://localhost:8080 [--workspace <id>]
//
// It picks a BRD with screens that are not all approved. It never saves: every confirmation is cancelled. Exit code 1 on
// a defect.
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
    record('every screen is approved or you cannot approve: Approve all not checked', true);
  }
  // Approving one screen and a requirement's screens ask first too (services/designActions)
  for (const [id, what] of [['studioApproveScreen', 'Approve screen'], ['studioApproveGroup', 'Approving the group']]) {
    const clicked = await run((b) => { const e = document.getElementById(b); if (e) { e.click(); } return !!e; }, id);
    if (!clicked) { record(what + ' is not offered here: not checked', true); continue; }
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
  const brdOnly = await run(() => new Promise((r) => setTimeout(() => {
    const doc = document.querySelector('#studioEditor iframe.factory-dz-frame').contentDocument;
    r(doc && doc.body ? !/Sample value/.test(doc.body.textContent) : false);
  }, 1500)));
  record('the editor\'s canvas shows no invented sample values', brdOnly);

  const editable = await run(() => !!document.querySelector('#studioEditor #undoButton'));
  if (editable) {
    // An unsaved change: move the first component down in Layers
    await run(() => { document.getElementById('leftTab-layers').click(); return 1; });
    await sleep(600);
    const firstId = await run(() => { const row = document.querySelector('#designLayers [data-cid]'); if (row) { row.click(); } return row ? row.getAttribute('data-cid') : null; });
    await sleep(600);
    await run((id) => { document.querySelector('#designLayers [data-cid="' + id + '"]').focus(); return 1; }, firstId);
    await key('ArrowDown', 1);
    await sleep(800);
    const unsaved = () => run(() => !!document.querySelector('#studioEditor .factory-dz-unsaved'));
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
      record(what + ' with unsaved changes asks first', !did || !!asked, did ? asked : 'no other screen');
      await cancel();
      const kept = await run(() => ({ page: new URLSearchParams(location.search).get('ojr'), edit: document.getElementById('studioMode-edit') && document.getElementById('studioMode-edit').getAttribute('aria-pressed') }));
      record('cancelling keeps Edit and the changes', kept.page === 'studio' && kept.edit === 'true' && await unsaved(), kept);
    }
    await run(() => { document.querySelector('#studioEditor #undoButton').click(); return 1; });
    await sleep(800);
    record('Undo brings back the saved version', !(await unsaved()));
    // Escape with nothing selected goes back to Review
    await run(() => { const row = document.querySelector('#designLayers [data-layer="screen"]'); row.click(); row.focus(); return 1; });
    await sleep(500);
    await key('Escape');
    await sleep(1200);
    const back = await run(() => document.getElementById('studioMode-review').getAttribute('aria-pressed'));
    record('Escape with nothing selected goes back to Review', back === 'true', back);
    record('Review has its preview back', JSON.stringify(await frames()) === JSON.stringify({ review: 1, editor: 0, all: 1 }), await frames());
  } else {
    record('the screen is read-only here: unsaved-change guards not checked', true);
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

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Design Studio: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
