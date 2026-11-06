// Models & AI check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - one answer to what is in use: the Writing and Search slots, the provider rows marked in use and the routing table
//    all say what GET /api/model/status says (the settings the server uses);
//  - each slot shows the model, provider, address, inside or outside the bank and its last test, with Test and Change;
//  - Change opens the provider's side panel: focus moves into it, Escape and the close button close it, focus returns;
//  - Use for writing and Use for search send PUT /api/model/settings with the role moved and the other kept (an api
//    stand-in in the page answers, so nothing is saved);
//  - no provider shows as connected before a test of it succeeded; Usage & Cost, the capability table, Provider Health
//    and the disabled fallback controls are gone; routing, the failure behaviour and the learned limits are shown;
//  - the data classification says where the bank's content may go; API keys never reach the browser;
//  - tabs work with the arrow keys; nothing scrolls sideways at 390 px (panel closed and open); no console errors.
// It tests the connection to the writing model's server (lists its models: nothing is sent to the model).
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-models.js --url http://localhost:8080
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
  // Runs fn(viewModel, arg) in the page
  const vm = (fn, arg) => run({ toString: () => '(a) => new Promise((resolve) => window.require([\'knockout\'], (ko) => Promise.resolve(('
    + fn.toString() + ')(ko.dataFor(document.querySelector(\'.factory-ma\')), a)).then(resolve)))' }, arg);
  const key = async (k, code, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: code, windowsVirtualKeyCode: vk });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: vk });
  };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=models');
  await sleep(6000);

  // One answer to what is in use
  const status = await run(() => fetch('api/model/status').then((r) => r.json()));
  const shown = await vm((m) => ({
    slots: m.slots().map((x) => ({ id: x.id, model: x.model, url: x.url, provider: x.provider, place: x.place.text, last: x.last })),
    rows: m.providers().filter((p) => p.roles().length).map((p) => ({ url: p.baseUrl(), roles: p.roles() })),
    routing: m.routing().map((r) => ({ job: r.job, chip: r.chip.text, model: r.model })),
    title: (document.querySelector('.factory-ma h1') || {}).textContent || ''
  }));
  const norm = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
  const searchUrl = status.embeddingBaseUrl || status.baseUrl;
  const w = shown.slots.find((x) => x.id === 'writing');
  const se = shown.slots.find((x) => x.id === 'search');
  record('the title is Models & AI', shown.title.trim() === 'Models & AI', shown.title);
  record('two slots, Writing and Search', shown.slots.length === 2 && !!w && !!se, shown.slots.map((x) => x.id));
  record('the Writing slot says the chat model and server the factory uses', !!w && w.model === status.chatModel && norm(w.url) === norm(status.baseUrl), w);
  record('the Search slot says the embedding model and server the factory uses', !!se && se.model === status.embeddingModel && norm(se.url) === norm(searchUrl), se);
  record('the providers marked in use are the same servers',
    shown.rows.some((r) => norm(r.url) === norm(status.baseUrl) && r.roles.indexOf('Writing') >= 0)
    && shown.rows.some((r) => norm(r.url) === norm(searchUrl) && r.roles.indexOf('Search') >= 0)
    && shown.rows.every((r) => (r.roles.indexOf('Writing') < 0 || norm(r.url) === norm(status.baseUrl)) && (r.roles.indexOf('Search') < 0 || norm(r.url) === norm(searchUrl))), shown.rows);
  record('routing names the same models', shown.routing.every((r) => (r.chip !== 'Writing' || r.model === status.chatModel) && (r.chip !== 'Search' || r.model === status.embeddingModel)));
  const slotsDom = await run(() => [...document.querySelectorAll('.factory-ma-slot')].map((el) => ({
    text: el.innerText.replace(/\s+/g, ' '), buttons: [...el.querySelectorAll('button')].map((b) => b.textContent.trim())
  })));
  record('each slot shows model, provider, address, inside or outside the bank, its last test, Test and Change',
    slotsDom.length === 2 && slotsDom.every((d, i) => d.text.indexOf(shown.slots[i].model) >= 0 && d.text.indexOf(shown.slots[i].url) >= 0
      && /(Inside|Outside) the bank/.test(d.text) && /(Tested|Failed|Not tested|Administrators)/.test(d.text) && d.buttons.join() === 'Test,Change'), slotsDom);
  const gone = await run(() => ({ usage: !!document.getElementById('md-usage') || !!document.getElementById('ma-usage') || !!document.getElementById('usageEmpty'),
    matrix: !!document.getElementById('capabilityMatrix'), health: !!document.getElementById('providerHealth'), fallback: !!document.getElementById('fallbackProvider') || !!document.getElementById('autoFallback'),
    defaults: !!document.getElementById('defaultSettings') || !!document.getElementById('defaultProvider'), table: !!document.getElementById('modelTable'),
    tabs: [...document.querySelectorAll('.factory-ma-tabs [role=tab]')].map((t) => t.textContent.trim()), usageLine: (document.getElementById('usageLine') || {}).textContent || '' }));
  record('four tabs: Overview, Routing & limits, Privacy, Try a prompt', gone.tabs.join('|') === 'Overview|Routing & limits|Privacy|Try a prompt', gone.tabs);
  record('Usage & Cost, the models table, capabilities, Provider Health, Default Model Settings and the fallback controls are gone',
    !gone.usage && !gone.matrix && !gone.health && !gone.fallback && !gone.defaults && !gone.table, gone);
  record('one line says usage is not recorded', /does not record token usage/.test(gone.usageLine));

  // No provider reads connected without a test that succeeded
  const before = await vm((m) => m.providers().map((p) => ({ name: p.name, pill: p.pill().text, remembered: p.health().check ? p.health().check.ok : null })));
  record('no provider shows as connected without a test that succeeded', before.every((p) => p.remembered === true || p.pill !== 'Connected'), before);

  // The side panel: Change on the Writing slot
  await run(() => { document.querySelector('#slot-writing button[aria-label^="Change"]').focus(); document.querySelector('#slot-writing button[aria-label^="Change"]').click(); return 1; });
  await sleep(800);
  const opened = await run(() => ({ open: !!document.querySelector('#providerSheet .fx-sheet'), focusIn: !!(document.activeElement && document.activeElement.closest('.fx-sheet')),
    heading: ((document.querySelector('#providerSheet .fx-sheet-title') || {}).textContent || '').trim(),
    fields: !!document.getElementById('panelUrl') && !!document.getElementById('panelKey'), keyType: (document.querySelector('#panelKey input') || {}).type,
    keyValue: (document.querySelector('#panelKey input') || {}).value, test: !!document.getElementById('panelTestButton'), save: !!document.getElementById('panelSave') }));
  record('Change opens the provider\'s side panel with the focus inside', opened.open && opened.focusIn, opened);
  record('the panel has the address, the API key (a password field, empty), Test connection and Save', opened.fields && opened.keyType === 'password' && !opened.keyValue && opened.test && opened.save, opened);
  record('the panel is the writing model\'s provider', opened.heading === w.provider, opened.heading);
  await key('Escape', 'Escape', 27);
  await sleep(500);
  const closed = await run(() => ({ open: !!document.querySelector('#providerSheet .fx-sheet'), back: !!(document.activeElement && document.activeElement.matches('#slot-writing button[aria-label^="Change"]')) }));
  record('Escape closes the panel and the focus returns to Change', !closed.open && closed.back, closed);
  await run(() => { document.querySelector('.factory-ma-open').click(); return 1; });
  await sleep(600);
  await run(() => { document.querySelector('#providerSheet .fx-sheet-close').click(); return 1; });
  await sleep(500);
  record('the close button closes the panel', await run(() => !document.querySelector('#providerSheet .fx-sheet')));

  // Use for writing / Use for search with an api stand-in: the request is recorded and answered here, nothing is saved
  const use = await vm((m) => new Promise((resolve) => window.require(['services/api'], (api) => {
    const sent = [];
    const put = api.put;
    api.put = (path, body) => { sent.push({ path: path, body: body }); return Promise.resolve({ status: Object.assign({}, m.status()), embeddingsRemoved: false, embeddingProblem: null }); };
    const p = m.providers().find((x) => x.id === 'groq');
    const s = m.status();
    p.models([{ id: 'stand-in-chat', embedding: false }, { id: 'stand-in-embed', embedding: true }]);
    p.open();
    setTimeout(() => {
      const buttons = [...document.querySelectorAll('#panelModels .factory-ma-use')];
      const offers = buttons.map((b) => b.textContent.trim());
      (buttons.find((b) => b.textContent.trim() === 'Use for writing') || { click: () => 0 }).click();
      setTimeout(() => {
        ([...document.querySelectorAll('#panelModels .factory-ma-use')].find((b) => b.textContent.trim() === 'Use for search') || { click: () => 0 }).click();
        setTimeout(() => { api.put = put; p.models([]); m.panelOpen(false); resolve({ offers: offers, sent: sent, status: { baseUrl: s.baseUrl, embeddingBaseUrl: s.embeddingBaseUrl, chatModel: s.chatModel, embeddingModel: s.embeddingModel }, url: p.baseUrl() }); }, 800);
      }, 800);
    }, 600);
  })));
  const wr = use.sent[0];
  const sr = use.sent[1];
  record('the panel lists the server\'s models with Use for writing and Use for search', use.offers.indexOf('Use for writing') >= 0 && use.offers.indexOf('Use for search') >= 0, use.offers);
  record('Use for writing sends PUT model/settings: writing moves to this server, search stays where it was',
    !!wr && wr.path === 'model/settings' && wr.body.chatModel === 'stand-in-chat' && norm(wr.body.baseUrl) === norm(use.url) && wr.body.embeddingModel === use.status.embeddingModel
      && norm(wr.body.embeddingBaseUrl) === norm(use.status.embeddingBaseUrl || use.status.baseUrl) && wr.body.embeddingApiKey === null, wr && Object.assign({}, wr.body, { apiKey: wr.body.apiKey ? 'set' : wr.body.apiKey }));
  record('Use for search sends PUT model/settings: search moves to this server, writing stays',
    !!sr && sr.path === 'model/settings' && sr.body.embeddingModel === 'stand-in-embed' && norm(sr.body.embeddingBaseUrl) === norm(use.url) && sr.body.chatModel === use.status.chatModel
      && norm(sr.body.baseUrl) === norm(use.status.baseUrl) && sr.body.apiKey === null, sr && Object.assign({}, sr.body, { embeddingApiKey: sr.body.embeddingApiKey ? 'set' : sr.body.embeddingApiKey }));
  // The stand-in answered with the status as it was; read it again so the page shows the server's truth
  await open(BASE + '/?ojr=models');
  await sleep(5000);

  // Test the writing model's server: the slot shows the result the server remembers, as Integrations does
  await run(() => { document.querySelector('#slot-writing button[aria-label^="Test"]').click(); return 1; });
  for (let i = 0; i < 40 && await vm((m) => m.providers().some((p) => p.testing())); i++) { await sleep(500); }
  await sleep(800);
  const tested = await vm((m) => m.writing().last);
  record('after a test the Writing slot shows when it was tested or why it failed', /^(Tested|Failed) /.test(tested), tested);

  // Tabs by keyboard; routing, fallback, limits
  await run(() => { document.getElementById('ma-overview').focus(); return 1; });
  await key('ArrowRight', 'ArrowRight', 39);
  await sleep(800);
  record('ArrowRight moves to Routing & limits', await run(() => document.activeElement && document.activeElement.id === 'ma-routing'));
  const routing = await run(() => ({
    jobs: [...document.querySelectorAll('#routingTable tbody tr td:first-child')].map((t) => t.textContent.trim()),
    note: (document.getElementById('taskRoutingNote') || {}).textContent || '', fallback: (document.getElementById('fallbackFacts') || {}).textContent || '',
    limits: !!document.getElementById('limitsTable'), prompts: (document.getElementById('promptsLink') || {}).textContent || ''
  }));
  record('routing names specification drafts, question improvement, screens, impact, code generation, library answers, search and code review',
    ['Specification drafts', 'Improve my question', 'Screen changes', 'Impact analysis', 'Code generation', 'OBDX Library answers', 'Search by meaning', 'Code review']
      .every((t) => routing.jobs.some((x) => x.indexOf(t) >= 0)), routing.jobs);
  record('routing says a model per job is not offered', /not offered/.test(routing.note));
  record('the failure behaviour and the learned limits are shown', /no fallback provider/i.test(routing.fallback) && routing.limits);
  record('the routing header links to the prompts it uses', routing.prompts.trim() === 'The prompts it uses');

  // Privacy
  await run(() => { document.getElementById('ma-policies').click(); return 1; });
  await sleep(1000);
  const privacy = await run(() => ({ rows: document.querySelectorAll('#classificationTable tbody tr').length, rotation: document.querySelectorAll('#rotationSteps li').length }));
  record('the data classification says where restricted content and code may go', privacy.rows === 2, privacy);
  record('rotating a key is explained step by step', privacy.rotation === 3);

  // Keys never reach the browser
  const raw = await run(() => fetch('api/model/status').then((r) => r.text()));
  record('the model status holds no key, only whether one is set', !/apiKey"\s*:\s*"/.test(raw) && /apiKeySet/.test(raw), raw.slice(0, 160));

  // Phone, with the panel closed and open
  await run(() => { document.getElementById('ma-overview').click(); return 1; });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));
  await run(() => { document.querySelector('.factory-ma-open').click(); return 1; });
  await sleep(800);
  record('the panel fits a 390 px screen', await run(() => { const r = document.querySelector('#providerSheet .fx-sheet').getBoundingClientRect(); return r.left >= 0 && r.right <= 390 && document.documentElement.scrollWidth <= 390; }));
  await key('Escape', 'Escape', 27);

  const errors = s.errors.filter((e) => !/auth\/me/.test(e) && !/servers\/models/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Models & AI: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
