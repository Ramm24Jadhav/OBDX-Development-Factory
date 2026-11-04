// OBDX Library check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the header (Analyze, OBDX Library, one line, Add documents) and at most one library problem bar under it, whose
//    message is not repeated in the document rows;
//  - Ask, Documents and Notes are tabs (arrow keys move between them); Search in sits on the Ask tab's line;
//  - Ask: the empty panel with examples, the composer (Enter asks, Shift+Enter is a new line), the answer-length menu,
//    the expanded editor (modal, focus kept in it, Escape closes it and focus goes back), an answer with its sources in
//    the rail, the sources searched and not used, and the feedback row. The answer is streamed by a stand-in for the
//    server's stream in the page, so no model is needed;
//  - Documents: the Sources strip, the toolbar filters, the six columns, a row menu, the Add documents side sheet;
//  - Notes: the filter with counts, the queue in groups, one note open at a time, Approve and next (the note is put
//    back to suggested afterwards);
//  - nothing scrolls sideways at 1440, 1280, 1024, 768 and 390 px; no console errors.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-library.js --url http://localhost:8080 [--workspace <id>]
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
  // Runs fn(viewModel) in the page
  const vm = (fn, arg) => run({ toString: () => '(arg) => new Promise((resolve) => window.require([\'knockout\'], (ko) => Promise.resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'libraryPage\')), arg)).then(resolve)))' }, arg);
  const key = async (k, code, vk, modifiers) => {
    // Enter goes as a key with its text, as a keyboard sends it (a button acts on it, a text area gets a new line)
    await cdp('Input.dispatchKeyEvent', k === 'Enter' ? { type: 'keyDown', key: k, code: code, windowsVirtualKeyCode: vk, modifiers: modifiers || 0, text: '\r', unmodifiedText: '\r' }
      : { type: 'rawKeyDown', key: k, code: code, windowsVirtualKeyCode: vk, modifiers: modifiers || 0 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: vk, modifiers: modifiers || 0 });
    await sleep(300);
  };
  const click = (sel) => run((q) => { const el = document.querySelector(q); if (el) { el.click(); } return !!el; }, sel);
  const active = () => run(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : ''; });
  const wide = () => run(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const size = async (w, h) => { await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h || 900, deviceScaleFactor: 1, mobile: w < 768 }); await sleep(900); };

  await size(1440, 1000);
  await open(BASE + '/?ojr=overview');
  if (args.workspace) { await s.selectWorkspace(args.workspace); }
  await open(BASE + '/?ojr=library');
  if (args.workspace) { await s.selectWorkspace(args.workspace); }
  await sleep(4000);

  // --- header, problem bar, tabs ---
  const top = await run(() => {
    const h1 = document.querySelector('.factory-lb h1');
    const add = document.getElementById('libraryAddDocuments');
    const bar = document.getElementById('libraryProblem');
    return {
      h1: h1 ? h1.textContent.trim() : '', h1Hidden: h1 ? /fx-visually-hidden/.test(h1.className) || h1.offsetHeight === 0 : true,
      eyebrow: (document.querySelector('.factory-lb-eyebrow') || {}).textContent || '',
      intro: (document.querySelector('.factory-lb-intro') || {}).textContent || '',
      add: add ? add.className : '', health: !!document.getElementById('libraryHealth'),
      bar: bar ? bar.textContent.replace(/\s+/g, ' ').trim() : '', barBeforeTabs: !!bar && !!(bar.compareDocumentPosition(document.querySelector('[role=tablist]')) & 4),
      tabs: [...document.querySelectorAll('.factory-lb-tabs [role=tab]')].map((t) => t.id),
      tabText: [...document.querySelectorAll('.factory-lb-tabs [role=tab]')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
      scope: !!document.getElementById('libraryAskVersion'), scopeLine: !!document.querySelector('.factory-lb-tabline #libraryAskVersion')
    };
  });
  const state = await vm((m) => ({ problem: m.problem().show, partial: m.embedding().partial, running: m.problem().running, admin: m.isAdmin(),
    docs: m.documents().filter((d) => !d.older).length, review: ((m.overview() || {}).stats || {}).suggestedNotes || 0 }));
  record('the header says Analyze, OBDX Library and what the library is', top.eyebrow.trim() === 'Analyze' && top.h1 === 'OBDX Library' && !top.h1Hidden && top.intro.length > 20, top);
  record('Add documents is a secondary button in the header', !state.admin || /fx-btn--secondary/.test(top.add), top.add);
  record('the old status line is gone', !top.health);
  record('the problem bar shows only when there is a problem, above the tabs', state.problem ? !!top.bar && top.barBeforeTabs : !top.bar, { bar: top.bar, state: state });
  if (state.problem && !state.running) {
    const bar = await run(() => ({ check: !!document.getElementById('libraryCheckModel'), embed: !!document.getElementById('embedAllButton') }));
    record('the problem bar says keywords only, with Check the model and (administrators) Embed all', /Keywords only/.test(top.bar) && bar.check && (!state.admin || bar.embed), bar);
  }
  record('Ask, Documents and Notes are tabs', top.tabs.join(',') === 'lb-ask,lb-documents,lb-notes', top.tabs);
  record('Documents shows its count and Notes the notes to review', top.tabText[1] === 'Documents' + (state.docs ? state.docs : '')
    && (!state.review || top.tabText[2] === 'Notes' + state.review + ' to review'), top.tabText);
  record('Search in sits on the tab line on Ask', top.scope && top.scopeLine);

  // --- Ask: empty state and composer ---
  const empty = await run(() => ({
    examples: document.querySelectorAll('.factory-lb-empty .factory-lb-examples .fx-chip').length,
    rail: (document.querySelector('.factory-lb-railempty') || {}).textContent || '',
    question: !!document.querySelector('#libraryQuestion textarea'), ask: !!document.getElementById('libraryAsk'),
    improve: !!document.getElementById('libraryImprove'), expand: !!document.getElementById('libraryExpand'), style: !!document.getElementById('libraryStyle')
  }));
  record('an empty Ask shows examples, and the rail says sources appear there', empty.examples === 4 && /appear here/.test(empty.rail), empty);
  record('the composer has the question, the answer length, Improve my question, Ask and Expand', empty.question && empty.ask && empty.improve && empty.expand && empty.style, empty);

  // The answer-length menu
  await click('#libraryStyle');
  await sleep(500);
  const menu = await run(() => [...document.querySelectorAll('.fx-menu [role=menuitemradio]')].map((b) => ({ text: b.querySelector('strong').textContent, desc: !!b.querySelector('.fx-menu-desc'), on: b.getAttribute('aria-checked') })));
  record('the answer-length menu offers Short, Detailed and Deep dive with descriptions, Detailed ticked', menu.map((m) => m.text).join(',') === 'Short,Detailed,Deep dive'
    && menu.every((m) => m.desc) && menu.filter((m) => m.on === 'true').map((m) => m.text).join() === 'Detailed', menu);
  await key('ArrowUp', 'ArrowUp', 38);
  await key('Enter', 'Enter', 13);
  const picked = await vm((m) => ({ style: m.style(), label: (document.getElementById('libraryStyle') || {}).textContent.trim(), focus: (document.activeElement || {}).id }));
  record('choosing Short in the menu sets the answer length; focus goes back to the button', picked.style === 'CONCISE' && picked.label === 'Short' && picked.focus === 'libraryStyle', picked);
  await click('#libraryStyle');
  await sleep(400);
  await key('Escape', 'Escape', 27);
  record('Escape closes the menu', await run(() => !document.querySelector('.fx-menu [role=menuitemradio]')) && (await active()) === 'libraryStyle');
  await vm((m) => { m.style('DETAILED'); return 1; });

  // Shift+Enter is a new line, Enter asks (the server's stream is stood in for in the page)
  await run(() => new Promise((r) => window.require(['services/api', 'knockout'], (api, ko) => {
    const m = ko.dataFor(document.getElementById('libraryPage'));
    const doc = m.documents().find((d) => !d.older) || { id: '00000000-0000-0000-0000-000000000000', title: 'A manual', obdxVersion: '25.2' };
    window.__lbAsked = [];
    api.stream = (path, body, onEvent) => new Promise((resolve) => {
      window.__lbAsked.push(body);
      const sources = [1, 2, 3].map((n) => ({ n: n, kind: 'SECTION', title: n === 3 ? 'Another guide' : doc.title, obdxVersion: doc.obdxVersion, heading: 'Section ' + n, pageFrom: n * 3, pageTo: n * 3 + 1,
        url: 'api/knowledge/documents/' + doc.id + '/file#page=' + n * 3, excerpt: 'What section ' + n + ' says.', bank: false }));
      onEvent({ type: 'status', text: 'Searching the manuals and notes…' });
      onEvent({ type: 'sources', sources: sources, grounded: true, versionLine: '25' });
      setTimeout(() => {
        const answer = 'Add the field through the extensibility layer [1].\n\n1. **The screen.** Copy the component into the extension folder [2].\n2. **The labels.** Add them to the resource bundle.';
        onEvent({ type: 'text', text: answer });
        onEvent({ type: 'done', answer: { answer: answer, grounded: true, sources: sources, versionLine: '25', latencyMs: 1200,
          report: { quality: { status: 'VERIFIED', reason: 'Every statement cites a source that says it.', findings: [] }, limitations: [], corrected: false } } });
        resolve();
      }, 300);
    });
    r(1);
  })));
  await run(() => { const a = document.querySelector('#libraryQuestion textarea'); a.focus(); return 1; });
  await cdp('Input.insertText', { text: 'How do I add a field' });
  await key('Enter', 'Enter', 13, 8);
  await cdp('Input.insertText', { text: 'to the fund transfer screen?' });
  const typed = await run(() => ({ value: document.querySelector('#libraryQuestion textarea').value, asked: window.__lbAsked.length }));
  record('Shift+Enter is a new line in the composer', typed.value === 'How do I add a field\nto the fund transfer screen?' && typed.asked === 0, typed);
  await key('Enter', 'Enter', 13);
  await sleep(1200);
  const answered = await run(() => ({
    asked: window.__lbAsked.length, style: (window.__lbAsked[0] || {}).style,
    title: (document.getElementById('lbQuestionTitle') || {}).textContent || '',
    meta: (document.querySelector('.factory-lb-qmeta') || {}).textContent || '',
    body: !!document.querySelector('#answerBody .fx-md'), cited: document.querySelectorAll('#answerCitations > li').length,
    other: (document.querySelector('#librarySearchedNotUsed > summary') || {}).textContent || '', otherOpen: !!(document.getElementById('librarySearchedNotUsed') || {}).open,
    bar: ['answerHelpful', 'answerNotHelpful', 'copyAnswer', 'regenerateAnswer', 'saveAnswer'].filter((id) => !document.getElementById(id)),
    newConv: !!document.getElementById('libraryNewConversation'), composer: document.querySelector('#libraryQuestion textarea').value,
    railBeside: (() => { const a = document.querySelector('.factory-lb-conv').getBoundingClientRect(); const b = document.querySelector('.factory-lb-rail').getBoundingClientRect(); return b.left >= a.right - 1 && Math.round(b.width) === 360; })()
  }));
  record('Enter asks the question with the chosen answer length', answered.asked === 1 && answered.style === 'DETAILED', answered);
  record('the panel shows the question as its heading and what the answer is grounded in', /fund transfer screen/.test(answered.title) && /Grounded in 2 sources/.test(answered.meta) && /OBDX 25\.x/.test(answered.meta) && /just now/.test(answered.meta), answered);
  record('the answer is shown, its two cited sources in the rail beside it (360 px)', answered.body && answered.cited === 2 && answered.railBeside, answered);
  record('the source searched and not used is folded away', /Searched and not used \(1\)/.test(answered.other) && !answered.otherOpen, answered.other);
  record('the feedback row has thumbs, Copy, Regenerate and Save as a note; New conversation is offered', answered.bar.length === 0 && answered.newConv, answered.bar);
  record('the composer is emptied for a follow-up', answered.composer === '');

  // The expanded editor
  await run(() => { document.getElementById('libraryExpand').focus(); return 1; });
  await click('#libraryExpand');
  await sleep(600);
  const editor = await run(() => ({ dialog: !!document.querySelector('#libraryEditor[role=dialog][aria-modal=true]'), focus: document.activeElement && document.activeElement.closest('#libraryEditor') ? document.activeElement.tagName : '' }));
  record('Expand opens the question editor as a modal with focus in it', editor.dialog && editor.focus === 'TEXTAREA', editor);
  let inside = true;
  for (let i = 0; i < 8; i++) { await key('Tab', 'Tab', 9); inside = inside && await run(() => !!(document.activeElement && document.activeElement.closest('#libraryEditor'))); }
  record('Tab keeps the focus in the editor', inside);
  await key('Escape', 'Escape', 27);
  await sleep(300);
  record('Escape closes the editor and focus goes back to Expand', await run(() => !document.getElementById('libraryEditor')) && (await active()) === 'libraryExpand', await active());

  // At 1279 px and below the sources go under the answer
  await size(1280, 900);
  const at1280 = await run(() => { const a = document.querySelector('.factory-lb-conv').getBoundingClientRect(); const b = document.querySelector('.factory-lb-rail').getBoundingClientRect(); return { beside: b.left >= a.right - 1, under: b.top >= a.bottom - 1 }; });
  await size(1024, 900);
  const at1024 = await run(() => { const a = document.querySelector('.factory-lb-conv').getBoundingClientRect(); const b = document.querySelector('.factory-lb-rail').getBoundingClientRect(); return { under: b.top >= a.bottom - 1 }; });
  record('the sources sit beside the answer at 1280 px and under it below', at1280.beside && at1024.under, { at1280: at1280, at1024: at1024 });
  await size(1440, 1000);

  // --- Documents ---
  await click('#lb-documents');
  await sleep(2500);
  const docs = await run(() => ({
    scope: !!document.getElementById('libraryAskVersion'),
    cards: document.querySelectorAll('.factory-lb-src').length, add: !!document.getElementById('libraryAddSource'),
    head: [...document.querySelectorAll('.factory-lb-table thead th')].map((t) => t.textContent.trim()),
    groups: [...document.querySelectorAll('.factory-lb-grouprow th')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
    rows: document.querySelectorAll('.factory-lb-table tbody tr:not(.factory-lb-grouprow)').length,
    keywordRows: [...document.querySelectorAll('.factory-lb-docmsg')].filter((m) => /keywords only/i.test(m.textContent)).length,
    meaningCard: !!document.querySelector('.factory-lb-embedding'),
    keywordStatus: [...document.querySelectorAll('.factory-lb-table tbody td')].filter((t) => /Ready · keywords only/.test(t.textContent)).length,
    allPartial: /for all /.test((document.querySelector('.factory-lb-problem') || {}).textContent || ''),
    toolbar: ['docSearch', 'docVersion', 'docType', 'docSource', 'docStatus'].filter((id) => !document.getElementById(id))
  }));
  const counts = await vm((m) => ({ sources: m.sourceCards().length, shown: m.shownCount(), failed: m.documents().filter((d) => d.status === 'FAILED' && !d.older).length, canAdd: m.canAdd() }));
  record('Search in is only on the Ask tab', !docs.scope);
  record('the Sources strip has a card per Oracle version followed and watched folder, and Add a source', docs.cards === counts.sources && docs.add === counts.canAdd, { docs: docs.cards, counts: counts });
  record('the toolbar has search, version, type, source and state', docs.toolbar.length === 0, docs.toolbar);
  record('the table has six columns and a menu column, grouped by version', !counts.shown || (docs.head.join('|') === 'Document|Source|Status|Pages|Sections|Indexed|Actions' && docs.groups.length > 0), docs);
  record('a long list shows a page at a time', !counts.shown || docs.rows === Math.min(counts.shown, 25), { rows: docs.rows, shown: counts.shown });
  record('no row repeats the keywords-only message; the Search by meaning card is gone', docs.keywordRows === 0 && !docs.meaningCard && (!docs.allPartial || docs.keywordStatus === 0), docs);

  // Document filters
  const filters = await vm((m) => {
    const docs = m.documents().filter((d) => !d.older);
    const v = docs.length ? docs[0].obdxVersion : '';
    m.docVersion(v);
    const byVersion = m.shownCount() === docs.filter((d) => d.obdxVersion === v).length;
    m.docVersion('');
    const out = { byVersion: byVersion, byType: true, bySource: true };
    ['ORACLE', 'BANK'].forEach((t) => { m.docType(t); out.byType = out.byType && m.shownCount() === docs.filter((d) => d.type === t).length; });
    m.docType('');
    ['SITE', 'FOLDER', 'UPLOAD'].forEach((src) => { m.docSource(src); out.bySource = out.bySource && m.shownCount() === docs.filter((d) => d.source === src).length; });
    m.docSource('');
    m.docStatus('FAILED');
    out.failedRows = m.shownCount();
    out.failedMessages = m.documents().filter((d) => d.status === 'FAILED' && !d.older).every((d) => !!d.rowMessage);
    m.resetDocFilters();
    return out;
  });
  record('documents filter by OBDX version, type and source', filters.byVersion && filters.byType && filters.bySource, filters);
  record('the failed filter lists the failed documents, each with its own message', filters.failedRows === counts.failed && filters.failedMessages, filters);
  await sleep(600);

  // A row menu
  if (counts.shown) {
    await run(() => { const b = document.querySelector('.factory-lb-table .fx-menu-toggle'); if (b) { b.focus(); b.click(); } return !!b; });
    await sleep(500);
    const rowMenu = await run(() => [...document.querySelectorAll('.fx-menu [role=menuitem]')].map((b) => b.textContent.trim()));
    record('a row menu holds the row\'s actions (administrators: Remove…)', rowMenu.length > 0 && (!state.admin || rowMenu.indexOf('Remove…') >= 0), rowMenu);
    await key('Escape', 'Escape', 27);
    record('Escape closes the row menu and focus goes back to its button', await run(() => !document.querySelector('.fx-menu [role=menuitem]') && document.activeElement.classList.contains('fx-menu-toggle')));
  }

  // The Add documents sheet
  if (counts.canAdd) {
    await run(() => { document.getElementById('libraryAddDocuments').focus(); document.getElementById('libraryAddDocuments').click(); return 1; });
    await sleep(700);
    const sheet = await run(() => {
      const box = document.querySelector('#libraryAddSheet .fx-sheet');
      return box ? { w: Math.round(box.getBoundingClientRect().width), modes: [...box.querySelectorAll('#libraryAddMode [role=radio]')].map((b) => b.textContent.trim()),
        drop: !!box.querySelector('#uploadButton'), version: !!box.querySelector('#importVersion'), patch: !!box.querySelector('#importPatchset'),
        who: !!box.querySelector('#importWho'), cancel: !!box.querySelector('#libraryAddCancel'), primary: (box.querySelector('#libraryAddFiles') || {}).textContent || '' } : null;
    });
    record('Add documents opens a 520 px side sheet: where from, version, patchset, the drop zone, whose documents, Cancel and Add',
      !!sheet && sheet.w === 520 && sheet.modes[0] === 'Upload files' && sheet.drop && sheet.version && sheet.patch && (!state.admin || sheet.who) && sheet.cancel && /Add documents/.test(sheet.primary), sheet);
    if (sheet && sheet.modes.length > 1) {
      await run(() => { [...document.querySelectorAll('#libraryAddMode [role=radio]')][1].click(); return 1; });
      await sleep(400);
      const second = await run(() => ({ folder: !!document.getElementById('importFolder'), oracle: !!document.getElementById('oracleVersion'),
        button: ((document.getElementById('importFolderButton') || document.getElementById('oracleFollow')) || {}).textContent || '' }));
      record('the second way in the sheet shows its own fields and button', (second.folder && /Watch folder/.test(second.button)) || (second.oracle && /Get and keep current/.test(second.button)), second);
      await run(() => { document.querySelector('#libraryAddMode [role=radio]').click(); return 1; });
    }
    await key('Escape', 'Escape', 27);
    await sleep(400);
    record('Escape closes the sheet and focus goes back to Add documents', await run(() => !document.querySelector('#libraryAddSheet .fx-sheet')) && (await active()) === 'libraryAddDocuments', await active());
  }

  // --- Notes ---
  await click('#lb-notes');
  await sleep(2500);
  const notes = await run(() => ({
    filter: [...document.querySelectorAll('#noteFilter [role=radio]')].map((b) => b.textContent.trim()),
    on: (document.querySelector('#noteFilter [aria-checked=true]') || {}).textContent || '',
    groups: [...document.querySelectorAll('.factory-lb-grouphead')].map((h) => h.textContent.trim()),
    rows: document.querySelectorAll('.factory-lb-note').length,
    tools: ['noteSearch', 'libraryDraftNote', 'newNoteButton'].filter((id) => !document.getElementById(id))
  }));
  const queue = await vm((m) => ({ check: m.notes().filter((n) => n.check).length, first: (m.noteGroups()[0] || {}).key, review: m.notes().length, canReview: m.notes().some((n) => n.canReview) }));
  record('the filter shows To review, Approved, Rejected and All with counts, To review first', notes.filter.length === 4 && /^To review \d+$/.test(notes.filter[0]) && /^All \d+$/.test(notes.filter[3]) && /^To review/.test(notes.on), notes.filter);
  record('the toolbar has search, Draft from the manuals and Write a note', notes.tools.length === 0, notes.tools);
  record('notes to check after a manual changed come first', !queue.check || (queue.first === 'check' && /^Check after a manual changed/.test(notes.groups[0])), notes.groups);
  if (notes.rows > 1) {
    await run(() => { document.querySelectorAll('.factory-lb-noteopen')[0].click(); return 1; });
    await sleep(500);
    await run(() => { document.querySelectorAll('.factory-lb-noteopen')[1].click(); return 1; });
    await sleep(500);
    const open = await run(() => {
      const rows = [...document.querySelectorAll('.factory-lb-note')];
      const opened = rows.filter((r) => r.classList.contains('is-open'));
      const o = opened[0];
      const body = o && o.querySelector('.factory-lb-notebody');
      return { open: opened.length, second: rows.indexOf(o), expanded: o ? o.querySelector('.factory-lb-noteopen').getAttribute('aria-expanded') : '',
        acts: o ? [...o.querySelectorAll('.factory-lb-noteacts > .fx-btn, .factory-lb-noteacts .fx-btn')].map((b) => b.textContent.trim()).filter(Boolean) : [],
        clipped: body ? body.scrollHeight > body.clientHeight + 1 || getComputedStyle(body).overflowY !== 'visible' : true };
    });
    record('one note is open at a time, expanded in place', open.open === 1 && open.second === 1 && open.expanded === 'true', open);
    record('nothing in the open note scrolls or is cut off', !open.clipped);
    if (queue.canReview && /^To review [1-9]/.test(notes.filter[0])) {
      record('the open note offers Edit, Reject and Approve and next', ['Edit', 'Reject', 'Approve and next'].every((t) => open.acts.indexOf(t) >= 0), open.acts);
      const before = await vm((m) => { const g = m.noteGroups(); const ids = g.reduce((a, x) => a.concat(x.rows.map((r) => r.id)), []); return { ids: ids, open: m.openNote() }; });
      await run(() => { [...document.querySelectorAll('.factory-lb-note.is-open .fx-btn')].find((b) => /Approve and next/.test(b.textContent)).click(); return 1; });
      await sleep(2500);
      const after = await vm((m) => ({ open: m.openNote() }));
      const at = before.ids.indexOf(before.open);
      record('Approve and next approves the note and opens the next one', after.open && after.open !== before.open && before.ids.indexOf(after.open) > at, { before: before.open, after: after.open });
      // Put it back as it was
      await run((id) => fetch('api/knowledge/notes/' + id + '/review', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json',
        'X-XSRF-TOKEN': decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '') }, body: JSON.stringify({ status: 'SUGGESTED' }) }).then((r) => r.status), before.open);
      await vm((m) => m.loadNotes().then(() => 1));
      await sleep(800);
    }
  }

  // --- widths and the phone ---
  const sideways = [];
  for (const w of [1440, 1280, 1024, 768, 390]) {
    await size(w, w < 768 ? 844 : 900);
    for (const t of ['ask', 'documents', 'notes']) {
      await click('#lb-' + t);
      await sleep(900);
      const over = await wide();
      if (over > 0) { sideways.push(w + ' ' + t + ' +' + over); }
    }
  }
  record('nothing scrolls sideways at 1440, 1280, 1024, 768 and 390 px', sideways.length === 0, sideways);
  await click('#lb-ask');
  await sleep(800);
  const phone = await run(() => {
    const bar = document.getElementById('libraryProblem');
    const tabs = [...document.querySelectorAll('.factory-lb-tabs [role=tab]')].map((t) => t.getBoundingClientRect().top);
    const comp = document.querySelector('.factory-lb-composer');
    const conv = document.querySelector('.factory-lb-conv');
    const text = bar && bar.querySelector('.factory-lb-problemtext');
    return { bar: text ? Math.round(text.getBoundingClientRect().height) : 0, oneRow: tabs.every((t) => Math.abs(t - tabs[0]) < 2),
      composerLast: !!comp && comp === conv.lastElementChild, stacked: document.querySelector('.factory-lb-rail').getBoundingClientRect().top >= conv.getBoundingClientRect().bottom - 1 };
  });
  record('on a phone the problem bar is one line, the tabs one row, the sources under the answer and the composer at the bottom',
    (!state.problem || (phone.bar > 0 && phone.bar <= 24)) && phone.oneRow && phone.composerLast && phone.stacked, phone);

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'OBDX Library: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
