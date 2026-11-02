// Project Profile check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - every fact of the server's profile shows once, in one of the eight areas, and areas without facts are left out;
//  - each fact's mark follows the server's status and confidence: Confirmed, Corrected, Not found, Detected (high
//    confidence: declared in a file) or Inferred (medium or low), so an inferred value never shows as verified;
//  - the facts code generation reads are marked, and the missing ones are named at the top;
//  - the scan line shows the server's scan time and revision;
//  - a fact opens from the keyboard and shows the server's evidence files;
//  - the filters narrow the list to one kind of fact; at 390 px an open fact does not scroll the page sideways;
//  - with --write 1 (only against a factory whose data may change): a correction and a reset are saved and show in the
//    correction history read from the audit log, and the fact goes back to how it was.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-profile.js --url http://localhost:8080
//
// Options: --out <folder for screenshots>  --theme light|dark  --write 1. Exit code 1 on a defect.
const fs = require('fs');
const path = require('path');
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const OUT = args.out ? path.resolve(args.out) : null;
const AREAS = ['OBDX framework and version', 'UI technology', 'Backend', 'Database', 'Integrations', 'Dependencies', 'Customisations', 'Bank conventions'];
const GENERATION = ['ui.jetVersion', 'ui.moduleSystem', 'backend.eeNamespace', 'backend.javaVersion', 'conventions.customizationFolders'];
const expectedMark = (f) => ({ confirmed: 'Confirmed', corrected: 'Corrected', missing: 'Not found' })[f.status]
  || (f.confidence === 'HIGH' ? 'Detected' : 'Inferred');

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
  const key = async (k, code) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, windowsVirtualKeyCode: code, code: k });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: code, code: k });
  };
  const waitFor = async (fn, arg, tries) => { for (let i = 0; i < (tries || 20); i++) { if (await run(fn, arg)) { return true; } await sleep(500); } return false; };
  const shown = () => run(() => [...document.querySelectorAll('#factGroups .factory-pp-fact')].map((li) => ({
    key: li.dataset.key, area: li.closest('section').querySelector('h2').textContent.trim(),
    value: li.querySelector('.factory-pp-value').textContent.trim(), mark: li.querySelector('.factory-pp-origin') ? li.querySelector('.factory-pp-origin').textContent.trim() : (li.querySelector('.factory-pp-value.is-missing') ? 'Not found' : ''),
    gen: !!li.querySelector('.factory-pp-gen')
  })));
  const serverProfile = (id) => run((w) => fetch('api/workspaces/' + w + '/profile').then((r) => r.json()), id);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=profile');
  if (args.theme) { await run((t) => new Promise((r) => window.require(['services/preferences'], (p) => { p.theme(t); r(1); })), args.theme); }
  const loaded = await waitFor(() => document.querySelectorAll('#factGroups .factory-pp-fact').length > 0, null, 30);
  record('the profile loads', loaded);
  const wsId = await run(() => window.require('services/workspaceSelection').selectedId());
  let server = await serverProfile(wsId);

  // Areas and facts against the server
  let facts = await shown();
  const areas = await run(() => [...document.querySelectorAll('#factGroups > section h2')].map((h) => h.textContent.trim()));
  record('areas are among the eight, in order, none empty', areas.every((a, i) => AREAS.indexOf(a) >= 0 && (i === 0 || AREAS.indexOf(a) > AREAS.indexOf(areas[i - 1])))
    && await run(() => [...document.querySelectorAll('#factGroups > section')].every((sec) => sec.querySelectorAll('.factory-pp-fact').length > 0)), areas);
  record('every server fact shows once', facts.length === server.facts.length && server.facts.every((f) => facts.filter((x) => x.key === f.key).length === 1),
    { shown: facts.length, server: server.facts.length });
  const wrongMarks = server.facts.filter((f) => { const x = facts.find((y) => y.key === f.key); return !x || x.mark !== expectedMark(f); })
    .map((f) => f.key + ':' + f.status + '/' + f.confidence);
  record('each fact is marked from its status and confidence (inferred never as verified)', wrongMarks.length === 0, wrongMarks);
  record('values match the server', server.facts.every((f) => facts.find((x) => x.key === f.key).value === (f.value || 'Not found')));
  record('the facts code generation reads are marked, and only those', facts.every((x) => x.gen === (GENERATION.indexOf(x.key) >= 0)));
  const missingGen = server.facts.filter((f) => GENERATION.indexOf(f.key) >= 0 && !f.value).map((f) => f.label).sort();
  const alertGen = await run(() => (document.getElementById('generationMissing')
    ? [...document.querySelectorAll('#generationMissing button')].map((b) => b.textContent.trim()) : []));
  record('the missing generation facts are named at the top', JSON.stringify(alertGen.slice().sort()) === JSON.stringify(missingGen), { page: alertGen, server: missingGen });

  // Scan line
  const scan = await run(() => { const o = {}; document.querySelectorAll('#scanFacts > div').forEach((d) => { o[d.querySelector('dt').textContent.trim()] = d.querySelector('dd').textContent.trim(); }); return o; });
  record('scan revision matches the server', scan['Scanned at revision'] === (server.revision === null ? 'Not known' : 'r' + server.revision), scan);
  record('last scan time is shown', !!scan['Last scan']);
  await shot('profile');

  // Open a fact with evidence from the keyboard
  const withEvidence = server.facts.find((f) => f.evidence && f.evidence.length) || server.facts[0];
  const headId = 'fact-' + withEvidence.key.replace(/\W/g, '-');
  await run((id) => { document.getElementById(id).focus(); return 1; }, headId);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(400);
  const opened = await run((id) => {
    const head = document.getElementById(id);
    const body = document.getElementById(head.getAttribute('aria-controls'));
    return { expanded: head.getAttribute('aria-expanded'), visible: body && !body.hidden && body.offsetHeight > 0,
      evidence: body ? [...body.querySelectorAll('.factory-pp-path')].map((e) => e.textContent.trim()) : [] };
  }, headId);
  record('Enter opens a fact', opened.expanded === 'true' && opened.visible, opened);
  record('an open fact lists the server\'s evidence files', JSON.stringify(opened.evidence) === JSON.stringify(withEvidence.evidence || []), opened.evidence);
  await shot('fact-open');

  // Filters
  for (const f of ['inferred', 'missing', 'people']) {
    await run((v) => { document.querySelector('#factFilters [data-filter="' + v + '"]').click(); return 1; }, f);
    await sleep(300);
    const marks = (await shown()).map((x) => x.mark);
    const want = { inferred: ['Inferred'], missing: ['Not found'], people: ['Confirmed', 'Corrected'] }[f];
    const pressed = await run((v) => document.querySelector('#factFilters [data-filter="' + v + '"]').getAttribute('aria-pressed'), f);
    record('filter ' + f + ' shows only those facts', pressed === 'true' && marks.every((m) => want.indexOf(m) >= 0)
      && (marks.length > 0 || await run(() => !!document.getElementById('filterEmpty'))), marks.length + ' shown');
  }
  await run(() => { document.querySelector('#factFilters [data-filter="all"]').click(); return 1; });
  await sleep(300);

  // A correction and a reset, saved and listed in the history (only with --write 1)
  const canEdit = await run((id) => !!document.getElementById(id.replace('fact-', 'factBody-')).querySelector('.factory-pp-edit'), headId);
  if (args.write === '1' && canEdit) {
    const target = server.facts.find((f) => f.status === 'detected' && f.value) || server.facts.find((f) => f.status === 'missing');
    const before = target.status;
    const tid = 'fact-' + target.key.replace(/\W/g, '-');
    await run((id) => { const h = document.getElementById(id); if (h.getAttribute('aria-expanded') !== 'true') { h.click(); } return 1; }, tid);
    await sleep(300);
    await run((id) => {
      const body = document.getElementById(id.replace('fact-', 'factBody-'));
      const input = body.querySelector('fx-input input');
      input.value = 'QA corrected value';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    }, tid);
    await sleep(200);
    await run((id) => { [...document.getElementById(id.replace('fact-', 'factBody-')).querySelectorAll('button')].find((b) => /Save correction/.test(b.textContent)).click(); return 1; }, tid);
    await waitFor((k) => { const li = document.querySelector('.factory-pp-fact[data-key="' + k + '"]'); return li && /Corrected/.test((li.querySelector('.factory-pp-origin') || {}).textContent || ''); }, target.key, 20);
    server = await serverProfile(wsId);
    const saved = server.facts.find((f) => f.key === target.key);
    record('a correction is saved and marked Corrected', saved.status === 'corrected' && saved.value === 'QA corrected value', saved.status + ' ' + saved.value);
    await waitFor((label) => [...document.querySelectorAll('#historyList li')].some((li) => li.textContent.indexOf(label) >= 0 && /QA corrected value/.test(li.textContent)), target.label, 20);
    record('the correction shows in the history', await run((label) => [...document.querySelectorAll('#historyList li')].some((li) => li.textContent.indexOf(label) >= 0 && /QA corrected value/.test(li.textContent)), target.label));
    await shot('fact-corrected');
    await run((id) => { [...document.getElementById(id.replace('fact-', 'factBody-')).querySelectorAll('button')].find((b) => /Reset to detected/.test(b.textContent)).click(); return 1; }, tid);
    await waitFor((k) => { const li = document.querySelector('.factory-pp-fact[data-key="' + k + '"]'); return li && !/Corrected/.test((li.querySelector('.factory-pp-origin') || {}).textContent || ''); }, target.key, 20);
    server = await serverProfile(wsId);
    record('a reset goes back to the detected value', server.facts.find((f) => f.key === target.key).status === before);
    const hist = await run((w) => fetch('api/workspaces/' + w + '/profile/history').then((r) => r.json()), wsId);
    record('the history lists the reset first, then the correction', hist[0] && hist[0].key === target.key && hist[0].action === 'reset' && hist[1].action === 'set', hist.slice(0, 2));
  } else {
    record('corrections offered only to members who manage the code', args.write !== '1' || !canEdit);
  }

  // Phone width with a fact open
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(600);
  await run((id) => { const h = document.getElementById(id); if (h.getAttribute('aria-expanded') !== 'true') { h.click(); } h.scrollIntoView(); return 1; }, headId);
  await sleep(400);
  record('390 px: an open fact does not scroll the page sideways', await run(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await shot('fact-open-390');

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  console.log(defects ? defects + ' defect(s).' : 'No defects.');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
