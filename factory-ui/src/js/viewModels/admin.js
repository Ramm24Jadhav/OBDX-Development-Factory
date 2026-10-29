/*
 * Administration & Access Control: users with their roles, workspaces, status and last sign-in, adding users, the role
 * permission matrix, workspace access (members and roles), users who have not signed in yet, the audit log and the
 * sign-in settings. Only administrators see this page.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/ui', '../services/toast', '../services/dialog', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojselectsingle', 'ojs/ojswitch'],
  function (ko, accUtils, api, session, ui, toast, dialog, ArrayDataProvider) {
    const PERMISSIONS = {
      ANALYST: 'view, comment, requirements, designs',
      DEVELOPER: 'view, comment, SVN and imports, profile, designs',
      LEAD: 'everything, including approvals'
    };
    const badge = (text, tone) => ({ text: text, css: 'fx-badge' + (tone ? ' fx-badge--' + tone : '') });
    const ROLE_PILL = {
      ADMIN: badge('Administrator', 'danger'), LEAD: badge('Lead', 'violet'), DEVELOPER: badge('Developer', 'primary'),
      ANALYST: badge('Business Analyst', 'success'), NONE: badge('No role yet', '')
    };
    const RANK = { LEAD: 3, DEVELOPER: 2, ANALYST: 1 };
    const MONTH_MS = 30 * 24 * 3600 * 1000;
    const ACTIVITY = {
      USER_CREATED: { title: 'User added', icon: 'user', tone: 'blue' }, USER_CHANGED: { title: 'User updated', icon: 'edit', tone: 'green' },
      MEMBER_SET: { title: 'Workspace access granted', icon: 'folder', tone: 'amber' }, MEMBER_REMOVED: { title: 'Workspace access removed', icon: 'x', tone: 'red' },
      PASSWORD_RESET: { title: 'Password reset', icon: 'shield', tone: 'violet' }, LOGIN_FAILED: { title: 'Failed sign-in', icon: 'alert', tone: 'red' },
      LOGIN: { title: 'Signed in', icon: 'check', tone: 'green' }
    };

    const ROLE_NAME = { LEAD: 'Lead', DEVELOPER: 'Developer', ANALYST: 'Business Analyst' };

    function AdminViewModel() {
      // Loading failures stay on the page; the result of an action is a toast
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);
      this.busy = ko.observable(false);
      this.busyCss = ko.pureComputed(() => 'fx-btn fx-btn--primary' + (this.busy() ? ' is-loading' : ''));
      const run = (promise) => { this.busy(true); return promise.finally(() => this.busy(false)); };
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
      const rawWorkspaces = ko.observableArray([]);
      // Selected users (client side)
      this.selected = ko.observableArray([]);

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
      // A steady avatar colour per person, picked from the name
      const avatarCss = (name) => ui.avatarTone(name) + ' fx-avatar--sm factory-ad-avatar';
      this.users = ko.pureComputed(() => rawUsers().map((u) => {
        const role = roleOf(u);
        const list = memberships()[u.id] || [];
        const menu = ui.menu();
        return Object.assign({}, u, {
          initials: ui.initials(u.displayName || u.username), avatarCss: avatarCss(u.username), role: role, rolePill: ROLE_PILL[role] || ROLE_PILL.NONE,
          workspaceText: u.admin ? 'All (' + workspaces().length + ')' : list.length === 1 ? '1 workspace' : list.length + ' workspaces',
          workspaceIds: list.map((m) => m.workspace),
          status: u.enabled ? badge('Active', 'success') : badge('Inactive', 'danger'),
          lastLogin: u.lastLoginAt ? ui.when(u.lastLoginAt) : 'Never',
          menu: menu,
          doAdmin: () => {
            menu.close();
            dialog.confirm({
              title: u.admin ? 'Remove administrator?' : 'Make administrator?',
              message: u.admin ? u.username + ' keeps only the roles they have in workspaces.' : u.username + ' can then see every workspace and manage users.',
              confirmLabel: u.admin ? 'Remove administrator' : 'Make administrator', danger: u.admin
            }).then((ok) => ok && updateUser(u.id, { admin: !u.admin }, u.username + (u.admin ? ' is no longer an administrator.' : ' is now an administrator.')));
          },
          doEnabled: () => {
            menu.close();
            const go = () => updateUser(u.id, { enabled: !u.enabled }, u.username + (u.enabled ? ' deactivated.' : ' activated.'));
            if (u.enabled) {
              dialog.confirm({ title: 'Deactivate ' + u.username + '?', message: 'They can no longer sign in until you activate them again.', confirmLabel: 'Deactivate', danger: true })
                .then((ok) => ok && go());
            } else {
              go();
            }
          },
          doPassword: () => { menu.close(); this.resetPassword(''); this.resetUser(u); },
          doAccess: () => { menu.close(); this.memberUserId(u.id); this.tab('access'); },
          adminLabel: u.admin ? 'Remove administrator' : 'Make administrator',
          enabledLabel: u.enabled ? 'Deactivate' : 'Activate',
          isLocal: u.source === 'LOCAL',
          isSelected: ko.pureComputed(() => this.selected.indexOf(u.id) >= 0),
          rowCss: ko.pureComputed(() => (this.selected.indexOf(u.id) >= 0 ? 'is-selected' : '')),
          toggle: (event) => { if (event.target.checked) { this.selected.push(u.id); } else { this.selected.remove(u.id); } return true; }
        });
      }));
      this.visibleUsers = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return this.users().filter((u) => (!text || (u.displayName + ' ' + u.username + ' ' + (u.email || '') + ' ' + u.rolePill.text).toLowerCase().indexOf(text) >= 0)
          && (!this.roleFilter() || u.role === this.roleFilter())
          && (!this.statusFilter() || (this.statusFilter() === 'active') === u.enabled)
          && (!this.workspaceFilter() || u.admin || u.workspaceIds.indexOf(this.workspaceFilter()) >= 0));
      });
      this.userPager = ui.pages(this.visibleUsers, 10, [10, 25, 50]);
      this.allSelected = ko.pureComputed(() => this.userPager.rows().length > 0 && this.userPager.rows().every((u) => this.selected.indexOf(u.id) >= 0));
      this.toggleAll = (event) => {
        const ids = this.userPager.rows().map((u) => u.id);
        this.selected(event.target.checked ? Array.from(new Set(this.selected().concat(ids))) : this.selected().filter((id) => ids.indexOf(id) < 0));
      };
      this.selectedText = ko.pureComputed(() => (this.selected().length ? ' · ' + this.selected().length + ' selected' : ''));
      this.invited = ko.pureComputed(() => this.users().filter((u) => !u.lastLoginAt));
      this.kpis = ko.pureComputed(() => {
        const all = rawUsers();
        const active = all.filter((u) => u.enabled).length;
        const recent = all.filter((u) => Date.now() - new Date(u.createdAt).getTime() < MONTH_MS).length;
        const showUsers = (status) => () => {
          this.tab('users');
          this.statusFilter(status);
          window.setTimeout(() => { const el = document.getElementById('statusFilter'); if (el) { el.value = status; } }, 0);
        };
        return [
          { label: 'Total Users', value: all.length, sub: '↑ ' + recent + ' this month', css: 'factory-ad-kpisub fx-trend--up', tone: 'primary', icon: 'user', open: showUsers(''), target: 'show all users' },
          { label: 'Active Users', value: active, sub: (all.length ? Math.round(100 * active / all.length) : 0) + '% of total', tone: 'info', icon: 'user', open: showUsers('active'), target: 'show active users' },
          { label: 'Roles', value: 4, sub: '3 workspace roles', tone: 'violet', icon: 'shield', open: () => this.tab('roles'), target: 'show roles and permissions' },
          { label: 'Workspaces', value: workspaces().length, sub: Object.keys(memberships()).length + ' users with access', tone: 'success', icon: 'folder', open: () => this.tab('access'), target: 'show workspace access' },
          { label: 'Not Signed In Yet', value: this.invited().length, sub: 'View users →', css: 'factory-ad-kpisub factory-ad-kpilink', tone: 'warning', icon: 'clock', valueCss: 'fx-kpi-value factory-ad-warn', open: () => this.tab('invitations'), target: 'show users who have not signed in' }
        ].map((k) => Object.assign(k, {
          cardCss: 'fx-card fx-card--interactive fx-kpi factory-ad-kpi', aria: k.label + ' ' + k.value + ', ' + k.target,
          iconCss: 'fx-kpi-icon factory-ad-tone-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon,
          valueCss: k.valueCss || 'fx-kpi-value', css: k.css || 'factory-ad-kpisub'
        }));
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

      // Recent administrative activity from the audit log, with user and workspace names instead of their IDs
      const userName = (id) => { const u = rawUsers().find((x) => x.id === id); return u ? (u.displayName || u.username) : id; };
      const workspaceName = (id) => { const w = rawWorkspaces().find((x) => x.id === id); return w ? w.name : 'a deleted workspace'; };
      const activityText = (e) => {
        if (e.action === 'MEMBER_SET') {
          return userName(e.target) + ' added to ' + workspaceName(e.workspaceId) + ' as ' + (ROLE_NAME[e.detail] || e.detail);
        }
        if (e.action === 'MEMBER_REMOVED') {
          return userName(e.target) + ' removed from ' + workspaceName(e.workspaceId);
        }
        return [e.target ? userName(e.target) : '', e.detail].filter(Boolean).join(' · ') || e.username;
      };
      this.activity = ko.pureComputed(() => rawAudit().filter((e) => ACTIVITY[e.action] && e.action !== 'LOGIN').slice(0, 6).map((e) => {
        const a = ACTIVITY[e.action];
        return {
          title: a.title, text: activityText(e), when: ui.when(e.at),
          iconCss: 'fx-kpi-icon factory-ad-acticon factory-ad-tone-' + ({ green: 'success', blue: 'primary', amber: 'warning', red: 'danger', violet: 'violet' }[a.tone]),
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
      this.auditPager = ui.pages(this.auditEvents, 15, [15, 30, 50]);

      // Add user
      this.adding = ko.observable(false);
      this.startAdd = () => { this.adding(true); this.tab('users'); };
      this.cancelAdd = () => this.adding(false);
      this.newUsername = ko.observable('');
      this.newDisplayName = ko.observable('');
      this.newEmail = ko.observable('');
      this.newPassword = ko.observable('');
      this.newAdmin = ko.observable(false);

      // Reset password (factory accounts only)
      this.resetUser = ko.observable(null);
      this.resetPassword = ko.observable('');
      this.cancelReset = () => { this.resetUser(null); this.resetPassword(''); };
      this.savePassword = () => {
        const u = this.resetUser();
        return run(api.post('admin/users/' + u.id + '/password', { newPassword: this.resetPassword() }))
          .then(() => { toast.success('Password of ' + u.username + ' reset. Tell them to change it after signing in.'); this.cancelReset(); loadAudit(); })
          .catch(actionError);
      };

      // Workspace access
      const userOptions = ko.observableArray([]);
      rawUsers.subscribe((list) => userOptions(list.filter((u) => u.enabled && !u.admin).map((u) => ({ value: u.id, label: u.displayName + ' (' + u.username + ')' }))));
      this.userProvider = new ArrayDataProvider(userOptions, { keyAttributes: 'value' });
      this.workspaceProvider = new ArrayDataProvider(workspaces, { keyAttributes: 'value' });
      this.workspaceList = workspaces;
      this.memberWorkspaceId = ko.observable(null);
      const rawMembers = ko.observableArray([]);
      this.members = ko.pureComputed(() => rawMembers().map((m) => ({
        label: m.displayName + ' (' + m.username + ')', initials: ui.initials(m.displayName || m.username), avatarCss: avatarCss(m.username),
        rolePill: ROLE_PILL[m.role], can: PERMISSIONS[m.role],
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

      const updateUser = (id, change, done) => api.put('admin/users/' + id, change)
        .then(() => { toast.success(done); loadUsers(); loadAudit(); })
        .catch(actionError);
      this.addUser = () => run(api.post('admin/users', {
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
        return run(api.put('workspaces/' + this.memberWorkspaceId() + '/members/' + this.memberUserId(), { role: this.memberRole() }))
          .then((members) => {
            rawMembers(members); this.memberUserId(null); loadAudit(); loadAllMembers();
            toast.success((user ? user.username : 'The user') + ' now has access as ' + ROLE_NAME[this.memberRole()] + '.');
          })
          .catch(actionError);
      };

      this.connected = () => {
        accUtils.announce('Administration page loaded.');
        document.title = 'Administration';
        loadUsers();
        api.get('workspaces').then((list) => rawWorkspaces(list) && workspaces(list.map((w) => ({ value: w.id, label: w.name + ' (' + w.bankName + ')' }))))
          .then(() => Promise.all([loadAudit(), loadAllMembers()]))
          .then(() => { if (!this.memberWorkspaceId() && workspaces().length) { this.memberWorkspaceId(workspaces()[0].value); } })
          .catch(showError);
      };
    }

    return AdminViewModel;
  }
);
