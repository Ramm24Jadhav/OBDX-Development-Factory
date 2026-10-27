/*
 * Administration: users, workspace members and roles, and the audit log. Only administrators see this page.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojselectsingle', 'ojs/ojswitch', 'ojs/ojbutton'],
  function (ko, accUtils, api, session, ArrayDataProvider) {
    const PERMISSIONS = {
      ANALYST: 'view, comment, requirements, designs',
      DEVELOPER: 'view, comment, SVN and imports, profile, designs',
      LEAD: 'everything, including approvals'
    };

    function AdminViewModel() {
      this.errorMessage = ko.observable('');
      this.infoMessage = ko.observable('');
      const showError = (error) => { this.infoMessage(''); this.errorMessage(error.message); };
      const showInfo = (text) => { this.errorMessage(''); this.infoMessage(text); };

      this.localMode = ko.pureComputed(() => !session.config() || session.config().mode === 'local');
      this.modeHint = ko.pureComputed(() => (this.localMode()
        ? 'Users sign in with factory accounts. Add people here and give them roles in workspaces below.'
        : 'Users sign in with the bank directory or single sign-on and appear here after their first sign-in. '
          + 'You can also add them in advance to give them roles before they sign in.'));

      const rawUsers = ko.observableArray([]);
      this.users = ko.pureComputed(() => rawUsers().map((u) => Object.assign({}, u, {
        lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never',
        toggleAdmin: () => updateUser(u.id, { admin: !u.admin }),
        toggleEnabled: () => updateUser(u.id, { enabled: !u.enabled }),
        resetPassword: () => {
          const password = window.prompt('New password for ' + u.username + ' (at least 12 characters):');
          if (password) {
            api.post('admin/users/' + u.id + '/password', { newPassword: password })
              .then(() => showInfo('Password of ' + u.username + ' reset. Tell them to change it after signing in.'))
              .catch(showError);
          }
        }
      })));
      const userOptions = ko.observableArray([]);
      rawUsers.subscribe((list) => userOptions(list
        .filter((u) => u.enabled && !u.admin)
        .map((u) => ({ value: u.id, label: u.displayName + ' (' + u.username + ')' }))));
      this.userProvider = new ArrayDataProvider(userOptions, { keyAttributes: 'value' });

      this.newUsername = ko.observable('');
      this.newDisplayName = ko.observable('');
      this.newEmail = ko.observable('');
      this.newPassword = ko.observable('');
      this.newAdmin = ko.observable(false);

      const workspaces = ko.observableArray([]);
      this.workspaceProvider = new ArrayDataProvider(workspaces, { keyAttributes: 'value' });
      this.memberWorkspaceId = ko.observable(null);
      const rawMembers = ko.observableArray([]);
      this.members = ko.pureComputed(() => rawMembers().map((m) => ({
        label: m.displayName + ' (' + m.username + ')',
        role: m.role.toLowerCase(),
        can: PERMISSIONS[m.role],
        removeAction: () => api.del('workspaces/' + this.memberWorkspaceId() + '/members/' + m.userId).then(rawMembers).catch(showError)
      })));
      this.memberUserId = ko.observable(null);
      this.memberRole = ko.observable('ANALYST');
      this.roleProvider = new ArrayDataProvider([
        { value: 'ANALYST', label: 'Analyst' }, { value: 'DEVELOPER', label: 'Developer' }, { value: 'LEAD', label: 'Lead' }
      ], { keyAttributes: 'value' });

      const rawAudit = ko.observableArray([]);
      this.auditEvents = ko.pureComputed(() => rawAudit().map((e) => {
        const workspace = workspaces().find((w) => w.value === e.workspaceId);
        return Object.assign({}, e, {
          when: new Date(e.at).toLocaleString(),
          workspace: workspace ? workspace.label : (e.workspaceId ? 'deleted workspace' : '')
        });
      }));

      const loadUsers = () => api.get('admin/users').then(rawUsers).catch(showError);
      const loadAudit = () => api.get('admin/audit?limit=200').then(rawAudit).catch(showError);
      const loadMembers = (id) => (id ? api.get('workspaces/' + id + '/members').then(rawMembers).catch(showError) : rawMembers([]));
      this.memberWorkspaceId.subscribe(loadMembers);

      const updateUser = (id, change) => api.put('admin/users/' + id, change)
        .then(() => { loadUsers(); loadAudit(); })
        .catch(showError);

      this.addUser = () => api.post('admin/users', {
        username: this.newUsername(), displayName: this.newDisplayName() || null, email: this.newEmail() || null,
        password: this.localMode() ? this.newPassword() : null, admin: this.newAdmin()
      }).then((user) => {
        showInfo('User ' + user.username + ' added.');
        this.newUsername('');
        this.newDisplayName('');
        this.newEmail('');
        this.newPassword('');
        this.newAdmin(false);
        loadUsers();
        loadAudit();
      }).catch(showError);

      this.setMember = () => api.put('workspaces/' + this.memberWorkspaceId() + '/members/' + this.memberUserId(), { role: this.memberRole() })
        .then((members) => { rawMembers(members); this.memberUserId(null); loadAudit(); })
        .catch(showError);

      this.connected = () => {
        accUtils.announce('Administration page loaded.');
        document.title = 'Administration';
        loadUsers();
        api.get('workspaces').then((list) => workspaces(list.map((w) => ({ value: w.id, label: w.name + ' (' + w.bankName + ')' }))))
          .then(loadAudit)
          .catch(showError);
      };
    }

    return AdminViewModel;
  }
);
