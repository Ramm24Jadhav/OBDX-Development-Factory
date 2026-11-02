// Version Packs check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - each pack names its OBDX version, status, UI targets, Java level and rules by source, and the table fits its card;
//  - rules show in groups by source (version pack, bank standards, UI target), each with its source file, severity,
//    enforcement, approval state and evidence;
//  - recipes say which OBDX versions they apply to; components say what they apply to;
//  - History and impact lists the workspaces on the version and says a pack change is not applied by itself;
//  - tabs work with the arrow keys; nothing scrolls sideways at 390 px; no console errors. It only reads.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-packs.js --url http://localhost:8080 [--workspace <id>]
//
// Exit code 1 on a defect.
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
  const tab = async (name) => { await run((t) => { document.getElementById('pk-' + t).click(); return 1; }, name); await sleep(1000); };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) {
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace);
  }
  await open(BASE + '/?ojr=packs');
  await sleep(6000);

  const table = await run(() => {
    const t = document.getElementById('packTable');
    const card = t.closest('.fx-card');
    return {
      heads: [...t.querySelectorAll('thead th')].map((x) => x.textContent.trim()),
      rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((d) => d.textContent.trim())),
      spill: Math.round(t.getBoundingClientRect().right - card.getBoundingClientRect().right),
      h1: (document.querySelector('.factory-pk h1') || {}).className || ''
    };
  });
  record('the pack table names version, status, UI targets, rules, Java and compatibility',
    ['Version', 'Status', 'UI targets', 'Rules', 'Java', 'Compatibility'].every((h) => table.heads.indexOf(h) >= 0), table.heads);
  record('every pack names its UI targets', table.rows.every((r) => r.some((c) => /OBDX JET UI/.test(c))), table.rows.map((r) => r[3]));
  record('the pack table fits its card', table.spill <= 0, table.spill);
  record('the h1 is only for screen readers', /fx-visually-hidden/.test(table.h1));

  // Tabs by keyboard
  await run(() => { document.getElementById('pk-packs').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(800);
  record('ArrowRight moves to Rules & Standards', await run(() => document.activeElement && document.activeElement.id === 'pk-standards'));

  // Rules by source
  await tab('standards');
  const rules = await run(() => ({
    groups: [...document.querySelectorAll('.factory-pk-rulegroup')].map((g) => ({ id: g.id, rows: g.querySelectorAll('tbody tr').length })),
    heads: [...document.querySelectorAll('.factory-pk-rules thead th')].slice(0, 8).map((x) => x.textContent.trim()),
    filled: [...document.querySelectorAll('.factory-pk-rules tbody tr')].every((tr) => [...tr.querySelectorAll('td')].slice(2).every((td) => td.textContent.trim().length > 0))
  }));
  record('rules show in three groups by source', rules.groups.map((g) => g.id).join(',') === 'rules-VERSION_PACK,rules-BANK,rules-TARGET', rules.groups);
  record('each rule shows source, severity, enforcement, approval and evidence',
    ['Source', 'Severity', 'Enforcement', 'Approval', 'Evidence'].every((h) => rules.heads.indexOf(h) >= 0) && rules.filled, rules.heads);

  // Templates and components say what they apply to
  await tab('templates');
  const recipe = await run(() => (document.getElementById('recipeFacts') || {}).textContent || '');
  record('a recipe says which OBDX versions it applies to', /Applies to\s*OBDX/.test(recipe), recipe.replace(/\s+/g, ' ').slice(0, 120));
  await tab('components');
  const comp = await run(() => (document.getElementById('componentDetail') || {}).textContent || '');
  record('a component says what it applies to', !comp || /Applies to/.test(comp), comp.replace(/\s+/g, ' ').slice(0, 120));

  // History and impact
  await tab('history');
  await sleep(1500);
  const hist = await run(() => ({
    note: !!document.querySelector('.factory-pk-silent'),
    workspaces: document.querySelectorAll('#packImpact > li').length,
    loading: [...document.querySelectorAll('#packImpact > li')].some((li) => /Loading/.test(li.textContent))
  }));
  record('History and impact says a pack change is not applied by itself', hist.note);
  record('the workspaces on the version are listed with their open changes', hist.workspaces > 0 && !hist.loading, hist);

  // Phone
  await tab('packs');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Version Packs: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
