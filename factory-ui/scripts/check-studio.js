// Design Studio check: drives a running factory in headless Edge or Chrome and checks what the Studio promises:
//  - the header: Design Studio, the BRD picker (no label), the five stages with "Approve x of n screens" current, and
//    Upload BRD;
//  - the Screens panel: a requirement's screens as cards in flow order (arrow keys, Home and End move between them and
//    show the screen); the requirement dropdown, ‹ ›, the dots and ←/→ on the carousel stay in step; ▴ hides the panel
//    and the choice is kept;
//  - the selected screen: "Requirement … · Step x of n · stage · Version v", the whole-BRD switcher, More, Approve or
//    Reopen, and Expand (hides the Screens panel and the readiness panel; "Exit full view"); Review | Edit tabs move with
//    the arrow keys;
//  - Ready to approve?: five checks as an accordion (one open at a time) with a summary; » folds it to a 56 px rail and
//    « brings it back (kept per user);
//  - Approve All, Approve screen and Reopen each ask first (Approve All says how many screens have open checks), and
//    Cancel changes nothing;
//  - Edit draws the designer inside the page (expanded, the app menu folded, one preview, no invented sample values); an
//    unsaved change is asked about on switching to Review, the screen switcher, the carousel and leaving the page; Ctrl+Z
//    outside the editor leaves it alone; while unsaved there is Save changes and no Approve; after saving, "Saved" and
//    Approve; an approved screen in Edit is read-only with "Reopen to edit"; Escape with nothing selected goes back to
//    Review;
//  - widths: no horizontal page scroll at 1024 and 768 (Review and Edit), Edit's panels are rails at 1024; at 390 px the
//    requirement dropdown, the screen switcher and a fixed bottom bar, and Edit says to use a wider screen;
//  - + New screen offers a blank screen (asks for its name; Cancel creates nothing) and an import; the screen's More
//    menu has share, import and delete, and Delete asks first;
//  - "Without a BRD" (in a workspace that has blank or imported screens) lists them, and approving one asks first;
//  - old links: the designer route opens the Studio, and a screen asked for with pageRequests.design opens in Edit; the
//    menu says Design Studio; ?ojr=studio&requirement=<id>&screen=<id> opens that screen on its requirement's slide, the
//    address follows the selection, and another page's address keeps none of it;
//  - the unsaved-change question also comes for the BRD picker, an upload (stubbed), another workspace and Back;
//  - Save: a refused save (stubbed 500) says why and keeps the changes, a save makes a new version; approving it with an
//    unsupported-components refusal (stubbed 409) asks again, Cancel approves nothing, Approve Anyway retries with
//    ?unsupported=true; the screen is reopened at the end.
// A missing precondition (no editable screen, nothing to approve, no screen without a BRD) is a defect, not a skip.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-studio.js --url http://localhost:8080 [--workspace <id>]
//
// It picks a BRD with screens that are not all approved. It SAVES: two new versions of one draft screen, and approves and
// reopens it; use it only on a factory whose data is a copy. Other confirmations are cancelled. It puts the Studio's
// layout choices (Expand, the readiness fold, the Screens panel) back to their defaults at the end. Exit code 1 on a
// defect.
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
  const dialogText = () => run(() => { const d = document.querySelector('.fx-dialog'); return d ? d.textContent.replace(/\s+/g, ' ').trim() : ''; });
  const cancel = async () => { await run(() => { const b = document.querySelector('.fx-dialog .fx-btn--secondary'); if (b) { b.click(); } return 1; }); await sleep(700); };
  const statuses = () => run(() => [...document.querySelectorAll('.factory-studio-node')].map((n) => n.classList.contains('is-approved')).join(','));
  const confirm = async () => { await run(() => { const b = document.querySelector('.fx-dialog .fx-dialog-actions .fx-btn:not(.fx-btn--secondary)'); if (b) { b.click(); } return 1; }); await sleep(500); };
  const click = (id) => run((x) => { const e = document.getElementById(x); if (e) { e.click(); } return !!e; }, id);
  const exists = (q) => run((x) => !!document.querySelector(x), q);
  const prefs = (values) => run((v) => new Promise((r) => window.require(['services/preferences'], (p) => { Object.keys(v).forEach((k) => p[k](v[k])); r(1); })), values);
  // Runs expr(vm) on the Studio's view model; null when the Studio is not on the page
  const vmCall = (expr) => run(new Function('return new Promise((r) => window.require(["knockout"], (ko) => { const e = document.querySelector(".factory-studio"); try { r(e ? (' + expr + ')(ko.dataFor(e)) : null); } catch (x) { r("error: " + x.message); } }));'));
  const hscroll = () => run(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const goStudio = async (id) => {
    if (id) { await run((x) => new Promise((r) => window.require(['services/pageRequests'], (pr) => { pr.studio(x); r(1); })), id); }
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
    await sleep(1500);
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); return 1; });
    await sleep(4500);
  };
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
  // Start from the default layout: not expanded, the readiness panel open (1440 px), the Screens panel shown
  await prefs({ studioExpanded: false, studioEditExpanded: true, studioReadiness: '', studioScreensHidden: false });
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

  // ---------- 1. The header ----------
  const bar = await run(() => ({
    title: ((document.querySelector('#studioBar h1') || {}).textContent || '').trim(),
    steps: [...document.querySelectorAll('.factory-studio-stepper-item .factory-studio-stepper-text')].map((x) => x.textContent.trim()),
    current: [...document.querySelectorAll('.factory-studio-stepper-item[aria-current="step"]')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    brd: !!document.getElementById('studioBrd'),
    label: !!document.querySelector('#studioBrd label:not(.fx-visually-hidden):not([hidden])') && getComputedStyle(document.querySelector('#studioBrd label')).position !== 'absolute',
    upload: ((document.getElementById('studioUploadButton') || {}).textContent || '').trim(),
    oneRow: (() => { const b = document.getElementById('studioBar'); return Math.round(b.getBoundingClientRect().height); })()
  }));
  record('the header says Design Studio, in one row', bar.title === 'Design Studio' && bar.oneRow <= 90, { title: bar.title, height: bar.oneRow });
  record('the stages: BRD, Spec, Screens, Approve x of n screens, Code', bar.steps.length === 5 && bar.steps[0] === 'BRD' && bar.steps[1] === 'Spec' && bar.steps[2] === 'Screens'
    && /^Approve \d+ of \d+ screens?$/.test(bar.steps[3]) && bar.steps[4] === 'Code', bar.steps);
  record('one stage is current', bar.current.length === 1, bar.current);
  record('the BRD picker has no label, and Upload BRD shows', bar.brd && !bar.label && bar.upload === 'Upload BRD', bar);

  // ---------- 2. The Screens panel ----------
  const panel = await run(() => ({
    title: ((document.getElementById('studioScreensTitle') || {}).textContent || '').trim(),
    sub: ((document.querySelector('#studioScreens .factory-studio-screens-title .fx-card-sub') || {}).textContent || '').trim(),
    count: ((document.getElementById('studioGroupCount') || {}).textContent || '').trim(),
    dropdown: !!document.getElementById('studioGroup'),
    approveAll: !!document.getElementById('studioApproveAll'), hide: !!document.getElementById('studioHideScreens'), add: !!document.getElementById('studioNew'),
    dots: document.querySelectorAll('.factory-studio-dot').length,
    position: ((document.getElementById('studioGroupPosition') || {}).textContent || '').trim(),
    oldList: !!document.querySelector('.factory-studio-nav, .factory-studio-map')
  }));
  record('the Screens panel: title, subtitle, count, + New screen, Approve All and hide', panel.title === 'Screens' && /Pick a screen to review\. They are in the order the customer sees them\./.test(panel.sub)
    && /^\d+ of \d+ screens? approved/.test(panel.count) && panel.add && panel.approveAll && panel.hide && !panel.oldList, panel);
  const groups = await vmCall('(vm) => vm.groupOptions().map((o) => o.value)');
  record('a requirement dropdown, dots and "Requirement 1 of n" (the BRD has several requirements)', panel.dropdown && panel.dots === groups.length && panel.position === 'Requirement 1 of ' + groups.length, { groups: groups.length, panel: panel.position });
  // ‹ › and ←/→ on the carousel move the requirement; the dropdown and the dots follow
  const slide = () => run(() => new Promise((r) => window.require(['knockout'], (ko) => {
    const vm = ko.dataFor(document.querySelector('.factory-studio'));
    r({ key: vm.group() && vm.group().key, pick: vm.groupPick(), position: ((document.getElementById('studioGroupPosition') || {}).textContent || '').trim(),
      dot: [...document.querySelectorAll('.factory-studio-dot')].findIndex((d) => d.classList.contains('is-current')) });
  })));
  const s0 = await slide();
  await click('studioNextGroup');
  await sleep(1200);
  const s1 = await slide();
  record('› shows the next requirement; the dropdown, the dots and the text follow', s1.key === groups[1] && s1.pick === s1.key && s1.dot === 1 && s1.position === 'Requirement 2 of ' + groups.length, { before: s0, after: s1 });
  await run(() => { document.getElementById('studioPrevGroup').focus(); return 1; });
  await key('ArrowLeft');
  await sleep(1000);
  const s2 = await slide();
  record('← on the carousel goes back a requirement', s2.key === groups[0] && s2.dot === 0, s2);
  await vmCall('(vm) => { vm.groupPick(' + JSON.stringify(groups[groups.length - 1]) + '); return 1; }');
  await sleep(1200);
  const s3 = await slide();
  record('the dropdown picks the slide', s3.key === groups[groups.length - 1] && s3.dot === groups.length - 1, s3);
  // A requirement with more than one screen, for the cards' keys
  let many = null;
  for (const g of groups) {
    await vmCall('(vm) => { vm.pickGroup(' + JSON.stringify(g) + '); return 1; }');
    await sleep(700);
    if ((await run(() => document.querySelectorAll('.factory-studio-node').length)) > 1) { many = g; break; }
  }
  record('a requirement with several screens', !!many, many);
  const nodes = await run(() => [...document.querySelectorAll('.factory-studio-node')].map((n) => n.getAttribute('data-studio-node')));
  const cards = await run(() => ({
    arrows: [...document.querySelectorAll('.factory-studio-nodes li')].slice(1).every((li) => getComputedStyle(li, '::before').content.indexOf('→') >= 0),
    meta: [...document.querySelectorAll('.factory-studio-node-meta')].map((m) => m.textContent.trim()),
    widths: [...document.querySelectorAll('.factory-studio-node')].map((n) => Math.round(n.getBoundingClientRect().width)),
    scrolling: !!document.querySelector('.factory-studio-nodes.is-scrolling')
  }));
  record('cards are joined by →, each with "<stage> · <status>"', cards.arrows && cards.meta.every((m) => / · /.test(m)), cards.meta.slice(0, 3));
  record('up to 4 cards share the width; from 5 they are 232 px and scroll', nodes.length > 4 ? cards.scrolling && cards.widths.every((w) => w === 232) : !cards.scrolling && cards.widths.every((w) => w > 232), cards.widths);
  const nodeState = () => run(() => ({
    focused: document.activeElement && document.activeElement.getAttribute('data-studio-node'),
    pressed: (document.querySelector('.factory-studio-node[aria-pressed="true"]') || { getAttribute: () => null }).getAttribute('data-studio-node'),
    title: (document.getElementById('studioScreenTitle') || {}).textContent || ''
  }));
  await run(() => { const n = document.querySelector('.factory-studio-node[aria-pressed="true"]') || document.querySelector('.factory-studio-node'); n.focus(); return 1; });
  const start = await nodeState();
  const at = nodes.indexOf(start.pressed);
  await key('ArrowRight');
  const moved = await nodeState();
  record('ArrowRight on a card moves to the next screen and shows it (the requirement stays)', moved.focused === nodes[Math.min(at + 1, nodes.length - 1)] && moved.pressed === moved.focused
    && (await slide()).key === many, { from: start.pressed, to: moved });
  await key('End');
  const end = await nodeState();
  record('End moves to the last card', end.pressed === nodes[nodes.length - 1] && end.focused === end.pressed, end.pressed);
  await key('Home');
  const home = await nodeState();
  record('Home moves to the first card', home.pressed === nodes[0] && home.focused === home.pressed, home.pressed);
  // ▴ hides the Screens panel; the choice is kept
  await click('studioHideScreens');
  await sleep(600);
  const hidden = await run(() => new Promise((r) => window.require(['services/preferences'], (p) => r({ panel: !!document.getElementById('studioScreens'), show: !!document.getElementById('studioShowScreens'), kept: p.studioScreensHidden() }))));
  record('▴ hides the Screens panel, and the choice is kept', !hidden.panel && hidden.show && hidden.kept === true, hidden);
  await click('studioShowScreens');
  await sleep(600);
  record('Show the screens brings it back', await exists('#studioScreens'));

  // ---------- 3. The selected screen ----------
  const head = await run(() => ({
    meta: ((document.getElementById('studioScreenMeta') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    position: ((document.querySelector('.factory-studio-switch span') || {}).textContent || '').trim(),
    order: [...document.querySelectorAll('#studioScreenHead .factory-studio-canvas-row:first-child > *')].map((e) => e.id || e.className.split(' ')[0]),
    tabs: [...document.querySelectorAll('.factory-studio-modes [role=tab]')].map((t) => t.textContent.trim()),
    devices: [...document.querySelectorAll('.factory-studio-devices button')].map((b) => b.textContent.trim())
  }));
  record('the screen\'s line: Requirement … · Step x of n · stage · Version v', /^Requirement .+ · Step \d+ of \d+ · .+ · Version \d+/.test(head.meta), head.meta);
  record('the switcher counts the whole BRD', /^\d+ \/ \d+$/.test(head.position) && Number(head.position.split('/')[1]) === brd.screens, head.position);
  const order = head.order.filter((x) => /studioPrevScreen|factory-studio-switch|studioScreenMore|studioApproveScreen|studioReopenScreen|studioExpand/.test(x));
  record('on the right: switcher, More, Approve or Reopen, then Expand', order.join(',') === 'factory-studio-switch,studioScreenMore,' + order[2] + ',studioExpand' && /studioApproveScreen|studioReopenScreen/.test(order[2]), head.order);
  record('Review | Edit tabs, and the Phone/Tablet/Desktop switch in Review', head.tabs.join(',') === 'Review,Edit' && head.devices.join(',') === 'Phone,Tablet,Desktop', head);
  const t0 = await run(() => document.getElementById('studioScreenTitle').textContent.trim());
  const p0 = Number(head.position.split('/')[0]);
  const forward = p0 < brd.screens;
  await click(forward ? 'studioNextScreen' : 'studioPrevScreen');
  await sleep(1200);
  const t1 = await run(() => ({ title: document.getElementById('studioScreenTitle').textContent.trim(), position: document.querySelector('.factory-studio-switch span').textContent.trim() }));
  record('‹ › in the switcher show the BRD\'s next or previous screen', t1.title !== t0 && Number(t1.position.split('/')[0]) === p0 + (forward ? 1 : -1), { from: t0, to: t1 });
  await click(forward ? 'studioPrevScreen' : 'studioNextScreen');
  await sleep(1000);
  // Review | Edit: the arrow keys move between them (on a screen with nothing unsaved)
  await run(() => { document.getElementById('studioMode-review').focus(); return 1; });
  await key('ArrowRight');
  await sleep(2500);
  const tab = await run(() => ({ focused: document.activeElement && document.activeElement.id, selected: document.getElementById('studioMode-edit').getAttribute('aria-selected') }));
  record('ArrowRight moves to the Edit tab', tab.focused === 'studioMode-edit' && tab.selected === 'true', tab);
  await key('Home');
  await sleep(1200);
  record('Home goes back to Review', await run(() => document.activeElement && document.activeElement.id === 'studioMode-review' && document.getElementById('studioMode-review').getAttribute('aria-selected') === 'true'));

  // ---------- 4. Ready to approve? ----------
  const ready = await run(() => ({
    title: ((document.getElementById('studioReadyTitle') || {}).textContent || '').trim(),
    summary: ((document.getElementById('studioReadySummary') || {}).textContent || '').trim(),
    checks: [...document.querySelectorAll('.factory-studio-check-row')].map((b) => b.id),
    titles: [...document.querySelectorAll('.factory-studio-check-title')].map((b) => b.textContent.trim()),
    open: [...document.querySelectorAll('.factory-studio-check-row[aria-expanded="true"]')].length,
    refine: !!document.querySelector('#studioRefine') && !!document.getElementById('studioRefineButton'), compare: !!document.getElementById('studioCompareLink')
  }));
  record('Ready to approve? with its summary', ready.title === 'Ready to approve?' && /^(All checks pass|\d of 5 checks? needs? attention)$/.test(ready.summary), ready.summary);
  record('the five checks in order', ready.checks.join(',') === 'studioCheck-fields,studioCheck-criteria,studioCheck-decisions,studioCheck-values,studioCheck-compat'
    && ready.titles[0] === 'Fields from the requirement' && ready.titles[1] === 'Acceptance criteria' && ready.titles[2] === 'Open decisions'
    && ready.titles[3] === 'Values to confirm' && /^OBDX .+ compatibility$/.test(ready.titles[4]), ready.titles);
  record('one check is open, and the footer has Refine with AI and Compare versions', ready.open === 1 && ready.refine && ready.compare, ready);
  await click('studioCheck-values');
  await sleep(500);
  const acc = await run(() => [...document.querySelectorAll('.factory-studio-check-row')].filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.id));
  record('opening a check closes the others', acc.join(',') === 'studioCheck-values', acc);
  await click('studioFoldReady');
  await sleep(600);
  const fold = await run(() => new Promise((r) => window.require(['services/preferences'], (p) => {
    const rail = document.getElementById('studioReadyRail');
    r({ panel: !!document.getElementById('studioReady'), rail: rail ? Math.round(rail.getBoundingClientRect().width) : 0, text: rail ? rail.textContent.replace(/\s+/g, ' ').trim() : '', kept: p.studioReadiness() });
  })));
  record('» folds the checks to a 56 px rail with the count, and the choice is kept', !fold.panel && fold.rail === 56 && /\d|✓/.test(fold.text) && fold.kept === 'folded', fold);
  await click('studioUnfoldReady');
  await sleep(600);
  record('« brings the checks back', await exists('#studioReady'));
  // Expand: the screen gets the page
  await click('studioExpand');
  await sleep(800);
  const big = await run(() => ({ screens: !!document.getElementById('studioScreens'), ready: !!document.getElementById('studioReady') || !!document.getElementById('studioReadyRail'),
    label: document.getElementById('studioExpand').getAttribute('aria-label') }));
  record('Expand hides the Screens panel and the checks, and says Exit full view', !big.screens && !big.ready && big.label === 'Exit full view', big);
  await click('studioExpand');
  await sleep(800);
  record('Exit full view brings them back', await run(() => !!document.getElementById('studioScreens') && !!document.getElementById('studioReady')));

  // ---------- Approving asks first; Cancel changes nothing ----------
  const before = await statuses();
  if (await click('studioApproveAll')) {
    await sleep(600);
    const text = await dialogText();
    record('Approve All asks first, and says how many screens have open checks', /Approve every screen/.test(text) && /open checks/.test(text), text.slice(0, 160));
    await cancel();
    record('cancelling approves nothing', (await statuses()) === before && !(await dialog()));
  } else {
    record('Approve All is offered (the BRD must have screens to approve and you the Approve permission)', false, 'precondition missing');
  }
  if (await click('studioApproveScreen')) {
    await sleep(600);
    const asked = await dialog();
    record('Approve screen asks first', !!asked, asked);
    await cancel();
    record('Approve screen: cancelling approves nothing', (await statuses()) === before && !(await dialog()));
  } else {
    record('Approve screen is offered (precondition: a screen to approve and the Approve permission)', false, 'precondition missing');
  }
  // Reopen asks first: a BRD with an approved screen
  if (brd.approvedBrd) {
    await goStudio(brd.approvedBrd);
    const approvedId = await run(async (id) => {
      const flow = await fetch('api/requirements/' + id + '/design-flow', { credentials: 'same-origin' }).then((r) => r.json());
      return (flow.screens.find((x) => x.status === 'APPROVED') || {}).id;
    }, brd.approvedBrd);
    await vmCall('(vm) => { vm.showScreen(' + JSON.stringify(approvedId) + '); return 1; }');
    await sleep(1500);
    if (await click('studioReopenScreen')) {
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
  await goStudio(brd.id);
  // A screen that can be changed
  const draft = await run(async (id) => {
    const flow = await fetch('api/requirements/' + id + '/design-flow', { credentials: 'same-origin' }).then((r) => r.json());
    return (flow.screens.find((x) => x.status !== 'APPROVED') || {}).id;
  }, brd.id);
  await vmCall('(vm) => { vm.showScreen(' + JSON.stringify(draft) + '); return 1; }');
  await sleep(1200);
  const frames = () => run(() => ({
    review: document.querySelectorAll('iframe[data-studio-screen]').length,
    editor: document.querySelectorAll('#studioEditor iframe.factory-dz-frame').length,
    all: document.querySelectorAll('.factory-page iframe').length
  }));
  record('Review shows one preview', JSON.stringify(await frames()) === JSON.stringify({ review: 1, editor: 0, all: 1 }), await frames());
  await click('studioMode-edit');
  await sleep(6000);
  const edit = await run(() => new Promise((r) => window.require(['services/pageRequests'], (pr) => r({
    pressed: document.getElementById('studioMode-edit').getAttribute('aria-pressed'),
    module: !!document.querySelector('#studioEditor .factory-dz'),
    screens: !!document.getElementById('studioScreens'),
    ready: !!document.getElementById('studioReady'),
    menu: pr.foldMenu(), shell: document.querySelector('.factory-shell').className,
    expand: document.getElementById('studioExpand').getAttribute('aria-label'),
    tabs: [...document.querySelectorAll('#studioEditor #leftPanel [role=tab]')].map((t) => t.textContent.trim()),
    board: !!document.getElementById('designBoard'),
    ownTitle: [...document.querySelectorAll('h1')].some((h) => /Visual Designer/.test(h.textContent)),
    loaded: !!document.querySelector('#studioEditor #designLayers, #studioEditor #designPalette'),
    saveAndApprove: [...document.querySelectorAll('button')].some((b) => /save and approve/i.test(b.textContent))
  }))));
  record('Edit draws the designer inside the Studio', edit.pressed === 'true' && edit.module && edit.loaded, edit);
  record('Edit opens expanded: no Screens panel, the app menu folds to icons, "Show the screens"', !edit.screens && !edit.ready && edit.menu === true && /collapsed/.test(edit.shell) && edit.expand === 'Show the screens', edit);
  record('the editor has no board, title or Screens tab of its own, and no Save and approve', !edit.board && !edit.ownTitle && edit.tabs.join(',') === 'Components,Layers' && !edit.saveAndApprove, edit.tabs);
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

  const editable = await exists('#undoButton');
  const unsaved = () => exists('.factory-dz-unsaved');
  // An unsaved change: move the first component down in Layers (the Layers rail opens it floating)
  const move = async () => {
    const docked = await run(() => getComputedStyle(document.getElementById('leftPanel')).display !== 'none');
    if (!docked) { await click('railLayers'); } else { await click('leftTab-layers'); }
    await sleep(500);
    if (await run(() => document.getElementById('leftTab-layers').getAttribute('aria-selected') !== 'true')) { await click('leftTab-layers'); await sleep(400); }
    const id = await run(() => { const row = document.querySelector('#designLayers [data-cid]'); row.click(); return row.getAttribute('data-cid'); });
    // Selecting draws the tree again: focus the new row
    await sleep(600);
    await run((cid) => { document.querySelector('#designLayers [data-cid="' + cid + '"]').focus(); return 1; }, id);
    await key('ArrowDown', 1);
    await sleep(800);
  };
  if (editable) {
    await move();
    record('a change in Edit is unsaved', await unsaved());
    const rule = await run(() => ({ unsaved: ((document.getElementById('studioUnsaved') || {}).textContent || '').trim(), save: ((document.getElementById('saveDesignButton') || {}).textContent || '').trim(),
      approve: !!document.getElementById('studioApproveScreen') || !!document.getElementById('studioPhoneApprove') && document.getElementById('studioPhoneApprove').offsetParent !== null }));
    record('while unsaved: "Unsaved changes" and Save changes, and no Approve', rule.unsaved === 'Unsaved changes' && rule.save === 'Save changes' && !rule.approve, rule);
    // Ctrl+Z outside the editor and the screen's header (the Studio's own header) leaves it alone
    await run(() => { const b = document.querySelector('#studioBrd button, #studioBrd input, #studioBrd [tabindex]'); b.focus(); return document.activeElement === b; });
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await sleep(600);
    record('Ctrl+Z outside the editor does not undo in it', await unsaved());
    // Each way out asks first: Review, the screen switcher, the carousel (with the screens shown), Esc, another page
    for (const [what, act] of [
      ['switching to Review', () => { document.getElementById('studioMode-review').click(); return 1; }],
      ['the screen switcher', () => { const b = [document.getElementById('studioNextScreen'), document.getElementById('studioPrevScreen')].find((x) => x && !x.disabled); if (b) { b.click(); } return !!b; }],
      ['the carousel\'s next requirement', () => { document.getElementById('studioExpand').click(); return new Promise((r) => setTimeout(() => { const b = [document.getElementById('studioNextGroup'), document.getElementById('studioPrevGroup')].find((x) => x && !x.disabled); if (b) { b.click(); } r(!!b); }, 800)); }],
      ['leaving the page', () => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; }]
    ]) {
      const did = await run(act);
      await sleep(1200);
      const asked = await dialog();
      record(what + ' with unsaved changes asks first', did && !!asked, did ? asked : 'precondition missing');
      await cancel();
      const kept = await run(() => ({ page: new URLSearchParams(location.search).get('ojr'), edit: document.getElementById('studioMode-edit') && document.getElementById('studioMode-edit').getAttribute('aria-pressed') }));
      record('cancelling keeps Edit and the changes', kept.page === 'studio' && kept.edit === 'true' && await unsaved(), kept);
    }
    // The panels are docked now (the screens are shown): 260 and 320 px
    const docked = await run(() => ({ left: Math.round(document.getElementById('leftPanel').getBoundingClientRect().width), right: Math.round(document.getElementById('rightPanel').getBoundingClientRect().width),
      rails: !!document.getElementById('railComponents') }));
    record('with the screens shown, Edit\'s panels are docked columns', docked.left === 260 && docked.right === 320 && !docked.rails, docked);
    // ... and the BRD picker, an upload (the upload is stubbed), another workspace, and the browser's Back
    await run(() => new Promise((r) => window.require(['knockout'], (ko) => { window.__studioVm = ko.dataFor(document.querySelector('.factory-studio')); r(1); })));
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
    await click('undoButton');
    await sleep(800);
    record('Undo brings back the saved version, and Approve with it', !(await unsaved()) && await exists('#studioApproveScreen'));

    // Save: a refused save keeps the changes and says so; a save keeps them as a new version, then "Saved" and Approve
    const version = () => run(() => new Promise((r) => window.require(['knockout'], (ko) => { const vm = ko.dataFor(document.querySelector('#studioEditor .factory-dz')); r(vm.detail() ? vm.detail().currentVersion : null); })));
    await move();
    record('a change to save is unsaved', await unsaved());
    const refused = await stub((r) => r.method === 'PUT' && /\/api\/designs\/[^/]+\/model$/.test(r.url), 500, { detail: 'Stub: the server refused the save' });
    await click('saveDesignButton');
    await sleep(1500);
    const failed = await run(() => ({ error: ((document.getElementById('designError') || {}).textContent || '').trim(), unsaved: !!document.querySelector('.factory-dz-unsaved'), saved: !!document.getElementById('studioSaved') }));
    record('a refused save says why and keeps the changes', /refused the save/.test(failed.error) && failed.unsaved && !failed.saved, failed);
    await unstub(refused);
    const v0 = await version();
    await click('saveDesignButton');
    await sleep(2500);
    const v1 = await version();
    const after = await run(() => ({ saved: ((document.getElementById('studioSaved') || {}).textContent || '').trim(), approve: !!document.getElementById('studioApproveScreen'), save: !!document.getElementById('saveDesignButton') }));
    record('Save keeps the changes as a new version', v1 === v0 + 1 && !(await unsaved()), { before: v0, after: v1 });
    record('after saving: "✓ Saved" and Approve screen, no Save changes', after.saved === '✓ Saved' && after.approve && !after.save, after);

    // Approve, with the unsupported-components refusal (stubbed 409) and its retry with ?unsupported=true
    const approves = [];
    const refuse = await stub((r) => r.method === 'POST' && /\/designs\/approve/.test(r.url) && (approves.push(r.url), !/unsupported=true/.test(r.url)), 409,
      { detail: 'Unsupported components: oj-select-one is not supported in OBDX 25.x (a stub for this check)' });
    await click('studioApproveScreen');
    await sleep(800);
    record('Approve asks to approve the saved version', /Approve this screen/.test(await dialog() || ''), await dialog());
    await confirm();
    await sleep(1500);
    record('an unsupported-components refusal asks again', /Approve unsupported components/.test(await dialog() || ''), await dialog());
    await cancel();
    await sleep(800);
    record('cancelling approves nothing', await exists('#studioApproveScreen'));
    await click('studioApproveScreen');
    await sleep(800);
    await confirm();
    await sleep(1500);
    await confirm();
    await sleep(3000);
    const approved = await run(() => ({ reopen: !!document.getElementById('studioReopenScreen'), dialog: !!document.querySelector('.fx-dialog') }));
    record('Approve Anyway approves with ?unsupported=true', approved.reopen && approves.some((u) => /unsupported=true/.test(u)), { approved: approved, requests: approves.map((u) => u.replace(/^.*\/api\//, '')) });
    await unstub(refuse);
    // An approved screen in Edit is read-only, with Reopen to edit
    const locked = await run(() => new Promise((r) => window.require(['knockout'], (ko) => {
      const vm = ko.dataFor(document.querySelector('#studioEditor .factory-dz'));
      r({ note: ((document.getElementById('studioEditLocked') || {}).textContent || '').replace(/\s+/g, ' ').trim(), editable: !!(vm && vm.editable()),
        undo: !!document.getElementById('undoButton') && !document.getElementById('undoButton').disabled, ask: !!document.getElementById('aiInstruction'),
        button: [...document.querySelectorAll('#studioEditLocked button')].map((b) => b.textContent.trim()) });
    })));
    record('an approved screen in Edit is read-only, with Reopen to edit', locked.note.length > 0 && !locked.editable && !locked.undo && !locked.ask && locked.button.indexOf('Reopen to edit') >= 0, locked);
    // Back to a draft for the next run
    await click('studioReopenScreen');
    await sleep(800);
    await confirm();
    await sleep(3000);
    record('Reopen makes it a draft again', await exists('#studioApproveScreen'));
    // Escape with nothing selected goes back to Review
    if (await run(() => getComputedStyle(document.getElementById('leftPanel')).display === 'none')) { await click('railLayers'); await sleep(400); }
    await click('leftTab-layers');
    await sleep(400);
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

  // ---------- Widths: no horizontal page scroll; Edit's panels are rails at 1024; phones ----------
  await prefs({ studioEditExpanded: false });
  for (const w of [1024, 768]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1500);
    const review = await hscroll();
    await click('studioMode-edit');
    await sleep(5000);
    const inEdit = await hscroll();
    const rails = await run(() => !!document.getElementById('railComponents') && getComputedStyle(document.getElementById('leftPanel')).display === 'none');
    record('no horizontal page scroll at ' + w + ' px (Review and Edit)', review <= 0 && inEdit <= 0, { review: review, edit: inEdit });
    if (w === 1024) { record('at 1024 px Edit\'s panels drop to rails (not expanded)', rails && await exists('#studioScreens')); }
    await click('studioMode-review');
    await sleep(1200);
  }
  await prefs({ studioEditExpanded: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1500);
  const phoneReview = await run(() => {
    const vis = (q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
    const bar = document.querySelector('.factory-studio-phonebar');
    return { dropdown: vis('#studioGroup'), switcher: vis('.factory-studio-phoneswitch'), cards: vis('.factory-studio-carousel'), bar: !!bar && getComputedStyle(bar).position === 'fixed',
      approve: vis('#studioPhoneApprove') || vis('#studioPhoneReopen'), more: vis('#studioPhoneMore'), headApprove: vis('#studioApproveScreen'),
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  record('at 390 px: the requirement dropdown, the screen switcher, a fixed bottom bar with More and Approve, no cards', phoneReview.dropdown && phoneReview.switcher && !phoneReview.cards && phoneReview.bar
    && phoneReview.approve && phoneReview.more && !phoneReview.headApprove && phoneReview.scroll <= 0, phoneReview);
  await click('studioMode-edit');
  await sleep(1500);
  const phone = await run(() => ({ text: (document.getElementById('studioEditNarrow') || {}).textContent || '', editor: !!document.querySelector('#studioEditor') }));
  record('Edit at 390 px says to use a wider screen', /Use a wider screen to edit this screen/.test(phone.text) && !phone.editor, phone.text.replace(/\s+/g, ' ').trim().slice(0, 60));
  await click('studioMode-review');
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
  await click('studioMode-review');
  await sleep(1200);
  // A real link: ?ojr=studio&requirement=&screen= opens that screen on its requirement's slide, and the address follows
  await open(BASE + '/?ojr=studio&requirement=' + brd.id + '&screen=' + target.id);
  await sleep(5000);
  const link = await run(() => ({
    pressed: (document.querySelector('.factory-studio-node[aria-pressed="true"]') || { getAttribute: () => null }).getAttribute('data-studio-node'),
    title: ((document.getElementById('studioScreenTitle') || {}).textContent || '').trim(),
    search: location.search
  }));
  record('?ojr=studio&requirement=&screen= opens that screen, on its requirement\'s slide', link.pressed === target.id && link.title === target.name, link);
  await run(() => { const n = document.querySelector('.factory-studio-node:not([aria-pressed="true"])') || document.querySelector('.factory-studio-node'); if (n) { n.click(); } return 1; });
  await sleep(800);
  const followed = await run(() => ({ id: document.querySelector('.factory-studio-node[aria-pressed="true"]').getAttribute('data-studio-node'), search: location.search }));
  record('the address follows the selected screen', followed.search.indexOf('screen=' + followed.id) >= 0 && followed.search.indexOf('ojr=studio') >= 0 && followed.search.indexOf('requirement=' + brd.id) >= 0, followed.search);
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

  // ---------- Without a BRD (a workspace that has blank or imported screens) ----------
  const loose = await run(async () => {
    const get = (p) => fetch('api/' + p, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : []));
    for (const w of await get('workspaces')) {
      const reqs = await get('workspaces/' + w.id + '/requirements');
      const ids = reqs.map((r) => r.id);
      const list = (await get('workspaces/' + w.id + '/designs')).filter((d) => !d.requirementId || ids.indexOf(d.requirementId) < 0);
      if (list.length) { return { workspace: w.id, count: list.length, brds: reqs.length }; }
    }
    return null;
  });
  if (loose) {
    await s.selectWorkspace(loose.workspace);
    await goStudio(loose.brds ? null : 'none');
    const options = await vmCall('(vm) => vm.groupOptions().map((o) => o.value + "=" + o.label)');
    await vmCall('(vm) => { vm.pickGroup("loose"); return 1; }');
    await sleep(1500);
    const none = await run(() => ({
      group: ((document.getElementById('studioGroup') || document.querySelector('.factory-studio-group-one') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      nodes: document.querySelectorAll('.factory-studio-node').length,
      numbers: [...document.querySelectorAll('.factory-studio-node-n')].map((n) => n.textContent.trim())
    }));
    record('"Without a BRD" lists the blank and imported screens', options.some((o) => o === 'loose=Without a BRD') && /Without a BRD/.test(none.group) && none.nodes === loose.count, { options: options, none: none });
    if (await click('studioApproveScreen')) {
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

  // Put the layout choices back to their defaults
  await prefs({ studioExpanded: false, studioEditExpanded: true, studioReadiness: '', studioScreensHidden: false });
  // The stubbed refusals are expected; anything else is a defect
  const stubbed = ['HTTP 500 /api/designs/', 'HTTP 409 /api/requirements/'];
  const errors = s.errors.filter((e) => !/auth\/me/.test(e) && !(stubbed.some((x) => e.indexOf(x) === 0) && /\/model$|\/designs\/approve$/.test(e)));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Design Studio: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
