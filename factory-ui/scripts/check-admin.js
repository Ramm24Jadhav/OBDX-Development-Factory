// Administration, Notifications, Account and About check: drives a running factory in headless Edge or Chrome and
// checks what the pages promise.
// Administration:
//  - one header (Add user and a menu), at most one problem bar, four "now" cards that agree with the server, four tabs;
//  - users as compact rows with chips that count and filter, a search, and a menu with every user action;
//  - the permission matrix comes from the server's role definitions, names the resource and action, and says allow or
//    deny in words for every role; the sign-in settings show the configured lockout and password length;
//  - a user's effective access lists each workspace with its role and the actions allowed and denied, and the history
//    of their access changes (a side panel);
//  - changing a member's role and adding an administrator ask first (the check cancels the dialog: nothing changes);
//  - the audit log as compact rows with chips by kind that count and filter;
//  - the admin endpoints give no password hash or token; tabs work with the arrow keys.
// Notifications: chips by kind with counts, rows grouped by day with the unread state, a row opens beside the list and
//   is marked read, Mark all read (undone after), an empty state with one action.
// Account: the profile card, the theme and notification preferences as rows that follow the preferences, the password
//   in a side panel (nothing is changed).
// About: four cards (the build agrees with the server), the links, the illustration, at most one problem bar.
// Every page: nothing scrolls sideways at 390 px; no console errors. Update now is never pressed.
//
//   FACTORY_QA_USER=admin FACTORY_QA_PASSWORD=... node scripts/check-admin.js --url http://localhost:8080
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
  // Runs fn(viewModel) in the page, with the view model of the element matching sel
  const vmOf = (sel) => (fn) => run({ toString: () => '() => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.querySelector(\'' + sel + '\'))))))' });
  const vm = vmOf('.factory-adm');
  const go = async (page) => {
    await run((p) => { window.dispatchEvent(new CustomEvent('factory-navigate', { detail: p })); window.scrollTo(0, 0); return 1; }, page);
    await sleep(4000);
  };
  const cancelDialog = () => run(() => { const c = [...document.querySelectorAll('.fx-dialog button')].find((b) => /Cancel/.test(b.textContent)); if (c) { c.click(); } return !!c; });

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=admin');
  await sleep(6000);

  // ---------- Administration: the header, the answer, the tabs ----------
  const serverUsers = await run(() => fetch('api/admin/users').then((r) => r.json()));
  const head = await run(() => ({
    primary: [...document.querySelectorAll('.factory-adm .factory-rq-headbar .fx-btn--primary')].map((b) => b.textContent.trim()),
    menu: !!document.querySelector('#adMoreButton'),
    problems: document.querySelectorAll('.factory-adm .factory-rqd-problem').length,
    oldKpis: document.querySelectorAll('.factory-adm .factory-kpis, .factory-adm .fx-kpi').length,
    cards: [...document.querySelectorAll('#adNow .factory-adm-card')].map((c) => ({ id: c.id, value: c.querySelector('.factory-adm-cardvalue').textContent.trim() })),
    tabs: [...document.querySelectorAll('.factory-adm [role=tab]')].map((t) => t.textContent.replace(/\d+/g, '').trim())
  }));
  record('one header with Add user as the one primary action and a menu', head.primary.length === 1 && /Add user/.test(head.primary[0]) && head.menu, head);
  record('at most one problem bar and no old KPI tiles', head.problems <= 1 && head.oldKpis === 0, head);
  record('four now cards: people, not signed in yet, sign-in, factory', head.cards.map((c) => c.id).join() === 'adNowPeople,adNowInvited,adNowSignin,adNowVersion', head.cards);
  const invitedServer = serverUsers.filter((u) => !u.lastLoginAt).length;
  record('the people and not-signed-in cards agree with the server',
    head.cards[0] && head.cards[0].value.indexOf(String(serverUsers.length)) === 0 && head.cards[1] && head.cards[1].value === String(invitedServer), { cards: head.cards, users: serverUsers.length, invited: invitedServer });
  record('four tabs: Users, Workspace access, Roles & security, Audit log', head.tabs.join('|') === 'Users|Workspace access|Roles & security|Audit log', head.tabs);

  // ---------- Users: rows, chips, search, menu ----------
  const users = await run(() => ({
    rows: document.querySelectorAll('#userList .factory-adm-item').length,
    sub: (document.querySelector('#userList .factory-adm-sub') || {}).textContent || '',
    chips: [...document.querySelectorAll('#adUserChips .fx-chip')].map((c) => ({ id: c.id, text: c.textContent.trim() })),
    menus: document.querySelectorAll('#userList fx-menu-button').length
  }));
  record('users are compact rows with a mono sub-line and a menu each', users.rows === Math.min(serverUsers.length, 25) && users.menus === users.rows && users.sub.length > 0, users);
  const allChip = users.chips.find((c) => c.id === 'adChip-all');
  record('the All chip counts every user', !!allChip && allChip.text === 'All ' + serverUsers.length, users.chips);
  if (invitedServer > 0) {
    await run(() => { document.getElementById('adChip-invited').click(); return 1; });
    await sleep(500);
    const shown = await run(() => document.querySelectorAll('#userList .factory-adm-item').length);
    record('the Not signed in yet chip shows exactly those users', shown === invitedServer, { shown: shown, expected: invitedServer });
    await run(() => { document.getElementById('adChip-all').click(); return 1; });
    await sleep(300);
  } else {
    record('the Not signed in yet chip shows exactly those users', true, 'nobody waiting');
  }
  const target = serverUsers[serverUsers.length - 1];
  await vm((m) => { m.search('zz-no-such-user-zz'); return 1; });
  await sleep(500);
  const empty = await run(() => ({ rows: document.querySelectorAll('#userList .factory-adm-item').length, empty: !!document.getElementById('adUsersEmpty'), buttons: document.querySelectorAll('#adUsersEmpty button').length }));
  record('a search with no match shows an empty state with one action', empty.rows === 0 && empty.empty && empty.buttons === 1, empty);
  await vm((m) => { m.resetFilters(); return 1; });
  await run((u) => new Promise((resolve) => window.require(['knockout'], (ko) => { ko.dataFor(document.querySelector('.factory-adm')).search(u); resolve(1); })), target.username);
  await sleep(500);
  const found = await run(() => [...document.querySelectorAll('#userList .factory-adm-sub')].map((x) => x.textContent));
  record('the search finds a user by username', found.length >= 1 && found.some((t) => t.indexOf(target.username) === 0), { found: found, wanted: target.username });
  await vm((m) => { m.resetFilters(); return 1; });
  await sleep(400);
  await run(() => { document.querySelector('#userList fx-menu-button .fx-menu-toggle').click(); return 1; });
  await sleep(500);
  const menu = await run(() => [...document.querySelectorAll('#userList .fx-menu [role=menuitem]')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled })));
  record('a user\'s menu holds access, workspace access, administrator, activation and password', menu.length === 5
    && /Effective access/.test(menu[0].text) && /workspace access/.test(menu[1].text) && /administrator/i.test(menu[2].text) && /activate/i.test(menu[3].text) && /password/i.test(menu[4].text), menu);
  await run(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.click(); return 1; });
  await sleep(300);

  // Effective access of the first non-admin user with a workspace (or any user), in its side panel
  const picked = await vm((m) => {
    const u = m.users().find((x) => !x.admin && x.workspaceIds.length) || m.users()[0];
    m.openAccess(u);
    return { username: u.username, admin: u.admin };
  });
  await sleep(2500);
  const access = await run(() => ({
    rows: [...document.querySelectorAll('#accessTable tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent.trim())),
    history: document.querySelectorAll('#accessHistory li').length,
    open: !!document.querySelector('#accessSheet .fx-sheet'),
    change: !!document.querySelector('#accessSheet #accessMore')
  }));
  record('effective access lists each workspace with its role, allowed and denied actions', access.rows.length > 0 && access.rows.every((r) => r.length === 4), { user: picked, rows: access.rows.slice(0, 2) });
  record('the access history of the user is shown', access.history > 0, access.history);
  record('the access panel offers the user\'s changes', access.open && access.change, access);
  await vm((m) => { m.accessOpen(false); return 1; });
  await sleep(600);

  // ---------- Workspace access: confirmation before a role change (cancelled) ----------
  const asked = await vm((m) => new Promise((resolve) => {
    m.tab('access');
    setTimeout(() => resolve({ ready: m.members().length > 0 }), 1500);
  }));
  const memberRows = await run(() => document.querySelectorAll('#memberList .factory-adm-item').length);
  record('members are compact rows with Change role and Remove', !asked.ready || memberRows > 0, memberRows);
  if (asked.ready) {
    await vm((m) => {
      const member = m.members()[0];
      const TEXT = { Lead: 'LEAD', Developer: 'DEVELOPER', 'Business Analyst': 'ANALYST' };
      const role = TEXT[member.rolePill.text];
      const user = m.users().find((u) => member.label.indexOf('(' + u.username + ')') >= 0);
      m.memberUserId(user.id);
      m.memberRole(role === 'LEAD' ? 'ANALYST' : 'LEAD');
      return 1;
    });
    await sleep(500);
    await vm((m) => { m.setMember(); return 1; });
    await sleep(800);
    const dialog = await run(() => { const d = document.querySelector('.fx-dialog'); return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : ''; });
    record('changing a role or giving Lead asks first', /role|Lead/.test(dialog), dialog);
    await cancelDialog();
    await sleep(600);
  } else {
    record('changing a role or giving Lead asks first', true, 'no members');
  }

  // ---------- Adding an administrator asks first (cancelled), in the Add user side panel ----------
  await vm((m) => { m.tab('users'); m.startAdd(); return 1; });
  await sleep(800);
  const sheet = await run(() => ({ open: !!document.querySelector('#addUserSheet .fx-sheet'), field: !!document.querySelector('#addUserSheet #newUsername') }));
  record('Add user opens a side panel with the form', sheet.open && sheet.field, sheet);
  await vm((m) => { m.newUsername('qa-not-created'); m.newAdmin(true); m.addUser(); return 1; });
  await sleep(800);
  const adminDialog = await run(() => { const d = document.querySelector('.fx-dialog'); return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : ''; });
  record('adding an administrator asks first', /administrator/i.test(adminDialog), adminDialog);
  await cancelDialog();
  await sleep(500);
  await vm((m) => { m.newUsername(''); m.newAdmin(false); m.cancelAdd(); return 1; });
  await sleep(400);
  const notCreated = await run(() => fetch('api/admin/users').then((r) => r.json()).then((list) => !list.some((u) => u.username === 'qa-not-created')));
  record('a cancelled change changes nothing', notCreated);

  // No sensitive account data
  const usersText = await run(() => fetch('api/admin/users').then((r) => r.text()));
  record('user data holds no password hash or token', !/password|hash|token|secret/i.test(usersText));

  // ---------- Roles & security: the matrix and the sign-in settings ----------
  await run(() => { document.getElementById('ad-roles').click(); return 1; });
  await sleep(1000);
  const matrix = await run(() => ({
    heads: [...document.querySelectorAll('#permissionMatrix thead th')].map((t) => t.textContent.trim()),
    rows: [...document.querySelectorAll('#permissionMatrix tbody tr')].map((r) => ({ name: r.querySelector('.factory-ad-perm').textContent.trim(),
      desc: r.querySelector('.factory-ad-permdesc').textContent.trim(), cells: [...r.querySelectorAll('td')].map((c) => c.textContent.trim()) }))
  }));
  const server = await run(() => fetch('api/admin/permissions').then((r) => r.json()));
  record('the matrix names the resource and action, with allow or deny for each role',
    matrix.rows.length === server.length + 1 && matrix.rows.every((r) => r.desc.length > 10 && r.cells.length === 4 && r.cells.every((c) => c === 'Allow' || c === 'Deny')), matrix.rows.slice(0, 2));
  const same = server.every((row, i) => ['ADMIN', 'LEAD', 'DEVELOPER', 'ANALYST'].every((role, j) => (row.allowed[role] ? 'Allow' : 'Deny') === matrix.rows[i].cells[j]));
  record('the matrix shows exactly the server\'s role definitions', same);
  const sec = await run(() => (document.getElementById('securitySettings') || {}).textContent || '');
  record('security settings show the configured lockout and password length', /locked for \d+ minutes after \d+ failed/.test(sec) && /At least \d+ characters/.test(sec), sec.replace(/\s+/g, ' ').slice(0, 200));

  // ---------- Audit log: compact rows, chips by kind ----------
  await run(() => { document.getElementById('ad-audit').click(); return 1; });
  await sleep(1000);
  const serverAudit = await run(() => fetch('api/admin/audit?limit=300').then((r) => r.json()));
  const audit = await run(() => ({
    rows: document.querySelectorAll('#auditList .factory-adm-event').length,
    chips: [...document.querySelectorAll('#adAuditChips .fx-chip')].map((c) => ({ id: c.id, text: c.textContent.trim() })),
    table: !!document.getElementById('auditTable')
  }));
  record('the audit log is compact rows (no table) with chips by kind', !audit.table && audit.rows === Math.min(serverAudit.length, 25) && audit.chips[0] && audit.chips[0].text === 'All ' + serverAudit.length, audit);
  const kinds = audit.chips.filter((c) => c.id !== 'adAudit-all');
  if (kinds.length) {
    const chip = kinds[kinds.length - 1];
    await run((id) => { document.getElementById(id).click(); return 1; }, chip.id);
    await sleep(500);
    const n = Number(chip.text.replace(/\D+/g, ''));
    const shown = await run(() => document.querySelectorAll('#auditList .factory-adm-event').length);
    record('an audit chip shows as many events as it counts', shown === Math.min(n, 25), { chip: chip, shown: shown });
    await run(() => { document.getElementById('adAudit-all').click(); return 1; });
    await sleep(300);
  }

  // Tabs by keyboard
  await run(() => { document.getElementById('ad-audit').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
  await sleep(600);
  record('Home moves to the first tab', await run(() => document.activeElement && document.activeElement.id === 'ad-users'));

  // ---------- Notifications ----------
  await go('notifications');
  const all = await run(() => new Promise((resolve) => window.require(['services/notifications'], (n) => resolve({ total: n.all().length, unread: n.unreadCount() }))));
  const nt = await run(() => ({
    chips: [...document.querySelectorAll('#ntChips .fx-chip')].map((c) => ({ id: c.id, text: c.textContent.trim() })),
    rows: document.querySelectorAll('#notificationList .factory-nt-item').length,
    days: [...document.querySelectorAll('#notificationList .factory-nt-day')].map((d) => d.textContent.trim()),
    unreadRows: document.querySelectorAll('#notificationList .factory-nt-item.is-unread').length,
    table: !!document.getElementById('notificationTable'),
    kpis: document.querySelectorAll('.factory-nt .factory-kpi').length
  }));
  record('notification chips count all and unread', nt.chips.length >= 2 && nt.chips[0].text === 'All ' + all.total && nt.chips[1].text === 'Unread ' + all.unread, { chips: nt.chips, all: all });
  record('notifications are compact rows grouped by day (no table, no KPI tiles)', !nt.table && nt.kpis === 0 && (all.total === 0 || (nt.rows === Math.min(all.total, 25) && nt.days.length >= 1)), nt);
  if (all.total > 0) {
    const before = await run(() => new Promise((resolve) => window.require(['services/notifications'], (n) => resolve(n.all().filter((x) => !x.unread()).map((x) => x.id)))));
    const first = await run(() => { const r = document.querySelectorAll('#notificationList .factory-nt-open')[0]; const t = r.querySelector('.factory-nt-title'); const title = t.textContent.slice(0, t.textContent.length - t.querySelector('.factory-nt-msg').textContent.length).trim(); r.click(); return title; });
    await sleep(600);
    const detail = await run(() => ({ title: (document.getElementById('notificationTitle') || {}).textContent || '', on: !!document.querySelector('#notificationList .factory-nt-item.is-on'), primary: !!document.getElementById('primaryActionButton') }));
    record('a row opens the notification beside the list', detail.title.trim() === first && detail.on && detail.primary, { first: first, detail: detail });
    const markable = await run(() => !document.getElementById('markAllReadButton').disabled);
    if (markable) {
      await run(() => { document.getElementById('markAllReadButton').click(); return 1; });
      await sleep(600);
      const after = await run(() => ({ unread: document.querySelectorAll('#notificationList .factory-nt-item.is-unread').length, disabled: document.getElementById('markAllReadButton').disabled }));
      record('Mark all read clears the unread state', after.unread === 0 && after.disabled, after);
    } else {
      record('Mark all read clears the unread state', true, 'nothing unread');
    }
    // Put the read state back as it was
    await run((ids) => new Promise((resolve) => window.require(['services/notifications'], (n) => { n.markUnread(n.all().map((x) => x.id).filter((id) => ids.indexOf(id) < 0)); resolve(1); })), before);
    await sleep(300);
  }
  await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => { ko.dataFor(document.querySelector('.factory-nt')).search('zz-nothing-zz'); resolve(1); })));
  await sleep(500);
  const ntEmpty = await run(() => ({ shown: !!document.getElementById('ntEmpty'), buttons: document.querySelectorAll('#ntEmpty button').length }));
  record('no match shows an empty state with one action', ntEmpty.shown && ntEmpty.buttons === 1, ntEmpty);
  await run(() => new Promise((resolve) => window.require(['knockout'], (ko) => { ko.dataFor(document.querySelector('.factory-nt')).clearFilters(); resolve(1); })));

  // ---------- Account ----------
  await go('account');
  const me = await run(() => fetch('api/auth/me').then((r) => r.json()));
  const acc = await run(() => ({
    name: (document.getElementById('accountName') || {}).textContent || '',
    facts: (document.getElementById('profileFacts') || {}).textContent || '',
    themes: [...document.querySelectorAll('.factory-acc-themes button')].map((b) => b.id + '=' + b.getAttribute('aria-pressed')),
    switches: [...document.querySelectorAll('#ac-sec-notifications .fx-switch')].map((b) => b.id + '=' + b.getAttribute('aria-checked')),
    tabs: document.querySelectorAll('.factory-acc [role=tab]').length,
    groups: [...document.querySelectorAll('.factory-acc-group h2')].map((h) => h.textContent.trim())
  }));
  record('the profile card names the user with their username', acc.name.trim() === me.displayName && acc.facts.indexOf(me.username) >= 0, { name: acc.name, user: me.username });
  record('preferences are grouped rows (no tabs)', acc.tabs === 0 && ['Appearance', 'Defaults', 'Notifications', 'Assistant and shortcuts', 'Security'].every((g) => acc.groups.indexOf(g) >= 0), acc.groups);
  const prefs = await run(() => new Promise((resolve) => window.require(['services/preferences'], (p) => resolve({ theme: p.theme(), notify: ['build', 'agent', 'review', 'system'].map((k) => 'notify-' + k + '=' + (p.notify[k]() ? 'true' : 'false')) }))));
  record('the theme buttons show the theme in use', acc.themes.length === 3 && acc.themes.indexOf('theme-' + prefs.theme + '=true') >= 0, { themes: acc.themes, theme: prefs.theme });
  record('the notification switches follow the preferences', acc.switches.join() === prefs.notify.join(), { shown: acc.switches, prefs: prefs.notify });
  await run(() => { document.getElementById('theme-dark').click(); return 1; });
  await sleep(400);
  const dark = await run(() => document.documentElement.getAttribute('data-theme'));
  await run((t) => { document.getElementById('theme-' + t).click(); return 1; }, prefs.theme);
  record('a theme button changes the theme', dark === 'dark', dark);
  if (me.canChangePassword) {
    await run(() => { document.getElementById('changePasswordStart').click(); return 1; });
    await sleep(700);
    const pw = await run(() => ({ open: !!document.querySelector('#passwordSheet .fx-sheet'), fields: document.querySelectorAll('#passwordSheet input[type=password]').length, rules: document.querySelectorAll('#passwordSheet .factory-ac-reqs li').length }));
    record('Change password opens a side panel with the three fields and the rules', pw.open && pw.fields === 3 && pw.rules === 3, pw);
    await run(() => { const b = document.querySelector('#passwordSheet .fx-sheet-close'); if (b) { b.click(); } return 1; });
    await sleep(400);
  }

  // ---------- About ----------
  await go('about');
  const upd = await run(() => fetch('api/update').then((r) => r.json()));
  const ab = await run(() => ({
    cards: [...document.querySelectorAll('#versionText .factory-adm-card')].map((c) => c.id + ':' + c.querySelector('.factory-abt-cardvalue').textContent.trim()),
    problems: document.querySelectorAll('.factory-abt .factory-rqd-problem').length,
    links: [...document.querySelectorAll('.factory-abt-links a')].map((a) => a.getAttribute('href')),
    art: (() => { const a = document.querySelector('.factory-ab-art'); if (!a) { return 0; } const r = a.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })(),
    tabs: document.querySelectorAll('.factory-abt [role=tab]').length
  }));
  const build = upd.build === 'dev' ? 'Development build' : 'Build ' + upd.build;
  record('four About cards; the version card shows the running build', ab.cards.length === 4 && ab.cards[0] === 'abVersion:' + build, { cards: ab.cards, build: build });
  record('About has no tabs and at most one problem bar', ab.tabs === 0 && ab.problems <= 1, ab);
  record('the links open the factory\'s repository', ab.links.length === 6 && ab.links.every((h) => /^https:\/\/github\.com\//.test(h)), ab.links);
  record('the illustration shows', /^\d{3,}x\d{3,}$/.test(String(ab.art)), ab.art);

  // ---------- Phones ----------
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const page of ['admin', 'notifications', 'account', 'about']) {
    await go(page);
    const w = await run(() => document.documentElement.scrollWidth);
    record('no sideways scroll at 390 px on ' + page, w <= 390, w);
  }

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Administration, Notifications, Account and About: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
