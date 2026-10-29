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

      // icon: the sidebar icon (css class factory-ico-<icon>); group: the sidebar section; parent: the sidebar entry
      // that stays highlighted for a page opened from another one.
      let navData = [
        { path: '', redirect: preferences.landing() || 'overview' },
        { path: 'overview', detail: { label: 'Home', icon: 'home', group: 'work' } },
        { path: 'workspaces', detail: { label: 'Workspaces', icon: 'folder', group: 'work' } },
        { path: 'code', detail: { label: 'Code', icon: 'code', group: 'work' } },
        { path: 'profile', detail: { label: 'Project Profile', icon: 'profile', group: 'work' } },
        { path: 'requirements', detail: { label: 'Requirements', icon: 'list', group: 'work' } },
        { path: 'designer', detail: { label: 'Visual Designer', icon: 'design', group: 'work' } },
        { path: 'changes', detail: { label: 'Changes', icon: 'branch', group: 'work' } },
        { path: 'build', detail: { label: 'Build, Test & Review', icon: 'flask', group: 'work' } },
        { path: 'modernization', detail: { label: 'Modernization', icon: 'refresh', group: 'work' } },
        { path: 'models', detail: { label: 'Models & AI Providers', icon: 'chip', group: 'work' } },
        { path: 'agents', detail: { label: 'Agent Runs', icon: 'robot', group: 'work' } },
        { path: 'admin', detail: { label: 'Administration', icon: 'cog', group: 'setup', adminOnly: true } },
        { path: 'reviews', detail: { label: 'External Review', icon: 'share', group: 'setup' } },
        { path: 'integrations', detail: { label: 'Integrations', icon: 'plug', group: 'setup' } },
        { path: 'packs', detail: { label: 'Version Packs', icon: 'cube', group: 'setup' } },
        { path: 'prompts', detail: { label: 'AI Prompt Library', icon: 'sparkle', group: 'setup' } },
        { path: 'notifications', detail: { label: 'Notifications', icon: 'bell', group: 'setup' } },
        { path: 'account', detail: { label: 'Account', icon: 'user', group: 'setup' } },
        { path: 'design', detail: { label: 'Design System', icon: 'design', group: 'setup' } },
        { path: 'about', detail: { label: 'About', icon: 'info', group: 'setup' } },
        // Opened from the Code and Changes pages
        { path: 'knowledge', detail: { label: 'Knowledge Explorer', hidden: true, parent: 'code' } },
        { path: 'impact', detail: { label: 'Impact Analysis', hidden: true, parent: 'changes' } },
        // Not in the navigation: the screen preview (shown inside the designer) and the customer review page.
        { path: 'preview', detail: { label: 'Preview', hidden: true } },
        { path: 'review', detail: { label: 'Review', hidden: true } }
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
        .filter((route) => !route.detail.hidden && (!route.detail.adminOnly || session.isAdmin()));
      const navItems = ko.observableArray(visibleRoutes());
      session.user.subscribe(() => navItems(visibleRoutes()));
      this.sidebarOpen = ko.observable(false);
      const navGroup = (group) => ko.pureComputed(() => navItems().filter((route) => route.detail.group === group).map((route) => ({
        label: route.detail.label,
        href: '?ojr=' + route.path,
        iconClass: 'factory-nav-icon factory-ico-' + route.detail.icon,
        active: ko.pureComputed(() => {
          const current = navData.find((r) => r.path === this.selection.path());
          return this.selection.path() === route.path || (!!current && !!current.detail && current.detail.parent === route.path);
        }),
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
      this.workNav = navGroup('work');
      this.setupNav = navGroup('setup');
      // The Setup section folds away (remembered in this browser) and opens by itself on one of its pages.
      const setupActive = ko.pureComputed(() => this.setupNav().some((item) => item.active()));
      const storedSetup = (() => {
        try { return window.localStorage.getItem('factory.navSetupOpen'); } catch (e) { return null; }
      })();
      this.setupOpen = ko.observable(storedSetup === null ? setupActive() : storedSetup === '1');
      this.setupOpen.subscribe((value) => {
        try { window.localStorage.setItem('factory.navSetupOpen', value ? '1' : '0'); } catch (e) { /* not kept */ }
      });
      setupActive.subscribe((value) => { if (value) { this.setupOpen(true); } });
      this.setupShown = ko.pureComputed(() => this.setupOpen() || setupActive() || this.sidebarCollapsed());
      this.toggleSetup = () => this.setupOpen(!this.setupShown());
      this.setupGroupClass = ko.pureComputed(() => 'factory-nav-group' + (this.setupShown() ? ' is-open' : ''));

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
      this.sidebarCollapsed = ko.pureComputed(() => (tablet() ? !tabletExpanded() : collapsedChoice()));
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
      session.user.subscribe((user) => { if (user) { workspaceSelection.load().catch(() => null); } });
      // Search and jump: the command palette (Ctrl K, '/', or the top bar search button)
      this.palette = palette;
      palette.init(navData.slice(1).filter((r) => r.detail && !r.detail.hidden).map((r) => ({ path: r.path, label: r.detail.label, icon: r.detail.icon })),
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
        if (this.bellOpen()) {
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
        if (session.checked()) { window.setTimeout(showPage, 0); } else {
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
      this.signInSubmit = (event) => { event.preventDefault(); this.signIn(); };
      this.signIn = () => {
        this.signingIn(true);
        this.loginError('');
        busy.block(session.login(this.loginUsername(), this.loginPassword()), 'Signing in…')
          .then(() => this.loginPassword(''))
          .catch((error) => this.loginError(error.message))
          .finally(() => this.signingIn(false));
      };
      this.loginTabLabel = ko.pureComputed(() => (this.authConfig() && this.authConfig().mode === 'ldap' ? 'Bank Directory' : 'Username & Password'));
      this.loginVersion = ko.pureComputed(() => {
        const v = this.authConfig() && this.authConfig().version;
        const m = v ? /^(\d+)\.(\d+)/.exec(v) : null;
        return m ? 'v' + m[1] + '.' + m[2] : '';
      });
      this.loginHint = ko.pureComputed(() => (this.authConfig() && this.authConfig().mode === 'ldap'
        ? 'Use your bank network username and password.' : 'Use your OBDX Development Factory account.'));
      // Update banner for administrators: checked after sign-in and every 30 minutes.
      this.updateBanner = updates.banner;
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
