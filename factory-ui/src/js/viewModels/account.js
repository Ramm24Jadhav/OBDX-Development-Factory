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
        { value: 'notifications', label: 'Notifications', icon: 'bell' }, { value: 'security', label: 'Security', icon: 'shield' },
        { value: 'api', label: 'API Access', icon: 'link' }
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
      this.profileRows = ko.pureComputed(() => {
        const me = this.user();
        if (!me) {
          return [];
        }
        const names = this.workspaces().map((w) => w.name);
        return [
          { label: 'Username', value: me.username, icon: 'user' },
          { label: 'Email', value: me.email || 'Not set', icon: 'doc' },
          { label: 'Role', value: this.roleText(), icon: 'users' },
          { label: 'Workspaces', value: names.length ? names.join(', ') : 'None yet; ask an administrator', icon: 'folder' },
          { label: 'Default Workspace', value: this.defaultWorkspaceName(), icon: 'bank' },
          { label: 'Timezone', value: this.timezone, icon: 'clock' },
          { label: 'Language', value: this.language, icon: 'info' }
        ].map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon }));
      });

      // More preferences, kept in this browser beside the shared ones; the pages do not read them yet
      const EXTRA_KEY = 'factory.account.preferences';
      const extraStored = (() => { try { return JSON.parse(window.localStorage.getItem(EXTRA_KEY) || '{}'); } catch (e) { return {}; } })();
      const EXTRA_DEFAULTS = { pageSize: '10', dateFormat: 'browser', editorTheme: 'light', autoSave: false, tooltips: true, confirmDelete: true, usageData: false };
      this.extra = {};
      Object.keys(EXTRA_DEFAULTS).forEach((k) => {
        this.extra[k] = ko.observable(extraStored[k] === undefined ? EXTRA_DEFAULTS[k] : extraStored[k]);
        this.extra[k].subscribe(() => {
          const out = {};
          Object.keys(EXTRA_DEFAULTS).forEach((key) => { out[key] = this.extra[key](); });
          try { window.localStorage.setItem(EXTRA_KEY, JSON.stringify(out)); } catch (e) { /* kept for this visit only */ }
        });
      });
      this.pageSizeOptions = ['10', '25', '50'];
      this.dateFormatOptions = [{ value: 'browser', label: 'As the browser shows it' }, { value: 'iso', label: '2026-10-28' }, { value: 'dmy', label: '28/10/2026' }, { value: 'mdy', label: '10/28/2026' }];
      this.pageSizeChange = ui.value(this.extra.pageSize);
      this.dateFormatChange = ui.value(this.extra.dateFormat);
      this.editorThemeChange = ui.value(this.extra.editorTheme);

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
        { label: 'Build Results', icon: 'cog', key: 'build', tone: 'blue' }, { label: 'Agent Run Status', icon: 'robot', key: 'agent', tone: 'violet' },
        { label: 'Reviews & Approvals', icon: 'doc', key: 'review', tone: 'amber' }, { label: 'System Notifications', icon: 'info', key: 'system', tone: 'green' }
      ].map((r) => Object.assign(r, { value: preferences.notify[r.key], change: ui.checked(preferences.notify[r.key]), disabled: false, tip: '' }))
        .concat([{ label: 'Security Alerts', icon: 'shield', tone: 'red' }, { label: 'Weekly Summary', icon: 'chart', tone: 'blue' }]
          .map((r) => Object.assign(r, { value: false, change: () => true, disabled: true, tip: 'The factory does not send these yet' })))
        .map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon, tileCss: 'factory-ac-tile factory-ov2-icon-' + r.tone }));
      // A sample shown on this page only; notifications come from what happens in the workspaces
      this.testShown = ko.observable(false);
      let testTimer = null;
      this.sendTest = () => { this.testShown(true); window.clearTimeout(testTimer); testTimer = window.setTimeout(() => this.testShown(false), 8000); };
      this.hideTest = () => this.testShown(false);
      this.settingsRows = [
        { id: 'assistantToggle', label: 'AI suggestions', sub: 'Show the AI Assistant panels on the pages', icon: 'sparkle', value: preferences.assistant, change: ui.checked(preferences.assistant), disabled: false, tip: '' },
        { id: 'autoSaveToggle', label: 'Auto-save changes', sub: 'Pages save when you press Save', icon: 'refresh', value: false, disabled: true, tip: 'There is no auto-save; each page saves when you press Save' },
        { id: 'tooltipsToggle', label: 'Show helpful tooltips', sub: 'Tooltips always show', icon: 'help', value: true, disabled: true, tip: 'Tooltips cannot be turned off yet' },
        { id: 'confirmDeleteToggle', label: 'Confirm before delete', sub: 'Each page decides when to ask', icon: 'trash', value: true, disabled: true, tip: 'Not a setting yet' },
        { id: 'usageDataToggle', label: 'Anonymous usage data', sub: 'The factory collects none', icon: 'chart', value: false, disabled: true, tip: 'The factory sends no usage data anywhere' }
      ].map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon + ' factory-ac-seticon', change: r.change || (() => true) }));
      this.resetPreferences = () => {
        preferences.reset();
        this.extra.pageSize('10');
        this.extra.dateFormat('browser');
        this.extra.editorTheme('light');
        ['landingPick', 'workspacePick', 'textPick', 'pageSizePick', 'dateFormatPick', 'editorThemePick'].forEach((id) => { const el = document.getElementById(id); if (el) { el.value = el.querySelector('option') ? el.querySelector('option').value : ''; } });
      };
      this.landingIs = (v) => ko.pureComputed(() => preferences.landing() === v);

      // Password
      const rule = (label, test) => ({ label: label, ok: ko.pureComputed(() => test(this.newPassword() || '')) });
      this.rules = [
        rule('At least 12 characters', (p) => p.length >= 12),
        rule('Different from the current password', (p) => !!p && p !== this.currentPassword()),
        rule('Both new passwords match', (p) => !!p && p === this.repeatPassword())
      ].map((r) => Object.assign(r, { css: ko.pureComputed(() => (r.ok() ? 'factory-ad-yes' : 'factory-ac-todo')), rowCss: ko.pureComputed(() => (r.ok() ? 'factory-ac-req-ok' : '')) }));
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
