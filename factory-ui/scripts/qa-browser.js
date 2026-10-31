// Shared by the UI checks (check-responsive.js, check-interactions.js): starts headless Edge or Chrome, talks to it
// over the DevTools protocol with a small WebSocket client (no dependencies), records console errors and failed
// requests, and signs in to the factory with FACTORY_QA_USER and FACTORY_QA_PASSWORD.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser(preferred) {
  const candidates = [preferred, process.env.FACTORY_QA_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find((c) => c && fs.existsSync(c));
}

/**
 * Starts the browser, opens the factory and signs in. Returns { cdp(method, params), run(fn, arg), open(url), errors,
 * proc, profile, close() }. errors collects console errors, exceptions and failed /api/ requests; empty it per page.
 */
async function start(options) {
  const BASE = options.base;
  const browser = findBrowser(options.browser);
  if (!browser) { console.error('No Edge or Chrome found: pass --browser <path>.'); process.exit(2); }
  const user = process.env.FACTORY_QA_USER || 'admin';
  const password = process.env.FACTORY_QA_PASSWORD;
  if (!password) { console.error('Set FACTORY_QA_PASSWORD (and FACTORY_QA_USER) for the factory at ' + BASE + '.'); process.exit(2); }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-qa-'));
  const proc = spawn(browser, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run',
    '--disable-extensions', '--hide-scrollbars=false', 'about:blank'], { stdio: 'ignore' });
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
  const listeners = [];
  ws.onMessage((text) => {
    const m = JSON.parse(text);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    listeners.forEach((l) => l(m));
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
  if (options.reducedMotion) { await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); }
  // Opens a page and waits until the app is ready (its start screen gone) and shows the shell or the sign-in page
  const open = async (url) => { await cdp('Page.navigate', { url: url }); for (let i = 0; i < 60; i++) { await sleep(500); try { if (await run(() => !!(window.require && document.body.classList.contains('fx-ready') && document.querySelector('.factory-shell, .factory-login, #loginUsername')))) { break; } } catch (e) { /* loading */ } } await sleep(1500); };
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
  if (!signedIn) { console.error('Could not sign in as ' + user + '.'); proc.kill(); process.exit(2); }
  return {
    cdp: cdp, run: run, open: open, errors: errors, ws: ws, proc: proc, profile: profile,
    /** Calls fn with every DevTools event (for checks that wait for one) */
    onEvent: (fn) => listeners.push(fn),
    close: () => { ws.close(); proc.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* still held */ } }
  };
}

module.exports = { start: start, sleep: sleep };
