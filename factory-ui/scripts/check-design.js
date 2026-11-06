// Design System check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the token reference lists every --fx-* token the stylesheet defines, with dark values, and its search and copy work;
//  - the new border, elevation and status tokens are defined and resolve in both themes;
//  - the contrast table measures every token pair in both themes, and text pairs meet WCAG AA;
//  - the focus and error states use the real focus ring and error colours;
//  - the tabs move with the arrow keys, Home and End; the breakpoint in use is marked;
//  - the ring chart shows the real workspaces; nothing scrolls sideways at 390 px; no console errors.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-design.js --url http://localhost:8080
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
  const key = async (k, code) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
    await sleep(300);
  };
  const theme = async (t) => {
    await run((x) => new Promise((r) => window.require(['services/preferences'], (p) => { p.theme(x); r(1); })), t);
    await sleep(800);
  };

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=design');
  await theme('light');
  await sleep(4000);

  // Token reference against the stylesheet
  const tokens = await run(() => {
    const defined = new Set();
    Array.from(document.styleSheets).forEach((sh) => {
      let rules = [];
      try { rules = Array.from(sh.cssRules || []); } catch (e) { rules = []; }
      rules.forEach((r) => {
        if (r.selectorText && r.selectorText.trim() === ':root' && r.style) {
          for (let i = 0; i < r.style.length; i++) { if (r.style[i].indexOf('--fx-') === 0) { defined.add(r.style[i]); } }
        }
      });
    });
    const rows = [...document.querySelectorAll('#dsTokenTable tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
    return { defined: defined.size, rows: rows.length, names: rows.map((r) => r[0]), surfaceDark: (rows.find((r) => r[0] === '--fx-surface') || [])[3] };
  });
  record('the token table lists every --fx-* token the stylesheet defines', tokens.rows === tokens.defined && tokens.rows > 100, tokens.rows + ' of ' + tokens.defined);
  record('the table shows dark values', !!tokens.surfaceDark && tokens.surfaceDark !== 'same', tokens.surfaceDark);
  const NEW = ['--fx-border-width', '--fx-border-width-strong', '--fx-elevation-1', '--fx-elevation-2', '--fx-elevation-3', '--fx-status-done', '--fx-status-failed-soft'];
  record('the border, elevation and status tokens are listed', NEW.every((n) => tokens.names.indexOf(n) >= 0), NEW.filter((n) => tokens.names.indexOf(n) < 0));

  // Search and copy
  await run(() => { const i = document.getElementById('dsTokenSearch'); i.value = 'radius'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; });
  await sleep(600);
  const searched = await run(() => [...document.querySelectorAll('#dsTokenTable tbody tr td:first-child')].map((td) => td.textContent.trim()));
  record('search narrows the tokens', searched.length >= 5 && searched.length < tokens.rows && searched.every((n) => /radius/.test(n)), searched.length);
  await run(() => {
    window.__copied = '';
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); } catch (e) { /* kept */ }
    document.querySelector('#dsTokenTable tbody tr .factory-ds-copy button').click();
    return 1;
  });
  await sleep(500);
  const copied = await run(() => window.__copied);
  record('copy puts the token\'s var() on the clipboard', /^var\(--fx-radius/.test(copied), copied);
  await run(() => { const i = document.getElementById('dsTokenSearch'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; });

  // New tokens resolve in both themes, and contrast in both themes
  for (const t of ['light', 'dark']) {
    await theme(t);
    const resolved = await run(() => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      probe.style.cssText = 'border: var(--fx-border-width-strong) solid red; box-shadow: var(--fx-elevation-2); color: var(--fx-status-done); background: var(--fx-status-done-soft)';
      const cs = getComputedStyle(probe);
      const out = { border: cs.borderTopWidth, shadow: cs.boxShadow, colour: cs.color, bg: cs.backgroundColor };
      probe.style.cssText = 'color: var(--fx-success-text); background: var(--fx-success-soft); box-shadow: var(--fx-shadow)';
      const ref = getComputedStyle(probe);
      out.same = out.colour === ref.color && out.bg === ref.backgroundColor && out.shadow === ref.boxShadow;
      probe.remove();
      return out;
    });
    record(t + ': the new tokens resolve to the colours and shadows they name', resolved.border === '2px' && resolved.same, resolved);
    const contrast = await run(() => [...document.querySelectorAll('#dsContrastTable tbody tr')].map((tr) => {
      const c = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
      return { use: c[0], ratio: parseFloat(c[3]) };
    }));
    const failing = contrast.filter((c) => !/decorative/.test(c.use) && !(c.ratio >= 4.5));
    record(t + ': contrast is measured for 14 pairs', contrast.length === 14 && contrast.every((c) => c.ratio >= 1), contrast.length);
    record(t + ': every text pair meets WCAG AA (4.5:1)', failing.length === 0, failing);
  }
  await theme('light');

  // States use the real focus ring and error colour
  const states = await run(() => {
    const btn = document.querySelector('.factory-ds-matrix .fx-btn.is-focus');
    const input = document.querySelector('.fx-input.is-focus');
    const err = document.querySelector('.fx-field.is-error .fx-input');
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    probe.style.cssText = 'box-shadow: var(--fx-focus); color: var(--fx-danger)';
    const ring = getComputedStyle(probe).boxShadow;
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return { btn: btn && getComputedStyle(btn).boxShadow === ring, input: input && getComputedStyle(input).boxShadow === ring,
      err: err && getComputedStyle(err).borderTopColor === danger, invalid: err && err.getAttribute('aria-invalid') === 'true' };
  });
  record('the focus state uses the real focus ring', states.btn && states.input, states);
  record('the error state uses the danger colour and aria-invalid', states.err && states.invalid, states);

  // Tabs by keyboard
  await run(() => { document.getElementById('dsTab-overview').focus(); return 1; });
  await key('ArrowRight', 39);
  const right = await run(() => ({ id: document.activeElement.id, sel: document.getElementById('dsTab-files').getAttribute('aria-selected') }));
  await key('End', 35);
  const end = await run(() => document.activeElement.id);
  await key('Home', 36);
  const home = await run(() => document.activeElement.id);
  record('tabs move with the arrow keys, Home and End', right.id === 'dsTab-files' && right.sel === 'true' && end === 'dsTab-history' && home === 'dsTab-overview', [right, end, home]);

  // Ring chart from the real workspaces
  const ring = await run(() => fetch('api/workspaces').then((r) => r.json()).then((list) => ({
    expected: list.filter((w) => w.obdxVersion === '22.x').length + ' of ' + list.length + ' workspaces on OBDX 22.x',
    shown: document.querySelector('.factory-ring').getAttribute('aria-label')
  })));
  record('the ring chart shows the real workspaces, with a text equivalent', ring.expected === ring.shown, ring);

  // Breakpoints
  const desk = await run(() => (document.querySelector('#dsBreakpoints tr.is-current') || {}).textContent || '');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1200);
  const phone = await run(() => (document.querySelector('#dsBreakpoints tr.is-current') || {}).textContent || '');
  record('the breakpoint in use is marked', /Desktop/.test(desk) && /Phone/.test(phone), [desk.replace(/\s+/g, ' ').slice(0, 40), phone.replace(/\s+/g, ' ').slice(0, 40)]);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Design System: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
