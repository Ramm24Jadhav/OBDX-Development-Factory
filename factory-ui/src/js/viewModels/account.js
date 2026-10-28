/*
 * Account & Preferences page: who is signed in with their role and workspaces, the preferences kept in this browser
 * (landing page, default workspace, time format, text size, assistant panels, notification categories), changing the
 * password of a factory account, this session, and signing out.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/preferences',
        '../services/ui', 'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojswitch'],
  function (ko, accUtils, api, session, workspaceSelection, preferences, ui) {
    function AccountViewModel() {
      this.user = session.user;
      this.prefs = preferences;
      this.currentPassword = ko.observable('');
      this.newPassword = ko.observable('');
      this.repeatPassword = ko.observable('');
      this.message = ko.observable('');
      this.success = ko.observable(false);
      this.messageClass = ko.pureComputed(() => (this.success() ? 'factory-note' : 'factory-note factory-note-bad'));
      this.tab = ko.observable('profile');
      this.tabs = ui.tabs(this.tab, [
        { value: 'profile', label: 'Profile', icon: 'user' }, { value: 'preferences', label: 'Preferences', icon: 'cog' },
        { value: 'notifications', label: 'Notifications', icon: 'bell' }, { value: 'security', label: 'Security', icon: 'shield' }
      ]);
      this.tab.subscribe((value) => { const el = document.getElementById('ac-sec-' + value); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      this.initials = ko.pureComputed(() => ui.initials(this.user() ? this.user().displayName : ''));
      this.sourceLabel = ko.pureComputed(() => {
        const source = this.user() ? this.user().source : '';
        return source === 'LDAP' ? 'Bank directory (LDAP)' : source === 'OIDC' ? 'Single sign-on (OpenID Connect)'
          : source === 'SAML' ? 'Single sign-on (SAML)' : 'Factory account';
      });
      this.roleText = ko.pureComputed(() => {
        const me = this.user();
        if (!me) {
          return '';
        }
        if (me.admin) {
          return 'Administrator';
        }
        const roles = Array.from(new Set(me.memberships.map((m) => m.role.charAt(0) + m.role.slice(1).toLowerCase())));
        return roles.join(', ') || 'No role yet';
      });
      this.workspaces = ko.pureComputed(() => {
        const me = this.user();
        if (!me) {
          return [];
        }
        if (me.admin) {
          return workspaceSelection.options().map((o) => ({ name: o.label, role: 'Administrator' }));
        }
        return me.memberships.map((m) => {
          const option = workspaceSelection.options().find((o) => o.value === m.workspaceId);
          return { name: option ? option.label : m.workspaceId, role: m.role.charAt(0) + m.role.slice(1).toLowerCase() };
        });
      });
      this.defaultWorkspaceName = ko.pureComputed(() => {
        const option = workspaceSelection.options().find((o) => o.value === preferences.workspace());
        return option ? option.label : 'The first one';
      });
      this.timezone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })();
      this.language = navigator.language || '';

      // Preferences
      this.workspaceOptions = workspaceSelection.options;
      this.landingOptions = [{ value: 'overview', label: 'Home' }, { value: 'workspaces', label: 'Workspaces' }, { value: 'requirements', label: 'Requirements' },
        { value: 'designer', label: 'Visual Designer' }, { value: 'changes', label: 'Changes' }, { value: 'notifications', label: 'Notifications' }];
      this.landingChange = ui.value(preferences.landing);
      this.workspaceChange = ui.value(preferences.workspace);
      this.textChange = ui.value(preferences.textSize);
      this.hour12On = () => preferences.hour12(true);
      this.hour24On = () => preferences.hour12(false);
      this.hour12Css = ko.pureComputed(() => (preferences.hour12() ? 'factory-seg factory-seg-on' : 'factory-seg'));
      this.hour24Css = ko.pureComputed(() => (preferences.hour12() ? 'factory-seg' : 'factory-seg factory-seg-on'));
      this.assistantToggle = ui.checked(preferences.assistant);
      this.sample = ko.pureComputed(() => ui.when(new Date().toISOString()));
      this.notifyRows = [
        { label: 'Build Results', icon: 'cog', key: 'build' }, { label: 'Agent Run Status', icon: 'robot', key: 'agent' },
        { label: 'Reviews & Approvals', icon: 'doc', key: 'review' }, { label: 'System Notifications', icon: 'info', key: 'system' }
      ].map((r) => Object.assign(r, { value: preferences.notify[r.key], change: ui.checked(preferences.notify[r.key]), iconClass: 'factory-nav-icon factory-ico-' + r.icon }));
      this.resetPreferences = () => {
        preferences.reset();
        ['landingPick', 'workspacePick', 'textPick'].forEach((id) => { const el = document.getElementById(id); if (el) { el.value = el.querySelector('option') ? el.querySelector('option').value : ''; } });
      };
      this.landingIs = (v) => ko.pureComputed(() => preferences.landing() === v);

      // Password
      const rule = (label, test) => ({ label: label, ok: ko.pureComputed(() => test(this.newPassword() || '')) });
      this.rules = [
        rule('At least 12 characters', (p) => p.length >= 12),
        rule('Different from the current password', (p) => !!p && p !== this.currentPassword()),
        rule('Both new passwords match', (p) => !!p && p === this.repeatPassword())
      ].map((r) => Object.assign(r, { css: ko.pureComputed(() => (r.ok() ? 'factory-ad-yes' : 'factory-ac-todo')) }));
      this.canChange = ko.pureComputed(() => !!this.user() && this.user().canChangePassword);
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
      this.browser = (() => {
        const ua = navigator.userAgent;
        const name = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
        const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
        return (os ? os + ' · ' : '') + name;
      })();
      this.signOut = () => session.logout();

      this.connected = () => {
        accUtils.announce('Account page loaded.');
        document.title = 'Account';
        workspaceSelection.load().catch(() => null);
      };
    }

    return AccountViewModel;
  }
);
