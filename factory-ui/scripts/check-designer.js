// Visual Designer check: drives a running factory in headless Edge or Chrome and checks what the designer promises, in
// the Design Studio's Edit mode (a screen that can be changed, opened from the Studio's Screens panel):
//  - Edit opens expanded: rails of icons open one floating panel at a time (with a shadow and ×); the toolbar is one
//    48 px row of 32 px controls;
//  - Show the screens docks the panels (260 and 320 px, sticky, scrolling inside); the canvas is the screen's full height;
//  - Components has tiles by group and the workspace's groups; Layers show types; arrow keys move between the tabs;
//  - a selected component's inspector has its seven sections in order, with its compatibility and evidence;
//  - Focus order (in the Fit menu) numbers the canvas;
//  - in Layers, Alt+Down moves a component (unsaved: Save changes shows, Approve does not), History compares it with the
//    saved version, leaving the page asks first, and Undo brings the screen back to the saved version.
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
  const picked = await run(() => (document.querySelector('#studioScreenTitle') || {}).textContent || null);
  record('the screen opens in Edit', !!picked && picked.trim().length > 0, picked);

  // Edit opens expanded: the panels are rails of icons, each opening a floating panel with a close button
  const shown = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && getComputedStyle(e).display !== 'none'; })()`;
  const rails = await run(new Function('return {' +
    'expanded: !document.getElementById("studioScreens"),' +
    'rails: ["railComponents", "railLayers", "railChecks", "railProperties", "railComments", "railHistory"].filter((id) => !!document.getElementById(id)),' +
    'left: ' + shown('leftPanel') + ', right: ' + shown('rightPanel') + ',' +
    'toolbar: Math.round(document.getElementById("canvasToolbar").getBoundingClientRect().height),' +
    'controls: [...document.querySelectorAll("#canvasToolbar .factory-de-pair, #canvasToolbar .factory-de-switch, #compatibilityChip, #zoomMenu button, #previewButton")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height)),' +
    'menu: document.querySelector(".factory-shell") ? document.querySelector(".factory-shell").className : ""' +
    '};'));
  record('Edit opens expanded, with the Screens panel hidden', rails.expanded, rails);
  record('the side panels are rails of icons (Components, Layers; Checks, Properties, Comments, History)', rails.rails.length === 6 && !rails.left && !rails.right, rails.rails);
  record('the toolbar is one 48 px row of 32 px controls', rails.toolbar === 48 && rails.controls.every((h) => h === 32), { toolbar: rails.toolbar, controls: [...new Set(rails.controls)] });
  await run(() => { document.getElementById('railComponents').click(); return 1; });
  await sleep(500);
  const float = await run(() => {
    const p = document.getElementById('leftPanel');
    const c = getComputedStyle(p);
    return { shown: c.display !== 'none', position: c.position, shadow: c.boxShadow !== 'none', close: !!p.querySelector('.factory-de-close'),
      tiles: [...document.querySelectorAll('#designPalette .factory-de-grouptitle')].map((t) => t.textContent.trim()) };
  });
  record('a rail opens its panel floating, with a shadow and a close button', float.shown && float.position === 'absolute' && float.shadow && float.close, float);
  record('Components has tiles by group, then the workspace\'s groups', ['Layout', 'Form controls', 'Data display', 'Actions'].every((t) => float.tiles.includes(t)) && float.tiles.includes('From this workspace'), float.tiles);
  await run(() => { document.getElementById('railChecks').click(); return 1; });
  await sleep(500);
  const one = await run(new Function('return { left: ' + shown('leftPanel') + ', right: ' + shown('rightPanel') + ', tab: (document.querySelector("#rightPanel [aria-selected=true]") || {}).id };'));
  record('one floating panel at a time (Checks replaces Components)', !one.left && one.right && one.tab === 'rightTab-checks', one);
  await run(() => { document.querySelector('#rightPanel .factory-de-close').click(); return 1; });
  await sleep(400);
  record('× closes the floating panel', await run(new Function('return !' + shown('rightPanel') + ';')));

  // Show the screens: the panels dock as columns, always open, and the Screens panel is back
  await run(() => { document.getElementById('studioExpand').click(); return 1; });
  await sleep(1500);
  const layout = await run(() => ({
    screens: !!document.getElementById('studioScreens'),
    title: !!document.querySelector('#studioEditor h1'),
    board: !!document.getElementById('designBoard'),
    tabs: [...document.querySelectorAll('#leftPanel [role=tab]')].map((t) => t.textContent.trim()),
    left: Math.round(document.getElementById('leftPanel').getBoundingClientRect().width),
    right: Math.round(document.getElementById('rightPanel').getBoundingClientRect().width),
    sticky: getComputedStyle(document.getElementById('leftPanel')).position,
    inner: getComputedStyle(document.getElementById('leftPanelBody')).overflowY,
    canvas: Math.round(document.querySelector('.factory-de-canvas').getBoundingClientRect().width),
    frameScroll: (() => { const f = document.getElementById('designerPreview'); const d = f.contentDocument; const r = d.createRange(); r.selectNodeContents(d.querySelector('.factory-preview')); return f.getAttribute('scrolling') === 'no' && r.getBoundingClientRect().bottom <= f.clientHeight && f.clientHeight >= 480; })()
  }));
  record('Show the screens brings the Screens panel back', layout.screens, layout.screens);
  record('the editor has no title or board of its own', !layout.title && !layout.board);
  record('docked panels: 260 and 320 px, sticky, scrolling inside', layout.left === 260 && layout.right === 320 && layout.sticky === 'sticky' && /auto|scroll/.test(layout.inner), layout);
  record('left panel has Components and Layers', layout.tabs.join(',') === 'Components,Layers', layout.tabs);
  record('canvas is at least 660 px wide at 1440', layout.canvas >= 660, layout.canvas);
  record('the canvas is the screen\'s full height (no inner scroll)', layout.frameScroll);

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
    tab: (document.querySelector('#rightPanel [aria-selected=true]') || {}).id,
    sections: [...document.querySelectorAll('#rightPanel details[data-section]')].map((d) => d.getAttribute('data-section')),
    compat: (document.getElementById('selectedCompatibility') || {}).textContent || '',
    types: [...document.querySelectorAll('#designLayers .factory-de-type')].filter((m) => m.textContent.trim()).length
  }));
  record('selecting a layer shows its Properties', inspector.tab === 'rightTab-properties', inspector.tab);
  record('the inspector has its seven sections in order', inspector.sections.join(',') === SECTIONS.join(','), inspector.sections);
  record('the selection shows its compatibility and evidence', /Verified|Unsupported|Unverified/.test(inspector.compat), inspector.compat.replace(/\s+/g, ' ').trim().slice(0, 120));
  record('layers show their type', inspector.types > 0, inspector.types);

  // Canvas previews, from the Fit menu
  const fit = (value) => run((v) => { document.getElementById('zoomMenu').dispatchEvent(new CustomEvent('fxAction', { bubbles: true, detail: { value: v } })); return 1; }, value);
  await fit('focus');
  await fit('validation');
  await sleep(2500);
  const canvas = await run(() => {
    const doc = document.getElementById('designerPreview').contentDocument;
    return { focus: doc.querySelectorAll('[data-focus]').length, rules: [...doc.querySelectorAll('[data-cid]')].length };
  });
  record('Focus order (in Fit) numbers the canvas', canvas.focus > 0, canvas);
  await fit('focus');
  await fit('validation');

  // Keyboard move in Layers, compare, the unsaved rule, leave guard, undo
  if (await run(() => !!document.getElementById('undoButton'))) {
    await run((id) => { const row = document.querySelector('#designLayers [data-cid="' + id + '"]'); row.focus(); return 1; }, firstId);
    await key('ArrowDown', 'ArrowDown', 40, 1);
    await sleep(800);
    const moved = await run(() => ({ unsaved: !!document.querySelector('.factory-dz-unsaved'), focused: document.activeElement && document.activeElement.getAttribute('data-cid') }));
    record('Alt+Down moves the component and keeps its focus', moved.unsaved && moved.focused === firstId, moved);
    const rule = await run(() => ({ save: !!document.getElementById('saveDesignButton'), approve: !!document.getElementById('studioApproveScreen'),
      saveAndApprove: [...document.querySelectorAll('button')].some((b) => /save and approve/i.test(b.textContent)) }));
    record('while unsaved: Save changes, and no Approve', rule.save && !rule.approve && !rule.saveAndApprove, rule);
    await run(() => { document.getElementById('rightTab-history').click(); return 1; });
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
    record('Undo brings back the saved version', await run(() => !document.querySelector('.factory-dz-unsaved') && !!document.getElementById('studioApproveScreen')));
  } else {
    record('screen is read-only here: keyboard move, compare and leave guard not checked', true);
  }
  // Put Expand back as Edit opens by default
  await run(() => new Promise((r) => window.require(['services/preferences'], (p) => { p.studioEditExpanded(true); r(1); })));
  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Visual Designer: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
