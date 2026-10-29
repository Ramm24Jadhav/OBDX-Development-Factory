// Responsive check: opens every page of a running factory in headless Edge or Chrome at each viewport size and
// reports page-level horizontal overflow, elements past the window edge, clipped labels, overlapping controls, text
// that is too small, popups outside the window, console errors and failed requests, with a screenshot per page.
// Wide tables, code and logs may scroll inside their own box; only scrolling of the whole page counts as overflow.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-responsive.js --url http://localhost:8080
//
// Options: --pages overview,code   --sizes 375x667,1440x900   --out <folder for report.json and screenshots>
//          --workspace <id>   --theme light|dark   --reduced-motion 1   --browser <path to msedge.exe or chrome>
// It only reads: it signs in and opens pages, and never saves or deletes anything. Exit code 1 when a defect is found.
// No dependencies: it talks to the browser over the DevTools protocol with the small WebSocket client below.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const OUT = path.resolve(args.out || 'responsive-report');
const PAGES = (args.pages || 'overview,workspaces,code,profile,requirements,designer,changes,impact,build,models,'
  + 'modernization,agents,admin,reviews,integrations,packs,knowledge,prompts,notifications,account,about,design').split(',');
// The device classes, plus 1280x800 and 1440x900 at 200% browser zoom (the same CSS width as 640 and 720 pixels).
const SIZES = (args.sizes || '320x568,375x667,430x932,768x1024,1024x768,1280x800,1440x900,1920x1080,640x400@2,720x450@2')
  .split(',').map((s) => { const m = /^(\d+)x(\d+)(?:@(\d))?$/.exec(s); return { w: +m[1], h: +m[2], scale: +(m[3] || 1), name: s.replace('@2', '-zoom200') }; });

