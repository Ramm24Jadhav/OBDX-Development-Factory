/*
 * Administration & Access Control: the answer first (people, who has not signed in, sign-in protection, the factory's
 * version), one problem bar, then four tabs: Users (compact rows with chips and a search; a user's effective access and
 * history, adding a user and resetting a password in side panels), Workspace access (members and roles), Roles &
 * security (the permission matrix and the sign-in settings) and the Audit log (compact rows with chips by kind).
 * Only administrators see this page.
 * The permission matrix comes from the server's role definitions (GET /api/admin/permissions), the same rules every
 * request is checked against; a user's effective access per workspace and the history of their privilege changes come
 * from GET /api/admin/users/{id}/access. Changes that widen or narrow access ask first. Hiding a control here is never
 * the protection: the server checks every change.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/updates', '../services/ui', '../services/toast',
        '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, updates, ui, toast, dialog) {
    const PERMISSIONS = {
      ANALYST: 'view, comment, requirements, designs',
      DEVELOPER: 'view, comment, SVN and imports, profile, designs',
      LEAD: 'everything, including approvals'
    };
    const badge = (text, tone) => ({ text: text, css: 'fx-badge' + (tone ? ' fx-badge--' + tone : '') });
    const ROLE_PILL = {
      ADMIN: badge('Administrator', 'primary'), LEAD: badge('Lead', 'violet'), DEVELOPER: badge('Developer', 'primary'),
      ANALYST: badge('Business Analyst', 'success'), NONE: badge('No role yet', '')
    };
    // User states in the shared status categories (ui.status)
    const ACTIVE = ui.status('SUCCEEDED', 'Active');
    const INACTIVE = ui.status('CLOSED', 'Inactive');
    const RANK = { LEAD: 3, DEVELOPER: 2, ANALYST: 1 };
    const DAY_MS = 24 * 3600 * 1000;
    const ACTIVITY = {
      USER_CREATED: { title: 'User added', icon: 'user', tone: 'blue' }, USER_CHANGED: { title: 'User updated', icon: 'edit', tone: 'green' },
      MEMBER_SET: { title: 'Workspace access granted', icon: 'folder', tone: 'amber' }, MEMBER_REMOVED: { title: 'Workspace access removed', icon: 'x', tone: 'red' },
      PASSWORD_RESET: { title: 'Password reset', icon: 'shield', tone: 'violet' }, LOGIN_FAILED: { title: 'Failed sign-in', icon: 'alert', tone: 'red' },
      LOGIN: { title: 'Signed in', icon: 'check', tone: 'green' },
      ADMIN_GRANTED: { title: 'Made administrator', icon: 'shield', tone: 'amber' }, ADMIN_REVOKED: { title: 'Administrator removed', icon: 'shield', tone: 'red' },
      USER_ACTIVATED: { title: 'User activated', icon: 'check', tone: 'green' }, USER_DEACTIVATED: { title: 'User deactivated', icon: 'x', tone: 'red' },
      FACTORY_UPDATE_STARTED: { title: 'Factory update started', icon: 'refresh', tone: 'blue' }
    };
    const TONE = { green: 'success', blue: 'primary', amber: 'warning', red: 'danger', violet: 'violet' };
    // The audit's kinds (chips): access changes, user accounts, sign-ins (failed ones on their own), everything else
    const AUDIT_KIND = {
      MEMBER_SET: 'access', MEMBER_REMOVED: 'access', ADMIN_GRANTED: 'access', ADMIN_REVOKED: 'access',
      USER_CREATED: 'users', USER_CHANGED: 'users', USER_ACTIVATED: 'users', USER_DEACTIVATED: 'users', PASSWORD_RESET: 'users',
      LOGIN: 'signin', LOGIN_FAILED: 'signin'
    };
    const AUDIT_CHIPS = [
      { value: 'all', label: 'All', test: () => true },
      { value: 'access', label: 'Access changes', test: (e) => AUDIT_KIND[e.action] === 'access' },
      { value: 'users', label: 'Accounts', test: (e) => AUDIT_KIND[e.action] === 'users' },
      { value: 'signin', label: 'Sign-ins', test: (e) => AUDIT_KIND[e.action] === 'signin' },
      { value: 'failed', label: 'Failed sign-ins', dot: 'is-danger', test: (e) => e.action === 'LOGIN_FAILED' },
      { value: 'other', label: 'Settings and other', test: (e) => !AUDIT_KIND[e.action] }
    ];
    // MEMBER_SET details are the role, then what it was: "LEAD (was ANALYST)", "ANALYST (new member)"
    const roleIn = (detail) => String(detail || '').split(' ')[0];
    const PERMISSION_NAME = { VIEW: 'View', COMMENT: 'Comment', MANAGE_CODE: 'Manage code', EDIT_REQUIREMENTS: 'Edit requirements', EDIT_DESIGNS: 'Edit designs', APPROVE: 'Approve' };
    const ROLE_NAME = { LEAD: 'Lead', DEVELOPER: 'Developer', ANALYST: 'Business Analyst' };
    const UPDATE_WORDS = { UP_TO_DATE: 'Up to date', AVAILABLE: 'A newer build is available', DOWNLOADING: 'Downloading an update', READY: 'Update ready',
      RESTARTING: 'Restarting with the update', FAILED: 'The last update failed', OFF: 'Updates are installed by the administrators' };
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

    function AdminViewModel() {
      // Loading failures stay on the page; the result of an action is a toast
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);
      this.busy = ko.observable(false);
      this.busyCss = ko.pureComputed(() => 'fx-btn fx-btn--primary' + (this.busy() ? ' is-loading' : ''));
      const run = (promise) => { this.busy(true); return promise.finally(() => this.busy(false)); };
      this.tab = ko.observable('users');
      // Only administrators see the page; anyone else opening it by URL gets a notice and no admin requests
      this.isAdmin = session.isAdmin;

      this.localMode = ko.pureComputed(() => !session.config() || session.config().mode === 'local');
      this.authMode = ko.pureComputed(() => (session.config() ? session.config().mode : 'local'));
      this.authText = ko.pureComputed(() => ({ local: 'Factory accounts (passwords hashed with BCrypt)', ldap: 'Bank directory (LDAP)',
        oidc: 'Single sign-on (OpenID Connect)', saml: 'Single sign-on (SAML)' }[this.authMode()] || this.authMode()));
      this.authShort = ko.pureComputed(() => ({ local: 'Factory accounts', ldap: 'Bank directory', oidc: 'Single sign-on', saml: 'Single sign-on' }[this.authMode()] || this.authMode()));
      this.modeHint = ko.pureComputed(() => (this.localMode()
        ? 'Users sign in with factory accounts. Add people here and give them roles in workspaces.'
        : 'Users sign in with the bank directory or single sign-on and appear here after their first sign-in. '
          + 'You can also add them in advance to give them roles before they sign in.'));

      const rawUsers = ko.observableArray([]);
      const workspaces = ko.observableArray([]);
      // userId -> [{workspace, role}]
      const memberships = ko.observable({});
      const rawAudit = ko.observableArray([]);
      const rawWorkspaces = ko.observableArray([]);
      this.loaded = ko.observable(false);

      const roleOf = (u) => {
        if (u.admin) {
          return 'ADMIN';
        }
        const list = memberships()[u.id] || [];
        return list.reduce((best, m) => (RANK[m.role] > (RANK[best] || 0) ? m.role : best), list.length ? list[0].role : 'NONE');
      };
      // A steady avatar colour per person, picked from the name
      const avatarCss = (name) => ui.avatarTone(name) + ' factory-adm-avatar';
      const userMenuItems = (u) => [
        { value: 'view', label: 'Effective access and history', icon: 'shield' },
        { value: 'access', label: 'Manage workspace access', icon: 'folder' },
        { value: 'admin', label: u.admin ? 'Remove administrator' : 'Make administrator', icon: 'shield', danger: u.admin },
        { value: 'enabled', label: u.enabled ? 'Deactivate' : 'Activate', icon: 'user', danger: u.enabled },
        { separator: true },
        { value: 'password', label: 'Reset password', icon: 'edit', disabled: u.source !== 'LOCAL',
          title: u.source === 'LOCAL' ? null : 'Directory and single sign-on users change their password there' }
      ];
      this.users = ko.pureComputed(() => rawUsers().map((u) => {
        const role = roleOf(u);
        const list = memberships()[u.id] || [];
        const doAdmin = () => dialog.confirm({
          title: u.admin ? 'Remove administrator?' : 'Make administrator?',
          message: u.admin ? u.username + ' keeps only the roles they have in workspaces.' : u.username + ' can then see every workspace and manage users.',
          confirmLabel: u.admin ? 'Remove administrator' : 'Make administrator', danger: u.admin
        }).then((ok) => ok && updateUser(u.id, { admin: !u.admin }, u.username + (u.admin ? ' is no longer an administrator.' : ' is now an administrator.')));
        const doEnabled = () => {
          const go = () => updateUser(u.id, { enabled: !u.enabled }, u.username + (u.enabled ? ' deactivated.' : ' activated.'));
          if (u.enabled) {
            dialog.confirm({ title: 'Deactivate ' + u.username + '?', message: 'They can no longer sign in until you activate them again.', confirmLabel: 'Deactivate', danger: true })
              .then((ok) => ok && go());
          } else {
            go();
          }
        };
        const actions = {
          view: () => this.openAccess(u),
          access: () => { this.memberUserId(u.id); this.tab('access'); },
          admin: doAdmin,
          enabled: doEnabled,
          password: () => { if (u.source === 'LOCAL') { this.resetPassword(''); this.resetUser(u); this.resetOpen(true); } }
        };
        return Object.assign({}, u, {
          name: u.displayName || u.username,
          initials: ui.initials(u.displayName || u.username), avatarCss: avatarCss(u.username), role: role, rolePill: ROLE_PILL[role] || ROLE_PILL.NONE,
          workspaceText: u.admin ? 'All workspaces' : list.length === 0 ? 'No workspace' : plural(list.length, 'workspace'),
          workspaceIds: list.map((m) => m.workspace),
          sub: u.username + (u.email ? ' · ' + u.email : ''),
          status: u.enabled ? ACTIVE : INACTIVE,
          invited: !u.lastLoginAt,
          lastLogin: u.lastLoginAt ? ui.when(u.lastLoginAt) : 'Never signed in',
          isLocal: u.source === 'LOCAL',
          adminLabel: u.admin ? 'Remove administrator' : 'Make administrator',
          enabledLabel: u.enabled ? 'Deactivate' : 'Activate',
          openLabel: 'Effective access and history of ' + u.username,
          menuLabel: 'More for ' + u.username,
          menuItems: userMenuItems(u),
          menu: (event) => { const f = actions[event.detail.value]; if (f) { f(); } },
          doView: actions.view, doAccess: actions.access, doAdmin: doAdmin, doEnabled: doEnabled, doPassword: actions.password
        });
      }));

      // Users: one chip (role, inactive or not signed in), a workspace and a search
      this.userChip = ko.observable('all');
      this.search = ko.observable('');
      this.workspaceFilter = ko.observable('');
      const USER_CHIPS = [
        { value: 'all', label: 'All', test: () => true },
        { value: 'ADMIN', label: 'Administrators', test: (u) => u.role === 'ADMIN' },
        { value: 'LEAD', label: 'Leads', test: (u) => u.role === 'LEAD' },
        { value: 'DEVELOPER', label: 'Developers', test: (u) => u.role === 'DEVELOPER' },
        { value: 'ANALYST', label: 'Business Analysts', test: (u) => u.role === 'ANALYST' },
        { value: 'NONE', label: 'No role yet', dot: 'is-warning', test: (u) => u.role === 'NONE' },
        { value: 'invited', label: 'Not signed in yet', dot: 'is-primary', test: (u) => u.invited },
        { value: 'inactive', label: 'Inactive', test: (u) => !u.enabled }
      ];
      const userMatches = (u) => {
        const text = this.search().trim().toLowerCase();
        return (!text || (u.name + ' ' + u.username + ' ' + (u.email || '') + ' ' + u.rolePill.text).toLowerCase().indexOf(text) >= 0)
          && (!this.workspaceFilter() || u.admin || u.workspaceIds.indexOf(this.workspaceFilter()) >= 0);
      };
      this.userChips = ko.pureComputed(() => {
        const base = this.users().filter(userMatches);
        return USER_CHIPS.map((c) => {
          const n = base.filter(c.test).length;
          return { value: c.value, n: n, text: c.label + ' ' + n, dot: c.dot ? 'factory-rq-fdot ' + c.dot : '',
            pressed: this.userChip() === c.value ? 'true' : 'false', pick: () => this.userChip(c.value) };
        }).filter((c) => c.value === 'all' || c.n > 0 || this.userChip() === c.value);
      });
      this.visibleUsers = ko.pureComputed(() => {
        const chip = USER_CHIPS.find((c) => c.value === this.userChip()) || USER_CHIPS[0];
        return this.users().filter((u) => chip.test(u) && userMatches(u));
      });
      this.userPager = ui.pages(this.visibleUsers, 25, [25, 50, 100]);
      this.userLong = ko.pureComputed(() => this.visibleUsers().length > this.userPager.size());
      this.usersShown = ko.pureComputed(() => (this.visibleUsers().length === this.users().length ? plural(this.users().length, 'user')
        : this.visibleUsers().length + ' of ' + this.users().length));
      this.filtersOn = ko.pureComputed(() => this.userChip() !== 'all' || !!this.search() || !!this.workspaceFilter());
      this.resetFilters = () => { this.userChip('all'); this.search(''); this.workspaceFilter(''); };
      this.workspaceFilterOptions = ko.pureComputed(() => [{ value: '', label: 'All workspaces' }].concat(workspaces()));
      // The usernames of the users shown, one per line (the former bulk bar's Copy usernames)
      this.copyUsernames = () => {
        const names = this.visibleUsers().map((u) => u.username);
        ui.copy(names.join('\n')).then(() => toast.success(plural(names.length, 'username') + ' copied.'))
          .catch(() => toast.error('The browser did not allow copying. Open a user and copy the username from there.'));
      };
      this.invited = ko.pureComputed(() => this.users().filter((u) => u.invited));

      // Sign-in protection as configured on the server
      this.security = ko.observable(null);
      this.update = updates.status;
      const failedSince = (ms) => rawAudit().filter((e) => e.action === 'LOGIN_FAILED' && Date.now() - new Date(e.at).getTime() < ms).length;
      this.lockText = ko.pureComputed(() => (this.security()
        ? 'Locked for ' + this.security().lockMinutes + ' min after ' + this.security().maxFailedLogins + ' failed sign-ins'
        : 'Locked for a while after repeated failures'));

      // The answer: four cards (people, waiting to sign in, sign-in, the factory's version)
      const showUsers = (chip) => () => { this.resetFilters(); this.userChip(chip); this.tab('users'); };
      this.nowCards = ko.pureComputed(() => {
        const all = this.users();
        const active = all.filter((u) => u.enabled).length;
        const admins = all.filter((u) => u.admin).length;
        const noRole = all.filter((u) => u.enabled && u.role === 'NONE').length;
        const failed = failedSince(7 * DAY_MS);
        const s = this.update();
        return [
          { id: 'adNowPeople', label: 'People', icon: 'user', tone: 'primary', value: plural(all.length, 'user'),
            sub: active + ' active · ' + plural(admins, 'administrator') + (noRole ? ' · ' + noRole + ' with no workspace' : ''),
            action: 'Show users', run: showUsers('all') },
          { id: 'adNowInvited', label: 'Not signed in yet', icon: 'clock', tone: this.invited().length ? 'warning' : 'success', value: String(this.invited().length),
            sub: this.invited().length ? 'Added in advance; the factory sends no invitation email' : 'Everyone has signed in at least once',
            action: this.invited().length ? 'Show them' : '', run: showUsers('invited') },
          { id: 'adNowSignin', label: 'Sign-in', icon: 'shield', tone: failed ? 'danger' : 'violet', value: this.authShort(),
            sub: failed ? plural(failed, 'failed sign-in') + ' in the last 7 days' : this.lockText(),
            action: failed ? 'Show in the audit log' : 'Security settings', run: failed ? () => this.showAudit('failed') : () => this.tab('roles') },
          { id: 'adNowVersion', label: 'Factory', icon: 'cube', tone: s && (s.state === 'AVAILABLE' || s.state === 'FAILED') ? 'warning' : 'success',
            value: s ? (s.build === 'dev' ? 'Development build' : 'Build ' + s.build) : '–',
            sub: s ? (s.version ? 'Version ' + s.version + ' · ' : '') + (UPDATE_WORDS[s.state] || s.state) : 'Version not read yet',
            action: 'About and updates', run: () => navigate('about') }
        ].map((c) => Object.assign(c, { iconCss: 'factory-adm-nowicon is-' + c.tone, iconClass: 'factory-nav-icon factory-ico-' + c.icon,
          aria: c.label + ': ' + c.value + '. ' + c.sub }));
      });
      // One problem: an update to install, failed sign-ins in the last day, people with no workspace
      this.problem = ko.pureComputed(() => {
        const s = this.update();
        if (s && s.enabled && s.state === 'FAILED') {
          return { css: 'factory-rqd-problem is-error', lead: 'The last update failed.', detail: s.message || 'Try again on the About page.', fix: { label: 'Open About', run: () => navigate('about') } };
        }
        const failed = failedSince(DAY_MS);
        if (failed >= 3) {
          return { css: 'factory-rqd-problem is-error', lead: plural(failed, 'failed sign-in') + ' in the last day.', detail: 'Check that they were the people themselves.',
            fix: { label: 'Show in the audit log', run: () => this.showAudit('failed') } };
        }
        if (s && s.enabled && s.state === 'AVAILABLE') {
          return { css: 'factory-rqd-problem', lead: 'A newer build of the factory is available.', detail: 'Build ' + s.latestBuild + '; this is build ' + s.build + '.',
            fix: { label: 'Open About', run: () => navigate('about') } };
        }
        const noRole = this.users().filter((u) => u.enabled && u.role === 'NONE');
        if (noRole.length) {
          return { css: 'factory-rqd-problem', lead: plural(noRole.length, 'user has', 'users have') + ' no workspace yet.', detail: 'They can sign in but see no work until they get a role.',
            fix: { label: 'Show them', run: showUsers('NONE') } };
        }
        return null;
      });

      this.tabKey = (event) => {
        const keys = this.tabs.map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tab(keys[next]);
        const button = document.getElementById('ad-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };
      this.tabs = ui.tabs(this.tab, [
        { value: 'users', label: 'Users', n: ko.pureComputed(() => rawUsers().length) },
        { value: 'access', label: 'Workspace access', n: ko.pureComputed(() => workspaces().length) },
        { value: 'roles', label: 'Roles & security', n: '' },
        { value: 'audit', label: 'Audit log', n: ko.pureComputed(() => rawAudit().length) }
      ]);

      // The header's menu: the reference pages in no menu, and copying usernames
      this.moreItems = ko.pureComputed(() => [
        { value: 'copy', label: 'Copy the usernames shown', icon: 'user', disabled: this.visibleUsers().length === 0 },
        { value: 'invited', label: 'Show who has not signed in', icon: 'clock' },
        { separator: true },
        { value: 'prompts', label: 'Prompts the factory uses', icon: 'doc', description: 'For developers: the AI Prompt Library' },
        { value: 'design', label: 'Design system reference', icon: 'cube', description: 'For developers: the factory\'s elements and tokens' }
      ]);
      this.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'copy') { this.copyUsernames(); } else if (v === 'invited') { showUsers('invited')(); } else if (v === 'prompts' || v === 'design') { navigate(v); }
      };

      // The permission matrix of the roles (from the factory's role definitions)
      const yes = { css: 'factory-ad-yes', text: 'Allowed', label: 'Allow' };
      const no = { css: 'factory-ad-no', text: 'Denied', label: 'Deny' };
      // Columns in this order; the rows come from the server's role definitions
      const MATRIX_ROLES = ['ADMIN', 'LEAD', 'DEVELOPER', 'ANALYST'];
      this.matrixRoles = ['Administrator', 'Lead', 'Developer', 'Business Analyst'];
      const rawMatrix = ko.observableArray([]);
      this.matrix = ko.pureComputed(() => rawMatrix().map((row) => ({
        permission: PERMISSION_NAME[row.permission] || row.permission, description: row.description,
        cells: MATRIX_ROLES.map((r) => (row.allowed[r] ? yes : no))
      })).concat([{ permission: 'Administration', description: 'Factory: create workspaces, manage users and roles, model and sign-in settings, the audit log', cells: [yes, no, no, no] }]));
      // Sign-in settings as rows
      this.securityRows = ko.pureComputed(() => {
        const s = this.security();
        return [
          { label: 'Sign-in', value: this.authText(), sub: 'Set in the factory settings (FACTORY_AUTH_MODE) by whoever installs it' },
          { label: 'Passwords', value: (s ? 'At least ' + s.minPasswordLength : 'At least 12') + ' characters', sub: 'Users change their own on the Account page' },
          { label: 'Failed sign-ins', value: s ? 'A username is locked for ' + s.lockMinutes + ' minutes after ' + s.maxFailedLogins + ' failed sign-ins in a row' : 'Accounts are locked for a while after repeated failures',
            sub: s ? 'After ' + s.maxFailedLoginsPerAddress + ' from one address, each further try waits longer' : '' },
          { label: 'Administrators from the settings', value: s && s.adminUsers.length ? s.adminUsers.join(', ') : 'None: administrators are set on this page',
            sub: s && s.adminUsers.length ? 'FACTORY_AUTH_ADMIN_USERS: administrators at each sign-in' : '' },
          { label: 'Account data', value: 'Password hashes, session tokens and stored secrets are never sent to the browser', sub: '' },
          { label: 'Changes', value: 'Every change is protected against cross-site requests and recorded in the audit log', sub: '' },
          { label: 'Stored secrets', value: 'SVN passwords, Jenkins tokens and model API keys are encrypted with the factory\'s key', sub: 'Never sent to the browser' }
        ];
      });

      // Effective access and privilege history of one user (a side sheet)
      this.accessOpen = ko.observable(false);
      this.accessUser = ko.observable(null);
      this.accessData = ko.observable(null);
      this.accessHeading = ko.pureComputed(() => (this.accessUser() ? 'Access: ' + (this.accessUser().displayName || this.accessUser().username) : 'Access'));
      this.accessRows = ko.pureComputed(() => {
        const d = this.accessData();
        return d ? d.workspaces.map((w) => ({
          workspace: w.workspace, rolePill: ROLE_PILL[w.role] || ROLE_PILL.NONE,
          allowed: w.allowed.map((p) => PERMISSION_NAME[p] || p), denied: w.denied.map((p) => PERMISSION_NAME[p] || p)
        })) : [];
      });
      this.accessHistory = ko.pureComputed(() => {
        const d = this.accessData();
        return d ? d.history.filter((e) => e.action !== 'USER_CHANGED').map((e) => ({
          title: (ACTIVITY[e.action] || { title: e.action }).title, text: activityText(e), when: ui.when(e.at), by: e.username || ''
        })) : [];
      });
      // The sheet's actions on the same user (the row menu's, for whoever opened the sheet first)
      this.accessActions = ko.pureComputed(() => {
        const u = this.accessUser();
        const row = u && this.users().find((x) => x.id === u.id);
        return row ? row.menuItems.filter((it) => it.value !== 'view') : [];
      });
      this.accessAction = (event) => {
        const u = this.accessUser();
        const row = u && this.users().find((x) => x.id === u.id);
        this.accessOpen(false);
        if (row) { row.menu(event); }
      };
      this.openAccess = (u) => {
        this.accessUser(u);
        this.accessData(null);
        this.accessOpen(true);
        api.get('admin/users/' + u.id + '/access').then(this.accessData).catch(actionError);
      };

      // The audit log with user and workspace names instead of their IDs
      const userName = (id) => { const u = rawUsers().find((x) => x.id === id); return u ? (u.displayName || u.username) : id; };
      const workspaceName = (id) => { const w = rawWorkspaces().find((x) => x.id === id); return w ? w.name : 'a deleted workspace'; };
      const activityText = (e) => {
        if (e.action === 'MEMBER_SET') {
          const was = /\(was (\w+)\)/.exec(e.detail || '');
          return userName(e.target) + (was ? ' changed in ' : ' added to ') + workspaceName(e.workspaceId) + (was ? ' to ' : ' as ') + (ROLE_NAME[roleIn(e.detail)] || roleIn(e.detail))
            + (was ? ' (was ' + (ROLE_NAME[was[1]] || was[1]) + ')' : '');
        }
        if (e.action === 'MEMBER_REMOVED') {
          const was = /^was (\w+)/.exec(e.detail || '');
          return userName(e.target) + ' removed from ' + workspaceName(e.workspaceId) + (was ? ' (was ' + (ROLE_NAME[was[1]] || was[1]) + ')' : '');
        }
        if (e.action === 'ADMIN_GRANTED' || e.action === 'ADMIN_REVOKED' || e.action === 'USER_ACTIVATED' || e.action === 'USER_DEACTIVATED') {
          return userName(e.target) + (e.username ? ' · by ' + e.username : '');
        }
        return [e.target ? userName(e.target) : '', e.detail].filter(Boolean).join(' · ') || e.username || '';
      };
      this.activityText = activityText;
      this.auditChip = ko.observable('all');
      this.auditSearch = ko.observable('');
      const auditAll = ko.pureComputed(() => rawAudit().map((e) => {
        const a = ACTIVITY[e.action] || { title: e.action.charAt(0) + e.action.slice(1).toLowerCase().replace(/_/g, ' '), icon: 'list', tone: '' };
        const workspace = workspaces().find((w) => w.value === e.workspaceId);
        const wsText = workspace ? workspace.label : (e.workspaceId ? 'deleted workspace' : '');
        return Object.assign({}, e, {
          title: a.title, text: activityText(e), when: ui.when(e.at), workspace: wsText,
          sub: [e.username ? 'by ' + e.username : '', e.action, wsText].filter(Boolean).join(' · '),
          iconCss: 'factory-adm-auditicon' + (TONE[a.tone] ? ' is-' + TONE[a.tone] : ''), iconClass: 'factory-nav-icon factory-ico-' + a.icon,
          tip: [e.action, e.target, e.detail].filter(Boolean).join(' · ')
        });
      }));
      const auditMatches = (e) => {
        const text = this.auditSearch().trim().toLowerCase();
        return !text || (e.action + ' ' + e.title + ' ' + e.text + ' ' + (e.username || '') + ' ' + (e.target || '') + ' ' + (e.detail || '') + ' ' + e.workspace).toLowerCase().indexOf(text) >= 0;
      };
      this.auditChips = ko.pureComputed(() => {
        const base = auditAll().filter(auditMatches);
        return AUDIT_CHIPS.map((c) => {
          const n = base.filter(c.test).length;
          return { value: c.value, n: n, text: c.label + ' ' + n, dot: c.dot ? 'factory-rq-fdot ' + c.dot : '',
            pressed: this.auditChip() === c.value ? 'true' : 'false', pick: () => this.auditChip(c.value) };
        }).filter((c) => c.value === 'all' || c.n > 0 || this.auditChip() === c.value);
      });
      this.auditEvents = ko.pureComputed(() => {
        const chip = AUDIT_CHIPS.find((c) => c.value === this.auditChip()) || AUDIT_CHIPS[0];
        return auditAll().filter((e) => chip.test(e) && auditMatches(e));
      });
      this.auditPager = ui.pages(this.auditEvents, 25, [25, 50, 100]);
      this.auditLong = ko.pureComputed(() => this.auditEvents().length > this.auditPager.size());
      this.auditShown = ko.pureComputed(() => (this.auditEvents().length === rawAudit().length ? plural(rawAudit().length, 'event') + ' (the latest 300)'
        : this.auditEvents().length + ' of ' + rawAudit().length));
      this.showAudit = (chip) => { this.auditSearch(''); this.auditChip(typeof chip === 'string' ? chip : 'all'); this.tab('audit'); };
      this.clearAudit = () => { this.auditSearch(''); this.auditChip('all'); };

      // Add user (a side panel)
      this.adding = ko.observable(false);
      this.startAdd = () => { this.adding(true); };
      this.cancelAdd = () => this.adding(false);
      this.newUsername = ko.observable('');
      this.newDisplayName = ko.observable('');
      this.newEmail = ko.observable('');
      this.newPassword = ko.observable('');
      this.newAdmin = ko.observable(false);

      // Reset password (factory accounts only; a side panel)
      this.resetUser = ko.observable(null);
      this.resetPassword = ko.observable('');
      this.resetOpen = ko.observable(false);
      this.resetHeading = ko.pureComputed(() => (this.resetUser() ? 'New password for ' + this.resetUser().username : 'New password'));
      this.resetOpen.subscribe((open) => { if (!open) { this.resetUser(null); this.resetPassword(''); } });
      this.cancelReset = () => this.resetOpen(false);
      this.savePassword = () => {
        const u = this.resetUser();
        return run(api.post('admin/users/' + u.id + '/password', { newPassword: this.resetPassword() }))
          .then(() => { toast.success('Password of ' + u.username + ' reset. Tell them to change it after signing in.'); this.cancelReset(); loadAudit(); })
          .catch(actionError);
      };

      // Workspace access
      const userOptions = ko.observableArray([]);
      rawUsers.subscribe((list) => userOptions(list.filter((u) => u.enabled && !u.admin).map((u) => ({ value: u.id, label: u.displayName + ' (' + u.username + ')' }))));
      this.userOptions = userOptions;
      this.workspaceList = workspaces;
      this.memberWorkspaceId = ko.observable(null);
      const rawMembers = ko.observableArray([]);
      this.members = ko.pureComputed(() => rawMembers().map((m) => ({
        label: m.displayName + ' (' + m.username + ')', name: m.displayName || m.username, username: m.username,
        initials: ui.initials(m.displayName || m.username), avatarCss: avatarCss(m.username),
        rolePill: ROLE_PILL[m.role], can: PERMISSIONS[m.role],
        change: () => { this.memberUserId(m.userId); this.memberRole(m.role === 'LEAD' ? 'DEVELOPER' : 'LEAD'); const el = document.getElementById('memberRole'); if (el) { el.scrollIntoView({ block: 'center' }); } },
        removeAction: () => {
          const workspaceId = this.memberWorkspaceId();
          const workspace = workspaces().find((w) => w.value === workspaceId);
          dialog.confirm({
            title: 'Remove ' + m.username + ' from this workspace?',
            message: 'They no longer see ' + (workspace ? workspace.label : 'this workspace') + '. You can give access again later.',
            confirmLabel: 'Remove', danger: true
          }).then((ok) => ok && api.del('workspaces/' + workspaceId + '/members/' + m.userId)
            .then((list) => { rawMembers(list); loadAllMembers(); loadAudit(); toast.success(m.username + ' removed from the workspace.'); })
            .catch(actionError));
        }
      })));
      this.membersShown = ko.pureComputed(() => plural(rawMembers().length, 'member') + '; administrators see every workspace');
      this.memberUserId = ko.observable(null);
      this.memberRole = ko.observable('ANALYST');
      this.roleOptions = [
        { value: 'ANALYST', label: 'Business Analyst' }, { value: 'DEVELOPER', label: 'Developer' }, { value: 'LEAD', label: 'Lead' }
      ];

      const loadUsers = () => api.get('admin/users').then(rawUsers).catch(showError);
      const loadAudit = () => api.get('admin/audit?limit=300').then(rawAudit).catch(showError);
      const loadMembers = (id) => (id ? api.get('workspaces/' + id + '/members').then(rawMembers).catch(showError) : rawMembers([]));
      const loadAllMembers = () => Promise.all(workspaces().map((w) => api.get('workspaces/' + w.value + '/members').then((list) => ({ w: w.value, list: list })).catch(() => ({ w: w.value, list: [] }))))
        .then((all) => {
          const map = {};
          all.forEach((x) => x.list.forEach((m) => { (map[m.userId] = map[m.userId] || []).push({ workspace: x.w, role: m.role }); }));
          memberships(map);
        });
      this.memberWorkspaceId.subscribe(loadMembers);

      const updateUser = (id, change, done) => api.put('admin/users/' + id, change)
        .then(() => { toast.success(done); loadUsers(); loadAudit(); })
        .catch(actionError);
      this.addUser = () => (this.newAdmin()
        ? dialog.confirm({ title: 'Add ' + this.newUsername() + ' as an administrator?', message: 'Administrators see every workspace, manage users and roles, and change the factory\'s settings.', confirmLabel: 'Add administrator', danger: true })
        : Promise.resolve(true)).then((ok) => ok && createUser());
      const createUser = () => run(api.post('admin/users', {
        username: this.newUsername(), displayName: this.newDisplayName() || null, email: this.newEmail() || null,
        password: this.localMode() ? this.newPassword() : null, admin: this.newAdmin()
      })).then((user) => {
        toast.success('User ' + user.username + ' added.');
        this.newUsername(''); this.newDisplayName(''); this.newEmail(''); this.newPassword(''); this.newAdmin(false);
        this.adding(false);
        loadUsers();
        loadAudit();
      }).catch(actionError);
      this.setMember = () => {
        const user = rawUsers().find((u) => u.id === this.memberUserId());
        const current = rawMembers().find((m) => m.userId === this.memberUserId());
        const role = this.memberRole();
        const name = user ? user.username : 'this user';
        const workspace = workspaces().find((w) => w.value === this.memberWorkspaceId());
        // Changing a role, or giving Lead (approvals), asks first
        const ask = current && current.role !== role
          ? { title: 'Change ' + name + '\'s role?', message: ROLE_NAME[current.role] + ' → ' + ROLE_NAME[role] + ' in ' + (workspace ? workspace.label : 'this workspace') + '. They can then: ' + PERMISSIONS[role] + '.', confirmLabel: 'Change role', danger: RANK[role] < RANK[current.role] }
          : !current && role === 'LEAD' ? { title: 'Give ' + name + ' the Lead role?', message: 'A Lead can do everything in ' + (workspace ? workspace.label : 'this workspace') + ', including approving requirements, designs and change plans.', confirmLabel: 'Give Lead' }
            : null;
        if (current && current.role === role) {
          toast.info(name + ' already has this role.');
          return Promise.resolve();
        }
        return (ask ? dialog.confirm(ask) : Promise.resolve(true)).then((ok) => ok && grant(user, role));
      };
      const grant = (user, role) => {
        return run(api.put('workspaces/' + this.memberWorkspaceId() + '/members/' + this.memberUserId(), { role: role }))
          .then((members) => {
            rawMembers(members); this.memberUserId(null); loadAudit(); loadAllMembers();
            toast.success((user ? user.username : 'The user') + ' now has access as ' + ROLE_NAME[role] + '.');
          })
          .catch(actionError);
      };

      this.connected = () => {
        accUtils.announce('Administration page loaded.');
        document.title = 'Administration';
        if (!session.isAdmin()) {
          return;
        }
        loadUsers();
        updates.refresh(false);
        api.get('workspaces').then((list) => rawWorkspaces(list) && workspaces(list.map((w) => ({ value: w.id, label: w.name + ' (' + w.bankName + ')' }))))
          .then(() => Promise.all([loadAudit(), loadAllMembers(), api.get('admin/permissions').then(rawMatrix), api.get('admin/security').then(this.security).catch(() => null)]))
          .then(() => { if (!this.memberWorkspaceId() && workspaces().length) { this.memberWorkspaceId(workspaces()[0].value); } })
          .catch(showError)
          .finally(() => this.loaded(true));
      };
    }

    return AdminViewModel;
  }
);
