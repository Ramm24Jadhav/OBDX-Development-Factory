// Workspaces page check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the list shows one row per workspace with its version, source, indexed revision, code state, SVN and Jenkins
//    health (the same results as Integrations) and last activity; filter chips with counts narrow it; the ⋯ menu
//    offers the workspace's pages and does not open the sheet;
//  - a row opens the workspace's details in a side sheet (at a glance, version evidence and confidence, connections,
//    members), and Escape closes it with focus back on the row;
//  - New workspace shows one step per screen with "Step n of 5" on top;
//  - Test the connection answers with the latest revision (it only reads SVN);
//  - Delete asks first and names what goes with the workspace (the check always cancels);
//  - New workspace shows the steps; Home's "Connect a code base" opens it; a source that cannot be read says so;
//  - with the factory unreachable the page says so and Try again recovers.
// With --svn <url> it also checks that URL (read only) and shows the details to confirm. With --create 1 as well, it
// creates a workspace from it, follows the import stages until the server reports them done, updates the code once,
// then deletes that workspace again: use it only on a factory whose data is a copy (imports only read SVN).
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-workspaces.js --url http://localhost:8080
//
// Options: --out <folder for screenshots>  --svn <url>  --create 1. Exit code 1 on a defect.
const fs = require('fs');
const path = require('path');
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const OUT = args.out ? path.resolve(args.out) : null;

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
  const text = (sel) => run((q) => { const e = document.querySelector(q); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  const waitFor = async (fn, arg, tries) => { for (let i = 0; i < (tries || 20); i++) { if (await run(fn, arg)) { return true; } await sleep(500); } return false; };
  const goWorkspaces = async () => {
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'workspaces' })); window.scrollTo(0, 0); return 1; });
    await sleep(3000);
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=workspaces');
  await sleep(2500);

  // The list against the server's own list
  const list = await run(() => new Promise((resolve) => window.require(['services/dashboard'], (d) => resolve({
    expected: d.data().map((e) => ({ name: e.workspace.name, revision: e.workspace.indexedRevision })),
    rows: [...document.querySelectorAll('#workspaceTable tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())),
    head: [...document.querySelectorAll('#workspaceTable thead th')].map((th) => th.textContent.trim())
  }))));
  record('one row per workspace', list.rows.length === list.expected.length && list.expected.length > 0, { rows: list.rows.length, workspaces: list.expected.length });
  record('columns: workspace, version, code, SVN, Jenkins, last activity, actions',
    JSON.stringify(list.head) === JSON.stringify(['Workspace', 'OBDX version', 'Code', 'SVN', 'Jenkins', 'Last activity', 'Actions']), list.head);
  record('indexed revision matches the server', list.expected.every((w) => list.rows.some((r) => r[0].indexOf(w.name) === 0 && r[2].indexOf(w.revision === null ? 'Not indexed' : 'r' + w.revision) >= 0)), list.rows.map((r) => r[2]));
  record('every row has a code state and a last activity', list.rows.every((r) => r[2] && r[5]), list.rows.map((r) => [r[2], r[5]]));
  record('the source sits under the name in mono', await run(() => [...document.querySelectorAll('#workspaceTable tbody tr')].every((tr) => !!tr.querySelector('.factory-wsp-mono'))));

  // Filter chips with counts (All, then each status some workspace has) and that they filter
  const chips = await run(() => new Promise((resolve) => window.require(['services/dashboard'], (d) => resolve({
    chips: [...document.querySelectorAll('#statusFilters .fx-chip')].map((c) => ({ id: c.id, n: +(c.textContent.trim().match(/(\d+)$/) || [0, 0])[1] })),
    total: d.data().length
  }))));
  record('filter chips: All counts every workspace, the others add up to it', chips.chips.length > 0 && chips.chips[0].n === chips.total
    && chips.chips.slice(1).reduce((a, c) => a + c.n, 0) === chips.total, chips);
  if (chips.chips.length > 1) {
    const one = chips.chips[1];
    await run((id) => { document.getElementById(id).click(); return 1; }, one.id);
    await sleep(300);
    const shown = await run(() => document.querySelectorAll('#workspaceTable tbody tr').length);
    record('a status chip filters the rows', shown === one.n, { chip: one, rows: shown });
    await run(() => { document.getElementById('wsFilter-all').click(); return 1; });
    await sleep(300);
  }

  // SVN and Jenkins health come from the same results as Integrations (services/connectionHealth)
  await waitFor(() => ![...document.querySelectorAll('#workspaceTable tbody tr')].some((tr) => /Checking\.\.\./.test(tr.textContent)), null, 20);
  const healthRows = await run(() => new Promise((resolve) => window.require(['knockout', 'services/dashboard', 'services/api', 'services/connectionHealth'], (ko, d, api, h) => {
    Promise.all(d.data().map((e) => Promise.all([api.get('workspaces/' + e.workspace.id + '/jenkins').then((j) => j || null).catch(() => undefined),
      api.get('workspaces/' + e.workspace.id + '/integrations/activity').catch(() => undefined)]).then(([j, a]) => {
      const s = h.summary(e, j, a);
      return { name: e.workspace.name, svn: s.svn.pill.text, jenkins: s.jenkins ? s.jenkins.pill.text : 'Not recorded' };
    }))).then((expected) => resolve({
      expected: expected,
      shown: [...document.querySelectorAll('#workspaceTable tbody tr')].map((tr) => ({ name: tr.querySelector('.factory-wsp-name').textContent.trim(),
        svn: tr.cells[3].querySelector('.fx-badge').textContent.trim(), jenkins: tr.cells[4].querySelector('.fx-badge').textContent.trim() }))
    }));
  })));
  record('SVN and Jenkins health match the recorded results', healthRows.expected.every((e) => healthRows.shown.some((r) => r.name === e.name && r.svn === e.svn && r.jenkins === e.jenkins)), healthRows);

  // The ⋯ menu: its items, and opening it does not open the sheet
  const menuId = await run(() => (document.querySelector('#workspaceTable tbody tr fx-menu-button') || {}).id || null);
  if (menuId) {
    await click('#' + menuId + ' button');
    await sleep(500);
    const menu = await run(() => ({ items: [...document.querySelectorAll('.fx-menu [role^="menuitem"]')].map((e) => e.textContent.trim()), sheet: !!document.querySelector('#workspaceSheet .fx-sheet') }));
    record('the ⋯ menu offers details, code, facts, update and settings', ['Details', 'Open the code', 'Codebase facts', 'Code settings (SVN, Jenkins)', 'Integrations'].every((x) => menu.items.indexOf(x) >= 0)
      && menu.items.some((x) => /^(Update|Import) code$/.test(x)), menu.items);
    record('opening the ⋯ menu does not open the sheet', !menu.sheet);
    await key('Escape', 27);
    await sleep(300);
  }
  record('no tiles, KPI cards or second registry screen', await run(() => !document.querySelector('.factory-ws-tile, .factory-kpi, #registryKpis, #openRegistry')));
  const loadErrors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors on load', loadErrors.length === 0, loadErrors.slice(0, 3));
  await shot('list');

  // The details sheet
  await click('#workspaceTable tbody tr');
  const sheetOpened = await waitFor(() => !!document.querySelector('#workspaceSheet .fx-sheet') && !!document.querySelector('#sheetVersion'));
  record('a row opens the details sheet', sheetOpened);
  await waitFor(() => /confidence|No OBDX version found|No codebase facts/.test((document.querySelector('#sheetVersion') || {}).textContent || ''));
  const version = await text('#sheetVersion');
  record('the sheet shows the detected version with its confidence', /confidence|No OBDX version found|No codebase facts/.test(version || ''), version);
  record('version evidence can be opened', await run(() => !!document.querySelector('#sheetEvidence summary') || !/confidence/.test(document.querySelector('#sheetVersion').textContent)));
  record('the password stays masked', await run(() => !/password:/i.test(document.querySelector('#workspaceSheet').textContent) && /Saved|Not saved/.test(document.querySelector('#workspaceSheet').textContent)));
  const parts = await run(() => ({
    glance: [...document.querySelectorAll('#sheetGlance .factory-wsp-glance-k')].map((e) => e.textContent.trim()),
    sections: [...document.querySelectorAll('#workspaceSheet .factory-wsp-part h3')].map((e) => e.textContent.trim()),
    svn: !!document.querySelector('#sheetSvn .fx-badge'), jenkins: !!document.querySelector('#sheetJenkins .fx-badge'),
    jenkinsLink: (document.getElementById('jenkinsSettingsLink') || {}).textContent || ''
  }));
  record('the sheet opens on code, SVN and Jenkins at a glance', JSON.stringify(parts.glance) === JSON.stringify(['Code', 'SVN', 'Jenkins']), parts.glance);
  record('the sheet\'s sections: code and index, version, connections, members', ['Code and index', 'OBDX version', 'Connections', 'Members'].every((x) => parts.sections.indexOf(x) >= 0), parts.sections);
  record('connections show SVN and Jenkins health with where to change them', parts.svn && parts.jenkins && /Code › Settings/.test(parts.jenkinsLink), parts);
  await shot('sheet');
  if (await run(() => !!document.getElementById('testConnectionButton'))) {
    await click('#testConnectionButton');
    await waitFor(() => !!document.getElementById('svnTestResult'), null, 30);
    const result = await text('#svnTestResult');
    record('Test the connection gives the latest revision', /latest revision is r\d+/.test(result || ''), result);
  }

  // Delete asks first and lists what depends on the workspace (cancelled)
  if (await run(() => !!document.getElementById('deleteWorkspaceButton'))) {
    await click('#deleteWorkspaceButton');
    await waitFor(() => !!document.querySelector('.fx-dialog'));
    const message = await text('.fx-dialog-body');
    record('delete asks first and names the dependents', /requirement.*screen design.*change.*indexed file.*SVN repository is not changed/.test(message || ''), message);
    await sleep(400);
    record('the dialog shows above the sheet', await run(() => { const b = document.querySelector('.fx-dialog').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && !!e.closest('.fx-dialog'); }));
    await shot('delete-dialog');
    await click('.fx-dialog-actions .fx-btn--secondary');
    await sleep(500);
    record('cancel keeps the workspace', await run(() => !document.querySelector('.fx-dialog') && !!document.querySelector('#workspaceSheet .fx-sheet')));
  }
  await key('Escape', 27);
  await sleep(500);
  record('Escape closes the sheet and focus returns to the row', await run(() => !document.querySelector('#workspaceSheet .fx-sheet') && !!document.activeElement && document.activeElement.tagName === 'TR'));

  // Keyboard: Enter on a focused row opens it
  await run(() => { document.querySelector('#workspaceTable tbody tr').focus(); return 1; });
  await key('Enter', 13);
  record('Enter on a row opens its details', await waitFor(() => !!document.querySelector('#workspaceSheet .fx-sheet')));
  await key('Escape', 27);
  await sleep(400);

  // New workspace
  await click('#newWorkspaceButton');
  await waitFor(() => !!document.getElementById('createWorkspaceCard'));
  const steps = await run(() => [...document.querySelectorAll('#createSteps li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
  record('New workspace shows the five steps', steps.length === 5, steps);
  const wiz = await run(() => ({ stepOf: (document.getElementById('createStepOf') || {}).textContent || '', title: (document.getElementById('createTitle') || {}).textContent || '',
    list: !!document.getElementById('workspaceTable'), current: document.querySelectorAll('#createSteps li[aria-current="step"]').length }));
  record('one step per screen: "Step 1 of 5" and its title on top, the list out of the way', /Step 1 of 5/.test(wiz.stepOf) && !!wiz.title.trim() && !wiz.list && wiz.current === 1, wiz);
  record('the source field has focus', await waitFor(() => !!document.activeElement && !!document.activeElement.closest('#folderPath, #svnUrl'), null, 6));
  await shot('create-source');
  // A source that cannot be read says what to do
  await run(() => { const b = document.getElementById('source-url'); if (b) { b.click(); } return 1; });
  await sleep(300);
  await run(() => { const i = document.querySelector('#svnUrl input'); i.value = 'svn://localhost:1/none'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; });
  await click('#checkSourceButton');
  await waitFor(() => !!document.getElementById('checkError'), null, 40);
  const checkError = await text('#checkError');
  record('a source that cannot be read shows the error and Check again', !!checkError && /Check again/.test(await text('#checkSourceButton')), checkError);
  s.errors.length = 0;

  if (args.svn) {
    await run((url) => { const i = document.querySelector('#svnUrl input'); i.value = url; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; }, args.svn);
    await click('#checkSourceButton');
    await waitFor(() => !!document.getElementById('detailsStage'), null, 60);
    const note = await text('#versionNote');
    record('the check leads to the details with the version evidence', !!note && /OBDX/.test(note), note);
    record('the details step is current', /Confirm details/.test(await text('#createSteps li[aria-current="step"]') || ''));
    await run(() => { const d = document.getElementById('suggestions'); if (d) { d.open = true; } return 1; });
    await shot('create-details');

    if (args.create === '1') {
      await run(() => { const i = document.querySelector('#name input'); i.value = 'qa-check-' + Date.now().toString(36); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; });
      await click('#createButton');
      await waitFor(() => !!document.getElementById('runSteps'), null, 20);
      await sleep(1500);
      await shot('create-running');
      const states = [];
      let done = false;
      for (let i = 0; i < 240 && !done; i++) {
        await sleep(1000);
        const st = await run(() => [...document.querySelectorAll('#runSteps > li')].map((li) => li.getAttribute('data-step') + ':' + li.querySelector('.fx-timeline-time').textContent.trim()).join(' '));
        if (states[states.length - 1] !== st) { states.push(st); }
        done = /profile:(Done|Failed)/.test(st) || /:Failed/.test(st);
      }
      record('the import stages run in order and end done', /create:Done.*start:Done.*checkout:Done.*index:Done.*profile:Done/.test(states[states.length - 1] || ''), states);
      record('no stage was done before the server said so', !states.some((x) => /index:Done/.test(x) && !/checkout:Done/.test(x)));
      await waitFor(() => !!document.getElementById('profileReview') && !/Reading/.test(document.getElementById('profileReview').textContent), null, 20);
      record('the detected codebase facts show after the import', /The code shows/.test(await text('#profileReview') || ''), await text('#profileReview'));
      await shot('create-done');
      const created = await run(() => window.require('services/workspaceSelection').selectedId());
      await click('#closeCreateButton');
      await sleep(800);

      // Update code (incremental), then delete the workspace this check made
      const row = await run((id) => new Promise((resolve) => window.require(['services/dashboard'], (d) => {
        const i = d.data().findIndex((e) => e.workspace.id === id);
        const tr = document.querySelectorAll('#workspaceTable tbody tr');
        const name = d.data()[i].workspace.name;
        const index = [...tr].findIndex((t) => t.cells[0].textContent.indexOf(name) >= 0);
        resolve(index);
      })), created);
      await click('#workspaceTable tbody tr:nth-child(' + (row + 1) + ')');
      await waitFor(() => !!document.getElementById('updateCodeButton'));
      const help = await text('#workspaceSheet');
      record('Update code says it is incremental', /since r\d+ and indexes again only the files whose content changed/.test(help || ''));
      await click('#updateCodeButton');
      const finished = await waitFor(() => /Last import/.test((document.getElementById('sheetJob') || {}).textContent || '') && /Indexed revision/.test(document.getElementById('workspaceSheet').textContent), null, 120);
      await sleep(4000);
      const msg = await text('#sheetJobMessage');
      record('the update ends and reports what changed', finished && /changed file/.test(msg || ''), msg);
      await click('#deleteWorkspaceButton');
      await waitFor(() => !!document.querySelector('.fx-dialog'));
      await click('.fx-dialog-actions .fx-btn--danger');
      await sleep(3000);
      record('the check workspace was deleted', await run((id) => new Promise((resolve) => window.require(['services/dashboard'], (d) => resolve(!d.data().some((e) => e.workspace.id === id)))), created));
    }
  }
  await run(() => { const b = document.getElementById('closeCreateButton'); if (b) { b.click(); } return 1; });
  await sleep(500);

  // Home's "Connect a code base" opens the steps here
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'overview' })); return 1; });
  await sleep(3500);
  if (await click('#connectCodeBase')) {
    await sleep(3500);
    record('Home "Connect a code base" opens New workspace', await run(() => new URLSearchParams(location.search).get('ojr') === 'workspaces' && !!document.getElementById('createWorkspaceCard')));
  }
  await goWorkspaces();

  // Offline: the error says what to do; Try again recovers
  s.errors.length = 0;
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await run(() => new Promise((r) => window.require(['services/dashboard'], (d) => d.load().then(() => r(1)))));
  await sleep(400);
  const offline = await text('#workspacesError');
  record('offline: the page says it could not load and what to do', !!offline && /try again/i.test(offline), offline);
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('#workspacesError .fx-btn');
  await sleep(3000);
  const after = await run(() => ({ error: !!document.getElementById('workspacesError'), busy: document.querySelectorAll('.is-busy').length }));
  record('Try again recovers with nothing left busy', !after.error && !after.busy, after);

  s.close();
  console.log(defects ? defects + ' defect(s).' : 'No defects.');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
