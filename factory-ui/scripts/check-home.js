// Home page check: drives a running factory in headless Edge or Chrome and checks what the Home page promises:
//  - "Work in progress" and "Needs you" show, or their empty states;
//  - the attention count matches the items the server data gives (the notification bell's list, for the chosen
//    workspace and for all workspaces); the kind chips add up to it and filter the rows;
//  - the four stages count the rows under them, and their figures match the data (no old Progress cards);
//  - the Recent card switches between activity, requirements and builds with its View all link;
//  - one small card per workspace, the chosen one marked, each with its menu;
//  - the newest work item and the first attention item open their own record (the requirement or change);
//  - with the factory unreachable, the page says so and "Try again" recovers with nothing left busy;
//  - Tab reaches the newest work item.
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
      firstContinue: (() => {
        const t = document.querySelector('#continueFirst .factory-home-row-title');
        if (!t) { return null; }
        const c = t.cloneNode(true);
        c.querySelectorAll('.factory-home-latest').forEach((b) => b.remove());
        return c.textContent.trim();
      })()
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
  record('work in progress shows (rows or empty state)', st.continueShown);
  record('needs you shows (rows or the one-line all-clear)', st.attentionShown);
  record('attention count matches the data for the chosen workspace', st.badge === st.expectedHere, { badge: st.badge, expected: st.expectedHere });
  record('at most five attention rows until expanded', st.rows === Math.min(5, st.expectedHere), { rows: st.rows });
  record('no console errors', s.errors.filter((e) => !/auth\/me/.test(e)).length === 0, s.errors.filter((e) => !/auth\/me/.test(e)).slice(0, 3));

  // The layout: one primary action, no old Progress cards, no Continue card apart from the work list
  const layout = await run(() => ({
    primary: document.querySelectorAll('.factory-home-head .fx-btn--primary').length,
    oldParts: !!document.querySelector('.factory-home-metrics, .factory-home-next, #recentWorkspaces table'),
    order: ['homeAttention', 'homeContinue', 'recentActivity', 'recentWorkspaces'].map((id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1; })
  }));
  record('one primary action in the header', layout.primary <= 1, layout.primary);
  record('no old Progress cards or Continue card', !layout.oldParts);
  record('needs you first, then the work, recent and the workspaces', layout.order.every((y) => y >= 0) && layout.order[0] < layout.order[1] && layout.order[1] <= layout.order[2] && layout.order[2] < layout.order[3], layout.order);

  // The kind chips add up to the count and filter the rows
  const chips = await run(() => [...document.querySelectorAll('#attentionFilters .fx-chip')].map((c) => ({ text: c.textContent.trim(), n: +(c.textContent.trim().match(/(\d+)$/) || [0, 0])[1] })));
  if (chips.length > 1) {
    record('kind chips add up to All', chips.slice(1).reduce((a, c) => a + c.n, 0) === chips[0].n, chips);
    const filtered = await run(() => new Promise((resolve) => {
      const chip = document.querySelectorAll('#attentionFilters .fx-chip')[1];
      chip.click();
      setTimeout(() => {
        const n = +(chip.textContent.trim().match(/(\d+)$/) || [0, 0])[1];
        const r = { pressed: chip.getAttribute('aria-pressed'), rows: document.querySelectorAll('#attentionList > li').length, n: n };
        document.querySelectorAll('#attentionFilters .fx-chip')[0].click();
        setTimeout(() => resolve(r), 300);
      }, 400);
    }));
    record('a kind chip filters the rows to that kind', filtered.pressed === 'true' && filtered.rows === Math.min(5, filtered.n), filtered);
  }

  // The stages: four, each counting the rows under it, with the figures the data gives
  const stages = await run(() => new Promise((resolve) => window.require(['knockout', 'services/dashboard'], (ko, dashboard) => {
    const vm = ko.dataFor(document.querySelector('.factory-page h1'));
    const reqs = vm.scoped().reduce((a, d) => a.concat(d.requirements), []);
    resolve({
      names: [...document.querySelectorAll('#developmentProgress .factory-home-stage-name')].map((e) => e.textContent.trim()),
      counts: [...document.querySelectorAll('#developmentProgress .factory-home-stage-count')].map((e) => e.textContent.trim()),
      groups: vm.workGroups().map((g) => ({ key: g.key, rows: g.rows.length })),
      hidden: vm.workHidden(),
      items: vm.continueItems().map((r) => r.step),
      reqFigure: ((document.getElementById('metric-requirements') || {}).textContent || '').trim(),
      reqExpected: reqs.length ? reqs.filter((r) => r.status === 'APPROVED').length + ' of ' + reqs.length : 'No requirements',
      steps: dashboard.steps
    });
  })));
  record('four stages: Spec, Screens, Plan, Code', JSON.stringify(stages.names) === JSON.stringify(stages.steps), stages.names);
  record('each stage counts its work in progress', stages.counts.every((c, i) => {
    const n = stages.items.filter((s) => s === i + 1).length;
    return n ? c === n + ' in progress' : c === 'None now';
  }), stages.counts);
  record('rows are grouped under their stage', stages.hidden > 0 || stages.groups.every((g) => g.rows === stages.items.filter((s) => 'step' + s === g.key).length), stages.groups);
  record('the requirements figure matches the data', stages.reqFigure.indexOf(stages.reqExpected) === 0, { shown: stages.reqFigure, expected: stages.reqExpected });

  // Recent: activity, requirements and builds in one card, each with its View all
  const recent = [];
  for (const tab of ['requirements', 'builds', 'activity']) {
    await run((t) => { document.getElementById('recent-' + t).click(); return 1; }, tab);
    await sleep(300);
    recent.push(await run((t) => ({ tab: t, shown: t === 'activity' ? !!document.querySelector('#recentActivity .fx-timeline, #recentActivity .factory-home-none') : !!document.getElementById('recent' + t.charAt(0).toUpperCase() + t.slice(1)),
      link: (document.getElementById('recentViewAll') || {}).getAttribute('href') }), tab));
  }
  record('Recent switches between requirements, builds and activity', recent.every((r) => r.shown), recent);
  record('each Recent list has its own View all', recent[0].link === '?ojr=requirements' && recent[1].link === '?ojr=build' && recent[2].link === '?ojr=notifications', recent.map((r) => r.link));

  // Workspaces as small cards
  const cards = await run(() => new Promise((resolve) => window.require(['services/dashboard', 'services/workspaceSelection'], (d, sel) => resolve({
    cards: document.querySelectorAll('#homeWorkspaceTrack > li:not(.factory-home-ws-add)').length,
    expected: d.data().length,
    current: [...document.querySelectorAll('#homeWorkspaceTrack > li[aria-current="true"] .factory-home-ws-name')].map((e) => e.textContent.trim()),
    selected: (d.data().find((e) => e.workspace.id === sel.selectedId()) || { workspace: {} }).workspace.name,
    menus: document.querySelectorAll('#homeWorkspaceTrack fx-menu-button').length
  }))));
  record('one card per workspace', cards.cards === cards.expected, cards);
  record('the chosen workspace is marked', cards.current.length === 1 && cards.current[0] === cards.selected, cards.current);
  record('every workspace card has its menu', cards.menus === cards.expected);

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
    record('the newest work item opens its record', o.title.indexOf(st.firstContinue.trim()) >= 0, o);
    await home();
  }

  // Keyboard: Tab from the heading reaches the continue card
  if (st.firstContinue) {
    await run(() => { const h = document.querySelector('.factory-page h1'); h.setAttribute('tabindex', '-1'); h.focus(); return 1; });
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', windowsVirtualKeyCode: 9, code: 'Tab' });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', windowsVirtualKeyCode: 9, code: 'Tab' });
      await sleep(100);
      reached = await run(() => document.activeElement && document.activeElement.id === 'continueFirst');
    }
    record('Tab reaches the newest work item', reached);
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
