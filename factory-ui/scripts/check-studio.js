// Design Studio check: drives a running factory in headless Edge or Chrome and checks what the Studio promises:
//  - the workflow bar has its five stages, one of them current;
//  - arrow keys, Home and End move through the flow's nodes, and the screen under the focus is shown;
//  - arrow keys move through the selected screen's tabs, each with its own panel;
//  - approving all screens asks first, and Cancel changes nothing.
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

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Design Studio: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
