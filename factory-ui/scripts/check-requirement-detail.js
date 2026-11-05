// Requirement detail check: drives a running factory in headless Edge or Chrome and checks what the detail promises,
// for every requirement of every workspace:
//  - one header: the title, an ID line (ID, workspace, spec version, source, last change), a pill with the stage and
//    its state as Home computes them (dashboard.workflow), and at most one primary action;
//  - the four stages with the one in progress marked (all done when the change is delivered or closed) and what was
//    recorded at each (the spec's approval, screens approved, the plan, the code);
//  - at most one problem bar; a failed change is said there; otherwise the next step is one line;
//  - the tabs shown are the ones the spec has something for (at most six; no empty part, no "Not set" placeholder),
//    and the arrow keys move between them;
//  - functional requirements, criteria and rules keep the spec's IDs and exact wording; items not found word for word
//    in the document are the ones marked Drafted;
//  - each criterion links to the requirements it verifies and each requirement to its criteria, and a link moves to the
//    other item with it focused;
//  - Source and history (a side panel) names the document and lists every version the server has
//    (GET /api/requirements/{id}/versions) and the approval;
//  - the next step offers Approve only for a ready spec with no open question, and never for an approved one;
//  - with open questions (a spec put into the page, nothing saved) Approve is not offered, the problem bar counts them
//    and "Answer the questions" opens them; a failed draft (put into the page) shows its message with Try again;
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
  const key = async (name, code) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, windowsVirtualKeyCode: code, code: name });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: code, code: name });
    await sleep(150);
  };
  const selectedTab = () => run(() => (document.querySelector('.factory-rq-subtabs [aria-selected="true"]') || {}).id || '');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const workspaces = await run(async () => (await (await fetch('api/workspaces')).json()).map((w) => ({ id: w.id, name: w.name })));
  let keysChecked = false;
  let sheetChecked = false;
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
      const code = 'REQ-' + d.id.replace(/-/g, '').slice(0, 4).toUpperCase();

      // The header, the stages and the one message
      const flow = await run((rid) => new Promise((resolve) => window.require(['services/api', 'services/dashboard'], (api, dashboard) => {
        Promise.all([api.get('requirements/' + rid), api.get('workspaces/' + window.require('services/workspaceSelection').selectedId() + '/designs'),
          api.get('workspaces/' + window.require('services/workspaceSelection').selectedId() + '/changes/details')]).then(([r, designs, changes]) => {
          const open = r.spec ? r.spec.openQuestions.filter((q) => !q.answer).length : 0;
          const f = dashboard.workflow(Object.assign({}, r, { openQuestions: open }), designs, changes, r.workspaceId);
          resolve({ pill: (f.finished ? 'Done' : dashboard.steps[f.step - 1]) + ' · ' + f.status.text, states: f.steps.map((x) => x.state), failed: f.status.category === 'failed' && !f.finished && r.status === 'APPROVED' });
        });
      })), id);
      const head = await run(() => ({
        title: document.getElementById('requirementDetailTitle').textContent.trim(),
        ids: document.getElementById('requirementIds').textContent.trim(),
        pill: document.getElementById('requirementPill').textContent.trim(),
        primary: document.querySelectorAll('.factory-rqd-headside .fx-btn--primary').length,
        steps: [...document.querySelectorAll('#requirementStepper > li')].map((li) => ({ state: li.className.replace(/.*is-/, ''), current: li.getAttribute('aria-current'),
          sub: li.querySelector('.factory-rqd-step-sub').textContent.trim() })),
        problems: document.querySelectorAll('#requirementProblem').length,
        problem: (document.getElementById('requirementProblem') || {}).textContent || '',
        next: (document.getElementById('requirementNext') || {}).textContent || ''
      }));
      record(label + ': one header with the title, the ID line and the stage pill', head.title === d.title.trim() && head.ids.indexOf(code) === 0 && head.ids.indexOf(w.name) > 0
        && head.pill === flow.pill && head.primary <= 1, { ids: head.ids, pill: head.pill, want: flow.pill, primary: head.primary });
      record(label + ': four stages, the one in progress marked', head.steps.length === 4 && JSON.stringify(head.steps.map((x) => x.state)) === JSON.stringify(flow.states)
        && head.steps.filter((x) => x.current === 'step').length === flow.states.filter((x) => x === 'current').length && head.steps.every((x) => x.sub), head.steps.map((x) => x.state + ': ' + x.sub).join(' | '));
      record(label + ': at most one problem bar; else the next step in one line', head.problems <= 1 && (head.problems === 1 || head.next.trim().length > 0)
        && (!flow.failed || head.problems === 1), (head.problem || head.next).replace(/\s+/g, ' ').trim().slice(0, 120));
      record(label + ': an approved spec says who approved it and when, at the Spec stage', d.status !== 'APPROVED' || /^Approved/.test(head.steps[0].sub), head.steps[0].sub);

      if (!d.spec) { record(label + ': no spec, no parts', await run(() => !document.querySelector('.factory-rq-subtabs'))); continue; }
      const sp = d.spec;
      const tabs = await run(() => [...document.querySelectorAll('.factory-rq-subtabs [role="tab"]')].map((t) => t.id.replace('part-', '')));
      const want = ['overview'].concat(sp.requirements.length || sp.nonFunctional.length || sp.acceptanceCriteria.length ? ['reqs'] : [],
        sp.businessRules.length || sp.messages.length || sp.apis.length || sp.hostInteractions.length ? ['rules'] : [],
        sp.screens.length ? ['screens'] : [], sp.openQuestions.length || sp.decisions.length ? ['questions'] : [],
        sp.requirements.length || sp.screens.length ? ['trace'] : []);
      record(label + ': tabs with data only, at most six', JSON.stringify(tabs) === JSON.stringify(want) && tabs.length <= 6, tabs.join(','));
      record(label + ': no "Not set" or "not recorded" placeholders', await run(() => !/Not set|Module not set|not recorded/i.test(document.getElementById('requirementDetail').textContent)));
      if (sp.roles.length) {
        await click('#part-overview');
        await sleep(200);
        record(label + ': the roles are on Overview', await run((n) => !!document.getElementById('requirementRoles') && document.querySelectorAll('#requirementRoles tbody tr').length === n, sp.roles.length));
      }

      if (!keysChecked && tabs.length > 2) {
        await run(() => { document.querySelector('.factory-rq-subtabs [aria-selected="true"]').focus(); return 1; });
        await key('ArrowRight', 39);
        const a = await selectedTab();
        await key('End', 35);
        const b = await selectedTab();
        await key('Home', 36);
        const c = await selectedTab();
        const focus = await run(() => document.activeElement.id);
        record('the arrow keys, Home and End move between the tabs', a === 'part-' + tabs[1] && b === 'part-' + tabs[tabs.length - 1] && c === 'part-' + tabs[0] && focus === 'part-' + tabs[0], { a: a, b: b, c: c, focus: focus });
        keysChecked = true;
      }

      const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const doc = squash(d.documentText);
      if (sp.requirements.length) {
        await click('#part-reqs');
        await sleep(300);
        const shown = await run(() => [...document.getElementById('functionalRequirements').children].map((li) => ({
          id: li.querySelector('.factory-rqd-id').textContent, text: (li.querySelector('.factory-rqd-quote') || {}).textContent || '',
          drafted: !!li.querySelector('.factory-rqd-tag'), refs: [...li.querySelectorAll('.factory-rqd-ref')].map((b) => b.textContent)
        })));
        const exact = sp.requirements.every((r, i) => shown[i] && shown[i].id === r.id && shown[i].text === (r.description || ''));
        record(label + ': requirements keep IDs and exact wording', exact && shown.length === sp.requirements.length, shown.length + ' of ' + sp.requirements.length);
        const draftedOk = sp.requirements.every((r, i) => shown[i].drafted === !(squash(r.description || r.title) && doc.indexOf(squash(r.description || r.title)) >= 0));
        record(label + ': Drafted marks the requirements not in the document', draftedOk, shown.filter((x) => x.drafted).map((x) => x.id).join(',') || 'none drafted');
        const linksOk = sp.requirements.every((r, i) => JSON.stringify(shown[i].refs) === JSON.stringify(sp.acceptanceCriteria.filter((c) => c.id && c.requirements.indexOf(r.id) >= 0).map((c) => c.id)));
        record(label + ': each requirement links the criteria that verify it', linksOk);
        const sections = await run(() => [...document.querySelectorAll('#requirementPart > .factory-rqd-h')].map((h) => h.id));
        const wantSections = [].concat(sp.requirements.length ? ['reqSection-fr'] : [], sp.acceptanceCriteria.some((c) => c.description) ? ['reqSection-ac'] : [],
          sp.nonFunctional.some((n) => n.description) ? ['reqSection-nfr'] : []);
        record(label + ': Requirements holds functional, acceptance and non-functional, each counted', JSON.stringify(sections) === JSON.stringify(wantSections), sections);
        const first = shown.findIndex((x) => x.refs.length);
        if (first >= 0) {
          await run((i) => { document.getElementById('functionalRequirements').children[i].querySelector('.factory-rqd-ref').click(); return 1; }, first);
          await sleep(400);
          const at = await run(() => ({ part: (document.querySelector('.factory-rq-subtabs [aria-selected="true"]') || {}).id, focus: document.activeElement.id }));
          record(label + ': a criterion link moves to it, focused', at.part === 'part-reqs' && at.focus === 'rqd-ac-' + shown[first].refs[0].replace(/[^A-Za-z0-9_-]/g, ''), at);
          const back = await run(() => { const b = document.activeElement.querySelector('.factory-rqd-ref:not(.is-plain)'); if (!b) { return null; } const t = b.textContent; b.click(); return t; });
          await sleep(400);
          if (back) {
            const at2 = await run(() => ({ part: (document.querySelector('.factory-rq-subtabs [aria-selected="true"]') || {}).id, focus: document.activeElement.id }));
            record(label + ': a "verifies" link moves to the requirement, focused', at2.part === 'part-reqs' && at2.focus === 'rqd-fr-' + back.replace(/[^A-Za-z0-9_-]/g, ''), at2);
          }
        }
      }
      if (sp.businessRules.length) {
        await click('#part-rules');
        await sleep(300);
        const rules = await run(() => [...document.querySelectorAll('#businessRules tbody tr')].map((tr) => ({
          id: tr.cells[0].textContent, drafted: !!tr.cells[1].querySelector('.factory-rqd-tag') })));
        record(label + ': rules keep IDs; Drafted marks those not in the document', sp.businessRules.every((r, i) => rules[i] && rules[i].id === (r.id || '–')
          && rules[i].drafted === !(doc.indexOf(squash(r.description)) >= 0)), rules.filter((x) => x.drafted).map((x) => x.id).join(',') || 'none drafted');
      }

      // Source and history, in the side panel
      await run(() => { const b = document.getElementById('requirementInfoButton'); b.focus(); b.click(); return 1; });
      await sleep(500);
      const info = await run(() => ({
        open: !!document.querySelector('#requirementInfo .fx-sheet'),
        source: ((document.querySelector('#requirementSource strong') || {}).textContent || '').trim(),
        hist: [...document.querySelectorAll('#requirementHistory > li strong')].map((x) => x.textContent)
      }));
      record(label + ': Source and history names the document', info.open && info.source === (d.fileName || (d.documentText ? 'Typed description' : '')), info.source);
      record(label + ': History lists every version and the approval', !!versions && versions.length === info.hist.filter((h) => /^v\d+ ·/.test(h)).length
        && (!d.approvedAt || info.hist[0].indexOf('Approved') === 0), info.hist.join(' | '));
      if (!sheetChecked && d.documentText) {
        await click('#requirementSource fx-menu-button button');
        await sleep(400);
        await run(() => { const it = [...document.querySelectorAll('.fx-menu [role^="menuitem"]')].find((e) => /Show the text/.test(e.textContent)); if (it) { it.click(); } return 1; });
        await sleep(400);
        record('Source and history: Show the text shows what the factory read', await run(() => !!document.querySelector('#requirementInfo .factory-rq-doctext')));
        sheetChecked = true;
      }
      await click('#requirementInfo .fx-sheet-close');
      await sleep(400);
      record(label + ': closing the panel gives focus back', await run(() => !document.querySelector('#requirementInfo .fx-sheet') && document.activeElement.id === 'requirementInfoButton'));

      const next = await run(() => ({ approve: !!document.getElementById('approveButton'), text: ((document.getElementById('requirementNext') || document.getElementById('requirementProblem') || {}).textContent || '') }));
      const mayApprove = d.status === 'READY' && sp.openQuestions.length === 0;
      record(label + ': Approve offered only when the server would take it', next.approve === (mayApprove && next.approve) && (d.status !== 'APPROVED' || !next.approve), next.text.replace(/\s+/g, ' ').trim().slice(0, 120));
    }
  }

  // Open questions: a spec with questions put into the page (not saved): no Approve, the problem bar counts them,
  // "Answer the questions" opens them
  const q = await vm((m) => {
    const d = m.detail();
    const spec = Object.assign({}, d.spec, { openQuestions: [{ question: 'How many instalments at most?', reason: 'Not stated', reference: 'OQ-001', options: ['12', '24'], suggestedAnswer: '12', answer: null }] });
    m.detail(Object.assign({}, d, { status: 'READY', approvedAt: null, spec: spec }));
    return 1;
  });
  await sleep(300);
  const st = await run(() => ({ approve: !!document.getElementById('approveButton'), answer: !!document.getElementById('answerQuestionsButton'),
    problem: ((document.getElementById('requirementProblem') || {}).textContent || '').replace(/\s+/g, ' ').trim(), next: !!document.getElementById('requirementNext'),
    pill: document.getElementById('requirementPill').textContent.trim(), count: ((document.querySelector('#part-questions .factory-rqd-cnt') || {}).className || '') }));
  record('Open questions: Approve not offered, Answer the questions is, the problem bar counts them', q === 1 && !st.approve && st.answer && /1 open question blocks approval/.test(st.problem) && !st.next, st);
  record('Open questions: the pill and the Questions tab say so', /^Spec · 1 open question/.test(st.pill) && /is-warning/.test(st.count), st);
  await click('#answerQuestionsButton');
  await sleep(400);
  record('Answer the questions opens them', (await selectedTab()) === 'part-questions');
  // A failed draft put into the page: its message in the problem bar, with Try again in the header
  await vm((m) => { const d = m.detail(); m.detail(Object.assign({}, d, { status: 'FAILED', message: 'The model did not answer.' })); return 1; });
  await sleep(300);
  const fl = await run(() => ({ problems: document.querySelectorAll('#requirementProblem').length, text: ((document.getElementById('requirementProblem') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    error: !!document.querySelector('#requirementProblem.is-error'), retry: !!document.getElementById('retryButton') }));
  record('A failed draft: one red problem bar with the message, Try again in the header', fl.problems === 1 && fl.error && /Drafting stopped\. The model did not answer\./.test(fl.text) && fl.retry, fl);
  await vm((m) => { const d = m.detail(); return m.open(d.id).then(() => 1); });
  await sleep(600);

  // Phone width
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  for (const part of ['overview', 'reqs', 'rules', 'screens', 'questions', 'trace']) {
    if (!(await click('#part-' + part))) { continue; }
    await sleep(300);
    const wide = await run(() => document.documentElement.scrollWidth);
    record('390 px, ' + part + ': no page-level horizontal scroll', wide <= 390, wide);
  }
  await click('#requirementInfoButton');
  await sleep(500);
  const sheetWide = await run(() => { const a = document.querySelector('#requirementInfo .fx-sheet'); return a ? Math.max(a.scrollWidth - a.clientWidth, document.documentElement.scrollWidth - 390) : -1; });
  record('390 px, Source and history: nothing wider than the panel', sheetWide === 0, sheetWide);
  await click('#requirementInfo .fx-sheet-close');
  record('No console errors', s.errors.filter((e) => !/auth\/me/.test(e)).length === 0, s.errors.filter((e) => !/auth\/me/.test(e)).slice(0, 3));
  console.log(defects ? defects + ' defect(s)' : 'No defects');
  s.close();
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