// ---------- A minimal WebSocket client (text frames only), enough for the DevTools protocol ----------
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key } });
    req.on('upgrade', (res, socket) => {
      let buffer = Buffer.alloc(0);
      const listeners = [];
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
          if (buffer.length < 2) { return; }
          let len = buffer[1] & 0x7f;
          let offset = 2;
          if (len === 126) { if (buffer.length < 4) { return; } len = buffer.readUInt16BE(2); offset = 4; }
          else if (len === 127) { if (buffer.length < 10) { return; } len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
          if (buffer.length < offset + len) { return; }
          const opcode = buffer[0] & 0x0f;
          const payload = buffer.subarray(offset, offset + len);
          buffer = buffer.subarray(offset + len);
          if (opcode === 1) { listeners.forEach((l) => l(payload.toString('utf8'))); }
        }
      });
      resolve({
        send(text) {
          const data = Buffer.from(text, 'utf8');
          const mask = crypto.randomBytes(4);
          let head;
          if (data.length < 126) { head = Buffer.from([0x81, 0x80 | data.length]); }
          else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2); }
          else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
          const masked = Buffer.alloc(data.length);
          for (let i = 0; i < data.length; i++) { masked[i] = data[i] ^ mask[i % 4]; }
          socket.write(Buffer.concat([head, mask, masked]));
        },
        onMessage(l) { listeners.push(l); },
        close() { socket.destroy(); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getJson(port, p, method) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: port, path: p, method: method || 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

let browserProcess = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const candidates = [args.browser, process.env.FACTORY_QA_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find((c) => c && fs.existsSync(c));
}

// ---------- What is measured on each page (runs in the page) ----------
function measure() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim()
    ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const visible = (e) => {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) { return false; }
    // Content of a closed <details> still reports a box in Chrome, but it does not show
    const closed = e.closest('details:not([open])');
    if (closed && !e.closest('summary')) { return false; }
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Inside a box that scrolls or clips sideways on purpose (tables, code, tab strips): not a page defect.
  const inLocalScroll = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') { return true; }
    }
    return false;
  };
  const shell = document.querySelector('.factory-shell');
  const closedDrawer = (e) => vw < 768 && e.closest('.factory-sidebar') && !(shell && shell.classList.contains('factory-shell-open'));
  const all = [...document.querySelectorAll('body *')];
  const out = { docWidth: document.documentElement.scrollWidth, viewport: vw, beyond: [], clipped: [], overlaps: [], tiny: 0, tinyExamples: [], smallTargets: 0 };
  for (const e of all) {
    if (!visible(e) || closedDrawer(e) || e.closest('svg') || e.closest('.fx-visually-hidden, .send-off-screen, .oj-helper-hidden-accessible')) { continue; }
    const r = e.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inLocalScroll(e) && getComputedStyle(e).position !== 'fixed') {
      if (out.beyond.length < 8) { out.beyond.push(name(e) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); }
    }
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) {
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 11) { out.tiny++; if (out.tinyExamples.length < 4) { out.tinyExamples.push(name(e) + ' ' + fs + 'px'); } }
    }
    // Labels cut off without an ellipsis (an ellipsis is a deliberate, readable truncation)
    if (e.matches('button, .fx-btn, a, label, th, h1, h2, h3, .fx-badge, .fx-chip, [class*="status"]') && own) {
      const s = getComputedStyle(e);
      if (s.overflow !== 'visible' && s.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2 && s.whiteSpace === 'nowrap') {
        if (out.clipped.length < 8) { out.clipped.push(name(e) + ' "' + e.textContent.trim().slice(0, 30) + '"'); }
      }
    }
  }
  // Tables wider than their box that do not scroll inside it (they spill over what is next to them)
  out.spills = [];
  for (const t of document.querySelectorAll('.factory-main table')) {
    if (!visible(t)) { continue; }
    const tw = t.getBoundingClientRect();
    let scrolls = false;
    let box = t.parentElement;
    for (let p = t.parentElement; p && !p.matches('.factory-page'); p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'visible') { scrolls = true; break; }
      if (/card|panel|pane|detail/.test(typeof p.className === 'string' ? p.className : '')) { box = p; break; }
    }
    const bw = box.getBoundingClientRect();
    if (!scrolls && tw.right > bw.right + 2 && out.spills.length < 4) { out.spills.push(name(t) + ' ' + Math.round(tw.width) + ' in ' + name(box) + ' ' + Math.round(bw.width)); }
  }
  // Controls drawn on top of each other
  const controls = all.filter((e) => e.matches('.factory-main button, .factory-main a[href], .factory-main input, .factory-main select, .factory-main textarea, .factory-main .fx-select-button')
    && visible(e) && !e.closest('.fx-popup, .fx-menu, .fx-sheet, .fx-cmd, [role="dialog"]'));
  // The part of each control that shows: cut by every ancestor that clips (a scrolled tab strip hides its overflow)
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const q = p.getBoundingClientRect();
        l = Math.max(l, q.left); t = Math.max(t, q.top); rt = Math.min(rt, q.right); b = Math.min(b, q.bottom);
      }
    }
    return { left: l, top: t, right: rt, bottom: b };
  };
  const boxes = controls.map((e) => ({ e: e, r: shown(e) })).filter((b) => b.r.right - b.r.left > 1 && b.r.bottom - b.r.top > 1 && b.r.bottom > 0 && b.r.top < vh * 3);
  for (let i = 0; i < boxes.length && out.overlaps.length < 6; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) { continue; }
      // A field's own buttons (show the password, clear, open the calendar) sit inside it on purpose
      const field = a.e.closest('.fx-control'); if (field && field === b.e.closest('.fx-control')) { continue; }
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 4 && y > 4) { out.overlaps.push(name(a.e) + ' / ' + name(b.e) + ' at ' + Math.round(Math.max(a.r.left, b.r.left)) + ',' + Math.round(Math.max(a.r.top, b.r.top))); break; }
    }
  }
  if (vw < 768) { out.smallTargets = boxes.filter((b) => b.e.matches('button, .fx-btn') && (b.r.height < 32 || b.r.width < 32)).length; }
  const h1 = document.querySelector('.factory-page h1, main h1, h1');
  out.heading = h1 ? h1.textContent.trim().slice(0, 50) : '';
  out.headingVisible = !!h1 && visible(h1) && h1.getBoundingClientRect().right <= vw + 1;
  out.signIn = !!document.querySelector('#loginUsername, .factory-login');
  // How long the page entrance animates (0.01ms when the system asks for reduced motion)
  const pageRoot = document.querySelector('.factory-page > *');
  out.pageMotion = pageRoot ? getComputedStyle(pageRoot).animationDuration : '';
  return out;
}

// Opens the shell's popups (menu drawer, user menu, command palette) and checks each stays in the window.
async function popupsInWindow() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const inside = (sel) => {
    const e = document.querySelector(sel);
    if (!e) { return sel + ': not shown'; }
    const r = e.getBoundingClientRect();
    return r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1 ? null : sel + ' ' + Math.round(r.left) + ',' + Math.round(r.top) + '..' + Math.round(r.right) + ',' + Math.round(r.bottom);
  };
  const problems = [];
  const press = (key, mods) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true }, mods || {})));
  if (vw < 768) {
    const toggle = document.querySelector('.factory-menu-toggle');
    if (!toggle) { problems.push('menu button missing'); } else {
      toggle.click(); await wait(400);
      const p = inside('.factory-sidebar'); if (p) { problems.push(p); }
      const scrim = document.querySelector('.factory-scrim'); if (scrim) { scrim.click(); } await wait(300);
    }
  }
  const user = document.querySelector('#userMenu');
  if (user) { user.click(); await wait(300); const p = inside('#userMenuList'); if (p && !/not shown/.test(p)) { problems.push(p); } if (document.querySelector('#userMenuList')) { user.click(); } await wait(200); }
  press('k', { ctrlKey: true }); await wait(400);
  const pc = inside('.fx-cmd'); if (pc) { problems.push(pc); }
  if (document.querySelector('.fx-cmd')) { press('k', { ctrlKey: true }); } await wait(300);
  if (document.querySelector('#userMenuList, .fx-cmd')) { problems.push('a popup did not close'); }
  return problems;
}

