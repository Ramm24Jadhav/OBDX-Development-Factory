// Impact Analysis check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the change and its plan's status come first, with what approval unblocks, before one row of tabs (arrow keys);
//  - the affected-file table has its six columns, and a layer chip filters it;
//  - in Dependencies a file focuses the view, the legend hides a layer, and Show all brings everything back;
//  - the risks are grouped; at 390 px the change's title wraps between words only.
// With --write yes it also, on a plan that waits for approval: adds a comment, requests changes (the plan stays
// unapproved and code generation is refused), analyzes again and compares the two revisions. It never approves.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-impact.js --url http://localhost:8080 [--workspace <id>] [--write yes]
//
// Exit code 1 on a defect.
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const WRITE = args.write === 'yes';

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const key = async (k, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: vk });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk });
    await sleep(250);
  };
  const tab = async (name) => { await run((t) => { document.getElementById('im-' + t).click(); return 1; }, name); await sleep(900); };
  const call = (method, path, body) => run((o) => new Promise((resolve) => window.require(['services/api'], (api) => {
    (o.method === 'get' ? api.get(o.path) : api[o.method](o.path, o.body)).then((r) => resolve({ ok: true, r: r })).catch((e) => resolve({ ok: false, e: e.message }));
  })), { method: method, path: path, body: body });

  // A page load starts the app afresh, which selects the default workspace: --workspace is selected again after each
  const openPage = async (url) => {
    await open(url);
    if (args.workspace) {
      await sleep(1500);
      await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
    }
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await openPage(BASE + '/?ojr=impact');
  await sleep(4500);
  const top = await run(() => {
    const summary = document.getElementById('planSummary');
    const tabs = document.querySelector('.factory-im-tabs');
    return {
      h1: (document.querySelector('.factory-im h1') || {}).className || '',
      summaryFirst: !!summary && !!tabs && (summary.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
      gate: (document.getElementById('planGate') || {}).textContent || '',
      status: ((document.getElementById('impactStatus') || {}).textContent || '').trim(),
      tabs: [...document.querySelectorAll('.factory-im-tabs [role=tab]')].length
    };
  });
  if (!top.status) {
    record('a change with a plan is shown', false, 'no change in this workspace');
    s.close();
    process.exit(1);
  }
  record('the h1 is only for screen readers (the breadcrumb names the page)', /fx-visually-hidden/.test(top.h1), top.h1);
  record('the change and its plan status come before the tabs', top.summaryFirst);
  record('the status line says what approval unblocks', /blocked until the plan is approved|Plan approved/.test(top.gate), top.gate.trim());
  record('one row of six tabs', top.tabs === 6, top.tabs);

  await run(() => { document.getElementById('im-files').focus(); return 1; });
  await key('ArrowRight', 39);
  record('ArrowRight moves to the next tab', await run(() => document.activeElement && document.activeElement.id === 'im-graph'
    && document.activeElement.getAttribute('aria-selected') === 'true'));
  await tab('files');
  const table = await run(() => ({
    heads: [...document.querySelectorAll('#affectedFiles thead th')].map((t) => t.textContent.trim()),
    rows: document.querySelectorAll('#affectedFiles tbody tr').length,
    chips: [...document.querySelectorAll('.factory-im-scopechip')].map((c) => c.textContent.trim())
  }));
  record('the file table has path, operation, module, reason, requirement and evidence', table.heads.join('|') === 'File path|Operation|Module|Reason|Requirement|Evidence', table.heads);
  if (table.chips.length > 2) {
    await run(() => { document.querySelectorAll('.factory-im-scopechip')[1].click(); return 1; });
    await sleep(500);
    const filtered = await run(() => ({ rows: document.querySelectorAll('#affectedFiles tbody tr').length, pressed: document.querySelectorAll('.factory-im-scopechip')[1].getAttribute('aria-pressed') }));
    record('a layer chip filters the table', filtered.rows < table.rows && filtered.pressed === 'true', { before: table.rows, after: filtered.rows, chip: table.chips[1] });
    await run(() => { document.querySelectorAll('.factory-im-scopechip')[0].click(); return 1; });
  }

  await tab('graph');
  const graph0 = await run(() => document.querySelectorAll('#dependencyGraph .factory-im-node').length);
  await run(() => { document.querySelector('#dependencyGraph .factory-im-node').click(); return 1; });
  await sleep(600);
  const focused = await run(() => ({ n: document.querySelectorAll('#dependencyGraph .factory-im-node').length, pressed: !!document.querySelector('#dependencyGraph [aria-pressed=true]'), all: !!document.getElementById('graphShowAll') }));
  record('a file focuses the view', focused.pressed && focused.n <= graph0 && focused.all, { before: graph0, after: focused.n });
  await run(() => { document.getElementById('graphShowAll').click(); return 1; });
  await sleep(400);
  await run(() => { const b = [...document.querySelectorAll('.factory-im-legendbtn')].find((x) => !x.disabled); b.click(); return 1; });
  await sleep(500);
  const hidden = await run(() => ({ n: document.querySelectorAll('#dependencyGraph .factory-im-node').length, off: document.querySelectorAll('.factory-im-legendbtn[aria-pressed=false]').length }));
  record('the legend hides a layer', hidden.off === 1 && hidden.n < graph0, { before: graph0, after: hidden.n });
  await run(() => { document.getElementById('graphShowAll').click(); return 1; });
  await sleep(400);
  record('Show all brings every file back', await run(() => document.querySelectorAll('#dependencyGraph .factory-im-node').length) === graph0);

  await tab('risks');
  const risks = await run(() => [...document.querySelectorAll('#riskFindings .factory-im-riskgroup h3')].map((h) => h.textContent.trim()));
  record('risks are grouped by what the analysis checks', risks.length > 0 || await run(() => /found no risks/.test(document.getElementById('riskFindings').textContent)), risks);

  if (WRITE) {
    const id = await run(() => document.getElementById('impactChange').value);
    const before = (await call('get', 'changes/' + id)).r;
    if (before.status === 'PLAN_READY') {
      await tab('review');
      await run(() => new Promise((r) => window.require(['knockout'], (ko) => { ko.dataFor(document.getElementById('planReview')).commentText('Check the IFSC rule with the business.'); r(1); })));
      await run(() => { document.getElementById('addPlanComment').click(); return 1; });
      await sleep(1500);
      await run(() => new Promise((r) => window.require(['knockout'], (ko) => { ko.dataFor(document.getElementById('planReview')).commentText('Add a test for the IFSC rules before approval.'); r(1); })));
      await run(() => { document.getElementById('requestChangesButton').click(); return 1; });
      await sleep(800);
      await run(() => { const b = document.querySelector('.fx-dialog .fx-btn--danger'); if (b) { b.click(); } return 1; });
      await sleep(1800);
      const after = await run(() => ({ request: ((document.getElementById('openRequest') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
        events: [...document.querySelectorAll('#reviewTimeline .factory-im-eventkind')].map((e) => e.textContent.trim()) }));
      record('Request Changes is recorded and shown above the plan', /Changes requested by/.test(after.request) && after.events.indexOf('Changes requested') >= 0, after);
      const still = (await call('get', 'changes/' + id)).r;
      record('the plan stays unapproved after the request', still.status === 'PLAN_READY' && !still.planApprovedAt, still.status);
      const gen = await call('post', 'changes/' + id + '/continue', {});
      record('code generation is refused while the plan is not approved', !gen.ok, gen.e || 'accepted');
      const n = (await call('get', 'changes/' + id + '/plan-review')).r.revisions.length;
      await run(() => { document.getElementById('analyzeAgainButton').click(); return 1; });
      for (let i = 0; i < 30; i++) {
        await sleep(2000);
        const c = (await call('get', 'changes/' + id)).r;
        if (c.status !== 'ANALYZING') { break; }
      }
      await openPage(BASE + '/?ojr=impact');
      await sleep(4500);
      await tab('revisions');
      const diff = await run(() => ({ note: (document.querySelector('#revisionCompare [role=status]') || {}).textContent || '',
        items: [...document.querySelectorAll('.factory-im-difflist li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) }));
      const n2 = (await call('get', 'changes/' + id + '/plan-review')).r.revisions.length;
      record('analyzing again adds a revision, compared in plain words', n2 > n && diff.items.length > 0 && !/Same/.test(diff.items[0]), { revisions: n2, first: diff.items.slice(0, 3) });
      record('the new revision closes the request for changes', await run(() => !document.getElementById('openRequest')));
    } else {
      record('write checks skipped: the plan is not waiting for approval', true, before.status);
    }
  }

  // Phone: the title wraps between words, not inside one
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await openPage(BASE + '/?ojr=impact');
  await sleep(4500);
  const phone = await run(() => {
    const title = document.getElementById('impactChangeTitle');
    if (!title) { return null; }
    // Every word's characters sit on one line: a word split over two lines would have two different tops
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    let split = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const re = /\S+/g;
      let m;
      while ((m = re.exec(node.textContent))) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        if (range.getClientRects().length > 1) { split.push(m[0]); }
      }
    }
    return { width: Math.round(title.getBoundingClientRect().width), split: split, scroll: document.documentElement.scrollWidth };
  });
  record('at 390 px the title breaks between words only', !!phone && phone.split.length === 0 && phone.width > 250, phone);
  record('no sideways scroll at 390 px', !!phone && phone.scroll <= 390, phone && phone.scroll);

  const errors = s.errors.filter((e) => !/auth\/me|continue/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Impact Analysis: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
