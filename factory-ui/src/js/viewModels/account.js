/*
 * Account & Preferences page: a profile card (who is signed in, with their role, workspaces and this session), then the
 * preferences kept in this browser as grouped rows (appearance, defaults, notifications, assistant and shortcuts), and
 * security (changing the password of a factory account in a side panel, two-factor sign-in, this session, API access).
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/preferences',
        '../services/ui', '../services/toast', '../services/palette', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, workspaceSelection, preferences, ui, toast, palette) {
    // A design system switch (button role=switch) for an observable
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
      this.initials = ko.pureComputed(() => ui.initials(this.user() ? this.user().displayName : ''));
      this.avatarCss = ko.pureComputed(() => ui.avatarTone(this.user() ? this.user().username : '') + ' factory-acc-avatar');
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
      this.workspaceChips = ko.pureComputed(() => this.workspaces().map((w) => ({ text: w.name, tip: w.name + ' · ' + w.role })));
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
        return [
          { label: 'Username', value: me.username, mono: true },
          { label: 'Email', value: me.email || 'Not set' },
          { label: 'Role', value: this.roleText() },
          { label: 'Sign-in', value: this.sourceLabel() },
          { label: 'Default workspace', value: this.defaultWorkspaceName() },
          { label: 'Timezone and language', value: [this.timezone, this.language].filter(Boolean).join(' · ') || '–' }
        ].map((r) => Object.assign(r, { css: r.mono ? 'factory-mono' : '' }));
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
      this.pageSizeOptions = [{ value: '10', label: '10' }, { value: '25', label: '25' }, { value: '50', label: '50' }];
      this.dateFormatOptions = [{ value: 'browser', label: 'As the browser shows it' }, { value: 'iso', label: '2026-10-28' }, { value: 'dmy', label: '28/10/2026' }, { value: 'mdy', label: '10/28/2026' }];
      this.editorThemeOptions = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];

      // Preferences
      this.workspaceOptions = ko.pureComputed(() => [{ value: '', label: 'The first one' }].concat(workspaceSelection.options()));
      this.landingOptions = [{ value: 'overview', label: 'Home' }, { value: 'workspaces', label: 'Workspaces' }, { value: 'requirements', label: 'Requirements' },
        { value: 'studio', label: 'Design Studio' }, { value: 'changes', label: 'Changes' }, { value: 'notifications', label: 'Notifications' }];
      this.textOptions = [{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }];
      this.hourOptions = [{ value: true, label: '12 hour' }, { value: false, label: '24 hour' }];
      // Density: compact rows and controls everywhere (the fx-compact body class)
      this.densityOptions = [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }];
      // The shortcuts sheet of the command palette (also on "?")
      this.showShortcuts = () => palette.helpOpen(true);
      // Theme: the same preference as the top bar's light / dark toggle
      this.themes = [
        { value: 'light', label: 'Light', icon: 'sun', tip: 'Light theme' },
        { value: 'dark', label: 'Dark', icon: 'moon', tip: 'Dark theme' },
        { value: 'system', label: 'System', icon: 'monitor', tip: 'Follow the light or dark setting of your computer' }
      ].map((t) => Object.assign(t, {
        iconClass: 'factory-nav-icon factory-ico-' + t.icon,
        pressed: ko.pureComputed(() => (preferences.theme() === t.value ? 'true' : 'false')),
        pick: () => preferences.theme(t.value)
      }));
      this.sample = ko.pureComputed(() => 'Now: ' + ui.when(new Date().toISOString()));
      this.notifyRows = [
        { label: 'Build results', sub: 'Jenkins builds passed or failed', icon: 'cog', key: 'build', tone: 'primary' },
        { label: 'AI work', sub: 'Drafts and code generation finished or failed', icon: 'robot', key: 'agent', tone: 'violet' },
        { label: 'Reviews and approvals', sub: 'Specs, screens and plans waiting for you', icon: 'doc', key: 'review', tone: 'warning' },
        { label: 'System', sub: 'Imports, indexing and model settings', icon: 'info', key: 'system', tone: 'success' }
      ].map((r) => Object.assign(r, switchFor(preferences.notify[r.key]), { id: 'notify-' + r.key,
        iconClass: 'factory-nav-icon factory-ico-' + r.icon, tileCss: 'factory-acc-tile is-' + r.tone }));
      // A sample shown as a toast on this page only; notifications come from what happens in the workspaces
      this.sendTest = () => toast.info('Test notification: this is how a notification shows. Real ones are in the Notification Center.', {
        action: { label: 'Open', run: () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'notifications' })) }
      });
      this.assistant = switchFor(preferences.assistant);
      this.resetPreferences = () => {
        preferences.reset();
        this.extra.pageSize('10');
        this.extra.dateFormat('browser');
        this.extra.editorTheme('light');
        toast.success('Preferences reset to the defaults.');
      };
      this.landingIs = (v) => ko.pureComputed(() => preferences.landing() === v);
      this.moreItems = [
        { value: 'reset', label: 'Reset preferences', icon: 'refresh', description: 'Theme, density, defaults and notifications back to the defaults' },
        { value: 'shortcuts', label: 'Keyboard shortcuts', icon: 'help' },
        { value: 'test', label: 'Send a test notification', icon: 'bell' }
      ];
      this.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'reset') { this.resetPreferences(); } else if (v === 'shortcuts') { this.showShortcuts(); } else { this.sendTest(); }
      };

      // Password (a side panel)
      this.passwordOpen = ko.observable(false);
      this.openPassword = () => { this.message(''); this.passwordOpen(true); };
      this.closePassword = () => this.passwordOpen(false);
      this.passwordOpen.subscribe((open) => { if (!open) { this.currentPassword(''); this.newPassword(''); this.repeatPassword(''); this.message(''); } });
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
            this.passwordOpen(false);
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
