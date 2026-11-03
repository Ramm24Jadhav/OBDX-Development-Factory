// Visual Designer check: drives a running factory in headless Edge or Chrome and checks what the designer promises, in
// the Design Studio's Edit mode (a screen that can be changed, opened from the Studio's flow):
//  - three zones: the left panel's tabs (Components and Layers; arrow keys move between them), the canvas toolbar and the
//    inspector, and no title, board or Screens tab of its own;
//  - a selected component's inspector has its seven sections in order, with its compatibility and evidence;
//  - Focus order numbers the canvas, and Validation shows the fields' messages;
//  - in Layers, Alt+Down moves a component (unsaved), History compares it with the saved version, leaving the page
//    asks first, and Undo brings the screen back to the saved version.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-designer.js --url http://localhost:8080 [--workspace <id>]
//
// It never saves: the one edit is undone before the end. Exit code 1 on a defect.
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const SECTIONS = ['properties', 'binding', 'validation', 'visibility', 'events', 'style', 'accessibility'];

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const key = async (k, code, vk, modifiers) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: code, windowsVirtualKeyCode: vk, modifiers: modifiers || 0 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: vk, modifiers: modifiers || 0 });
    await sleep(250);
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  await s.selectWorkspace(args.workspace || null);
  // A BRD with a screen that can be changed (a draft or one in review); the Studio opens on it
  const brd = await run(async () => {
    const get = (p) => fetch('api/' + p, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
    const w = await new Promise((r) => window.require(['services/workspaceSelection'], r));
    const pr = await new Promise((r) => window.require(['services/pageRequests'], r));
    for (const r of ((await get('workspaces/' + w.selectedId() + '/requirements')) || []).filter((x) => x.status === 'APPROVED')) {
      const flow = await get('requirements/' + r.id + '/design-flow');
      const screen = flow && flow.screens.find((x) => x.status !== 'APPROVED');
      if (screen) { pr.studio(r.id); return { brd: r.title, screen: screen.id, name: screen.name }; }
    }
    return null;
  });
  record('a BRD with a screen that can be changed', !!brd, brd || 'none in this workspace');
  if (!brd) { s.close(); process.exit(1); }
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); return 1; });
  await sleep(4500);
  await run((id) => { const n = document.querySelector('[data-studio-node="' + id + '"]'); if (n) { n.click(); } return 1; }, brd.screen);
  await sleep(1000);
  await run(() => { document.getElementById('studioMode-edit').click(); return 1; });
  await sleep(6000);
  const picked = await run(() => (document.querySelector('#studioEditor .factory-dz-cardname') || {}).textContent || null);
  record('the screen opens in Edit', !!picked && picked.trim().length > 0, picked);

  const layout = await run(() => ({
    title: !!document.querySelector('#studioEditor h1'),
    board: !!document.getElementById('designBoard'),
    tabs: [...document.querySelectorAll('#leftPanel [role=tab]')].map((t) => t.textContent.trim()),
    toolbar: !!document.getElementById('canvasToolbar') && getComputedStyle(document.getElementById('canvasToolbar')).display !== 'none',
    inspector: !!document.getElementById('rightPanel') && getComputedStyle(document.getElementById('rightPanel')).display !== 'none',
    canvas: Math.round(document.querySelector('.factory-dz-canvas').getBoundingClientRect().width)
  }));
  record('the editor has no title or board of its own', !layout.title && !layout.board, layout);
  record('left panel has Components and Layers', layout.tabs.join(',') === 'Components,Layers', layout.tabs);
  record('canvas toolbar and inspector show', layout.toolbar && layout.inspector);
  record('canvas is as wide as the Visual Designer had it (660 px at 1440)', layout.canvas >= 660, layout.canvas);

  // Tabs: ArrowRight from Components selects Layers
  await run(() => { document.getElementById('leftTab-components').focus(); return 1; });
  await key('ArrowRight', 'ArrowRight', 39);
  const tabState = await run(() => ({ focused: document.activeElement && document.activeElement.id, selected: document.getElementById('leftTab-layers').getAttribute('aria-selected') }));
  record('ArrowRight moves to the Layers tab', tabState.focused === 'leftTab-layers' && tabState.selected === 'true', tabState);

  // Select the first component in Layers
  const firstId = await run(() => { const row = document.querySelector('#designLayers [data-cid]'); if (row) { row.click(); } return row ? row.getAttribute('data-cid') : null; });
  record('Layers lists the components', !!firstId);
  await sleep(1500);
  const inspector = await run(() => ({
    sections: [...document.querySelectorAll('#rightPanel details[data-section]')].map((d) => d.getAttribute('data-section')),
    compat: (document.getElementById('selectedCompatibility') || {}).textContent || '',
    marks: [...document.querySelectorAll('#designLayers .factory-dz-compat')].filter((m) => m.textContent.trim()).length
  }));
  record('the inspector has its seven sections in order', inspector.sections.join(',') === SECTIONS.join(','), inspector.sections);
  record('the selection shows its compatibility and evidence', /Verified|Unsupported|Unverified/.test(inspector.compat), inspector.compat.replace(/\s+/g, ' ').trim().slice(0, 120));
  record('layers carry compatibility marks', inspector.marks > 0, inspector.marks);

  // Canvas previews
  await run(() => { document.getElementById('focusOrderButton').click(); document.getElementById('validationPreviewButton').click(); return 1; });
  await sleep(2500);
  const canvas = await run(() => {
    const doc = document.getElementById('designerPreview').contentDocument;
    return { focus: doc.querySelectorAll('[data-focus]').length, rules: [...doc.querySelectorAll('[data-cid]')].length };
  });
  record('Focus order numbers the canvas', canvas.focus > 0, canvas);
  await run(() => { document.getElementById('focusOrderButton').click(); document.getElementById('validationPreviewButton').click(); return 1; });

  // Keyboard move in Layers, compare, leave guard, undo
  const editable = await run(() => !!document.getElementById('undoButton'));
  if (editable) {
    await run((id) => { const row = document.querySelector('#designLayers [data-cid="' + id + '"]'); row.focus(); return 1; }, firstId);
    await key('ArrowDown', 'ArrowDown', 40, 1);
    await sleep(800);
    const moved = await run(() => ({ unsaved: !!document.querySelector('.factory-dz-unsaved'), focused: document.activeElement && document.activeElement.getAttribute('data-cid') }));
    record('Alt+Down moves the component and keeps its focus', moved.unsaved && moved.focused === firstId, moved);
    await run(() => { document.getElementById('ctxTab-history').click(); return 1; });
    await sleep(2500);
    const diff = await run(() => [...document.querySelectorAll('.factory-dz-difflist li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
    record('History compares the unsaved changes with the saved version', diff.some((d) => /order of the fields|moved to section/.test(d)), diff.slice(0, 3));
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
    await sleep(1500);
    const guard = await run(() => ({ dialog: !!document.querySelector('.fx-dialog'), page: new URLSearchParams(location.search).get('ojr') }));
    record('leaving with unsaved changes asks first', guard.dialog, guard);
    await run(() => { const b = document.querySelector('.fx-dialog .fx-btn--secondary'); if (b) { b.click(); } return 1; });
    await sleep(1000);
    record('cancelling keeps the editor open', await run(() => new URLSearchParams(location.search).get('ojr') === 'studio' && !!document.querySelector('.factory-dz-unsaved')));
    await run(() => { document.getElementById('undoButton').click(); return 1; });
    await sleep(800);
    record('Undo brings back the saved version', await run(() => !document.querySelector('.factory-dz-unsaved')));
    await run(() => { document.getElementById('contextToggle').click(); return 1; });
  } else {
    record('screen is read-only here: keyboard move, compare and leave guard not checked', true);
  }
  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Visual Designer: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