(async () => {
  const browser = findBrowser();
  if (!browser) { console.error('No Edge or Chrome found: pass --browser <path>.'); process.exit(2); }
  const user = process.env.FACTORY_QA_USER || 'admin';
  const password = process.env.FACTORY_QA_PASSWORD;
  if (!password) { console.error('Set FACTORY_QA_PASSWORD (and FACTORY_QA_USER) for the factory at ' + BASE + '.'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-qa-'));
  const proc = spawn(browser, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
    '--disable-extensions', '--hide-scrollbars=false', 'about:blank'], { stdio: 'ignore' });
  browserProcess = proc;
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(200);
    try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ }
  }
  const tab = (await getJson(port, '/json/list')).find((t) => t.type === 'page');
  const ws = await connect(tab.webSocketDebuggerUrl);
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onMessage((text) => {
    const m = JSON.parse(text);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') { errors.push('exception: ' + (m.params.exceptionDetails.exception || {}).description); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { errors.push('console: ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200)); }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && /\/api\//.test(m.params.response.url)) {
      errors.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url.replace(BASE, ''));
    }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) { errors.push('failed request: ' + m.params.errorText); }
  });
  const cdp = (method, params) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method: method, params: params || {} })); });
  const run = async (fn, arg) => {
    const r = await cdp('Runtime.evaluate', { expression: '(' + fn.toString() + ')(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')', awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) { throw new Error(r.result.exceptionDetails.exception.description); }
    return r.result.result.value;
  };
  await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.enable');
  if (args['reduced-motion']) { await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); }

  const open = async (url) => { await cdp('Page.navigate', { url: url }); for (let i = 0; i < 60; i++) { await sleep(500); try { if (await run(() => !!(window.require && document.querySelector('.factory-shell, .factory-login, #loginUsername')))) { break; } } catch (e) { /* loading */ } } await sleep(1500); };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  const signedIn = await run(async (cred) => {
    const session = await new Promise((r) => window.require(['services/session'], r));
    // The first read gives the browser the server's CSRF cookie, which sign-in must send back
    for (let i = 0; i < 3 && !session.user(); i++) {
      await fetch('api/auth/me', { credentials: 'same-origin' }).catch(() => null);
      try { await session.login(cred.user, cred.password); } catch (e) { await new Promise((r) => setTimeout(r, 1000)); }
    }
    return !!session.user();
  }, { user: user, password: password });
  if (!signedIn) { console.error('Could not sign in as ' + user + '.'); process.exit(2); }

  const report = { url: BASE, at: new Date().toISOString(), sizes: SIZES.map((s) => s.name), pages: PAGES, results: [] };
  for (const size of SIZES) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: size.scale, mobile: size.w < 768 });
    await open(BASE + '/?ojr=overview');
    await run((opts) => new Promise((r) => window.require(['services/preferences', 'services/workspaceSelection'], (prefs, sel) => {
      if (opts.theme) { prefs.theme(opts.theme); }
      if (opts.workspace) { sel.selectedId(opts.workspace); }
      r(1);
    })), { theme: args.theme || 'light', workspace: args.workspace || null });
    fs.mkdirSync(path.join(OUT, size.name), { recursive: true });
    for (const page of PAGES) {
      errors.length = 0;
      await run((p) => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: p })); window.scrollTo(0, 0); return 1; }, page);
      await sleep(3200);
      const m = await run(measure);
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, size.name, page + '.png'), Buffer.from(shot.result.data, 'base64'));
      const popups = page === 'overview' ? await run(popupsInWindow) : [];
      const entry = Object.assign({ size: size.name, page: page, errors: errors.slice(0, 5), popups: popups }, m);
      entry.overflow = m.docWidth > m.viewport + 1;
      entry.defects = (entry.overflow ? 1 : 0) + m.spills.length + m.beyond.length + m.clipped.length + m.overlaps.length + popups.length
        + entry.errors.length + (m.headingVisible ? 0 : 1) + (m.signIn ? 1 : 0);
      report.results.push(entry);
      process.stdout.write((entry.defects ? 'x ' : '. ') + size.name + ' ' + page + (entry.defects ? '  ' + JSON.stringify({
        overflow: entry.overflow ? m.docWidth : undefined, beyond: m.beyond.length ? m.beyond : undefined, clipped: m.clipped.length ? m.clipped : undefined, spills: m.spills.length ? m.spills : undefined,
        overlaps: m.overlaps.length ? m.overlaps : undefined, popups: popups.length ? popups : undefined, errors: entry.errors.length ? entry.errors : undefined,
        heading: m.headingVisible ? undefined : 'not visible', signIn: m.signIn || undefined }) : '') + '\n');
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const bad = report.results.filter((r) => r.defects);
  console.log('\n' + report.results.length + ' page views, ' + bad.length + ' with defects. Report and screenshots: ' + OUT);
  ws.close(); proc.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* the browser may still hold it */ }
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); if (browserProcess) { browserProcess.kill(); } process.exit(2); });
