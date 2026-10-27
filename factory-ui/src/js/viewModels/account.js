/*
 * Account page: who is signed in, their workspaces, and changing the password of a local account.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojbutton'],
  function (ko, accUtils, api, session, workspaceSelection) {
    function AccountViewModel() {
      this.user = session.user;
      this.currentPassword = ko.observable('');
      this.newPassword = ko.observable('');
      this.repeatPassword = ko.observable('');
      this.message = ko.observable('');
      this.success = ko.observable(false);
      this.messageClass = ko.pureComputed(() => (this.success() ? 'oj-text-color-success' : 'oj-text-color-danger'));
      this.sourceLabel = ko.pureComputed(() => {
        const source = this.user() ? this.user().source : '';
        return source === 'LDAP' ? 'bank directory (LDAP)' : source === 'OIDC' ? 'single sign-on' : 'factory account';
      });
      this.workspaceSummary = ko.pureComputed(() => {
        const me = this.user();
        if (!me) {
          return '';
        }
        if (me.admin) {
          return 'all (administrator)';
        }
        if (me.memberships.length === 0) {
          return 'none yet; ask an administrator to add you';
        }
        return me.memberships.map((m) => {
          const option = workspaceSelection.options().find((o) => o.value === m.workspaceId);
          return (option ? option.label : m.workspaceId) + ': ' + m.role.toLowerCase();
        }).join('; ');
      });

      this.changePassword = () => {
        this.success(false);
        if (this.newPassword() !== this.repeatPassword()) {
          this.message('The new passwords do not match.');
          return;
        }
        api.post('auth/password', { currentPassword: this.currentPassword(), newPassword: this.newPassword() })
          .then(() => {
            this.success(true);
            this.message('Password changed.');
            this.currentPassword('');
            this.newPassword('');
            this.repeatPassword('');
          })
          .catch((error) => this.message(error.message));
      };

      this.connected = () => {
        accUtils.announce('Account page loaded.');
        document.title = 'Account';
        workspaceSelection.load().catch(() => null);
      };
    }

    return AccountViewModel;
  }
);
