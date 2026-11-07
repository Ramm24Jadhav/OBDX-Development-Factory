// Impact Analysis check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - one header (the change, a mono line with its IDs, the plan's status, at most one primary action) and one line for
//    what approval unblocks or the one problem, before the answer;
//  - the answer in four cards (size, modules, risks, tests) with the plan's own numbers, before three tabs (arrow keys);
//  - the planned files as compact rows with path, operation, module, reason, requirement and evidence; a layer chip and a
//    module in the Modules card filter them;
//  - By layer: a file focuses the view, the legend hides a layer, and Show all brings everything back;
//  - the risks are grouped; the review has the history and the revisions; the requirement is in a side panel;
//  - at 390 px the change's title wraps between words only, and nothing scrolls sideways.
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
  const vm = (body) => run({ toString: () => '() => new Promise((resolve) => { const ko = window.require("knockout"); const m = ko.dataFor(document.querySelector(".factory-im")); Promise.resolve((' + body + ')(m)).then(resolve); })' });
  const rows = () => run(() => document.querySelectorAll('#affectedFiles > li').length);

  // Opens the page on the newest change that has a plan (the page opens the newest change)
  const openPage = async () => {
    await open(BASE + '/?ojr=impact');
    await s.selectWorkspace(args.workspace);
    await sleep(3500);
    await vm('(m) => new Promise((r) => window.require(["services/api"], (api) => api.get("workspaces/" + m.workspaceId() + "/changes/details").then((l) => { const c = l.find((x) => x.plan); if (c && m.changeId() !== c.id) { m.changeId(c.id); } r(1); })))');
    await sleep(2500);
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await openPage();
  const top = await run(() => {
    const head = document.getElementById('planSummary');
    const cards = document.getElementById('impactCards');
    const tabs = document.querySelector('.factory-im-tabs');
    const after = (a, b) => !!a && !!b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
    return {
      h1: (document.querySelector('.factory-im h1') || {}).className || '',
      order: after(head, cards) && after(cards, tabs),
      ids: ((document.getElementById('impactIds') || {}).textContent || '').trim(),
      gate: ((document.getElementById('planGate') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      gates: document.querySelectorAll('#planSummary #planGate, #planSummary .factory-rqd-problem').length,
      status: ((document.getElementById('impactStatus') || {}).textContent || '').trim(),
      primaries: document.querySelectorAll('#planSummary .factory-rqd-headside .fx-btn--primary').length,
      tabs: [...document.querySelectorAll('.factory-im-tabs [role=tab]')].map((t) => { const c = t.cloneNode(true); c.querySelectorAll('.factory-rqd-cnt').forEach((x) => x.remove()); return c.textContent.trim(); }),
      cards: [...document.querySelectorAll('#impactCards .factory-im-card')].map((c) => ({ label: c.querySelector('.factory-im-cardlabel').textContent.trim(),
        n: Number((c.querySelector('.factory-im-big').textContent.match(/\d+/) || [-1])[0]) }))
    };
  });
  if (!top.status) {
    record('a change with a plan is shown', false, 'no change in this workspace');
    s.close();
    process.exit(1);
  }
  const plan = await vm('(m) => { const p = m.detail().plan; return { items: p.items.length, risks: (p.risks || []).length, tests: p.items.filter((i) => i.layer === "test").length, status: m.detail().status }; }');
  record('the h1 is only for screen readers (the breadcrumb names the page)', /fx-visually-hidden/.test(top.h1), top.h1);
  record('the header, then the answer, then the tabs', top.order);
  record('a mono line names the change and the requirement', /^CHG-\w+ · REQ-\w+/.test(top.ids), top.ids);
  record('one status pill and at most one primary action', !!top.status && top.primaries <= 1, { status: top.status, primaries: top.primaries });
  record('one line says what approval unblocks, or the one problem', top.gates === 1 && /blocked|Plan approved|Changes requested|Failed|missing|running/.test(top.gate), top.gate);
  record('four cards: size, modules, risks, tests', top.cards.map((c) => c.label).join('|') === 'Size|Modules|Risks|Tests', top.cards);
  record('the cards give the plan\'s own numbers', top.cards.length === 4 && top.cards[0].n === plan.items && top.cards[2].n === plan.risks && top.cards[3].n === plan.tests, { cards: top.cards, plan: plan });
  record('three tabs: files, risks and tests, review', top.tabs.join('|') === 'Files|Risks and tests|Review', top.tabs);

  await run(() => { document.getElementById('im-files').focus(); return 1; });
  await key('ArrowRight', 39);
  record('ArrowRight moves to the next tab', await run(() => document.activeElement && document.activeElement.id === 'im-risks'
    && document.activeElement.getAttribute('aria-selected') === 'true'));
  await tab('files');
  await vm('(m) => { m.filePager.size(50); return 1; }');
  await sleep(400);
  const list = await run(() => ({
    rows: [...document.querySelectorAll('#affectedFiles > li')].map((li) => ['path', 'operation', 'module', 'reason', 'requirement', 'evidence'].filter((p) => li.querySelector('[data-part="' + p + '"]')).length),
    chips: [...document.querySelectorAll('.factory-im-layerchip')].map((c) => c.textContent.trim()),
    table: !!document.querySelector('#affectedFiles thead')
  }));
  record('the files are compact rows with path, operation, module, reason, requirement and evidence', list.rows.length === plan.items && !list.table && list.rows.every((n) => n === 6), { rows: list.rows.length, parts: list.rows[0] });
  const layerChips = list.chips.filter((c) => !/^Named in a risk/.test(c));
  if (layerChips.length > 2) {
    await run(() => { document.querySelectorAll('.factory-im-layerchip')[1].click(); return 1; });
    await sleep(500);
    const filtered = await run(() => ({ rows: document.querySelectorAll('#affectedFiles > li').length, pressed: document.querySelectorAll('.factory-im-layerchip')[1].getAttribute('aria-pressed') }));
    record('a layer chip filters the list', filtered.rows < list.rows.length && filtered.pressed === 'true' && String(filtered.rows) === layerChips[1].split(' ').pop(), { before: list.rows.length, after: filtered.rows, chip: layerChips[1] });
    await run(() => { document.querySelectorAll('.factory-im-layerchip')[0].click(); return 1; });
    await sleep(400);
  }
  const mod = await run(() => { const b = document.querySelector('#impactModules .factory-im-modbtn'); if (!b) { return null; } const n = Number(b.querySelector('.factory-im-modn').textContent); b.click(); return n; });
  if (mod) {
    await sleep(500);
    record('a module in the Modules card shows only its files', await rows() === mod, { module: mod, rows: await rows() });
    await run(() => { document.getElementById('clearFiltersButton').click(); return 1; });
    await sleep(400);
    record('Clear filters brings every file back', await rows() === plan.items);
  }

  // By layer
  await run(() => { document.getElementById('impactViewGraph').click(); return 1; });
  await sleep(900);
  const graph0 = await run(() => document.querySelectorAll('#dependencyGraph .factory-im-node').length);
  await run(() => { document.querySelector('#dependencyGraph .factory-im-node').click(); return 1; });
  await sleep(600);
  const focused = await run(() => ({ n: document.querySelectorAll('#dependencyGraph .factory-im-node').length, pressed: !!document.querySelector('#dependencyGraph [aria-pressed=true]'), all: !!document.getElementById('graphShowAll') }));
  record('By layer: a file focuses the view', graph0 > 0 && focused.pressed && focused.n <= graph0 && focused.all, { before: graph0, after: focused.n });
  await run(() => { document.getElementById('graphShowAll').click(); return 1; });
  await sleep(400);
  const layers = await run(() => [...document.querySelectorAll('.factory-im-legendbtn')].filter((x) => !x.disabled).length);
  if (layers > 1) {
    await run(() => { const b = [...document.querySelectorAll('.factory-im-legendbtn')].find((x) => !x.disabled); b.click(); return 1; });
    await sleep(500);
    const hidden = await run(() => ({ n: document.querySelectorAll('#dependencyGraph .factory-im-node').length, off: document.querySelectorAll('.factory-im-legendbtn[aria-pressed=false]').length }));
    record('the legend hides a layer', hidden.off === 1 && hidden.n < graph0, { before: graph0, after: hidden.n });
    await run(() => { document.getElementById('graphShowAll').click(); return 1; });
    await sleep(400);
  }
  record('Show all brings every file back', await run(() => document.querySelectorAll('#dependencyGraph .factory-im-node').length) === graph0);
  await run(() => { document.getElementById('impactViewList').click(); return 1; });

  await tab('risks');
  const risks = await run(() => ({ groups: [...document.querySelectorAll('#riskFindings .factory-im-riskgroup h3')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    none: /found no risks/.test(document.getElementById('riskFindings').textContent), tests: !!document.getElementById('planTests') }));
  record('risks are grouped by what the analysis checks, beside the tests', (risks.groups.length > 0 || risks.none) && risks.tests, risks.groups);
  await tab('review');
  record('the review has the comment box, the revisions and the history', await run(() => !!document.getElementById('planReview') && !!document.getElementById('revisionCompare') && !!document.getElementById('reviewTimeline')));

  await run(() => { document.getElementById('impactRequirementButton').click(); return 1; });
  await sleep(900);
  record('the requirement opens in a side panel with its screens and APIs', await run(() => !!document.querySelector('.fx-sheet #requirementScreens') && !!document.querySelector('.fx-sheet #requirementApis')));
  await run(() => { const b = document.querySelector('.fx-sheet-close'); if (b) { b.click(); } return 1; });
  await sleep(500);

  if (WRITE) {
    const id = await vm('(m) => m.changeId()');
    const before = (await call('get', 'changes/' + id)).r;
    if (before.status === 'PLAN_READY') {
      await tab('review');
      await vm('(m) => { m.commentText("Check the IFSC rule with the business."); return 1; }');
      await run(() => { document.getElementById('addPlanComment').click(); return 1; });
      await sleep(1500);
      await vm('(m) => { m.commentText("Add a test for the IFSC rules before approval."); return 1; }');
      await run(() => { document.getElementById('requestChangesButton').click(); return 1; });
      await sleep(800);
      await run(() => { const b = document.querySelector('.fx-dialog .fx-btn--danger'); if (b) { b.click(); } return 1; });
      await sleep(1800);
      const after = await run(() => ({ request: ((document.getElementById('planGate') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
        events: [...document.querySelectorAll('#reviewTimeline .factory-im-eventkind')].map((e) => e.textContent.trim()) }));
      record('Request changes is recorded and shown as the one problem', /Changes requested by/.test(after.request) && after.events.indexOf('Changes requested') >= 0, after);
      const still = (await call('get', 'changes/' + id)).r;
      record('the plan stays unapproved after the request', still.status === 'PLAN_READY' && !still.planApprovedAt, still.status);
      const gen = await call('post', 'changes/' + id + '/continue', {});
      record('code generation is refused while the plan is not approved', !gen.ok, gen.e || 'accepted');
      const n = (await call('get', 'changes/' + id + '/plan-review')).r.revisions.length;
      await vm('(m) => { m.analyzeAgain(); return 1; }');
      for (let i = 0; i < 30; i++) {
        await sleep(2000);
        const c = (await call('get', 'changes/' + id)).r;
        if (c.status !== 'ANALYZING') { break; }
      }
      await openPage();
      await tab('review');
      const diff = await run(() => ({ items: [...document.querySelectorAll('.factory-im-difflist li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) }));
      const n2 = (await call('get', 'changes/' + id + '/plan-review')).r.revisions.length;
      record('analyzing again adds a revision, compared in plain words', n2 > n && diff.items.length > 0 && !/Same/.test(diff.items[0]), { revisions: n2, first: diff.items.slice(0, 3) });
      record('the new revision closes the request for changes', await run(() => !/Changes requested by/.test((document.getElementById('planGate') || {}).textContent || '')));
    } else {
      record('write checks skipped: the plan is not waiting for approval', true, before.status);
    }
  }

  // Phone: the title wraps between words, not inside one
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await openPage();
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
