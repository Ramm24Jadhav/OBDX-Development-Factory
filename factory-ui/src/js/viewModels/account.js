/*
 * Account & Preferences page: who is signed in with their role and workspaces, the preferences kept in this browser
 * (theme, landing page, default workspace, time format, text size, assistant panels, notification categories),
 * changing the password of a factory account, this session, and signing out.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/preferences',
        '../services/ui', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, workspaceSelection, preferences, ui, toast) {
    // A design system switch (button role=switch) for an observable, or a fixed value when it cannot change yet
    const switchFor = (value) => ({
      checkedText: ko.pureComputed(() => (ko.unwrap(value) ? 'true' : 'false')),
      flip: () => { if (ko.isObservable(value)) { value(!value()); } }
    });

    function AccountViewModel() {
      this.user = session.user;
      this.prefs = preferences;
      this.currentPassword = ko.observable('');
      this.newPassword = ko.observable('');
      this.repeatPassword = ko.observable('');
      // An error from changing the password, shown under the fields; success is a toast
      this.message = ko.observable('');
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
          { label: 'Workspaces', value: names.length ? names.join('\n') : 'None yet; ask an administrator', icon: 'folder' },
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
      // Theme: the same preference as the top bar's light / dark toggle
      this.themes = [
        { value: 'light', label: 'Light', icon: 'sun', tip: 'Light theme' },
        { value: 'dark', label: 'Dark', icon: 'moon', tip: 'Dark theme' },
        { value: 'system', label: 'System', icon: 'monitor', tip: 'Follow the light or dark setting of your computer' }
      ].map((t) => Object.assign(t, {
        iconClass: 'factory-nav-icon factory-ico-' + t.icon,
        pressed: ko.pureComputed(() => (preferences.theme() === t.value ? 'true' : 'false')),
        css: ko.pureComputed(() => 'factory-ac-theme' + (preferences.theme() === t.value ? ' factory-ac-theme-on' : '')),
        pick: () => preferences.theme(t.value)
      }));
      this.sample = ko.pureComputed(() => ui.when(new Date().toISOString()));
      this.notifyRows = [
        { label: 'Build Results', icon: 'cog', key: 'build', tone: 'blue' }, { label: 'Agent Run Status', icon: 'robot', key: 'agent', tone: 'violet' },
        { label: 'Reviews & Approvals', icon: 'doc', key: 'review', tone: 'amber' }, { label: 'System Notifications', icon: 'info', key: 'system', tone: 'green' }
      ].map((r) => Object.assign(r, { value: preferences.notify[r.key], disabled: false, tip: '' }))
        .concat([{ label: 'Security Alerts', icon: 'shield', tone: 'red' }, { label: 'Weekly Summary', icon: 'chart', tone: 'blue' }]
          .map((r) => Object.assign(r, { value: false, disabled: true, tip: 'The factory does not send these yet' })))
        .map((r) => Object.assign(r, switchFor(r.value), { iconClass: 'factory-nav-icon factory-ico-' + r.icon, tileCss: 'factory-ac-tile factory-ac-tone-' + r.tone }));
      // A sample shown as a toast on this page only; notifications come from what happens in the workspaces
      this.sendTest = () => toast.info('Test notification: this is how a notification shows. Real ones are in the Notification Center.', {
        action: { label: 'Open', run: () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'notifications' })) }
      });
      this.settingsRows = [
        { id: 'assistantToggle', label: 'AI suggestions', sub: 'Show the AI Assistant panels on the pages', icon: 'sparkle', value: preferences.assistant, disabled: false, tip: '' },
        { id: 'autoSaveToggle', label: 'Auto-save changes', sub: 'Pages save when you press Save', icon: 'refresh', value: false, disabled: true, tip: 'There is no auto-save; each page saves when you press Save' },
        { id: 'tooltipsToggle', label: 'Show helpful tooltips', sub: 'Tooltips always show', icon: 'help', value: true, disabled: true, tip: 'Tooltips cannot be turned off yet' },
        { id: 'confirmDeleteToggle', label: 'Confirm before delete', sub: 'Each page decides when to ask', icon: 'trash', value: true, disabled: true, tip: 'Not a setting yet' },
        { id: 'usageDataToggle', label: 'Anonymous usage data', sub: 'The factory collects none', icon: 'chart', value: false, disabled: true, tip: 'The factory sends no usage data anywhere' }
      ].map((r) => Object.assign(r, switchFor(r.value), { iconClass: 'factory-nav-icon factory-ico-' + r.icon + ' factory-ac-seticon' }));
      this.resetPreferences = () => {
        preferences.reset();
        this.extra.pageSize('10');
        this.extra.dateFormat('browser');
        this.extra.editorTheme('light');
        // The selects show the defaults again (their options are bound to the preferences)
        [['landingPick', preferences.landing()], ['workspacePick', preferences.workspace()], ['textPick', preferences.textSize()],
          ['pageSizePick', '10'], ['dateFormatPick', 'browser'], ['editorThemePick', 'light']].forEach((p) => { const el = document.getElementById(p[0]); if (el) { el.value = p[1]; } });
        toast.success('Preferences reset to the defaults.');
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
        this.message('');
        if (this.newPassword() !== this.repeatPassword()) {
          this.message('The new passwords do not match. Type the same new password twice.');
          return;
        }
        api.post('auth/password', { currentPassword: this.currentPassword(), newPassword: this.newPassword() })
          .then(() => {
            toast.success('Password changed. Use the new one the next time you sign in.');
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
