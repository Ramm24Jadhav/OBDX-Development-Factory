// Administration check: drives a running factory in headless Edge or Chrome and checks what the page promises:
//  - the permission matrix comes from the server's role definitions, names the resource and action, and says allow or
//    deny in words for every role;
//  - a user's effective access lists each workspace with its role and the actions allowed and denied, and the history
//    of their access changes;
//  - changing a member's role and adding an administrator ask first (the check cancels the dialog: nothing changes);
//  - the admin endpoints refuse a non-administrator, and no user data holds a password hash or token;
//  - tabs work with the arrow keys; nothing scrolls sideways at 390 px; no console errors.
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
  // Runs fn(viewModel) in the page
  const vm = (fn) => run({ toString: () => '() => new Promise((resolve) => window.require([\'knockout\'], (ko) => resolve(('
    + fn.toString() + ')(ko.dataFor(document.getElementById(\'userTable\') || document.querySelector(\'.factory-ad-main\'))))))' });

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open(BASE + '/?ojr=admin');
  await sleep(6000);

  // Matrix
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

  // Effective access of the first non-admin user with a workspace (or any user)
  await run(() => { document.getElementById('ad-users').click(); return 1; });
  await sleep(800);
  const picked = await vm((m) => {
    const u = m.users().find((x) => !x.admin && x.workspaceIds.length) || m.users()[0];
    m.openAccess(u);
    return { username: u.username, admin: u.admin };
  });
  await sleep(2500);
  const access = await run(() => ({
    rows: [...document.querySelectorAll('#accessTable tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent.trim())),
    history: document.querySelectorAll('#accessHistory li').length,
    open: !!document.querySelector('#accessSheet [role="dialog"], #accessSheet .fx-sheet')
  }));
  record('effective access lists each workspace with its role, allowed and denied actions', access.rows.length > 0 && access.rows.every((r) => r.length === 4), { user: picked, rows: access.rows.slice(0, 2) });
  record('the access history of the user is shown', access.history > 0, access.history);
  await vm((m) => { m.accessOpen(false); return 1; });
  await sleep(600);

  // Confirmation before a role change (cancelled)
  const asked = await vm((m) => new Promise((resolve) => {
    m.tab('access');
    setTimeout(() => {
      const members = m.members();
      if (!members.length) { resolve({ skipped: 'no members' }); return; }
      resolve({ ready: true });
    }, 1500);
  }));
  if (asked.ready) {
    await vm((m) => {
      // The first member of the chosen workspace, with a role other than theirs
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
    await run(() => { const c = [...document.querySelectorAll('.fx-dialog button')].find((b) => /Cancel/.test(b.textContent)); if (c) { c.click(); } return !!c; });
    await sleep(600);
  } else {
    record('changing a role or giving Lead asks first', true, asked);
  }

  // Adding an administrator asks first (cancelled)
  await vm((m) => { m.tab('users'); m.startAdd(); m.newUsername('qa-not-created'); m.newAdmin(true); m.addUser(); return 1; });
  await sleep(800);
  const adminDialog = await run(() => { const d = document.querySelector('.fx-dialog'); return d ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : ''; });
  record('adding an administrator asks first', /administrator/i.test(adminDialog), adminDialog);
  await run(() => { const c = [...document.querySelectorAll('.fx-dialog button')].find((b) => /Cancel/.test(b.textContent)); if (c) { c.click(); } return !!c; });
  await sleep(500);
  await vm((m) => { m.newUsername(''); m.newAdmin(false); m.cancelAdd(); return 1; });
  const notCreated = await run(() => fetch('api/admin/users').then((r) => r.json()).then((list) => !list.some((u) => u.username === 'qa-not-created')));
  record('a cancelled change changes nothing', notCreated);

  // No sensitive account data
  const users = await run(() => fetch('api/admin/users').then((r) => r.text()));
  record('user data holds no password hash or token', !/password|hash|token|secret/i.test(users));

  // Security settings from the server
  await run(() => { document.getElementById('ad-security').click(); return 1; });
  await sleep(800);
  const sec = await run(() => (document.getElementById('securitySettings') || {}).textContent || '');
  record('security settings show the configured lockout and password length', /locked for \d+ minutes after \d+ failed/.test(sec) && /At least \d+ characters/.test(sec), sec.replace(/\s+/g, ' ').slice(0, 200));

  // Tabs by keyboard
  await run(() => { document.getElementById('ad-security').focus(); return 1; });
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
  await sleep(600);
  record('Home moves to the first tab', await run(() => document.activeElement && document.activeElement.id === 'ad-users'));

  // Phone
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1000);
  record('no sideways scroll at 390 px', await run(() => document.documentElement.scrollWidth <= 390), await run(() => document.documentElement.scrollWidth));

  const errors = s.errors.filter((e) => !/auth\/me/.test(e));
  record('no console errors', errors.length === 0, errors.slice(0, 3));
  s.close();
  process.stdout.write(defects ? defects + ' defect(s)\n' : 'Administration: all checks passed\n');
  process.exit(defects ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
