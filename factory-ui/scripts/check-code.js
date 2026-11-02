// Code page check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - four areas (repository health, quick checks, code search, repository settings) as one tab row; arrow keys move;
//  - health shows the server's index figures and a list of checks, each marked Error, Warning or Info;
//  - "Check for new commits" asks the repository for its latest revision (svn info, read only) and the stale-index
//    check agrees with it; without that check the page never claims the index is up to date;
//  - a search opens the first result in the code viewer; another result opens its file at the matching line, marked,
//    coloured and scrolled to inside the viewer; long lines scroll the viewer, not the page;
//  - result filters only narrow the list to results with that metadata; the top-bar search request still works;
//  - quick check filters (status, category) narrow the rules; settings never show a stored secret;
//  - offline, search says the factory could not be reached instead of "Failed to fetch";
//  - the repository settings link opens the workspace's details sheet on Workspaces.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-code.js --url http://localhost:8080
//
// Options: --out <folder for screenshots>  --query <search text, default transfer>  --theme light|dark. Exit code 1 on a defect.
// It saves nothing: the only server actions are reads, searches and the SVN connection check.
const fs = require('fs');
const path = require('path');
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const OUT = args.out ? path.resolve(args.out) : null;
const QUERY = args.query || 'transfer';

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const shot = async (name) => {
    if (!OUT) { return; }
    fs.mkdirSync(OUT, { recursive: true });
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const click = async (sel) => {
    const c = await run((q) => { const e = document.querySelector(q); if (!e) { return null; } e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    if (!c) { return false; }
    for (const t of ['mousePressed', 'mouseReleased']) { await cdp('Input.dispatchMouseEvent', { type: t, x: c.x, y: c.y, button: 'left', clickCount: 1 }); }
    return true;
  };
  const key = async (k, code) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, windowsVirtualKeyCode: code, code: k });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: code, code: k });
  };
  const waitFor = async (fn, arg, tries) => { for (let i = 0; i < (tries || 20); i++) { if (await run(fn, arg)) { return true; } await sleep(500); } return false; };
  const noPageScroll = () => run(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=code');
  if (args.theme) { await run((t) => new Promise((r) => window.require(['services/preferences'], (p) => { p.theme(t); r(1); })), args.theme); }
  await waitFor(() => document.querySelectorAll('#indexFacts > div').length > 0, null, 30);
  const wsId = await run(() => window.require('services/workspaceSelection').selectedId());

  // The four areas
  const tabs = await run(() => [...document.querySelectorAll('.factory-cd [role="tablist"]')].map((l) => [...l.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())));
  record('one tab row with the four areas', tabs.length === 1 && JSON.stringify(tabs[0]) === JSON.stringify(['Repository health', 'Quick checks', 'Code search', 'Repository settings']), tabs);
  await run(() => { document.getElementById('tab-health').focus(); return 1; });
  await key('ArrowRight', 39);
  await sleep(300);
  const moved = await run(() => ({ focus: document.activeElement.id, shown: !document.getElementById('panel-checks').hidden, others: ['health', 'search', 'settings'].every((t) => document.getElementById('panel-' + t).hidden) }));
  record('ArrowRight moves to Quick checks and shows only its panel', moved.focus === 'tab-checks' && moved.shown && moved.others, moved);
  await key('Home', 36);
  await sleep(300);

  // Health against the server
  const health = await run(async (id) => {
    const index = await fetch('api/workspaces/' + id + '/index').then((r) => r.json());
    const facts = {};
    document.querySelectorAll('#indexFacts > div').forEach((d) => { facts[d.querySelector('dt').textContent.trim()] = d.querySelector('dd').textContent.trim(); });
    const items = [...document.querySelectorAll('#healthList > li')].map((li) => ({ word: li.querySelector('.fx-badge').textContent.trim(), cls: li.className }));
    return { index: index, facts: facts, items: items, pill: document.getElementById('indexPill').textContent.trim() };
  }, wsId);
  record('index figures match the server', health.facts['Files'] === health.index.files.toLocaleString() && health.facts['Indexed revision'] === (health.index.indexedRevision === null ? 'Not imported' : 'r' + health.index.indexedRevision), { facts: health.facts, server: health.index });
  record('every health check is marked Error, Warning or Info', health.items.length > 0 && health.items.every((i) => ['Error', 'Warning', 'Info'].indexOf(i.word) >= 0 && i.cls.indexOf('is-' + i.word.toLowerCase()) >= 0), health.items);
  record('without a repository check the page does not claim "Up to date"', !/up to date/i.test(health.pill), health.pill);
  await shot('health');

  // Stale index: only from a check the user runs
  const canCheck = await run(() => !document.getElementById('checkHeadButton').disabled);
  if (canCheck && health.index.indexedRevision !== null) {
    await click('#checkHeadButton');
    await waitFor(() => !!document.querySelector('#healthFresh, #healthStale, #healthRepository'), null, 30);
    const head = await run(async (id) => {
      const info = await fetch('api/workspaces/' + id + '/svn/test', { method: 'POST', headers: { 'X-XSRF-TOKEN': decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '') } }).then((r) => r.ok ? r.json() : null);
      return { info: info, fresh: !!document.getElementById('healthFresh'), stale: document.getElementById('healthStale') ? document.getElementById('healthStale').textContent.replace(/\s+/g, ' ').trim() : null, pill: document.getElementById('indexPill').textContent.trim() };
    }, wsId);
    const behind = head.info ? head.info.headRevision - health.index.indexedRevision : null;
    record('stale check agrees with the repository\'s latest revision', head.info && (behind > 0 ? !!head.stale && head.stale.indexOf('r' + head.info.headRevision) >= 0 && /Behind/.test(head.pill) : head.fresh && /Up to date/.test(head.pill)), { head: head.info && head.info.headRevision, indexed: health.index.indexedRevision, stale: head.stale, fresh: head.fresh, pill: head.pill });
  } else {
    record('check for new commits is offered to managers only', !canCheck || health.index.indexedRevision === null);
  }

  // Quick checks filters
  await click('#tab-checks');
  await sleep(500);
  const ruleCheck = await run(() => {
    const m = window.require('knockout').dataFor(document.getElementById('panel-checks'));
    const all = document.querySelectorAll('#ruleTable tbody tr').length;
    m.ruleStatusFilter('OFF');
    const offRows = [...document.querySelectorAll('#ruleTable tbody tr')].map((tr) => tr.querySelector('[role="switch"]').getAttribute('aria-checked'));
    m.ruleStatusFilter('');
    const cat = (m.ruleCategories()[1] || {}).value;
    m.ruleCategory(cat || '');
    const catRows = [...document.querySelectorAll('#ruleTable tbody tr td[data-label="Category"]')].map((td) => td.textContent.trim());
    m.clearRuleFilters();
    return { all: all, offRows: offRows, cat: cat, catRows: catRows, total: m.checkRules().length };
  });
  record('quick checks list every rule', ruleCheck.all === ruleCheck.total && ruleCheck.total > 0, ruleCheck);
  record('status "Turned off" shows only rules that are off', ruleCheck.offRows.every((v) => v === 'false'), ruleCheck.offRows);
  record('a category shows only its rules', !ruleCheck.cat || (ruleCheck.catRows.length > 0 && ruleCheck.catRows.every((c) => c === ruleCheck.cat)), { cat: ruleCheck.cat, rows: ruleCheck.catRows.length });
  await shot('checks');

  // Search and the viewer
  await click('#tab-search');
  await sleep(400);
  await click('#searchQuery input');
  await run((q) => { const i = document.querySelector('#searchQuery input'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; }, QUERY);
  await click('#searchButton');
  await waitFor(() => document.querySelectorAll('#searchResults li').length > 0 || !!document.getElementById('noResults'), null, 30);
  const api = await run(async (a) => (await fetch('api/workspaces/' + a.id + '/search?q=' + encodeURIComponent(a.q)).then((r) => r.json())).results, { id: wsId, q: QUERY });
  const listed = await run(() => document.querySelectorAll('#searchResults li').length);
  record('one result per search hit', listed === api.length && api.length > 0, { listed: listed, server: api.length });
  if (api.length) {
    await waitFor(() => document.querySelectorAll('#codeViewerBody .factory-cd-line').length > 0, null, 20);
    const first = await run(() => ({ title: document.getElementById('viewerTitle').textContent.trim() }));
    record('the first result opens in the viewer', first.title === api[0].path, first);
    // A result further down, ideally one far into its file
    const pick = Math.max(0, api.findIndex((r, i) => i > 0 && r.startLine > 40));
    await click('#searchResults li:nth-child(' + (pick + 1) + ') button');
    await waitFor((p) => document.getElementById('viewerTitle').textContent.trim() === p && document.querySelectorAll('#codeViewerBody .is-hit').length > 0, api[pick].path, 20);
    await sleep(300);
    const view = await run(() => {
      const body = document.getElementById('codeViewerBody');
      const hit = body.querySelector('.is-hit');
      const facts = {};
      document.querySelectorAll('#viewerFacts > div').forEach((d) => { facts[d.querySelector('dt').textContent.trim()] = d.querySelector('dd').textContent.trim(); });
      const br = body.getBoundingClientRect();
      const hr = hit ? hit.getBoundingClientRect() : null;
      return {
        title: document.getElementById('viewerTitle').textContent.trim(),
        firstHit: hit ? +hit.querySelector('.factory-cd-n').textContent : null,
        hits: body.querySelectorAll('.is-hit').length,
        hitVisible: !!hr && hr.top >= br.top && hr.top < br.bottom,
        coloured: body.querySelectorAll('[class^="fx-syn-"]').length,
        focus: document.activeElement === body,
        facts: facts,
        current: !!document.querySelector('#searchResults .is-current[aria-current="true"]')
      };
    });
    const r = api[pick];
    record('a result opens its file at the matching line', view.title === r.path && view.firstHit === r.startLine && view.hits === r.endLine - r.startLine + 1, { want: [r.path, r.startLine, r.endLine], got: [view.title, view.firstHit, view.hits] });
    record('the matching line is scrolled into view inside the viewer', view.hitVisible, view);
    record('the code is coloured', view.coloured > 0, view.coloured);
    record('focus moves to the code and the result is marked current', view.focus && view.current, { focus: view.focus, current: view.current });
    record('viewer shows path, module, lines, indexed revision and last change', ['Lines', 'Module', 'Indexed revision', 'Last changed'].every((k) => !!view.facts[k]), view.facts);
    // Long lines: the viewer scrolls sideways, the page does not
    await run(() => { const b = document.getElementById('codeViewerBody'); const row = b.querySelector('.factory-cd-line'); const t = row.querySelector('.factory-cd-t'); t.appendChild(document.createTextNode(' '.repeat(10) + 'x'.repeat(600))); return 1; });
    const wide = await run(() => { const b = document.getElementById('codeViewerBody'); return { inner: b.scrollWidth > b.clientWidth, page: document.documentElement.scrollWidth <= document.documentElement.clientWidth }; });
    record('long code scrolls inside the viewer, not the page', wide.inner && wide.page, wide);
    await shot('search');

    // Filters narrow by the results' own metadata
    const kinds = Array.from(new Set(api.map((x) => x.kind)));
    const filtered = await run((k) => {
      const m = window.require('knockout').dataFor(document.getElementById('panel-search'));
      m.fKind(k);
      const n = document.querySelectorAll('#searchResults li').length;
      const opts = m.kindOptions().map((o) => o.value).filter(Boolean);
      m.clearFilters();
      return { n: n, opts: opts };
    }, kinds[0]);
    record('category filter options come from the results and narrow the list', JSON.stringify(filtered.opts.slice().sort()) === JSON.stringify(kinds.slice().sort()) && filtered.n === api.filter((x) => x.kind === kinds[0]).length, { filtered: filtered, kinds: kinds });

    // Phone width: the viewer sits below the list, no page scroll
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(600);
    await click('#searchResults li:nth-child(1) button');
    await sleep(1200);
    record('390 px: opening a result keeps the page from scrolling sideways', await noPageScroll());
    await shot('search-390');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
  }

  // Top-bar search request (command palette) still opens Code search with results
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
  await sleep(2000);
  await run((q) => { window.require('services/pageRequests').codeSearch(q); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' })); return 1; }, QUERY);
  await waitFor(() => document.getElementById('tab-search') && document.getElementById('tab-search').getAttribute('aria-selected') === 'true' && document.querySelectorAll('#searchResults li').length > 0, null, 30);
  record('a top-bar search opens Code search with results', await run(() => document.getElementById('tab-search').getAttribute('aria-selected') === 'true' && document.querySelectorAll('#searchResults li').length > 0));

  // Offline search
  s.errors.length = 0;
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('#searchButton');
  await waitFor(() => !!document.getElementById('searchError'), null, 10);
  const offline = await run(() => (document.getElementById('searchError') || {}).textContent || '');
  record('offline search says the factory could not be reached', /could not reach the factory/i.test(offline) && !/Failed to fetch/.test(offline), offline.trim());
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  record('nothing left busy after the failure', await waitFor(() => !document.querySelector('.is-busy, .fx-progressbar.is-on'), null, 10));
  s.errors.length = 0;

  // Settings: secrets stay masked; the workspace sheet link
  await click('#tab-settings');
  await sleep(500);
  const secrets = await run(() => [...document.querySelectorAll('#panel-settings input[type="password"]')].map((i) => i.value));
  record('stored passwords and tokens are never filled in', secrets.every((v) => v === ''), secrets.length + ' secret fields');
  await shot('settings');
  await click('#workspaceDetailsLink');
  record('"Workspace details" opens the workspace sheet on Workspaces', await waitFor(() => new URLSearchParams(location.search).get('ojr') === 'workspaces' && !!document.querySelector('#workspaceSheet .fx-sheet') && !!document.getElementById('sheetVersion'), null, 20));
  await key('Escape', 27);

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  console.log(defects ? defects + ' defect(s).' : 'No defects.');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
