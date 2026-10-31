// Interaction check: drives a running factory in headless Edge or Chrome with real keyboard, mouse and touch input
// (DevTools protocol) and checks, on every page:
//  - the page transition runs (or is off when reduced motion is asked for);
//  - nothing is left busy once the page has loaded (button spinners, the blocking overlay, the progress bar);
//  - the page heading shows;
//  - Tab moves focus forward through visible controls, each with a visible focus change, and never gets stuck.
// and once for the shell: the collapse notch, the phone drawer (keyboard and swipe), the command palette, the user
// menu, the notification panel, switching workspace, a dialog closing on Escape with focus returning, carousel keys,
// and three read-only operations (Workspaces refresh, Code search, Knowledge search) on a slow network (success) and
// offline (failure), each of which must end with nothing left busy. Finally it signs out to check the sign-in page.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-interactions.js --url http://localhost:8080
//
// Options: --pages overview,code   --sizes 1440x900,375x667   --out <folder>   --workspace <id>   --reduced-motion 1
// It only reads (searches, refreshes, opens and closes things) and never saves or deletes. Exit code 1 on a defect.
const fs = require('fs');
const path = require('path');
const qa = require('./qa-browser');

const sleep = qa.sleep;
const args = {};
for (let i = 2; i < process.argv.length; i += 2) { args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]; }
const BASE = (args.url || 'http://localhost:8080').replace(/\/$/, '');
const OUT = path.resolve(args.out || 'interaction-report');
const PAGES = (args.pages || 'overview,workspaces,code,profile,requirements,designer,changes,impact,build,models,'
  + 'modernization,agents,admin,reviews,integrations,packs,knowledge,prompts,notifications,account,about,design').split(',');
const SIZES = (args.sizes || '1440x900,375x667').split(',').map((s) => { const m = /^(\d+)x(\d+)$/.exec(s); return { w: +m[1], h: +m[2], name: s }; });
const REDUCED = !!args['reduced-motion'];

