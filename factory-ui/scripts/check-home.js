// Home page check: drives a running factory in headless Edge or Chrome and checks what the Home page promises:
//  - "Continue where you left off" and "Attention required" show, or their empty states;
//  - the attention count matches the items the server data gives (the notification bell's list, for the chosen
//    workspace and for all workspaces);
//  - the first continue item and the first attention item open their own record (the requirement or change);
//  - with the factory unreachable, the page says so and "Try again" recovers with nothing left busy;
//  - Tab reaches the continue card.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-home.js --url http://localhost:8080
//
// It only reads (opens pages and records) and never saves or deletes. Exit code 1 on a defect.
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
  const home = async () => {
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); window.scrollTo(0, 0); return 1; });
    await sleep(3500);
  };
  const click = async (sel) => {
    const c = await run((q) => { const e = document.querySelector(q); if (!e) { return null; } e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    if (!c) { return false; }
    for (const t of ['mousePressed', 'mouseReleased']) { await cdp('Input.dispatchMouseEvent', { type: t, x: c.x, y: c.y, button: 'left', clickCount: 1 }); }
    return true;
  };
  // The page's state and, from the shared dashboard data, what it should show
  const state = () => run(() => new Promise((resolve) => window.require(['services/dashboard', 'services/workspaceSelection'], (dashboard, sel) => {
    const items = dashboard.attention();
    const badge = document.querySelector('#homeAttention .factory-home-count');
    resolve({
      continueShown: !!document.querySelector('#continueFirst, #continueEmpty'),
      attentionShown: !!document.querySelector('#attentionList, #attentionEmpty'),
      badge: badge ? +badge.textContent.trim() : 0,
      rows: document.querySelectorAll('#attentionList > li').length,
      expectedHere: items.filter((a) => !a.workspaceId || a.workspaceId === sel.selectedId()).length,
      expectedAll: items.length,
      firstAttention: (document.querySelector('#attentionList .factory-home-row-title') || {}).textContent || null,
      firstContinue: (document.querySelector('#continueFirst .factory-home-next-title') || {}).textContent || null
    });
  })));
  const opened = () => run(() => {
    const page = new URLSearchParams(location.search).get('ojr');
    const title = document.querySelector('.factory-ch-title') || document.querySelector('.factory-rq-name') || document.querySelector('.factory-page h1');
    return { page: page, title: title ? title.textContent.trim() : '' };
  });
  const waitOpened = async (title) => {
    let o = null;
    for (let i = 0; i < 20; i++) { await sleep(500); o = await opened(); if (title && o.title.indexOf(title.trim()) >= 0) { break; } }
    return o;
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  await sleep(2500);
  let st = await state();
  record('continue panel shows (items or empty state)', st.continueShown);
  record('attention panel shows (items or empty state)', st.attentionShown);
  record('attention count matches the data for the chosen workspace', st.badge === st.expectedHere, { badge: st.badge, expected: st.expectedHere });
  record('at most five attention rows until expanded', st.rows === Math.min(5, st.expectedHere), { rows: st.rows });
  record('no console errors', s.errors.filter((e) => !/auth\/me/.test(e)).length === 0, s.errors.filter((e) => !/auth\/me/.test(e)).slice(0, 3));

  // All workspaces
  const scoped = await run(() => { const b = [...document.querySelectorAll('.factory-home-scope button')].find((x) => /All workspaces/.test(x.textContent)); if (b) { b.click(); } return !!b; });
  if (scoped) {
    await sleep(500);
    st = await state();
    record('all workspaces: attention count matches the bell', st.badge === st.expectedAll, { badge: st.badge, expected: st.expectedAll });
    await run(() => { const b = document.querySelector('.factory-home-scope button'); b.click(); return 1; });
    await sleep(500);
  }

  // Deep links
  st = await state();
  if (st.firstAttention) {
    await click('#attentionList .factory-home-row');
    const o = await waitOpened(st.firstAttention);
    record('first attention item opens its record', o.title.indexOf(st.firstAttention.trim()) >= 0, o);
    await home();
  }
  st = await state();
  if (st.firstContinue) {
    await click('#continueFirst');
    const o = await waitOpened(st.firstContinue);
    record('continue card opens its record', o.title.indexOf(st.firstContinue.trim()) >= 0, o);
    await home();
  }

  // Keyboard: Tab from the heading reaches the continue card
  if (st.firstContinue) {
    await run(() => { const h = document.querySelector('.factory-page h1'); h.setAttribute('tabindex', '-1'); h.focus(); return 1; });
    let reached = false;
    for (let i = 0; i < 8 && !reached; i++) {
      await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', windowsVirtualKeyCode: 9, code: 'Tab' });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', windowsVirtualKeyCode: 9, code: 'Tab' });
      await sleep(100);
      reached = await run(() => document.activeElement && document.activeElement.id === 'continueFirst');
    }
    record('Tab reaches the continue card', reached);
  }

  // Role: a viewer (VIEW and COMMENT only, as the browser sees it; the server still checks every request) gets no
  // New Requirement button and is told who acts on each item instead of being offered the action
  const viewer = await run(() => new Promise((resolve) => window.require(['services/session', 'services/workspaceSelection'], (session, sel) => {
    const me = session.user();
    session.user(Object.assign({}, me, { admin: false, memberships: [{ workspaceId: sel.selectedId(), role: 'VIEWER', permissions: ['VIEW', 'COMMENT'] }] }));
    setTimeout(() => {
      const r = {
        newButton: !!document.getElementById('overviewRequirement'),
        actions: [...document.querySelectorAll('#attentionList .factory-home-row-action')].map((e) => e.textContent.trim()),
        next: (document.querySelector('#continueFirst .factory-home-next-text') || {}).textContent || ''
      };
      session.user(me);
      resolve(r);
    }, 2500);
  })));
  record('viewer: no New Requirement button', !viewer.newButton);
  record('viewer: attention says who acts', viewer.actions.every((a) => /^Waiting for|^Ask /.test(a)), viewer.actions);
  record('viewer: continue says who acts', !viewer.next || /Waiting for|is being|is running|Jenkins is/.test(viewer.next), viewer.next);
  await sleep(2500);

  // Offline: the error says what to do; Try again recovers
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await run(() => new Promise((r) => window.require(['services/dashboard'], (d) => d.load().then(() => r(1)))));
  await sleep(400);
  const offline = await run(() => { const e = document.getElementById('homeError'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; });
  record('offline: the page says it could not load and what to do', !!offline && /try again/i.test(offline), offline);
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('#homeError .fx-btn');
  await sleep(3000);
  const after = await run(() => ({ error: !!document.getElementById('homeError'), busy: document.querySelectorAll('.is-busy').length, bar: !!document.querySelector('.fx-progressbar.is-on') }));
  record('Try again recovers with nothing left busy', !after.error && !after.busy && !after.bar, after);

  s.close();
  console.log(defects ? defects + ' defect(s).' : 'No defects.');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
