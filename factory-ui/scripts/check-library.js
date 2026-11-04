// OBDX Library check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the header (Analyze, OBDX Library, one line, Add documents) and at most one library problem bar under it, whose
//    message is not repeated in the document rows;
//  - Ask, Documents and Notes are tabs (arrow keys move between them); Search in sits on the Ask tab's line;
//  - Ask: empty, one centred question (the heading, what the answers cite, four example cards with their kind; a card
//    asks its question), the composer (rounded, the answer length and Improve as pills, the keys, a round Ask; Enter
//    asks, Shift+Enter is a new line), the answer-length menu, the expanded editor (modal, focus kept in it, Escape
//    closes it and focus goes back), Improve my question (the question rewritten in the box with one line and Undo, then
//    asked with the improved one); after a question the thread: the question as a bubble on the right, one folded line
//    on how the answer was found that opens the detail, citations as numbered pills, compact source cards in the rail,
//    the sources searched and not used, icon-only actions with their names, and Ask next (a chip asks it as a
//    follow-up; none when the answer has no follow-ups). The answer is streamed by a stand-in for the server's stream
//    in the page, so no model is needed;
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
  const empty = await run(() => {
    const css = (el) => (el ? getComputedStyle(el) : {});
    const ask = document.getElementById('libraryAsk');
    const improve = document.getElementById('libraryImprove');
    const compose = document.querySelector('.factory-lb-compose');
    const hero = document.querySelector('.factory-lb-hero');
    const panel = document.getElementById('libraryPanel').getBoundingClientRect();
    const h = hero ? hero.getBoundingClientRect() : null;
    return {
      heading: ((hero && hero.querySelector('h2')) || {}).textContent || '',
      covers: ((document.getElementById('libraryCovers') || {}).textContent || '').trim(),
      spark: !!(hero && hero.querySelector('.factory-lb-spark.is-lg')),
      centred: !!h && Math.abs((h.left + h.right) / 2 - (panel.left + panel.right) / 2) < 3,
      kinds: [...document.querySelectorAll('.factory-lb-examples .factory-lb-example')].map((c) => (c.querySelector('.factory-lb-exkind') || {}).textContent || ''),
      cardQuestions: [...document.querySelectorAll('.factory-lb-examples .factory-lb-example .factory-lb-exq')].filter((q) => q.textContent.trim().length > 10).length,
      cardIcons: document.querySelectorAll('.factory-lb-examples .factory-lb-example .factory-lb-exicon .factory-nav-icon').length,
      columns: new Set([...document.querySelectorAll('.factory-lb-examples .factory-lb-example')].map((c) => Math.round(c.getBoundingClientRect().left))).size,
      rail: !!document.querySelector('.factory-lb-rail'),
      question: !!document.querySelector('#libraryQuestion textarea'), ask: !!ask,
      improve: !!improve, expand: !!document.getElementById('libraryExpand'), style: !!document.getElementById('libraryStyle'),
      composeWidth: compose ? Math.round(compose.getBoundingClientRect().width) : 0, composeRadius: css(compose).borderTopLeftRadius,
      sticky: css(document.querySelector('.factory-lb-composer')).position,
      textSize: css(document.querySelector('#libraryQuestion textarea')).fontSize,
      stylePill: css(document.getElementById('libraryStyle')).borderTopLeftRadius, improvePill: css(improve).borderTopLeftRadius,
      improveText: improve ? improve.textContent.trim() : '', improveLabel: improve ? improve.getAttribute('aria-label') : '', improveTitle: improve ? improve.title : '',
      keys: document.querySelectorAll('.factory-lb-composebar .factory-lb-keys kbd').length,
      askSize: ask ? Math.round(ask.getBoundingClientRect().width) + 'x' + Math.round(ask.getBoundingClientRect().height) : '', askRadius: css(ask).borderTopLeftRadius,
      askText: ask ? ask.textContent.trim() : '?', askLabel: ask ? ask.getAttribute('aria-label') : '', askOff: ask ? ask.getAttribute('aria-disabled') : ''
    };
  });
  record('an empty Ask is one centred question: a sparkle, the heading and what the answers cite (no rail)', empty.heading === 'What do you want to know about OBDX?' && empty.spark && empty.centred
    && /^(Answers cite \d[\d,]* documents?: .+\.|Answers cite the library's notes|The library has no documents)/.test(empty.covers) && !empty.rail, empty);
  const coverCount = await vm((m) => { const line = m.askVersion() || String(m.answer() ? '' : (require('services/workspaceSelection').selectedVersion() || '')).split('.')[0];
    return m.documents().filter((d) => !d.older && d.status !== 'FAILED' && (!line || d.versionLine === line)).length; });
  record('the count of documents the answers cite is the library\'s own', !/^Answers cite \d/.test(empty.covers) || empty.covers.indexOf('Answers cite ' + String(coverCount) + ' document') === 0, { covers: empty.covers, count: coverCount });
  record('four example cards in two columns, each with an icon, its kind and the question', empty.kinds.join(',') === 'Extend a screen,Host integration,Customise safely,Toolkit'
    && empty.cardQuestions === 4 && empty.cardIcons === 4 && empty.columns === 2, empty);
  record('the composer has the question, the answer length, Improve my question, Ask and Expand', empty.question && empty.ask && empty.improve && empty.expand && empty.style, empty);
  record('the composer is centred, at most 760 px, rounded (16 px), 15 px text, and not sticky', empty.composeWidth > 400 && empty.composeWidth <= 760 && empty.composeRadius === '16px'
    && empty.textSize === '15px' && empty.sticky !== 'sticky' && empty.sticky !== 'fixed', empty);
  record('the answer length and Improve are pills; Improve says Improve, named Improve my question', parseFloat(empty.stylePill) >= 14 && parseFloat(empty.improvePill) >= 14
    && empty.improveText === 'Improve' && empty.improveLabel === 'Improve my question' && empty.improveTitle === 'Improve my question', empty);
  record('the keys are shown as key caps and Ask is a 36 px round icon, off while the question is empty', empty.keys >= 3 && empty.askSize === '36x36' && parseFloat(empty.askRadius) >= 18
    && empty.askText === '' && empty.askLabel === 'Ask' && empty.askOff === 'true', empty);

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
        // The server's follow-up questions (none when window.__lbNoFollow is set)
        onEvent({ type: 'done', answer: { answer: answer, grounded: true, sources: sources, versionLine: '25', latencyMs: 1200,
          followUps: window.__lbNoFollow ? [] : ['How do I map the field in the host adapter?', 'Where is the resource bundle?'],
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
  const answered = await run(() => {
    const conv = document.querySelector('.factory-lb-conv').getBoundingClientRect();
    const bubble = document.querySelector('.factory-lb-bubble');
    const b = bubble ? bubble.getBoundingClientRect() : null;
    const steps = document.getElementById('answerSteps');
    const icons = ['copyAnswer', 'regenerateAnswer', 'answerHelpful', 'answerNotHelpful'].map((id) => document.getElementById(id));
    const save = document.getElementById('saveAnswer');
    return {
      asked: window.__lbAsked.length, style: (window.__lbAsked[0] || {}).style,
      title: (document.getElementById('lbQuestionTitle') || {}).textContent || '',
      bubble: !!b && bubble.id === 'lbQuestionTitle' && Math.abs(b.right - conv.right) < 3 && b.left > conv.left + 40,
      avatar: !!document.querySelector('.factory-lb-reply > .factory-lb-spark'),
      steps: steps ? steps.textContent.replace(/\s+/g, ' ').trim() : '', stepsLines: document.querySelectorAll('.factory-lb-steps').length,
      stepsFolded: !!steps && steps.getAttribute('aria-expanded') === 'false' && !document.getElementById('answerDetail'),
      body: !!document.querySelector('#answerBody .fx-md'), cited: document.querySelectorAll('#answerCitations > li').length,
      pills: [...document.querySelectorAll('#answerBody .fx-md-cite.is-numbered')].map((a) => ({ n: (a.querySelector('.fx-md-citen') || {}).textContent || '',
        name: ((a.querySelector('.fx-md-citename') || {}).textContent || '').trim(), href: !!a.getAttribute('href'), label: /^Source \d/.test(a.getAttribute('aria-label') || '') })),
      cards: [...document.querySelectorAll('#answerCitations > li.factory-lb-srcitem')].map((c) => ({ type: ((c.querySelector('.factory-lb-type') || {}).textContent || '').trim(),
        n: ((c.querySelector('.factory-lb-n') || {}).textContent || '').trim(), title: !!c.querySelector('.factory-lb-citetitle'),
        ellipsis: getComputedStyle(c.querySelector('.factory-lb-citetitle')).textOverflow, meta: !!((c.querySelector('.factory-lb-citemeta') || {}).textContent || '').trim(),
        quote: !!c.querySelector('.factory-lb-itemquote') })),
      railHead: ((document.querySelector('.factory-lb-railhead') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      other: (document.querySelector('#librarySearchedNotUsed > summary') || {}).textContent || '', otherOpen: !!(document.getElementById('librarySearchedNotUsed') || {}).open,
      bar: ['answerHelpful', 'answerNotHelpful', 'copyAnswer', 'regenerateAnswer', 'saveAnswer'].filter((id) => !document.getElementById(id)),
      iconOnly: icons.every((x) => x && x.textContent.trim() === '' && !!x.getAttribute('aria-label') && !!x.title),
      names: icons.map((x) => (x ? x.title : '')),
      save: save ? save.textContent.trim() : '', divider: !!save && !!save.previousElementSibling && save.previousElementSibling.classList.contains('factory-lb-barsep'),
      next: [...document.querySelectorAll('#libraryAskNext .factory-lb-nextchip')].map((c) => c.textContent.trim()),
      nextTitle: ((document.querySelector('#libraryAskNext .factory-lb-nexttitle') || {}).textContent || '').trim(),
      newConv: !!document.getElementById('libraryNewConversation'), composer: document.querySelector('#libraryQuestion textarea').value,
      railBeside: (() => { const r = document.querySelector('.factory-lb-rail').getBoundingClientRect(); return r.left >= conv.right - 1 && Math.round(r.width) === 340; })()
    };
  });
  record('Enter asks the question with the chosen answer length', answered.asked === 1 && answered.style === 'DETAILED', answered);
  record('the question is a bubble on the right, the answer beside its mark', /fund transfer screen/.test(answered.title) && answered.bubble && answered.avatar, answered);
  record('one folded line says how well the sources support it and what was searched and read', answered.stepsLines === 1 && answered.stepsFolded
    && /Verified against 2 sources/.test(answered.steps) && /read 3 sections/i.test(answered.steps) && /1\.2 s/.test(answered.steps), answered.steps);
  await click('#answerSteps');
  await sleep(400);
  const detail = await run(() => ({ open: (document.getElementById('answerSteps') || {}).getAttribute('aria-expanded'), text: ((document.getElementById('answerDetail') || {}).textContent || '').replace(/\s+/g, ' ') }));
  record('the line opens the detail: the length, the version, when, and the check', detail.open === 'true' && /Detailed · OBDX 25\.x · just now/.test(detail.text) && /Every statement cites/.test(detail.text), detail);
  await click('#answerSteps');
  await sleep(300);
  record('it folds again', await run(() => !document.getElementById('answerDetail') && document.getElementById('answerSteps').getAttribute('aria-expanded') === 'false'));
  record('citations are pills with the number and a short name, linked', answered.pills.length === 2 && answered.pills.map((p) => p.n).join() === '1,2'
    && answered.pills.every((p) => p.name.length > 0 && p.name.split(' ').length <= 3 && p.href && p.label), answered.pills);
  record('the answer is shown, its two cited sources in the rail beside it (340 px)', answered.body && answered.cited === 2 && answered.railBeside, answered);
  record('the source cards are compact: a type badge, the number, the title on one line, where it is and an excerpt', answered.cards.length === 2
    && answered.cards.every((c) => /^(PDF|DOC|HTML|TXT|NOTE)$/.test(c.type) && /^\d+$/.test(c.n) && c.title && c.ellipsis === 'ellipsis' && c.meta && c.quote)
    && /2 cited · 1 searched and not used/.test(answered.railHead), answered.cards);
  record('the source searched and not used is folded away', /Searched and not used \(1\)/.test(answered.other) && !answered.otherOpen, answered.other);
  record('the actions: Copy, Regenerate and the thumbs are icons with their names, a divider, then Save as a note in words; New conversation is offered',
    answered.bar.length === 0 && answered.iconOnly && answered.names.join() === 'Copy,Regenerate,Helpful,Not helpful' && answered.save === 'Save as a note' && answered.divider && answered.newConv, answered);
  record('Ask next shows the follow-up questions as chips', answered.nextTitle === 'Ask next' && answered.next.join('|') === 'How do I map the field in the host adapter?|Where is the resource bundle?', answered.next);
  record('the composer is emptied for a follow-up', answered.composer === '');

  // A follow-up chip asks it as a follow-up; an answer without follow-ups shows no Ask next
  await run(() => { document.querySelector('#libraryAskNext .factory-lb-nextchip').click(); return 1; });
  await sleep(1200);
  const followed = await run(() => { const b = window.__lbAsked[window.__lbAsked.length - 1] || {}; return { n: window.__lbAsked.length, question: b.question, history: (b.history || []).length,
    title: (document.getElementById('lbQuestionTitle') || {}).textContent || '', line: ((document.querySelector('.factory-lb-convline') || {}).textContent || '').replace(/\s+/g, ' ').trim() }; });
  record('a chip under Ask next asks it as a follow-up', followed.n === 2 && followed.question === 'How do I map the field in the host adapter?' && followed.history === 1
    && /host adapter/.test(followed.title) && /This conversation · 2 questions/.test(followed.line), followed);
  await run(() => { window.__lbNoFollow = true; return 1; });
  await click('#regenerateAnswer');
  await sleep(1200);
  const noNext = await run(() => ({ n: window.__lbAsked.length, next: !!document.getElementById('libraryAskNext'), body: !!document.querySelector('#answerBody .fx-md') }));
  record('an answer without follow-up questions shows no Ask next', noNext.n === 3 && noNext.body && !noNext.next, noNext);
  await run(() => { window.__lbNoFollow = false; return 1; });

  // The expanded editor
  await run(() => { document.getElementById('libraryExpand').focus(); return 1; });
  await click('#libraryExpand');
  await sleep(600);
  const editor = await run(() => {
    const ask = document.getElementById('libraryAskLarge');
    const improve = document.getElementById('libraryImproveLarge');
    return { dialog: !!document.querySelector('#libraryEditor[role=dialog][aria-modal=true]'), focus: document.activeElement && document.activeElement.closest('#libraryEditor') ? document.activeElement.tagName : '',
      ask: ask ? Math.round(ask.getBoundingClientRect().width) + ' ' + getComputedStyle(ask).borderTopLeftRadius + ' ' + ask.getAttribute('aria-label') : '',
      improve: improve ? improve.textContent.trim() + ' ' + getComputedStyle(improve).borderTopLeftRadius : '', keys: document.querySelectorAll('#libraryEditor .factory-lb-keys kbd').length };
  });
  record('Expand opens the question editor as a modal with focus in it', editor.dialog && editor.focus === 'TEXTAREA', editor);
  record('the editor\'s footer looks like the composer: pills, key caps and a round Ask', /^36 \d+px Ask$/.test(editor.ask) && parseFloat(editor.ask.split(' ')[1]) >= 18
    && /^Improve \d/.test(editor.improve) && editor.keys >= 3, editor);
  let inside = true;
  for (let i = 0; i < 8; i++) { await key('Tab', 'Tab', 9); inside = inside && await run(() => !!(document.activeElement && document.activeElement.closest('#libraryEditor'))); }
  record('Tab keeps the focus in the editor', inside);
  await key('Escape', 'Escape', 27);
  await sleep(300);
  record('Escape closes the editor and focus goes back to Expand', await run(() => !document.getElementById('libraryEditor')) && (await active()) === 'libraryExpand', await active());

  // Improve my question rewrites the question in the box, with one line and Undo (the server's reply is stood in for)
  await run(() => new Promise((r) => window.require(['services/api'], (api) => {
    const post = api.post;
    api.post = (path, body) => (path === 'knowledge/improve-question'
      ? Promise.resolve({ status: 'NEEDS_CLARIFICATION', enhancedQuery: 'How do I add a Purpose of payment field to the OBDX fund transfer screen?', clarificationQuestions: ['Retail or corporate users?'], assumptions: [], byModel: true })
      : post(path, body));
    r(1);
  })));
  await vm((m) => { m.question('purpose field on transfer'); return 1; });
  await click('#libraryImprove');
  await sleep(800);
  const improved = await run(() => {
    const line = document.getElementById('libraryImproved');
    const area = document.querySelector('#libraryQuestion textarea');
    return {
      value: area.value, line: ((line || {}).textContent || '').replace(/s+/g, ' ').trim(),
      card: !!document.querySelector('.factory-lb-improve, #libraryUseImproved, #libraryCancelImprove'), undo: !!document.getElementById('libraryUndoImprove'),
      above: !!line && !!(line.compareDocumentPosition(area) & 4), glow: !!document.querySelector('.factory-lb-compose.is-improved'),
      pill: (document.getElementById('libraryImprove') || { className: '' }).className.indexOf('is-on') >= 0
    };
  });
  record('Improve my question rewrites the question in the box, with one line saying what to add and Undo, and no separate card',
    /Purpose of payment/.test(improved.value) && /Retail or corporate/.test(improved.line) && improved.undo && !improved.card, improved);
  record('while an improvement shows, its line sits above the question and the composer glows', improved.above && improved.glow && improved.pill, improved);
  await click('#libraryUndoImprove');
  await sleep(300);
  const undone = await run(() => ({ value: document.querySelector('#libraryQuestion textarea').value, line: !!document.getElementById('libraryImproved') }));
  record('Undo puts back the question as it was written', undone.value === 'purpose field on transfer' && !undone.line, undone);
  await click('#libraryImprove');
  await sleep(800);
  await click('#libraryAsk');
  await sleep(1200);
  const askedImproved = await run(() => ({ body: window.__lbAsked[window.__lbAsked.length - 1] || {}, line: !!document.getElementById('libraryImproved'),
    askedAs: ((document.querySelector('.factory-lb-askedas') || {}).textContent || '').trim() }));
  record('Ask sends the question as written with the improved one, and the answer says what it was asked as',
    askedImproved.body.question === 'purpose field on transfer' && /Purpose of payment/.test(askedImproved.body.improved || '') && !askedImproved.line && /Purpose of payment/.test(askedImproved.askedAs), askedImproved);

  // New conversation empties the thread; an example card asks its question
  await click('#libraryNewConversation');
  await sleep(600);
  const fresh = await run(() => ({ hero: !!document.querySelector('.factory-lb-hero'), cards: document.querySelectorAll('.factory-lb-example').length }));
  await run(() => { const c = document.querySelectorAll('.factory-lb-example')[1]; if (c) { c.click(); } return !!c; });
  await sleep(1200);
  const byCard = await run(() => { const b = window.__lbAsked[window.__lbAsked.length - 1] || {}; return { question: b.question, history: (b.history || []).length, answer: !!document.querySelector('#answerBody .fx-md') }; });
  record('New conversation brings back the empty Ask; an example card asks its question', fresh.hero && fresh.cards === 4 && byCard.question === 'How is a fund transfer sent to the host?'
    && byCard.history === 0 && byCard.answer, { fresh: fresh, byCard: byCard });

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
    const bubble = document.querySelector('.factory-lb-asked').getBoundingClientRect();
    const keys = document.querySelector('.factory-lb-composer .factory-lb-keys');
    return { bar: text ? Math.round(text.getBoundingClientRect().height) : 0, oneRow: tabs.every((t) => Math.abs(t - tabs[0]) < 2),
      composerLast: !!comp && comp === conv.lastElementChild, stacked: document.querySelector('.factory-lb-rail').getBoundingClientRect().top >= conv.getBoundingClientRect().bottom - 1,
      bubble: Math.round(bubble.width / conv.getBoundingClientRect().width * 100), keysHidden: !keys || keys.offsetParent === null };
  });
  record('on a phone the problem bar is one line, the tabs one row, the sources under the answer and the composer at the bottom',
    (!state.problem || (phone.bar > 0 && phone.bar <= 24)) && phone.oneRow && phone.composerLast && phone.stacked, phone);
  record('on a phone the question bubble may take most of the width and the keys are hidden', phone.bubble <= 93 && phone.keysHidden, phone);
  await vm((m) => { m.newConversation(); return 1; });
  await sleep(800);
  const phoneEmpty = await run(() => ({ columns: new Set([...document.querySelectorAll('.factory-lb-example')].map((c) => Math.round(c.getBoundingClientRect().left))).size,
    cards: document.querySelectorAll('.factory-lb-example').length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  record('on a phone the example cards are one column and nothing scrolls sideways', phoneEmpty.cards === 4 && phoneEmpty.columns === 1 && phoneEmpty.over <= 0, phoneEmpty);

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'OBDX Library: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