const KEYS = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37, ' ': 32, k: 75 };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const s = await qa.start({ base: BASE, browser: args.browser, reducedMotion: REDUCED });
  const { cdp, run, open } = s;
  const results = [];
  let defects = 0;
  const record = async (scope, check, ok, detail) => {
    const entry = { scope: scope, check: check, ok: !!ok, detail: detail === undefined ? '' : detail };
    if (!ok) {
      defects++;
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      entry.screenshot = (scope + '-' + check).replace(/[^a-z0-9]+/gi, '_') + '.png';
      fs.writeFileSync(path.join(OUT, entry.screenshot), Buffer.from(shot.result.data, 'base64'));
    }
    results.push(entry);
    process.stdout.write((ok ? '. ' : 'x ') + scope + ' ' + check + (detail !== undefined && detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '') + '\n');
  };
  const key = async (k, modifiers) => {
    const code = KEYS[k];
    const base = { key: k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: modifiers || 0, code: k.length === 1 ? 'Key' + k.toUpperCase() : k };
    await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, base));
    if (k.length === 1 && !modifiers) { await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'char', text: k }, base)); }
    if (k === 'Enter' && !modifiers) { await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'char', text: '\r' }, base)); }
    await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
    await sleep(120);
  };
  const type = async (text) => { await cdp('Input.insertText', { text: text }); await sleep(100); };
  const center = (sel) => run((q) => { const e = document.querySelector(q); if (!e) { return null; } e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const click = async (sel) => {
    const c = await center(sel);
    if (!c) { return false; }
    await sleep(150);
    const c2 = await center(sel);
    for (const t of ['mousePressed', 'mouseReleased']) { await cdp('Input.dispatchMouseEvent', { type: t, x: c2.x, y: c2.y, button: 'left', clickCount: 1 }); }
    return true;
  };
  const network = (conditions) => cdp('Network.emulateNetworkConditions', Object.assign({ offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, conditions));
  const go = async (page) => {
    await run((p) => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: p })); window.scrollTo(0, 0); return 1; }, page);
  };
  const stuck = () => run(() => ({
    busy: document.querySelectorAll('.is-busy').length,
    overlay: !!document.querySelector('.fx-overlay'),
    bar: !!document.querySelector('.fx-progressbar.is-on'),
    inert: !!document.querySelector('[inert]')
  }));
  const clear = (x) => !x.busy && !x.overlay && !x.bar && !x.inert;
  // Waits up to 20 seconds for everything to clear (a slow search is not stuck); returns the last state
  const settle = async () => {
    let x = await stuck();
    for (let i = 0; i < 40 && !clear(x); i++) { await sleep(500); x = await stuck(); }
    if (!clear(x)) { x.after = '20 s'; }
    return x;
  };
  const focused = () => run(() => {
    const e = document.activeElement;
    if (!e || e === document.body) { return null; }
    return { tag: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : ''), inMenu: !!e.closest('.fx-menu, [role="menu"], .fx-cmd, .fx-dialog, .factory-bell-panel'), label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) };
  });

  // Reads what shows that e has focus: its outline and shadow, and those of a wrapper that styles :focus-within
  function focusLook(e) {
    const look = (x) => { const c = getComputedStyle(x); return [c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 ? c.outlineColor + c.outlineWidth : '', c.boxShadow, c.borderColor, c.backgroundColor, c.textDecorationLine].join('|'); };
    const chain = [e, e.parentElement, e.parentElement && e.parentElement.parentElement].filter(Boolean);
    return chain.map(look).join(' / ');
  }

  // ---------- Every page ----------
  for (const size of SIZES) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.w < 768 });
    await open(BASE + '/?ojr=overview');
    if (args.workspace) { await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace); await sleep(1500); }
    for (const page of PAGES) {
      const scope = size.name + ' ' + page;
      s.errors.length = 0;
      await go(page);
      await sleep(90);
      const anim = await run(() => {
        const root = document.querySelector('.factory-page > *:not(script)');
        if (!root) { return { name: 'no page' }; }
        const c = getComputedStyle(root);
        return { name: c.animationName, duration: c.animationDuration, running: root.getAnimations().some((a) => a.playState === 'running') };
      });
      if (REDUCED) {
        await record(scope, 'no transition with reduced motion', anim.duration === '1e-05s' || anim.name === 'none', anim);
      } else {
        await record(scope, 'page transition runs', anim.name === 'fx-rise', anim);
      }
      await sleep(3400);
      // A slow request may still be open; stuck means it never clears (settle waits up to 20 seconds)
      const t0 = Date.now();
      const st = await settle();
      await record(scope, 'nothing left busy after loading', clear(st), clear(st) ? (Date.now() - t0 > 600 ? 'cleared after ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s more' : '') : st);
      const head = await run(() => { const h = document.querySelector('.factory-page h1'); if (!h) { return null; } const r = h.getBoundingClientRect(); return { text: h.textContent.trim().slice(0, 40), shown: r.width > 0 && r.right <= document.documentElement.clientWidth + 1 }; });
      await record(scope, 'heading shows', head && head.shown, head ? head.text : 'no h1');
      // Keyboard: from the heading, Tab twelve times
      await run(() => { const h = document.querySelector('.factory-page h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } window.scrollTo(0, 0); return 1; });
      const seen = [];
      const noIndicator = [];
      const hidden = [];
      let stuckAt = null;
      let last = null;
      for (let i = 0; i < 12; i++) {
        await key('Tab');
        // A tab strip scrolls a focused tab into view smoothly: judge where it ends up
        await sleep(400);
        const f = await run(() => {
          const e = document.activeElement;
          if (!e || e === document.body) { return null; }
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          // Tag, id or first class and the label, so five cards of one kind count as five stops
          return { id: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '')
              + ' "' + (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"'
              + ' @' + Math.round(r.left + scrollX) + ',' + Math.round(r.top + scrollY),
            shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth };
        });
        if (!f) { break; }
        if (last && f.id === last.id) { stuckAt = f.id; break; }
        seen.push(f.id);
        last = f;
        if (!f.shown) { hidden.push(f.id); }
        // The same element with and without focus must look different (focus again after: after a key press it keeps
        // :focus-visible)
        // The focus ring eases in and out over --fx-dur-hover, so both reads wait for it
        await sleep(260);
        const changes = await run(async (src) => {
          const look = eval('(' + src + ')');
          const e = document.activeElement;
          const a = look(e);
          e.blur();
          await new Promise((r) => setTimeout(r, 260));
          const b = look(e);
          e.focus();
          return a !== b;
        }, focusLook.toString());
        if (!changes) { noIndicator.push(f.id); }
      }
      await record(scope, 'Tab moves through visible controls', seen.length > 0 && !stuckAt && hidden.length === 0, stuckAt ? 'stuck on ' + stuckAt : hidden.length ? 'focus on hidden ' + hidden.join(', ') : seen.length + ' stops');
      await record(scope, 'focus is visible on every stop', noIndicator.length === 0, noIndicator.length ? 'no visible focus: ' + [...new Set(noIndicator)].join(', ') : '');
      await record(scope, 'no console errors or failed requests', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
    }
  }

  // ---------- The shell, once on a desktop and once on a phone ----------
  for (const size of [{ w: 1440, h: 900, name: '1440x900' }, { w: 375, h: 667, name: '375x667' }]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.w < 768 });
    await open(BASE + '/?ojr=overview');
    if (args.workspace) { await run((id) => new Promise((r) => window.require(['services/workspaceSelection'], (w) => { w.selectedId(id); r(1); })), args.workspace); }
    await sleep(2500);
    const scope = size.name + ' shell';
    if (size.w >= 768) {
      // Collapse notch, by keyboard
      await run(() => { document.querySelector('#collapseSidebar').focus(); return 1; });
      await key('Enter');
      await sleep(400);
      let n = await run(() => ({ collapsed: document.querySelector('.factory-shell').classList.contains('factory-shell-collapsed'), expanded: document.querySelector('#collapseSidebar').getAttribute('aria-expanded'), label: document.querySelector('#collapseSidebar').getAttribute('aria-label'), width: Math.round(document.querySelector('.factory-sidebar').getBoundingClientRect().width), focusKept: document.activeElement.id }));
      await record(scope, 'notch collapses with Enter', n.collapsed && n.expanded === 'false' && n.label === 'Expand sidebar' && n.width === 68 && n.focusKept === 'collapseSidebar', n);
      await key(' ');
      await sleep(400);
      n = await run(() => ({ collapsed: document.querySelector('.factory-shell').classList.contains('factory-shell-collapsed'), expanded: document.querySelector('#collapseSidebar').getAttribute('aria-expanded'), width: Math.round(document.querySelector('.factory-sidebar').getBoundingClientRect().width) }));
      await record(scope, 'notch expands with Space', !n.collapsed && n.expanded === 'true' && n.width > 200, n);
      const notch = await run(() => { const a = document.querySelector('#collapseSidebar').getBoundingClientRect(); const ws = document.querySelector('.factory-topbar-workspace').getBoundingClientRect(); const logo = document.querySelector('.factory-sidebar .factory-brand-mark').getBoundingClientRect(); return { notch: [Math.round(a.left), Math.round(a.right)], logoRight: Math.round(logo.right), workspaceLeft: Math.round(ws.left) }; });
      await record(scope, 'notch overlaps neither the logo nor the workspace picker', notch.notch[0] > notch.logoRight && notch.notch[1] < notch.workspaceLeft, notch);
    } else {
      // Phone drawer: the menu button opens it, Escape closes it and focus goes back to the button
      await run(() => { document.querySelector('#menuToggle').focus(); return 1; });
      await key('Enter');
      await sleep(400);
      const opened = await run(() => document.querySelector('.factory-shell').classList.contains('factory-shell-open'));
      await record(scope, 'menu button opens the drawer', opened);
      await key('Escape');
      await sleep(400);
      const esc = await run(() => ({ open: document.querySelector('.factory-shell').classList.contains('factory-shell-open'), focus: document.activeElement && document.activeElement.id }));
      await record(scope, 'Escape closes the drawer and returns focus', !esc.open && esc.focus === 'menuToggle', esc);
      // Swipe: open, then a real touch swipe to the left
      await run(() => { if (!document.querySelector('.factory-shell').classList.contains('factory-shell-open')) { document.querySelector('#menuToggle').click(); } return 1; });
      await sleep(400);
      const pts = (x, y) => [{ x: x, y: y, id: 1 }];
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(200, 320) });
      for (const x of [170, 130, 90]) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(x, 325) }); await sleep(16); }
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(400);
      const swiped = await run(() => document.querySelector('.factory-shell').classList.contains('factory-shell-open'));
      await record(scope, 'swipe left closes the drawer', !swiped);
      const notchHidden = await run(() => getComputedStyle(document.querySelector('#collapseSidebar')).display === 'none');
      await record(scope, 'notch hidden on phones', notchHidden);
    }
    // Command palette: Ctrl K opens it with focus in the search; typing and Enter opens a page; Escape restores focus
    await run(() => { document.querySelector('#bellButton').focus(); return 1; });
    await key('k', 2);
    await sleep(400);
    let pal = await run(() => ({ open: !!document.querySelector('.fx-cmd'), inSearch: !!document.activeElement.closest('.fx-cmd') }));
    await record(scope, 'Ctrl K opens the palette with focus in it', pal.open && pal.inSearch, pal);
    await key('Escape');
    await sleep(300);
    pal = await run(() => ({ open: !!document.querySelector('.fx-cmd'), focus: document.activeElement && document.activeElement.id }));
    await record(scope, 'Escape closes the palette and returns focus', !pal.open && pal.focus === 'bellButton', pal);
    await key('k', 2);
    await sleep(300);
    await type('Agent Runs');
    await sleep(300);
    await key('Enter');
    await sleep(2500);
    const where = await run(() => location.search);
    await record(scope, 'palette opens a page with Enter', /ojr=agents/.test(where), where);
    // User menu: Enter opens it with focus on an item, the arrows move, Escape closes it and focus returns
    await run(() => { document.querySelector('#userMenu').focus(); return 1; });
    await key('Enter');
    await sleep(300);
    const um1 = await run(() => ({ open: !!document.querySelector('#userMenuList'), focus: document.activeElement && document.activeElement.textContent.trim().slice(0, 20), inMenu: !!document.activeElement.closest('#userMenuList') }));
    await key('ArrowDown');
    const um2 = await run(() => document.activeElement && document.activeElement.textContent.trim().slice(0, 20));
    await record(scope, 'user menu opens with Enter and arrows move', um1.open && um1.inMenu && um2 !== um1.focus, { first: um1.focus, next: um2 });
    await key('Escape');
    await sleep(300);
    const um3 = await run(() => ({ open: !!document.querySelector('#userMenuList'), focus: document.activeElement && document.activeElement.id }));
    await record(scope, 'Escape closes the user menu and returns focus', !um3.open && um3.focus === 'userMenu', um3);
    // Notification panel
    await run(() => { document.querySelector('#bellButton').focus(); return 1; });
    await key('Enter');
    await sleep(400);
    const bell = await run(() => { const p = document.querySelector('.factory-bell-panel, #bellPanel'); if (!p) { return { open: false }; } const r = p.getBoundingClientRect(); return { open: true, inWindow: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 }; });
    await record(scope, 'notification panel opens inside the window', bell.open && bell.inWindow, bell);
    await key('Escape');
    await sleep(300);
    const bell2 = await run(() => ({ open: !!document.querySelector('.factory-bell-panel, #bellPanel'), focus: document.activeElement && document.activeElement.id }));
    await record(scope, 'Escape closes the notification panel and returns focus', !bell2.open && bell2.focus === 'bellButton', bell2);
    // Dialog: Escape closes it and focus goes back to what had it
    await run(() => new Promise((r) => window.require(['services/dialog'], (d) => { document.querySelector('#bellButton').focus(); d.confirm({ title: 'Check', message: 'A check of the dialog.', confirmLabel: 'OK' }); setTimeout(() => r(1), 400); })));
    const dl = await run(() => ({ open: !!document.querySelector('.fx-dialog'), inDialog: !!document.activeElement.closest('.fx-dialog') }));
    await key('Escape');
    await sleep(300);
    const dl2 = await run(() => ({ open: !!document.querySelector('.fx-dialog'), focus: document.activeElement && document.activeElement.id }));
    await record(scope, 'dialog takes focus, Escape closes it and focus returns', dl.open && dl.inDialog && !dl2.open && dl2.focus === 'bellButton', { before: dl, after: dl2 });
    // Switching workspace with the keyboard on a slow network, on a page that loads the workspace's data: the bar
    // runs, then everything clears
    await go('code');
    await sleep(3500);
    await network({ latency: 700 });
    const wsBefore = await run(() => window.require('services/workspaceSelection').selectedId());
    await run(() => { document.querySelector('.factory-topbar-workspace .fx-select-button').focus(); return 1; });
    await key('Enter');
    await sleep(300);
    await key('ArrowDown');
    await key('Enter');
    await sleep(350);
    const during = await stuck();
    const after = await settle();
    const wsAfter = await run(() => window.require('services/workspaceSelection').selectedId());
    await record(scope, 'switching workspace by keyboard shows progress, then clears', wsAfter !== wsBefore && during.bar && clear(after), { changed: wsAfter !== wsBefore, barDuring: during.bar, after: after });
    await network({});
    await run((id) => { window.require('services/workspaceSelection').selectedId(id); return 1; }, wsBefore);
    await sleep(2000);
  }

  // ---------- Read-only operations: success on a slow network, failure offline ----------
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=overview');
  if (args.workspace) { await run((id) => { window.require('services/workspaceSelection').selectedId(id); return 1; }, args.workspace); }
  await sleep(2500);
  const operations = [
    { name: 'Workspaces refresh', page: 'workspaces', prepare: null, button: '#refreshWorkspaces' },
    { name: 'Code search', page: 'code', prepare: async () => { await click('#tab-search'); await sleep(800); await click('#searchQuery input'); await type('transfer'); }, button: '#searchButton' },
    { name: 'Knowledge search', page: 'knowledge', prepare: async () => { await click('#kn-search'); await sleep(800); await click('#knowledgeQuery input'); await type('transfer'); }, button: '#knowledgeSearchButton' }
  ];
  for (const op of operations) {
    for (const mode of ['success', 'failure']) {
      const scope = '1440x900 ' + op.page + ' ' + op.name;
      await go(op.page);
      await sleep(3500);
      if (op.prepare) { await op.prepare(); }
      s.errors.length = 0;
      await network(mode === 'success' ? { latency: 900 } : { offline: true });
      const toastsBefore = await run(() => document.querySelectorAll('.fx-toast').length);
      const clicked = await click(op.button);
      await sleep(450);
      const during = await run((b) => { const e = document.querySelector(b); return { buttonBusy: !!e && (e.classList.contains('is-busy') || e.classList.contains('is-loading') || e.disabled), bar: !!document.querySelector('.fx-progressbar.is-on') }; }, op.button);
      const after = await settle();
      const outcome = await run((n) => ({ toasts: document.querySelectorAll('.fx-toast').length - n, text: [...document.querySelectorAll('.fx-toast, .fx-alert--danger, .factory-error, [role="alert"]')].map((e) => e.textContent.trim().slice(0, 80)).filter(Boolean).slice(-1)[0] || '' }), toastsBefore);
      await network({});
      if (mode === 'success') {
        await record(scope, 'success: busy while running, clear after', clicked && during.buttonBusy && during.bar && clear(after), { clicked: clicked, during: during, after: after });
      } else {
        await record(scope, 'failure: clears and says what went wrong', clicked && clear(after) && !!outcome.text, { clicked: clicked, after: after, message: outcome.text });
      }
    }
  }

  // ---------- Carousel keys (Version Packs components) ----------
  await go('packs');
  await sleep(3500);
  await click('#pk-components');
  await sleep(800);
  await run(() => { const t = document.querySelector('.factory-pk-carousel .fx-carousel-track'); t.scrollLeft = 0; t.focus(); return 1; });
  await sleep(500);
  // What has focus when the key goes in (for a failure: the track, something inert, an overlay)
  const pre = await run(() => ({ focus: document.activeElement.className, inert: !!document.querySelector('[inert]'), overlay: !!document.querySelector('.fx-overlay, .fx-dialog, .fx-cmd') }));
  await key('ArrowRight');
  await sleep(800);
  const car = await run(() => { const c = document.querySelector('.factory-pk-carousel'); return { left: Math.round(c.querySelector('.fx-carousel-track').scrollLeft), current: [...c.querySelectorAll('.fx-carousel-dot')].findIndex((d) => d.classList.contains('is-current')), prevEnabled: !c.querySelector('.fx-carousel-btn--prev').disabled }; });
  car.before = pre;
  await record('1440x900 packs', 'carousel moves with the arrow key', car.left > 100 && car.current === 1 && car.prevEnabled, car);

  // ---------- Approved assets ----------
  const brand = await run(() => { const m = getComputedStyle(document.querySelector('.factory-brand-mark')); const ai = document.querySelector('.factory-brand-ai'); return { logo: /svg|url/.test(m.backgroundImage), powered: !!ai && ai.textContent.trim() === 'Powered by AI' && ai.getBoundingClientRect().width > 0 }; });
  await record('1440x900 shell', 'logo and Powered by AI show', brand.logo && brand.powered, brand);
  await go('about');
  await sleep(3500);
  const about = await run(() => { const a = document.querySelector('.factory-ab-art'); if (!a) { return { shown: false }; } const r = a.getBoundingClientRect(); return { shown: r.width > 100 && r.height > 100, size: Math.round(r.width) + 'x' + Math.round(r.height) }; });
  await record('1440x900 about', 'About illustration shows', about.shown, about);
  const shotA = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'about-illustration.png'), Buffer.from(shotA.result.data, 'base64'));
  // Sign out (only the session ends) to see the sign-in page and its illustration
  await run(() => new Promise((r) => window.require(['services/session'], (x) => x.logout().then(() => setTimeout(() => r(1), 1500)))));
  const login = await run(() => { const a = document.querySelector('.factory-login-art'); if (!a) { return { shown: false }; } const r = a.getBoundingClientRect(); return { shown: r.width > 100 && r.height > 100, size: Math.round(r.width) + 'x' + Math.round(r.height), ready: document.body.classList.contains('fx-ready') }; });
  await record('1440x900 sign-in', 'sign-in illustration shows', login.shown, login);
  const shotL = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'sign-in-illustration.png'), Buffer.from(shotL.result.data, 'base64'));

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ url: BASE, at: new Date().toISOString(), reducedMotion: REDUCED, results: results }, null, 2));
  console.log('\n' + results.length + ' checks, ' + defects + ' failed. Report and screenshots: ' + OUT);
  s.close();
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
