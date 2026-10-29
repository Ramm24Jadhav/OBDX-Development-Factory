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

    const ROLE_NAME = { LEAD: 'Lead', DEVELOPER: 'Developer', ANALYST: 'Business Analyst' };

    /** Pages of a list with numbered page buttons and a page size: {rows, page, pages, text, prev, next, buttons, sizeChange}. */
    function numberedPager(list, initialSize) {
      const size = ko.observable(initialSize);
      const page = ko.observable(1);
      const pages = ko.pureComputed(() => Math.max(1, Math.ceil(ko.unwrap(list).length / size())));
      const current = ko.pureComputed(() => Math.min(page(), pages()));
      const rows = ko.pureComputed(() => ko.unwrap(list).slice((current() - 1) * size(), current() * size()));
      const text = ko.pureComputed(() => {
        const total = ko.unwrap(list).length;
        return total === 0 ? 'Showing 0' : 'Showing ' + ((current() - 1) * size() + 1) + ' to ' + Math.min(total, current() * size()) + ' of ' + total;
      });
      const buttons = ko.pureComputed(() => {
        const out = [];
        for (let n = 1; n <= pages(); n++) {
          out.push({ n: n, css: 'factory-ad-pg' + (n === current() ? ' factory-ad-pg-on' : ''), pick: () => page(n) });
        }
        return out;
      });
      return {
        rows: rows, page: current, pages: pages, text: text, buttons: buttons,
        prev: () => page(Math.max(1, current() - 1)),
        next: () => page(Math.min(pages(), current() + 1)),
        sizeChange: (event) => { size(Number(event.target.value) || initialSize); page(1); }
      };
    }

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
      const AVATAR_COLORS = ['#1e40af', '#7c3aed', '#0f766e', '#c2410c', '#be185d', '#15803d', '#0369a1', '#a16207', '#4338ca', '#b91c1c'];
      const avatarStyle = (name) => {
        let h = 0;
        String(name || '').split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) % 997; });
        return { background: AVATAR_COLORS[h % AVATAR_COLORS.length] };
      };
      this.users = ko.pureComputed(() => rawUsers().map((u) => {
        const role = roleOf(u);
        const list = memberships()[u.id] || [];
        return Object.assign({}, u, {
          initials: ui.initials(u.displayName || u.username), avatarStyle: avatarStyle(u.username), role: role, rolePill: ROLE_PILL[role] || ROLE_PILL.NONE,
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
          isLocal: u.source === 'LOCAL',
          isSelected: ko.pureComputed(() => this.selected.indexOf(u.id) >= 0),
          rowCss: ko.pureComputed(() => (this.selected.indexOf(u.id) >= 0 ? 'factory-ad-picked' : '')),
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
      this.userPager = numberedPager(this.visibleUsers, 10);
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
        return [
          { label: 'Total Users', value: all.length, sub: '↑ ' + recent + ' this month', css: 'factory-kpi-sub factory-up', tone: 'blue', icon: 'user' },
          { label: 'Active Users', value: active, sub: (all.length ? Math.round(100 * active / all.length) : 0) + '% of total', css: 'factory-kpi-sub', tone: 'blue', icon: 'user' },
          { label: 'Roles', value: 4, sub: '3 workspace roles', css: 'factory-kpi-sub', tone: 'violet', icon: 'shield' },
          { label: 'Workspaces', value: workspaces().length, sub: Object.keys(memberships()).length + ' users with access', css: 'factory-kpi-sub', tone: 'green', icon: 'folder' },
          { label: 'Not Signed In Yet', value: this.invited().length, sub: 'View users →', css: 'factory-kpi-sub factory-link', tone: 'amber', icon: 'clock', valueCss: 'factory-kpi-value factory-ad-orange', open: () => this.tab('invitations') }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon, valueCss: k.valueCss || 'factory-kpi-value', open: k.open || (() => null) }));
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
        label: m.displayName + ' (' + m.username + ')', initials: ui.initials(m.displayName || m.username), avatarStyle: avatarStyle(m.username),
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
        api.get('workspaces').then((list) => rawWorkspaces(list) && workspaces(list.map((w) => ({ value: w.id, label: w.name + ' (' + w.bankName + ')' }))))
          .then(() => Promise.all([loadAudit(), loadAllMembers()]))
          .then(() => { if (!this.memberWorkspaceId() && workspaces().length) { this.memberWorkspaceId(workspaces()[0].value); } })
          .catch(showError);
      };
    }

    return AdminViewModel;
  }
);
