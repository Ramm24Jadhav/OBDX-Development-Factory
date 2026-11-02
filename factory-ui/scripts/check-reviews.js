// External Review check: drives a running factory in headless Edge or Chrome and checks what the pages promise.
//  The team's page (?ojr=reviews):
//  - one row of tabs, a plain summary line, the screens and the selected screen's link: status, expiry, what is shared,
//    reviewers, requested changes and decisions kept apart;
//  - revoking a link asks first (the check cancels: the link still works);
//  - nothing scrolls sideways at 390 px; no console errors.
//  The reviewer's page (?ojr=review&embed=1&token=..., signed out):
//  - it shows at once, calls only /api/review/<token>, and the answer has no ids, tokens, team comments, team names or
//    where the screen's values are loaded from;
//  - a comment can be about one part of the screen (the About list); approving asks first (cancelled);
//  - a link that is not valid says so.
//  With --write 1 (a test factory only: it adds a comment and a link that stay in its data) it also creates a link for a
//  screen without one, comments through it as a reviewer about one field, resolves the comment as the team, revokes the
//  link and checks that the old address no longer opens.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-reviews.js --url http://localhost:8080 [--shots <dir>] [--write 1]
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
const WRITE = args.write === '1';

(async () => {
  const s = await qa.start({ base: BASE, browser: args.browser });
  const { cdp, run, open } = s;
  let defects = 0;
  const record = (check, ok, detail) => {
    if (!ok) { defects++; }
    process.stdout.write((ok ? '. ' : 'x ') + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const vm = (fn, arg) => run({ toString: () => '(arg) => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.querySelector(\'.factory-xr\')), arg))))' }, arg);
  const shot = async (name) => {
    if (!SHOTS) { return; }
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const theme = (t) => run((x) => new Promise((r) => window.require(['services/preferences'], (p) => { p.theme(x); r(1); })), t);
  const size = (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });

  // The workspace and screen to look at: the first with an active link (or, when writing, any draft screen)
  const pick = await run(async (write) => {
    const ws = await fetch('api/workspaces').then((r) => r.json());
    let fallback = null;
    for (const w of ws) {
      const list = await fetch('api/workspaces/' + w.id + '/designs').then((r) => r.json());
      for (const d of list) {
        const det = await fetch('api/designs/' + d.id).then((r) => r.json());
        const live = det.reviewToken && new Date(det.reviewExpiresAt) > new Date();
        if (live && !write) { return { workspaceId: w.id, designId: d.id, token: det.reviewToken, team: det.comments.filter((c) => !c.fromReview).map((c) => c.text) }; }
        if (write && !live && det.status === 'DRAFT' && det.model && det.model.sections.some((x) => x.components.length) && !fallback) {
          fallback = { workspaceId: w.id, designId: d.id, token: null, team: det.comments.filter((c) => !c.fromReview).map((c) => c.text) };
        }
      }
    }
    return fallback;
  }, WRITE);
  if (!pick) { record('a screen to check', false, WRITE ? 'no draft screen with fields' : 'no active review link: run with --write 1 on a test factory'); s.close(); process.exit(1); }

  // ---------- The team's page ----------
  await size(1440, 1000);
  await open(BASE + '/?ojr=overview');
  await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (sel) => { sel.selectedId(id); r(1); })), pick.workspaceId);
  await run(() => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'reviews' })); return 1; });
  await sleep(5000);
  await vm((m, id) => { m.selectedId(id); return 1; }, pick.designId);
  await sleep(800);

  if (WRITE) {
    await vm((m) => { m.createLink(); return 1; });
    await sleep(2500);
    pick.token = await run((id) => fetch('api/designs/' + id).then((r) => r.json()).then((d) => d.reviewToken), pick.designId);
    record('creating a link from the page gives the screen a link', !!pick.token);
  }

  const page = await run(() => ({
    h1: (document.querySelector('.factory-xr h1') || {}).textContent,
    tablists: document.querySelectorAll('.factory-xr [role="tablist"]').length,
    kpis: document.querySelectorAll('.factory-xr .fx-kpi').length,
    summary: (document.getElementById('reviewSummary') || {}).textContent || '',
    facts: [...document.querySelectorAll('#reviewFacts dt')].map((d) => d.textContent.trim()),
    shared: ([...document.querySelectorAll('#reviewFacts dd')][2] || {}).textContent || '',
    copy: !!document.getElementById('copyLinkButton'),
    sections: [...document.querySelectorAll('.factory-xr-h3')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    switches: document.querySelectorAll('.factory-xr .fx-switch').length
  }));
  record('the page is External Review with one row of tabs and no KPI cards', /External Review/.test(page.h1) && page.tablists === 1 && page.kpis === 0, page);
  record('the summary line gives real counts', /\d+ active links?/.test(page.summary) && /\d+ open reviewer comments?/.test(page.summary), page.summary.trim());
  record('the link shows its status, expiry, what is shared, reviewers and requirement', ['Link', 'Expires', 'Shared', 'Reviewers', 'Requirement'].every((f) => page.facts.includes(f)), page.facts);
  record('what is shared says reviewers see no code or team comments', /do not see code/.test(page.shared) && /team's comments/.test(page.shared), page.shared.trim());
  record('requested changes and decisions are kept apart', page.sections.some((t) => /^Requested changes/.test(t)) && page.sections.includes('Decisions'), page.sections);
  record('an active link can be copied', page.copy);
  record('no switches for settings the factory does not have', page.switches === 0);
  await shot('reviews-1440-light');

  // Revoking asks first (cancelled)
  await vm((m) => { m.revokeLink(); return 1; });
  await sleep(700);
  const dialogText = await run(() => { const d = document.querySelector('.fx-dialog'); return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : ''; });
  record('revoking a link asks first', /Revoke/.test(dialogText) && /stops working/.test(dialogText), dialogText);
  await run(() => { const c = [...document.querySelectorAll('.fx-dialog button')].find((b) => /Cancel/.test(b.textContent)); if (c) { c.click(); } return !!c; });
  await sleep(500);
  const stillLive = await run((id) => fetch('api/designs/' + id).then((r) => r.json()).then((d) => !!d.reviewToken), pick.designId);
  record('a cancelled revoke changes nothing', stillLive);

  // The other tabs
  await run(() => { document.getElementById('xr-comments').click(); return 1; });
  await sleep(600);
  record('the Comments tab lists comments in a table', await run(() => !!document.querySelector('#allComments thead') && !document.getElementById('xr-panel-comments').hidden));
  await run(() => { document.getElementById('xr-history').click(); return 1; });
  await sleep(600);
  const hist = await run(() => ({ shown: !document.getElementById('xr-panel-history').hidden, rows: document.querySelectorAll('#reviewHistory li').length }));
  const histServer = await run((ws) => fetch('api/workspaces/' + ws + '/review-history').then((r) => r.json()).then((l) => l.length), pick.workspaceId);
  record('History shows the recorded link and approval events', hist.shown && hist.rows === histServer, { page: hist.rows, server: histServer });
  await run(() => { document.getElementById('xr-links').click(); return 1; });
  await sleep(400);

  for (const t of ['dark', 'light']) {
    await theme(t);
    for (const [w, h] of [[1440, 1000], [390, 844]]) {
      await size(w, h);
      await sleep(900);
      if (w === 390) {
        const sw = await run(() => document.documentElement.scrollWidth);
        record('the team page does not scroll sideways at 390 px (' + t + ')', sw <= 390, sw);
      }
      if (!(w === 1440 && t === 'light')) { await shot('reviews-' + w + '-' + t); }
    }
  }
  await size(1440, 1000);
  const teamErrors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors on the team page', teamErrors.length === 0, teamErrors.slice(0, 3));

  // ---------- The reviewer's page, signed out ----------
  await run(() => fetch('api/auth/logout', { method: 'POST', headers: { 'X-XSRF-TOKEN': decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '') } }).then((r) => r.status));
  await cdp('Network.clearBrowserCookies');
  const requests = [];
  s.onEvent((m) => { if (m.method === 'Network.requestWillBeSent' && /\/api\//.test(m.params.request.url)) { requests.push(m.params.request.url.replace(BASE, '')); } });
  s.errors.length = 0;
  const started = Date.now();
  await cdp('Page.navigate', { url: BASE + '/?ojr=review&embed=1&token=' + pick.token });
  let shownAfter = null;
  for (let i = 0; i < 40 && shownAfter === null; i++) {
    await sleep(250);
    try { if (await run(() => document.body.classList.contains('fx-ready') && !!document.querySelector('.factory-rw-title'))) { shownAfter = Date.now() - started; } } catch (e) { /* loading */ }
  }
  record('the review page shows within 6 seconds', shownAfter !== null && shownAfter < 6000, shownAfter);
  await sleep(1500);
  const answer = await run((t) => fetch('api/review/' + encodeURIComponent(t)).then((r) => r.text()), pick.token);
  const leaks = ['reviewToken', 'workspaceId', 'requirementId', 'fromReview', 'resolvedBy', pick.workspaceId, pick.designId]
    .filter((k) => answer.indexOf(k) >= 0).concat(/"dataSource":\s*\{/.test(answer) ? ['a data source'] : []).concat(pick.team.filter((t) => t && answer.indexOf(t) >= 0).map((t) => 'team comment: ' + t.slice(0, 30)));
  record('the review answer has no ids, tokens, team comments or data sources', leaks.length === 0, leaks);
  const others = requests.filter((u) => !u.startsWith('/api/review/'));
  record('the review page calls only the review link', others.length === 0, others.slice(0, 5));
  const rv = await run(() => ({
    about: !!document.getElementById('reviewAbout'), decision: !!document.getElementById('reviewDecisionTitle'),
    comments: !!document.getElementById('reviewCommentsTitle'), facts: (document.getElementById('reviewFacts') || {}).textContent || ''
  }));
  record('the reviewer sees the version, link expiry, comments (with About) and the decision apart', rv.about && rv.decision && rv.comments && /Version \d+/.test(rv.facts), rv);

  // A comment about one part of the screen
  const part = await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => {
    const m = ko.dataFor(document.querySelector('.factory-xw'));
    const p = m.parts().find((x) => x.value);
    m.author('QA reviewer');
    if (p) { m.about(p.value); }
    resolve(p || null);
  })));
  await sleep(500);
  const label = await run(() => { const f = document.querySelector('#reviewComment label, #reviewAbout .fx-select-value, #reviewAbout button'); return f ? f.textContent.trim() : ''; });
  record('a comment can be about one part of the screen', !!part, { part: part, shown: label.slice(0, 60) });
  if (WRITE && part) {
    await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => { const m = ko.dataFor(document.querySelector('.factory-xw')); m.text('QA check: please show the currency.'); m.sendComment(); resolve(1); })));
    await sleep(1500);
    const sent = await run(() => [...document.querySelectorAll('#reviewComments li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
    record('the reviewer\'s comment shows with the part it is about and as open', sent.some((t) => /QA check/.test(t) && t.indexOf('On: ' + part.label) >= 0 && /Open/.test(t)), sent.slice(0, 2));
  }
  // Approving asks first (cancelled)
  await run(() => { document.getElementById('reviewApproveButton').click(); return 1; });
  await sleep(700);
  const approveDialog = await run(() => { const d = document.querySelector('.fx-dialog'); return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : ''; });
  record('approving asks first', /Approve this screen design/.test(approveDialog), approveDialog);
  await run(() => { const c = [...document.querySelectorAll('.fx-dialog button')].find((b) => /Cancel/.test(b.textContent)); if (c) { c.click(); } return !!c; });
  await sleep(400);
  await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => { const m = ko.dataFor(document.querySelector('.factory-xw')); m.about(''); m.author(''); resolve(1); })));

  for (const t of ['light', 'dark']) {
    await theme(t);
    for (const [w, h] of [[1440, 1000], [390, 844]]) {
      await size(w, h);
      await sleep(900);
      if (w === 390) {
        const sw = await run(() => document.documentElement.scrollWidth);
        record('the review page does not scroll sideways at 390 px (' + t + ')', sw <= 390, sw);
      }
      await shot('review-' + w + '-' + t);
    }
  }
  await theme('light');
  await size(1440, 1000);
  const reviewErrors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors on the review page', reviewErrors.length === 0, reviewErrors.slice(0, 3));

  // A link that is not valid
  await cdp('Page.navigate', { url: BASE + '/?ojr=review&embed=1&token=not-a-valid-link' });
  await sleep(4000);
  const bad = await run(() => (document.getElementById('reviewError') || {}).textContent || '');
  record('a link that is not valid says so', /not valid/.test(bad), bad.trim());

  if (WRITE) {
    // Resolve the comment and revoke the link as the team; the old address stops working
    s.close();
    const t = await qa.start({ base: BASE, browser: args.browser });
    const result = await t.run(async (x) => {
      const xsrf = () => decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '');
      const send = (method, url, body) => fetch(url, { method: method, headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf() }, body: body ? JSON.stringify(body) : undefined });
      const d = await fetch('api/designs/' + x.designId).then((r) => r.json());
      const mine = d.comments.find((c) => c.fromReview && /QA check/.test(c.text));
      const resolved = mine ? await send('PUT', 'api/designs/' + x.designId + '/comments/' + mine.id + '/resolved', { resolved: true }).then((r) => r.json()) : null;
      const shownResolved = await fetch('api/review/' + encodeURIComponent(x.token)).then((r) => r.json()).then((v) => v.comments.some((c) => /QA check/.test(c.text) && c.resolved));
      const revoked = await send('DELETE', 'api/designs/' + x.designId + '/review-link').then((r) => r.status);
      const after = await fetch('api/review/' + encodeURIComponent(x.token)).then((r) => r.status);
      const comment = await fetch('api/review/' + encodeURIComponent(x.token) + '/comments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf() }, body: JSON.stringify({ author: 'x', text: 'late' }) }).then((r) => r.status);
      const history = await fetch('api/workspaces/' + x.workspaceId + '/review-history').then((r) => r.json());
      return { resolvedBy: resolved && resolved.comments.find((c) => c.id === mine.id).resolvedBy, shownResolved: shownResolved, revoked: revoked, after: after, comment: comment,
        audited: ['REVIEW_LINK_CREATED', 'REVIEW_COMMENT_RESOLVED', 'REVIEW_LINK_CLOSED'].every((a) => history.some((e) => e.action === a)),
        tokenInHistory: JSON.stringify(history).indexOf(x.token) >= 0 };
    }, pick);
    record('the team can resolve a reviewer\'s comment; the reviewer sees it resolved, not by whom', !!result.resolvedBy && result.shownResolved, result);
    record('a revoked link no longer opens or takes comments', result.revoked === 200 && result.after === 404 && result.comment === 404, result);
    record('creating, resolving and revoking are recorded, without the link address', result.audited && !result.tokenInHistory);
    t.close();
  } else {
    s.close();
  }
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'External Review: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
