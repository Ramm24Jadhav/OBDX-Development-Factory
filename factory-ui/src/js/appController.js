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
define(['knockout', './services/session', './services/updates', './services/dashboard', './services/workspaceSelection', './services/pageRequests', './services/preferences', 'ojs/ojarraydataprovider', 'ojs/ojcontext', 'ojs/ojmodule-element-utils', 'ojs/ojresponsiveutils', 'ojs/ojresponsiveknockoututils', 'ojs/ojcorerouter', 'ojs/ojmodulerouter-adapter', 'ojs/ojknockoutrouteradapter', 'ojs/ojurlparamadapter', 'ojs/ojmodule-element', 'ojs/ojknockout', 'ojs/ojselectsingle', 'ojs/ojmenu'],
  function (ko, session, updates, dashboard, workspaceSelection, pageRequests, preferences, ArrayDataProvider, Context, moduleUtils, ResponsiveUtils, ResponsiveKnockoutUtils, CoreRouter, ModuleRouterAdapter, KnockoutRouterAdapter, UrlParamAdapter) {

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
        { path: 'overview', detail: { label: 'Overview', icon: 'home', group: 'work' } },
        { path: 'workspaces', detail: { label: 'Workspaces', icon: 'folder', group: 'work' } },
        { path: 'code', detail: { label: 'Code', icon: 'code', group: 'work' } },
        { path: 'profile', detail: { label: 'Project Profile', icon: 'profile', group: 'work' } },
        { path: 'requirements', detail: { label: 'Requirements', icon: 'list', group: 'work' } },
        { path: 'designer', detail: { label: 'Designer', icon: 'design', group: 'work' } },
        { path: 'changes', detail: { label: 'Changes', icon: 'branch', group: 'work' } },
        { path: 'modernization', detail: { label: 'Modernization', icon: 'refresh', group: 'work' } },
        { path: 'models', detail: { label: 'Models', icon: 'chip', group: 'work' } },
        { path: 'build', detail: { label: 'Build & Test', icon: 'flask', group: 'work' } },
        { path: 'agents', detail: { label: 'Task History', icon: 'robot', group: 'work' } },
        { path: 'admin', detail: { label: 'Users & Access', icon: 'users', group: 'admin', adminOnly: true } },
        { path: 'packs', detail: { label: 'Version Packs', icon: 'cube', group: 'admin' } },
        { path: 'prompts', detail: { label: 'AI Prompt Library', icon: 'sparkle', group: 'admin' } },
        { path: 'reviews', detail: { label: 'External Review', icon: 'share', group: 'admin' } },
        { path: 'integrations', detail: { label: 'Integrations', icon: 'plug', group: 'admin' } },
        { path: 'account', detail: { label: 'Settings', icon: 'cog', group: 'admin' } },
        // Opened from the top bar: the bell, Help and the user menu
        { path: 'notifications', detail: { label: 'Notifications', hidden: true } },
        { path: 'about', detail: { label: 'About', hidden: true } },
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
      this.adminNav = navGroup('admin');
      // The Administration group opens and closes; it is open while one of its pages is shown.
      const storedAdminOpen = (() => {
        try { return window.localStorage.getItem('factory.adminOpen') !== '0'; } catch (e) { return true; }
      })();
      this.adminOpen = ko.observable(storedAdminOpen);
      this.adminOpen.subscribe((value) => {
        try { window.localStorage.setItem('factory.adminOpen', value ? '1' : '0'); } catch (e) { /* not kept */ }
      });
      this.toggleAdminOpen = () => this.adminOpen(!this.adminOpen());
      this.selection.path.subscribe((path) => {
        const route = navData.find((r) => r.path === path);
        if (route && route.detail && route.detail.group === 'admin') {
          this.adminOpen(true);
        }
      });
      this.pageTitle = ko.pureComputed(() => {
        const route = navData.find((r) => r.path === this.selection.path());
        return route && route.detail ? route.detail.label : '';
      });
      // Collapsed (icons only) is remembered in this browser; on small screens the sidebar opens over the page.
      const storedCollapsed = (() => {
        try { return window.localStorage.getItem('factory.sidebarCollapsed') === '1'; } catch (e) { return false; }
      })();
      this.sidebarCollapsed = ko.observable(storedCollapsed);
      this.sidebarCollapsed.subscribe((value) => {
        try { window.localStorage.setItem('factory.sidebarCollapsed', value ? '1' : '0'); } catch (e) { /* not kept */ }
      });
      this.toggleCollapsed = () => this.sidebarCollapsed(!this.sidebarCollapsed());
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
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      session.user.subscribe((user) => { if (user) { workspaceSelection.load().catch(() => null); } });
      const workspacePages = ['code', 'profile', 'requirements', 'designer', 'changes', 'build', 'modernization', 'knowledge', 'impact', 'reviews', 'packs', 'prompts'];
      this.crumbWorkspace = ko.pureComputed(() => {
        if (workspacePages.indexOf(this.selection.path()) < 0) {
          return '';
        }
        const option = workspaceSelection.options().find((o) => o.value === this.workspaceId());
        return option ? option.label.split(' (')[0] : '';
      });
      this.globalQuery = ko.observable('');
      this.globalQueryInput = (event) => this.globalQuery(event.target.value);
      // The search box has its own form, so browsers do not take it for the username of a password on the page
      this.globalSearchSubmit = (event) => event.preventDefault();
      this.globalSearchKey = (event) => {
        if (event.key === 'Enter' && this.globalQuery().trim()) {
          pageRequests.codeSearch(this.globalQuery().trim());
          this.globalQuery('');
          event.target.value = '';
          router.go({ path: 'code' });
        }
      };
      document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
          const input = document.getElementById('globalSearch');
          if (input) {
            event.preventDefault();
            input.focus();
          }
        }
      });
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
      this.openHelp = (event) => {
        event.preventDefault();
        router.go({ path: 'about' });
      };
      this.openNotifications = (event) => {
        event.preventDefault();
        this.bellOpen(false);
        router.go({ path: 'notifications' });
      };
      this.openHome = (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        event.preventDefault();
        router.go({ path: 'overview' });
      };

      // Sign-in: pages show only for a signed-in user, except the preview and customer review pages (embedded).
      this.signedIn = ko.pureComputed(() => session.user() !== null);
      this.sessionChecked = session.checked;
      this.authConfig = session.config;
      this.loginUsername = ko.observable('');
      this.loginPassword = ko.observable('');
      this.loginError = ko.observable(new URLSearchParams(window.location.search).get('signInError') === 'sso'
        ? 'Single sign-on did not complete. Try again or contact your administrator.' : '');
      this.signingIn = ko.observable(false);
      this.signIn = () => {
        this.signingIn(true);
        this.loginError('');
        session.login(this.loginUsername(), this.loginPassword())
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
