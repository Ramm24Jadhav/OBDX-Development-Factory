/*
 * Administration & Access Control: users with their roles, workspaces, status and last sign-in, adding users, the role
 * permission matrix, workspace access (members and roles), users who have not signed in yet, the audit log and the
 * sign-in settings. Only administrators see this page.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/ui', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojselectsingle', 'ojs/ojswitch', 'ojs/ojbutton', 'ojs/ojmenu'],
  function (ko, accUtils, api, session, ui, ArrayDataProvider) {
    const PERMISSIONS = {
      ANALYST: 'view, comment, requirements, designs',
      DEVELOPER: 'view, comment, SVN and imports, profile, designs',
      LEAD: 'everything, including approvals'
    };
    const ROLE_PILL = {
      ADMIN: ui.pill('Administrator', 'red'), LEAD: ui.pill('Lead', 'violet'), DEVELOPER: ui.pill('Developer', 'blue'),
      ANALYST: ui.pill('Business Analyst', 'green'), NONE: ui.pill('No role yet', 'grey')
    };
    const RANK = { LEAD: 3, DEVELOPER: 2, ANALYST: 1 };
    const MONTH_MS = 30 * 24 * 3600 * 1000;
    const ACTIVITY = {
      USER_CREATED: { title: 'User added', icon: 'user', tone: 'blue' }, USER_CHANGED: { title: 'User updated', icon: 'edit', tone: 'green' },
      MEMBER_SET: { title: 'Workspace access granted', icon: 'folder', tone: 'amber' }, MEMBER_REMOVED: { title: 'Workspace access removed', icon: 'x', tone: 'red' },
      PASSWORD_RESET: { title: 'Password reset', icon: 'shield', tone: 'violet' }, LOGIN_FAILED: { title: 'Failed sign-in', icon: 'alert', tone: 'red' },
      LOGIN: { title: 'Signed in', icon: 'check', tone: 'green' }
    };

    function AdminViewModel() {
      this.errorMessage = ko.observable('');
      this.infoMessage = ko.observable('');
      const showError = (error) => { this.infoMessage(''); this.errorMessage(error.message); };
      const showInfo = (text) => { this.errorMessage(''); this.infoMessage(text); };
      this.tab = ko.observable('users');

      this.localMode = ko.pureComputed(() => !session.config() || session.config().mode === 'local');
      this.authMode = ko.pureComputed(() => (session.config() ? session.config().mode : 'local'));
      this.authText = ko.pureComputed(() => ({ local: 'Factory accounts (passwords hashed with BCrypt)', ldap: 'Bank directory (LDAP)',
        oidc: 'Single sign-on (OpenID Connect)', saml: 'Single sign-on (SAML)' }[this.authMode()] || this.authMode()));
      this.showAudit = () => this.tab('audit');
      this.modeHint = ko.pureComputed(() => (this.localMode()
        ? 'Users sign in with factory accounts. Add people here and give them roles in workspaces.'
        : 'Users sign in with the bank directory or single sign-on and appear here after their first sign-in. '
          + 'You can also add them in advance to give them roles before they sign in.'));

      const rawUsers = ko.observableArray([]);
      const workspaces = ko.observableArray([]);
      // userId -> [{workspace, role}]
      const memberships = ko.observable({});
      const rawAudit = ko.observableArray([]);

      const roleOf = (u) => {
        if (u.admin) {
          return 'ADMIN';
        }
        const list = memberships()[u.id] || [];
        return list.reduce((best, m) => (RANK[m.role] > (RANK[best] || 0) ? m.role : best), list.length ? list[0].role : 'NONE');
      };
      this.search = ko.observable('');
      this.roleFilter = ko.observable('');
      this.statusFilter = ko.observable('');
      this.workspaceFilter = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.roleChange = ui.value(this.roleFilter);
      this.statusChange = ui.value(this.statusFilter);
      this.workspaceChange = ui.value(this.workspaceFilter);
      this.resetFilters = () => {
        ['userSearch', 'roleFilter', 'statusFilter', 'workspaceFilter'].forEach((id) => { const el = document.getElementById(id); if (el) { el.value = ''; } });
        this.search(''); this.roleFilter(''); this.statusFilter(''); this.workspaceFilter('');
      };
      this.users = ko.pureComputed(() => rawUsers().map((u) => {
        const role = roleOf(u);
        const list = memberships()[u.id] || [];
        return Object.assign({}, u, {
          initials: ui.initials(u.displayName || u.username), role: role, rolePill: ROLE_PILL[role] || ROLE_PILL.NONE,
          workspaceText: u.admin ? 'All (' + workspaces().length + ')' : list.length === 1 ? '1 workspace' : list.length + ' workspaces',
          workspaceIds: list.map((m) => m.workspace),
          status: u.enabled ? ui.pill('Active', 'green') : ui.pill('Inactive', 'red'),
          lastLogin: u.lastLoginAt ? ui.when(u.lastLoginAt) : 'Never',
          action: (event) => {
            const value = event.detail.selectedValue;
            if (value === 'admin') {
              updateUser(u.id, { admin: !u.admin });
            } else if (value === 'enabled') {
              updateUser(u.id, { enabled: !u.enabled });
            } else if (value === 'password') {
              const password = window.prompt('New password for ' + u.username + ' (at least 12 characters):');
              if (password) {
                api.post('admin/users/' + u.id + '/password', { newPassword: password })
                  .then(() => showInfo('Password of ' + u.username + ' reset. Tell them to change it after signing in.'))
                  .catch(showError);
              }
            } else if (value === 'access') {
              this.memberUserId(u.id);
              this.tab('access');
            }
          },
          adminLabel: u.admin ? 'Remove administrator' : 'Make administrator',
          enabledLabel: u.enabled ? 'Deactivate' : 'Activate',
          isLocal: u.source === 'LOCAL'
        });
      }));
      this.visibleUsers = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return this.users().filter((u) => (!text || (u.displayName + ' ' + u.username + ' ' + (u.email || '') + ' ' + u.rolePill.text).toLowerCase().indexOf(text) >= 0)
          && (!this.roleFilter() || u.role === this.roleFilter())
          && (!this.statusFilter() || (this.statusFilter() === 'active') === u.enabled)
          && (!this.workspaceFilter() || u.admin || u.workspaceIds.indexOf(this.workspaceFilter()) >= 0));
      });
      this.userPager = ui.pager(this.visibleUsers, 10);
      this.invited = ko.pureComputed(() => this.users().filter((u) => !u.lastLoginAt));
      this.kpis = ko.pureComputed(() => {
        const all = rawUsers();
        const active = all.filter((u) => u.enabled).length;
        const recent = all.filter((u) => Date.now() - new Date(u.createdAt).getTime() < MONTH_MS).length;
        return [
          { label: 'Total Users', value: all.length, sub: '↑ ' + recent + ' this month', css: 'factory-kpi-sub factory-up', tone: 'blue', icon: 'user' },
          { label: 'Active Users', value: active, sub: (all.length ? Math.round(100 * active / all.length) : 0) + '% of total', css: 'factory-kpi-sub', tone: 'blue', icon: 'user' },
          { label: 'Roles', value: 4, sub: 'Administrator and 3 workspace roles', css: 'factory-kpi-sub', tone: 'violet', icon: 'shield' },
          { label: 'Workspaces', value: workspaces().length, sub: Object.keys(memberships()).length + ' users with access', css: 'factory-kpi-sub', tone: 'green', icon: 'folder' },
          { label: 'Not Signed In Yet', value: this.invited().length, sub: 'View users →', css: 'factory-kpi-sub factory-link', tone: 'amber', icon: 'clock', open: () => this.tab('invitations') }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon, open: k.open || (() => null) }));
      });
      this.tabs = ui.tabs(this.tab, [
        { value: 'users', label: 'Users', icon: 'user' }, { value: 'roles', label: 'Roles & Permissions', icon: 'shield' },
        { value: 'access', label: 'Workspace Access', icon: 'folder' }, { value: 'invitations', label: 'Invitations', icon: 'plug' },
        { value: 'audit', label: 'Audit Log', icon: 'list' }, { value: 'security', label: 'Security Settings', icon: 'cog' }
      ]);

      // The permission matrix of the roles (from the factory's role definitions)
      const yes = { css: 'factory-ad-yes', text: 'Allowed' };
      const no = { css: 'factory-ad-no', text: 'Not allowed' };
      this.matrix = [
        { permission: 'Access workspaces', cells: [yes, yes, yes, yes] },
        { permission: 'View code and requirements', cells: [yes, yes, yes, yes] },
        { permission: 'Comment', cells: [yes, yes, yes, yes] },
        { permission: 'Edit requirements', cells: [yes, yes, no, yes] },
        { permission: 'Edit designs', cells: [yes, yes, yes, yes] },
        { permission: 'Import code, make changes', cells: [yes, yes, yes, no] },
        { permission: 'Approve requirements, designs and plans', cells: [yes, yes, no, no] },
        { permission: 'Create workspaces, manage users', cells: [yes, no, no, no] }
      ];
      this.matrixRoles = ['Administrator', 'Lead', 'Developer', 'Business Analyst'];

      // Recent administrative activity from the audit log
      this.activity = ko.pureComputed(() => rawAudit().filter((e) => ACTIVITY[e.action] && e.action !== 'LOGIN').slice(0, 6).map((e) => {
        const a = ACTIVITY[e.action];
        return {
          title: a.title, text: [e.target, e.detail].filter(Boolean).join(' · ') || e.username, when: ui.when(e.at),
          iconCss: 'factory-kpi-icon factory-ad-acticon factory-ov2-icon-' + ({ green: 'green', blue: 'blue', amber: 'amber', red: 'red', violet: 'violet' }[a.tone]),
          iconClass: 'factory-nav-icon factory-ico-' + a.icon
        };
      }));
      this.auditSearch = ko.observable('');
      this.auditSearchInput = ui.value(this.auditSearch);
      this.auditEvents = ko.pureComputed(() => {
        const text = this.auditSearch().trim().toLowerCase();
        return rawAudit().map((e) => {
          const workspace = workspaces().find((w) => w.value === e.workspaceId);
          return Object.assign({}, e, { when: ui.when(e.at), workspace: workspace ? workspace.label : (e.workspaceId ? 'deleted workspace' : '') });
        }).filter((e) => !text || (e.action + ' ' + (e.username || '') + ' ' + (e.target || '') + ' ' + (e.detail || '')).toLowerCase().indexOf(text) >= 0);
      });
      this.auditPager = ui.pager(this.auditEvents, 15);

      // Add user
      this.adding = ko.observable(false);
      this.startAdd = () => { this.adding(true); this.tab('users'); };
      this.cancelAdd = () => this.adding(false);
      this.newUsername = ko.observable('');
      this.newDisplayName = ko.observable('');
      this.newEmail = ko.observable('');
      this.newPassword = ko.observable('');
      this.newAdmin = ko.observable(false);

      // Workspace access
      const userOptions = ko.observableArray([]);
      rawUsers.subscribe((list) => userOptions(list.filter((u) => u.enabled && !u.admin).map((u) => ({ value: u.id, label: u.displayName + ' (' + u.username + ')' }))));
      this.userProvider = new ArrayDataProvider(userOptions, { keyAttributes: 'value' });
      this.workspaceProvider = new ArrayDataProvider(workspaces, { keyAttributes: 'value' });
      this.workspaceList = workspaces;
      this.memberWorkspaceId = ko.observable(null);
      const rawMembers = ko.observableArray([]);
      this.members = ko.pureComputed(() => rawMembers().map((m) => ({
        label: m.displayName + ' (' + m.username + ')', initials: ui.initials(m.displayName || m.username),
        rolePill: ROLE_PILL[m.role], can: PERMISSIONS[m.role],
        removeAction: () => api.del('workspaces/' + this.memberWorkspaceId() + '/members/' + m.userId).then((list) => { rawMembers(list); loadAllMembers(); }).catch(showError)
      })));
      this.memberUserId = ko.observable(null);
      this.memberRole = ko.observable('ANALYST');
      this.roleProvider = new ArrayDataProvider([
        { value: 'ANALYST', label: 'Business Analyst' }, { value: 'DEVELOPER', label: 'Developer' }, { value: 'LEAD', label: 'Lead' }
      ], { keyAttributes: 'value' });

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

      const updateUser = (id, change) => api.put('admin/users/' + id, change)
        .then(() => { loadUsers(); loadAudit(); })
        .catch(showError);
      this.addUser = () => api.post('admin/users', {
        username: this.newUsername(), displayName: this.newDisplayName() || null, email: this.newEmail() || null,
        password: this.localMode() ? this.newPassword() : null, admin: this.newAdmin()
      }).then((user) => {
        showInfo('User ' + user.username + ' added.');
        this.newUsername(''); this.newDisplayName(''); this.newEmail(''); this.newPassword(''); this.newAdmin(false);
        this.adding(false);
        loadUsers();
        loadAudit();
      }).catch(showError);
      this.setMember = () => api.put('workspaces/' + this.memberWorkspaceId() + '/members/' + this.memberUserId(), { role: this.memberRole() })
        .then((members) => { rawMembers(members); this.memberUserId(null); loadAudit(); loadAllMembers(); })
        .catch(showError);

      this.connected = () => {
        accUtils.announce('Administration page loaded.');
        document.title = 'Administration';
        loadUsers();
        api.get('workspaces').then((list) => workspaces(list.map((w) => ({ value: w.id, label: w.name + ' (' + w.bankName + ')' }))))
          .then(() => Promise.all([loadAudit(), loadAllMembers()]))
          .then(() => { if (!this.memberWorkspaceId() && workspaces().length) { this.memberWorkspaceId(workspaces()[0].value); } })
          .catch(showError);
      };
    }

    return AdminViewModel;
  }
);
