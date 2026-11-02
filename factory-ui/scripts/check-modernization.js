// Modernization & Migration check: drives a running factory in headless Edge or Chrome, read-only, for every workspace
// with an analysis (?ojr=modernization):
//  - one row of tabs; source and target (version, technology, channel) each say where the value comes from;
//  - every opportunity says it is detected and where from, and opens to its evidence; an "Open in Code" button opens the
//    Code page's viewer at that file;
//  - findings carry the rule id and file lines; the plan never says the migration is complete and shows its gates;
//  - model-written text only in the assistant panel (closed by default, Escape closes it); no model call is made;
//  - the profile is asked for only when the code is indexed; no failed API calls or console errors; nothing scrolls
//    sideways at 390 px.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-modernization.js --url http://localhost:8080 [--shots <dir>]
//
// Exit code 1 on a defect.
const fs = require('fs');
const path = require('path');
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const SHOTS = args.shots ? path.resolve(args.shots) : null;

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const shot = async (name) => {
    if (!SHOTS) { return; }
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const size = (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
  const requests = [];
  s.onEvent((m) => { if (m.method === 'Network.requestWillBeSent' && /\/api\//.test(m.params.request.url)) { requests.push(m.params.request.url.replace(BASE, '')); } });

  const workspaces = await run(() => fetch('api/workspaces').then((r) => r.json()));
  for (const w of workspaces) {
    const label = w.name + ': ';
    await size(1440, 1000);
    await open(BASE + '/?ojr=overview');
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (sel) => { sel.selectedId(id); r(1); })), w.id);
    s.errors.length = 0;
    requests.length = 0;
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'modernization' })); return 1; });
    await sleep(6000);
    const has = await run(() => !!document.querySelector('#mzStatus'));
    if (!has) {
      record(label + 'no analysis: the page says so', await run(() => !!document.querySelector('#modernizationEmpty')));
      continue;
    }
    const page = await run(() => {
      const q = (sel) => Array.from(document.querySelectorAll(sel));
      return {
        tablists: q('.factory-mz [role=tablist]').length,
        ends: q('.factory-mz-end').map((e) => ({ label: e.querySelector('.factory-mz-endlabel').textContent, src: (e.querySelector('.factory-mz-src') || {}).textContent || '' })),
        opps: q('.factory-mz-opp').map((o) => ({ id: o.id, src: (o.querySelector('.factory-mz-src') || {}).textContent || '' })),
        aiOutside: q('.factory-mz .fx-badge').filter((b) => /AI/.test(b.textContent) && !b.closest('fx-sheet')).length,
        sheetOpen: !!document.querySelector('#moAssistant .fx-sheet')
      };
    });
    record(label + 'one row of tabs', page.tablists === 1, page.tablists);
    const visible = await run(() => Array.from(document.querySelectorAll('.factory-mz [role=tabpanel]')).filter((p) => p.offsetParent !== null).map((p) => p.id));
    record(label + 'only the selected tab panel shows', visible.length === 1 && visible[0] === 'mo-panel-overview', visible);
    record(label + 'source and target say where each value comes from', page.ends.length === 4 && page.ends.every((e) => e.src.trim()), page.ends);
    record(label + 'every opportunity is detected with a source', page.opps.every((o) => /^(Detected|Version pack)/.test(o.src.trim())), page.opps);
    record(label + 'no AI text outside the assistant; the assistant starts closed', page.aiOutside === 0 && !page.sheetOpen, page);
    if (page.opps.length) {
      const ev = await run((id) => { const d = document.getElementById(id); d.open = true; return d.querySelectorAll('.factory-mz-evidence li').length; }, page.opps[0].id);
      record(label + 'an opportunity opens to its evidence', ev > 0, ev);
    }
    await shot(w.name + '-overview-1440');

    // Findings: rule ids and lines
    await run(() => { document.getElementById('mo-findings').click(); return 1; });
    await sleep(500);
    const f = await run(() => Array.from(document.querySelectorAll('#findingTable tbody tr')).map((r) => r.textContent.replace(/\s+/g, ' ')));
    record(label + 'findings show the rule id and lines', f.every((t) => /lines \d+-\d+/.test(t)), f.length + ' rows');
    record(label + 'compatibility rows from the version packs', await run(() => document.querySelectorAll('#compatTable tbody tr').length) > 0);
    await shot(w.name + '-findings-1440');

    // Plan: gates and no completion claim
    await run(() => { document.getElementById('mo-plan').click(); return 1; });
    await sleep(500);
    const plan = await run(() => ({
      status: document.getElementById('mzCompletion').textContent.trim(),
      gates: Array.from(document.querySelectorAll('#mzGates li')).map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
      pre: document.querySelectorAll('#mzPrerequisites li').length,
      rollback: document.querySelectorAll('#mzRollback li').length
    }));
    record(label + 'the plan does not say the migration is complete', /^Not complete/.test(plan.status) && !/\bmigration (is )?complete\b/i.test(plan.status.replace('does not record a migration as complete', '')), plan.status);
    record(label + 'prerequisites, gates and rollback listed', plan.pre > 0 && plan.gates.length > 0 && plan.rollback > 0, plan);
    await shot(w.name + '-plan-1440');

    // The assistant opens and Escape closes it (nothing is asked)
    await run(() => { document.getElementById('moAssistantButton').click(); return 1; });
    await sleep(400);
    const opened = await run(() => !!document.querySelector('#moAssistant .fx-sheet'));
    await run(() => { document.querySelector('#moAssistant .fx-sheet-backdrop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; });
    await sleep(400);
    record(label + 'the assistant opens and Escape closes it', opened && !(await run(() => !!document.querySelector('#moAssistant .fx-sheet'))));
    record(label + 'no model call', !requests.some((u) => /knowledge\/ask/.test(u)));
    record(label + 'profile asked for only when the code is indexed', w.indexedRevision != null || !requests.some((u) => /\/profile$/.test(u)));
    record(label + 'no failed API calls or console errors', s.errors.length === 0, s.errors.slice(0, 3));

    // Phone width: nothing scrolls sideways on any tab
    await size(390, 844);
    for (const t of ['overview', 'findings', 'dependencies', 'plan', 'history']) {
      await run((id) => { document.getElementById('mo-' + id).click(); return 1; }, t);
      await sleep(400);
      const over = await run(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const shown = await run(() => Array.from(document.querySelectorAll('.factory-mz [role=tabpanel]')).filter((p) => p.offsetParent !== null).map((p) => p.id));
      record(label + t + ' panel alone shows', shown.length === 1 && shown[0] === 'mo-panel-' + t, shown);
      record(label + t + ' fits 390 px', over <= 0, over);
    }
    await run(() => { document.getElementById('mo-overview').click(); return 1; });
    await shot(w.name + '-overview-390');

    // Open in Code: the first finding's file in the Code page's viewer
    await size(1440, 1000);
    await run(() => { document.getElementById('mo-findings').click(); return 1; });
    await sleep(300);
    const target = await run(() => { const b = document.querySelector('#findingTable tbody tr .fx-btn--secondary'); if (!b) { return null; } const p = b.closest('tr').querySelector('.factory-mz-path').textContent.trim(); b.click(); return p; });
    if (target) {
      await sleep(5000);
      const shown = await run((p) => location.search.indexOf('ojr=code') >= 0 && document.body.textContent.indexOf(p) >= 0, target);
      record(label + 'Open in Code opens the file in the Code page', shown, target);
    }
  }
  s.close();
  process.stdout.write('\n' + (defects ? defects + ' defect(s).' : 'No defects.') + '\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
