// Requirement detail check: drives a running factory in headless Edge or Chrome and checks what the detail promises,
// for every requirement of every workspace:
//  - the parts shown are the ones the spec has something for (no empty part, no "Not set" placeholder);
//  - functional requirements, criteria and rules keep the spec's IDs and exact wording; items not found word for word
//    in the document are the ones marked Drafted;
//  - each criterion links to the requirements it verifies and each requirement to its criteria, and a link opens the
//    other part with that item focused;
//  - History lists every version the server has (GET /api/requirements/{id}/versions) and the approval;
//  - the next step offers Approve only for a ready spec with no open question, and never for an approved one;
//  - with open questions (a spec put into the page, nothing saved) Approve is not offered and "Answer the questions"
//    opens them;
//  - no page-level horizontal scroll at 390 px; no console errors.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-requirement-detail.js --url http://localhost:8080
//
// It never creates, changes or deletes anything. Exit code 1 on a defect.
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
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'reqListTitle\')), a))))' }, arg);
  const click = (sel) => run((q) => { const e = document.querySelector(q); if (e) { e.click(); } return !!e; }, sel);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const workspaces = await run(async () => (await (await fetch('api/workspaces')).json()).map((w) => ({ id: w.id, name: w.name })));
  for (const w of workspaces) {
    await open(BASE + '/?ojr=overview');
    await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (sel) => { sel.selectedId(id); r(1); })), w.id);
    await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'requirements' })); return 1; });
    await sleep(3000);
    const list = await run(async (id) => (await (await fetch('api/workspaces/' + id + '/requirements')).json()).map((r) => r.id), w.id);
    for (const id of list) {
      const d = await run(async (rid) => (await fetch('api/requirements/' + rid)).json(), id);
      const versions = await run(async (rid) => { const r = await fetch('api/requirements/' + rid + '/versions'); return r.ok ? r.json() : null; }, id);
      await vm((m, rid) => m.open(rid), id);
      await sleep(900);
      const label = w.name + ' / ' + d.title;
      if (!d.spec) { record(label + ': no spec, no parts', await run(() => !document.querySelector('.factory-rq-subtabs'))); continue; }
      const sp = d.spec;
      const tabs = await run(() => [...document.querySelectorAll('.factory-rq-subtabs [role="tab"]')].map((t) => t.id.replace('part-', '')));
      const want = ['overview'].concat(sp.requirements.length || sp.nonFunctional.length ? ['fr'] : [], sp.acceptanceCriteria.length ? ['ac'] : [],
        sp.businessRules.length || sp.messages.length ? ['rules'] : [], sp.apis.length || sp.hostInteractions.length ? ['apis'] : [],
        sp.screens.length ? ['data'] : [], sp.roles.length ? ['roles'] : [], sp.openQuestions.length || sp.decisions.length ? ['questions'] : [],
        sp.requirements.length || sp.screens.length ? ['trace'] : [], ['history']);
      record(label + ': parts with data only', JSON.stringify(tabs) === JSON.stringify(want), tabs.join(','));
      record(label + ': no "Not set" placeholders', await run(() => !/Not set|Module not set/.test(document.getElementById('requirementDetail').textContent)));

      const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const doc = squash(d.documentText);
      if (sp.requirements.length) {
        await click('#part-fr');
        await sleep(300);
        const shown = await run(() => [...document.querySelectorAll('#requirementPart .factory-rqd-items')[0].children].map((li) => ({
          id: li.querySelector('.factory-rqd-id').textContent, text: (li.querySelector('.factory-rqd-quote') || {}).textContent || '',
          drafted: !!li.querySelector('.factory-rqd-tag'), refs: [...li.querySelectorAll('.factory-rqd-ref')].map((b) => b.textContent)
        })));
        const exact = sp.requirements.every((r, i) => shown[i] && shown[i].id === r.id && shown[i].text === (r.description || ''));
        record(label + ': requirements keep IDs and exact wording', exact && shown.length === sp.requirements.length, shown.length + ' of ' + sp.requirements.length);
        const draftedOk = sp.requirements.every((r, i) => shown[i].drafted === !(squash(r.description || r.title) && doc.indexOf(squash(r.description || r.title)) >= 0));
        record(label + ': Drafted marks the requirements not in the document', draftedOk, shown.filter((x) => x.drafted).map((x) => x.id).join(',') || 'none drafted');
        const linksOk = sp.requirements.every((r, i) => JSON.stringify(shown[i].refs) === JSON.stringify(sp.acceptanceCriteria.filter((c) => c.id && c.requirements.indexOf(r.id) >= 0).map((c) => c.id)));
        record(label + ': each requirement links the criteria that verify it', linksOk);
        const first = shown.findIndex((x) => x.refs.length);
        if (first >= 0) {
          await run((i) => { document.querySelectorAll('#requirementPart .factory-rqd-items')[0].children[i].querySelector('.factory-rqd-ref').click(); return 1; }, first);
          await sleep(400);
          const at = await run(() => ({ part: (document.querySelector('.factory-rq-subtabs [aria-selected="true"]') || {}).id, focus: document.activeElement.id }));
          record(label + ': a criterion link opens it, focused', at.part === 'part-ac' && at.focus === 'rqd-ac-' + shown[first].refs[0].replace(/[^A-Za-z0-9_-]/g, ''), at);
          const back = await run(() => { const b = document.activeElement.querySelector('.factory-rqd-ref:not(.is-plain)'); if (!b) { return null; } const t = b.textContent; b.click(); return t; });
          await sleep(400);
          if (back) {
            const at2 = await run(() => ({ part: (document.querySelector('.factory-rq-subtabs [aria-selected="true"]') || {}).id, focus: document.activeElement.id }));
            record(label + ': a "verifies" link opens the requirement, focused', at2.part === 'part-fr' && at2.focus === 'rqd-fr-' + back.replace(/[^A-Za-z0-9_-]/g, ''), at2);
          }
        }
      }
      if (sp.businessRules.length) {
        await click('#part-rules');
        await sleep(300);
        const rules = await run(() => [...document.querySelectorAll('#requirementPart table')[0].querySelectorAll('tbody tr')].map((tr) => ({
          id: tr.cells[0].textContent, drafted: !!tr.cells[1].querySelector('.factory-rqd-tag') })));
        record(label + ': rules keep IDs; Drafted marks those not in the document', sp.businessRules.every((r, i) => rules[i] && rules[i].id === (r.id || '–')
          && rules[i].drafted === !(doc.indexOf(squash(r.description)) >= 0)), rules.filter((x) => x.drafted).map((x) => x.id).join(',') || 'none drafted');
      }
      await click('#part-history');
      await sleep(300);
      const hist = await run(() => [...document.querySelectorAll('#requirementHistory > li strong')].map((x) => x.textContent));
      record(label + ': History lists every version and the approval', !!versions && versions.length === hist.filter((h) => /^v\d+ ·/.test(h)).length
        && (!d.approvedAt || hist[0].indexOf('Approved') === 0), hist.join(' | '));
      const next = await run(() => ({ approve: !!document.getElementById('approveButton'), text: document.getElementById('requirementNext').textContent }));
      const mayApprove = d.status === 'READY' && sp.openQuestions.length === 0;
      record(label + ': Approve offered only when the server would take it', next.approve === (mayApprove && next.approve) && (d.status !== 'APPROVED' || /Approved/.test(next.text)), next.text.replace(/\s+/g, ' ').trim().slice(0, 120));
    }
  }

  // Open questions: a spec with questions put into the page (not saved): no Approve, "Answer the questions" opens them
  const q = await vm((m) => {
    const d = m.detail();
    const spec = Object.assign({}, d.spec, { openQuestions: [{ question: 'How many instalments at most?', reason: 'Not stated', reference: 'OQ-001', options: ['12', '24'], suggestedAnswer: '12', answer: null }] });
    m.detail(Object.assign({}, d, { status: 'READY', spec: spec }));
    return 1;
  });
  await sleep(300);
  const st = await run(() => ({ approve: !!document.getElementById('approveButton'), answer: !!document.getElementById('answerQuestionsButton'),
    text: document.getElementById('requirementNext').textContent.replace(/\s+/g, ' ').trim() }));
  record('Open questions: Approve not offered, Answer the questions is', q === 1 && !st.approve && st.answer && /1 open question/.test(st.text), st);
  await click('#answerQuestionsButton');
  await sleep(400);
  record('Answer the questions opens them', await run(() => (document.querySelector('.factory-rq-subtabs [aria-selected="true"]') || {}).id === 'part-questions'));

  // Phone width
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  for (const part of ['overview', 'fr', 'ac', 'rules', 'trace', 'history']) {
    await click('#part-' + part);
    await sleep(300);
    const wide = await run(() => document.documentElement.scrollWidth);
    record('390 px, ' + part + ': no page-level horizontal scroll', wide <= 390, wide);
  }
  record('No console errors', s.errors.filter((e) => !/auth\/me/.test(e)).length === 0, s.errors.filter((e) => !/auth\/me/.test(e)).slice(0, 3));
  console.log(defects ? defects + ' defect(s)' : 'No defects');
  s.close();
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
