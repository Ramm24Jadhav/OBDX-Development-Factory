/**
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
/*
 * The application shell: sidebar navigation, top bar, sign-in page and update banner.
 */
define(['knockout', './services/session', './services/updates', './services/dashboard', './services/workspaceSelection', './services/pageRequests', './services/preferences', './services/ui', './services/palette', './services/busy', './services/strips', './services/reveal', 'ojs/ojarraydataprovider', 'ojs/ojcontext', 'ojs/ojmodule-element-utils', 'ojs/ojresponsiveutils', 'ojs/ojresponsiveknockoututils', 'ojs/ojcorerouter', 'ojs/ojmodulerouter-adapter', 'ojs/ojknockoutrouteradapter', 'ojs/ojurlparamadapter', 'ojs/ojmodule-element', 'ojs/ojknockout', './components/fx-elements', './components/fx-more'],
  function (ko, session, updates, dashboard, workspaceSelection, pageRequests, preferences, ui, palette, busy, strips, reveal, ArrayDataProvider, Context, moduleUtils, ResponsiveUtils, ResponsiveKnockoutUtils, CoreRouter, ModuleRouterAdapter, KnockoutRouterAdapter, UrlParamAdapter) {

     function ControllerViewModel() {

        // Handle announcements sent when pages change, for Accessibility.
        this.manner = ko.observable('polite');
        this.message = ko.observable();

        const announcementHandler = (event) => {
          this.message(event.detail.message);
          this.manner(event.detail.manner);
      };

      document.getElementById('globalBody').addEventListener('announce', announcementHandler, false);

      // Media queries for responsive layouts
      const smQuery = ResponsiveUtils.getFrameworkQuery(ResponsiveUtils.FRAMEWORK_QUERY_KEY.SM_ONLY);
      this.smScreen = ResponsiveKnockoutUtils.createMediaQueryObservable(smQuery);

      // icon: the sidebar icon (css class factory-ico-<icon>); group: the sidebar section (NAV_GROUPS); parent: the
      // sidebar entry that stays highlighted, and shows in the breadcrumb, for a page opened from another one;
      // sidebar: false keeps a page out of the sidebar (it opens from the top bar and the palette); hidden: in no menu.
      let navData = [
        { path: '', redirect: preferences.landing() || 'overview' },
        { path: 'overview', detail: { label: 'Home', icon: 'home', group: 'overview' } },
        { path: 'workspaces', detail: { label: 'Workspaces', icon: 'folder', group: 'overview' } },
        { path: 'requirements', detail: { label: 'Requirements', icon: 'list', group: 'analyze' } },
        { path: 'profile', detail: { label: 'Project Profile', icon: 'profile', group: 'analyze' } },
        { path: 'code', detail: { label: 'Code', icon: 'code', group: 'analyze' } },
        { path: 'knowledge', detail: { label: 'Knowledge Explorer', icon: 'target', group: 'analyze', parent: 'code' } },
        { path: 'library', detail: { label: 'OBDX Library', icon: 'book', group: 'analyze' } },
        { path: 'studio', detail: { label: 'UI Design Studio', icon: 'design', group: 'design' } },
        { path: 'designer', detail: { label: 'Visual Designer', icon: 'edit', group: 'design', parent: 'studio' } },
        { path: 'changes', detail: { label: 'Changes', icon: 'branch', group: 'deliver' } },
        { path: 'build', detail: { label: 'Build, Test & Review', icon: 'flask', group: 'deliver' } },
        { path: 'reviews', detail: { label: 'External Review', icon: 'share', group: 'deliver' } },
        { path: 'modernization', detail: { label: 'Modernization', icon: 'refresh', group: 'modernize' } },
        { path: 'models', detail: { label: 'Models & AI Providers', icon: 'chip', group: 'admin' } },
        { path: 'integrations', detail: { label: 'Integrations', icon: 'plug', group: 'admin' } },
        { path: 'agents', detail: { label: 'Agent Runs', icon: 'robot', group: 'admin' } },
        { path: 'packs', detail: { label: 'Version Packs', icon: 'cube', group: 'admin' } },
        { path: 'prompts', detail: { label: 'AI Prompt Library', icon: 'sparkle', group: 'admin' } },
        { path: 'admin', detail: { label: 'Administration', icon: 'cog', group: 'admin', adminOnly: true } },
        { path: 'design', detail: { label: 'Design System', icon: 'design', group: 'admin' } },
        // In the top bar (bell, help, user menu) rather than the sidebar
        { path: 'notifications', detail: { label: 'Notifications', icon: 'bell', sidebar: false } },
        { path: 'account', detail: { label: 'Account', icon: 'user', sidebar: false } },
        { path: 'about', detail: { label: 'About', icon: 'info', sidebar: false } },
        // Opened from the Changes page
        { path: 'impact', detail: { label: 'Impact Analysis', hidden: true, parent: 'changes' } },
        // Not in the navigation: the screen preview (shown inside the designer) and the customer review page.
        { path: 'preview', detail: { label: 'Preview', hidden: true } },
        { path: 'review', detail: { label: 'Review', hidden: true } }
      ];
      // The sidebar sections, in order. Administration folds away; the others are always open.
      const NAV_GROUPS = [
        { key: 'overview', label: 'Overview' },
        { key: 'analyze', label: 'Analyze' },
        { key: 'design', label: 'Design' },
        { key: 'deliver', label: 'Build & Deliver' },
        { key: 'modernize', label: 'Modernize' },
        { key: 'admin', label: 'Administration', folds: true }
      ];
      preferences.apply();
      // Router setup
      let router = new CoreRouter(navData, {
        urlAdapter: new UrlParamAdapter()
      });
      router.sync();
      // Pages open another page with window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' })).
      window.addEventListener('factory-navigate', (event) => router.go({ path: event.detail }));

      this.moduleAdapter = new ModuleRouterAdapter(router);

      this.selection = new KnockoutRouterAdapter(router);

      // The sidebar: the Administration page is shown only to administrators.
      const visibleRoutes = () => navData.slice(1)
        .filter((route) => !route.detail.hidden && route.detail.sidebar !== false && (!route.detail.adminOnly || session.isAdmin()));
      const navItems = ko.observableArray(visibleRoutes());
      session.user.subscribe(() => navItems(visibleRoutes()));
      this.sidebarOpen = ko.observable(false);
      const currentRoute = ko.pureComputed(() => navData.find((r) => r.path === this.selection.path()) || null);
      // A page's own entry is highlighted; a page without one (Impact Analysis) highlights the entry it was opened from.
      const isActive = (path) => {
        const current = currentRoute();
        if (!current) { return false; }
        return current.path === path || (current.detail.parent === path && navItems().indexOf(current) < 0);
      };
      const navGroup = (group) => ko.pureComputed(() => navItems().filter((route) => route.detail.group === group).map((route) => ({
        label: route.detail.label,
        href: '?ojr=' + route.path,
        iconClass: 'factory-nav-icon factory-ico-' + route.detail.icon,
        active: ko.pureComputed(() => isActive(route.path)),
        // A plain click opens the page here; Ctrl or Shift click opens it in a new tab.
        open: (event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
          }
          event.preventDefault();
          router.go({ path: route.path });
          this.sidebarOpen(false);
        }
      })));
      // Administration folds away (remembered in this browser; the key was factory.navSetupOpen when the section was
      // called Setup) and opens by itself on one of its pages. In the collapsed menu every section shows as icons.
      const adminItems = navGroup('admin');
      const adminActive = ko.pureComputed(() => adminItems().some((item) => item.active()));
      const storedAdmin = (() => {
        try {
          const kept = window.localStorage.getItem('factory.navAdminOpen');
          return kept !== null ? kept : window.localStorage.getItem('factory.navSetupOpen');
        } catch (e) { return null; }
      })();
      const adminOpen = ko.observable(storedAdmin === null ? adminActive() : storedAdmin === '1');
      adminOpen.subscribe((value) => {
        try { window.localStorage.setItem('factory.navAdminOpen', value ? '1' : '0'); } catch (e) { /* not kept */ }
      });
      adminActive.subscribe((value) => { if (value) { adminOpen(true); } });
      const adminShown = ko.pureComputed(() => adminOpen() || adminActive() || this.sidebarCollapsed());
      this.navGroups = ko.pureComputed(() => NAV_GROUPS.map((group) => {
        const items = group.key === 'admin' ? adminItems : navGroup(group.key);
        return {
          label: group.label,
          folds: !!group.folds,
          headingId: 'nav-' + group.key + '-heading',
          listId: 'nav-' + group.key + '-list',
          items: items,
          shown: group.folds ? adminShown : ko.pureComputed(() => true),
          css: group.folds ? ko.pureComputed(() => 'factory-nav-section factory-nav-group' + (adminShown() ? ' is-open' : '')) : 'factory-nav-section',
          toggle: () => adminOpen(!adminShown())
        };
      }).filter((group) => group.items().length > 0));

      // Up and Down move between the menu's links (and the Administration toggle), Home and End go to the first and last.
      this.navKey = (event) => {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        const nav = event.currentTarget;
        if (keys.indexOf(event.key) < 0 || event.altKey || event.ctrlKey || event.metaKey || !event.target.closest('.factory-nav-link, .factory-nav-group-toggle')) {
          return true;
        }
        const stops = Array.from(nav.querySelectorAll('.factory-nav-link, .factory-nav-group-toggle'))
          .filter((el) => el.getClientRects().length > 0);
        const at = stops.indexOf(event.target.closest('.factory-nav-link, .factory-nav-group-toggle'));
        let next = at;
        if (event.key === 'Home') { next = 0; } else if (event.key === 'End') { next = stops.length - 1; }
        else if (event.key === 'ArrowDown') { next = Math.min(stops.length - 1, at + 1); } else { next = Math.max(0, at - 1); }
        event.preventDefault();
        if (stops[next]) { stops[next].focus(); }
        return false;
      };

      // The breadcrumb above every page: section, the page it was opened from (a link) and the page. Pages outside the
      // sections (Notifications, Account, About) have none.
      this.crumbs = ko.pureComputed(() => {
        const current = currentRoute();
        if (!current || !current.detail) { return null; }
        const parent = current.detail.parent && navItems().indexOf(current) < 0
          ? navData.find((r) => r.path === current.detail.parent) : null;
        const group = NAV_GROUPS.find((g) => g.key === (current.detail.group || (parent && parent.detail.group)));
        if (!group) { return null; }
        return {
          section: group.label,
          parent: parent ? {
            label: parent.detail.label,
            href: '?ojr=' + parent.path,
            open: (event) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey) { return; }
              event.preventDefault();
              router.go({ path: parent.path });
            }
          } : null,
          page: current.detail.label
        };
      });

      // No scrollbar on the menu: an edge fades while more items are hidden past it.
      const navEdges = (nav) => {
        nav.classList.toggle('factory-nav-more-up', nav.scrollTop > 2);
        nav.classList.toggle('factory-nav-more-down', nav.scrollTop + nav.clientHeight < nav.scrollHeight - 2);
      };
      // The menu is drawn after sign-in, so this waits for it and attaches once.
      this.watchNav = (tries) => {
        const sideNav = document.querySelector('.factory-nav');
        if (!sideNav) {
          if ((tries || 0) < 40) { window.setTimeout(() => this.watchNav((tries || 0) + 1), 250); }
          return;
        }
        if (sideNav.dataset.edges) { return; }
        sideNav.dataset.edges = '1';
        // Phones: a swipe to the left closes the open menu drawer (a mostly vertical swipe still scrolls it)
        const drawer = sideNav.closest('.factory-sidebar');
        let touchX = null;
        let touchY = null;
        drawer.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
        drawer.addEventListener('touchend', (e) => {
          if (touchX === null || !this.sidebarOpen()) { return; }
          const dx = e.changedTouches[0].clientX - touchX;
          const dy = e.changedTouches[0].clientY - touchY;
          touchX = null;
          if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) { this.sidebarOpen(false); }
        }, { passive: true });
        // Collapsed menu: the page name in a tooltip to the right of the icon, on hover and on keyboard focus
        const tip = document.getElementById('navTip');
        const showTip = (link) => {
          if (!tip || !this.sidebarCollapsed()) { return; }
          const label = link.querySelector('.factory-nav-label');
          const box = link.getBoundingClientRect();
          tip.textContent = label ? label.textContent.trim() : '';
          tip.style.top = Math.round(box.top + box.height / 2) + 'px';
          tip.style.left = Math.round(box.right + 10) + 'px';
          tip.classList.add('is-on');
        };
        this.hideNavTip = () => { if (tip) { tip.classList.remove('is-on'); } };
        const linkOf = (e) => (e.target && e.target.closest ? e.target.closest('.factory-nav-link') : null);
        sideNav.addEventListener('mouseover', (e) => { const link = linkOf(e); if (link) { showTip(link); } });
        sideNav.addEventListener('mouseout', (e) => { const link = linkOf(e); if (link && !link.contains(e.relatedTarget)) { this.hideNavTip(); } });
        sideNav.addEventListener('focusin', (e) => { const link = linkOf(e); if (link && link.matches(':focus-visible')) { showTip(link); } });
        sideNav.addEventListener('focusout', () => this.hideNavTip());
        sideNav.addEventListener('scroll', () => this.hideNavTip(), { passive: true });
        this.sidebarCollapsed.subscribe(() => this.hideNavTip());
        sideNav.addEventListener('scroll', () => navEdges(sideNav), { passive: true });
        window.addEventListener('resize', () => navEdges(sideNav));
        if (window.ResizeObserver) {
          const watch = new window.ResizeObserver(() => navEdges(sideNav));
          watch.observe(sideNav);
          sideNav.querySelectorAll('ul').forEach((list) => watch.observe(list));
        }
        navEdges(sideNav);
      };
      // Collapsed (icons only) is remembered in this browser; on tablets (768 to 1099 pixels) the menu starts collapsed so
      // the page has room, and Expand opens it until the window changes size; on phones it opens over the page.
      const storedCollapsed = (() => {
        try { return window.localStorage.getItem('factory.sidebarCollapsed') === '1'; } catch (e) { return false; }
      })();
      const collapsedChoice = ko.observable(storedCollapsed);
      collapsedChoice.subscribe((value) => {
        try { window.localStorage.setItem('factory.sidebarCollapsed', value ? '1' : '0'); } catch (e) { /* not kept */ }
      });
      const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1099px)');
      const tablet = ko.observable(tabletQuery.matches);
      const tabletExpanded = ko.observable(false);
      tabletQuery.addEventListener('change', (event) => { tabletExpanded(false); tablet(event.matches); });
      // The phone drawer always shows the full menu, whatever was chosen on a wider window.
      const phoneQuery = window.matchMedia('(max-width: 767px)');
      const phone = ko.observable(phoneQuery.matches);
      phoneQuery.addEventListener('change', (event) => phone(event.matches));
      this.sidebarCollapsed = ko.pureComputed(() => !phone() && (tablet() ? !tabletExpanded() : collapsedChoice()));
      this.toggleCollapsed = () => {
        if (tablet()) { tabletExpanded(!tabletExpanded()); } else { collapsedChoice(!collapsedChoice()); }
      };
      this.toggleSidebar = () => this.sidebarOpen(!this.sidebarOpen());
      this.closeSidebar = () => this.sidebarOpen(false);
      this.shellClass = ko.pureComputed(() => 'factory-shell' + (this.sidebarCollapsed() ? ' factory-shell-collapsed' : '')
        + (this.sidebarOpen() ? ' factory-shell-open' : ''));

      // "embed=1" shows a page without the header and navigation: the preview frame and customer review links.
      this.embedded = new URLSearchParams(window.location.search).get('embed') === '1';
      if (!this.embedded) {
        session.load();
      }

      // Header
      // Application Name used in Branding Area
      this.appName = ko.observable("OBDX Development Factory");
      // User Info used in Global Navigation area
      this.userLogin = ko.pureComputed(() => (session.user() ? session.user().displayName : 'Not signed in'));
      this.userInitials = ko.pureComputed(() => this.userLogin().split(/\s+/).filter(Boolean).slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase()).join('') || '?');
      this.canChangePassword = ko.pureComputed(() => !!session.user() && session.user().canChangePassword);

      // Top bar: the workspace the pages work on (shared with their own pickers), the page and workspace as a breadcrumb,
      // search of the workspace's code (opens the Code page's Search tab), what needs attention, and help.
      this.workspaceOptions = workspaceSelection.options;
      this.workspaceId = workspaceSelection.selectedId;
      this.workspaceVersion = ko.pureComputed(() => (workspaceSelection.selectedVersion() ? 'OBDX ' + workspaceSelection.selectedVersion() : ''));
      session.user.subscribe((user) => { if (user) { workspaceSelection.load().catch(() => null); } });
      // Search and jump: the command palette (Ctrl K, '/', or the top bar search button)
      this.palette = palette;
      palette.init(navData.slice(1).filter((r) => r.detail && !r.detail.hidden).map((r) => ({ path: r.path, label: r.detail.label, icon: r.detail.icon, adminOnly: !!r.detail.adminOnly })),
        (path) => router.go({ path: path }));
      this.openPalette = () => palette.show('');
      this.closeShortcutsBackdrop = (event) => { if (event.target === event.currentTarget) { palette.closeHelp(); } };
      this.attention = dashboard.attention;
      this.attentionCount = ko.pureComputed(() => this.attention().length);
      this.bellOpen = ko.observable(false);
      this.toggleBell = () => {
        if (!this.bellOpen()) {
          dashboard.load();
        }
        this.bellOpen(!this.bellOpen());
      };
      document.addEventListener('click', (event) => {
        if (this.bellOpen() && !event.target.closest('.factory-bell-wrap')) {
          this.bellOpen(false);
        }
      });
      // Opening an item from the bell closes it.
      window.addEventListener('factory-navigate', () => this.bellOpen(false));
      // Escape closes the notification panel, then the phone menu drawer, and focus goes back to the button that opened
      // it. Dialogs, the palette, sheets and menus close themselves on Escape first.
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || document.querySelector('.fx-dialog, .fx-cmd, .fx-sheet, .fx-shortcuts, .fx-overlay')) {
          return;
        }
        const back = (id) => window.setTimeout(() => { const b = document.getElementById(id); if (b) { b.focus(); } }, 0);
        const navTip = document.querySelector('.factory-nav-tip.is-on');
        if (navTip) {
          navTip.classList.remove('is-on');
        } else if (this.bellOpen()) {
          this.bellOpen(false);
          back('bellButton');
        } else if (this.sidebarOpen()) {
          this.sidebarOpen(false);
          back('menuToggle');
        }
      });
      this.openHelp = (event) => {
        event.preventDefault();
        router.go({ path: 'about' });
      };
      // Light or dark theme (also in Account & Preferences)
      this.toggleTheme = () => preferences.toggleTheme();
      this.themeLabel = ko.pureComputed(() => (preferences.theme() && preferences.isDark() ? 'Use the light theme' : 'Use the dark theme'));
      this.themeIcon = ko.pureComputed(() => 'factory-nav-icon ' + (preferences.theme() && preferences.isDark() ? 'factory-ico-sun' : 'factory-ico-moon'));
      this.openNewRequirement = (event) => {
        event.preventDefault();
        router.go({ path: 'requirements' });
        this.sidebarOpen(false);
      };
      this.openNotifications = (event) => {
        event.preventDefault();
        this.bellOpen(false);
        router.go({ path: 'notifications' });
      };

      // Sign-in: pages show only for a signed-in user, except the preview and customer review pages (embedded).
      this.signedIn = ko.pureComputed(() => session.user() !== null);
      this.signedIn.subscribe((value) => { if (value) { this.watchNav(); } });
      if (this.signedIn()) { this.watchNav(); }
      this.sessionChecked = session.checked;

      // Loading feedback (services/busy): the progress bar, button spinners and the blocking overlay. While the overlay
      // shows, the page behind it cannot be used or focused.
      this.busy = busy;
      busy.blocking.subscribe((on) => {
        const shell = document.querySelector('.factory-shell, .factory-login');
        if (shell) { shell.inert = on; }
        if (on) { window.setTimeout(() => { const o = document.querySelector('.fx-overlay'); if (o) { o.focus(); } }, 0); }
      });
      // The start screen (index.html) fades once the page is bound and the session is known; it never stays longer than
      // 15 seconds, so a slow or failed check still shows the page and its message.
      this.markReady = () => {
        const showPage = () => document.body.classList.add('fx-ready');
        // Embedded pages (preview frames, review links) do not check the session, so they show at once
        if (session.checked() || this.embedded) { window.setTimeout(showPage, 0); } else {
          const sub = session.checked.subscribe((v) => { if (v) { sub.dispose(); window.setTimeout(showPage, 0); } });
          window.setTimeout(showPage, 15000);
        }
        strips.init();
        reveal.init();
      };
      this.authConfig = session.config;
      this.loginUsername = ko.observable('');
      this.loginPassword = ko.observable('');
      this.loginError = ko.observable(new URLSearchParams(window.location.search).get('signInError') === 'sso'
        ? 'Single sign-on did not complete. Try again or contact your administrator.' : session.unreachable());
      session.unreachable.subscribe((message) => { if (message) { this.loginError(message); } });
      this.signingIn = ko.observable(false);
      // Inline validation: a field left empty says so under it (on leaving it, or on Sign in) and clears once typed in
      this.loginUsernameError = ko.observable('');
      this.loginPasswordError = ko.observable('');
      const usernameMissing = () => !String(this.loginUsername() || '').trim();
      const passwordMissing = () => !this.loginPassword();
      this.loginUsername.subscribe(() => { if (!usernameMissing()) { this.loginUsernameError(''); } });
      this.loginPassword.subscribe(() => { if (!passwordMissing()) { this.loginPasswordError(''); } });
      const focusLogin = (id) => window.setTimeout(() => { const box = document.getElementById(id); if (box) { box.focus(); } }, 0);
      // Leaving a field (not for its own show-password button) checks it
      this.loginFieldLeft = (event) => {
        const field = event.currentTarget;
        if (!event.target.matches('input') || (event.relatedTarget && field.contains(event.relatedTarget)) || this.signingIn()) { return; }
        if (field.id === 'loginUsername' && usernameMissing()) { this.loginUsernameError('Enter your username.'); }
        if (field.id === 'loginPassword' && passwordMissing()) { this.loginPasswordError('Enter your password.'); }
      };
      // Says what went wrong in words a person can act on; the server's own words for a lockout or a disabled account
      const signInFailure = (error) => {
        if (!error.status) { return 'The factory cannot be reached. Check your connection and that the factory is running, then try again.'; }
        if (error.status === 401) {
          return this.authConfig() && this.authConfig().mode === 'ldap'
            ? 'Wrong username or password. Use your bank network username and password, and try again.'
            : 'Wrong username or password. Try again, or ask an administrator to reset your password.';
        }
        if (error.status === 403 && /csrf/i.test(error.message)) { return 'This sign-in page has expired. Reload the page and try again.'; }
        if (error.status >= 500) { return 'The factory could not sign you in just now. Try again in a moment, and tell an administrator if it keeps happening.'; }
        return error.message;
      };
      this.signInSubmit = (event) => { event.preventDefault(); this.signIn(); };
      // One request at a time: the button is disabled and shows its spinner until the answer comes. After a failure the
      // username stays, the password is cleared and focused for the next try.
      this.signIn = () => {
        if (this.signingIn()) { return; }
        this.loginUsernameError(usernameMissing() ? 'Enter your username.' : '');
        this.loginPasswordError(passwordMissing() ? 'Enter your password.' : '');
        if (usernameMissing() || passwordMissing()) {
          focusLogin(usernameMissing() ? 'loginUsernameInput' : 'loginPasswordInput');
          return;
        }
        this.signingIn(true);
        this.loginError('');
        let failed = false;
        session.login(this.loginUsername(), this.loginPassword())
          .then(() => this.loginPassword(''))
          .catch((error) => {
            failed = true;
            this.loginPassword('');
            this.loginError(signInFailure(error));
          })
          .finally(() => {
            this.signingIn(false);
            if (failed) { focusLogin('loginPasswordInput'); }
          });
      };
      this.loginEnvironment = ko.pureComputed(() => (this.authConfig() && this.authConfig().environment) || '');
      this.loginHelp = ko.pureComputed(() => (this.authConfig() && this.authConfig().mode === 'local'
        ? 'No account yet? Ask an administrator of this factory to add you.' : ''));
      this.loginVersion = ko.pureComputed(() => {
        const v = this.authConfig() && this.authConfig().version;
        const m = v ? /^(\d+)\.(\d+)/.exec(v) : null;
        return m ? 'v' + m[1] + '.' + m[2] : '';
      });
      this.loginHint = ko.pureComputed(() => (this.authConfig() && this.authConfig().mode === 'ldap'
        ? 'Use your bank network username and password.' : 'Use your OBDX Development Factory account.'));
      // Update banner for administrators: checked after sign-in and every 30 minutes.
      this.updateBanner = updates.banner;
      this.updateProgress = updates.progress;
      this.updateAvailable = ko.pureComputed(() => !!updates.status() && updates.status().state === 'AVAILABLE');
      this.installUpdate = () => updates.install();
      const checkUpdates = () => { if (session.isAdmin()) { updates.refresh(false); } };
      session.user.subscribe(checkUpdates);
      window.setInterval(checkUpdates, 30 * 60 * 1000);

      // The user menu (design system menu: keyboard, Escape, outside click)
      this.userMenu = ui.menu();
      this.userGo = (value) => () => { this.userMenu.close(); this.userMenuAction({ detail: { selectedValue: value } }); };
      this.userMenuAction = (event) => {
        const value = event.detail.selectedValue;
        if (value === 'out') {
          session.logout();
        } else if (value === 'account') {
          router.go({ path: 'account' });
        } else if (value === 'about') {
          router.go({ path: 'about' });
        } else if (value === 'notifications') {
          router.go({ path: 'notifications' });
        }
      };

     }

     // release the application bootstrap busy state
     Context.getPageContext().getBusyContext().applicationBootstrapComplete();

     return new ControllerViewModel();
  }
);
