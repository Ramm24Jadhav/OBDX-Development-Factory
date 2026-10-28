/**
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
/*
 * Your application specific code will go here
 */
define(['knockout', './services/session', './services/updates', 'ojs/ojcontext', 'ojs/ojmodule-element-utils', 'ojs/ojresponsiveutils', 'ojs/ojresponsiveknockoututils', 'ojs/ojcorerouter', 'ojs/ojmodulerouter-adapter', 'ojs/ojknockoutrouteradapter', 'ojs/ojurlparamadapter', 'ojs/ojarraydataprovider', 'ojs/ojknockouttemplateutils', 'ojs/ojmodule-element', 'ojs/ojknockout'],
  function (ko, session, updates, Context, moduleUtils, ResponsiveUtils, ResponsiveKnockoutUtils, CoreRouter, ModuleRouterAdapter, KnockoutRouterAdapter, UrlParamAdapter, ArrayDataProvider, KnockoutTemplateUtils) {

     function ControllerViewModel() {

        this.KnockoutTemplateUtils = KnockoutTemplateUtils;

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

      let navData = [
        { path: '', redirect: 'workspaces' },
        { path: 'workspaces', detail: { label: 'Workspaces' } },
        { path: 'code', detail: { label: 'Code' } },
        { path: 'profile', detail: { label: 'Profile' } },
        { path: 'requirements', detail: { label: 'Requirements' } },
        { path: 'designer', detail: { label: 'Designer' } },
        { path: 'changes', detail: { label: 'Changes' } },
        { path: 'modernization', detail: { label: 'Modernization' } },
        { path: 'models', detail: { label: 'Models' } },
        { path: 'admin', detail: { label: 'Admin', adminOnly: true } },
        { path: 'about', detail: { label: 'About' } },
        { path: 'account', detail: { label: 'Account', hidden: true } },
        // Not in the navigation: the screen preview (shown inside the designer) and the customer review page.
        { path: 'preview', detail: { label: 'Preview', hidden: true } },
        { path: 'review', detail: { label: 'Review', hidden: true } }
      ];
      // Router setup
      let router = new CoreRouter(navData, {
        urlAdapter: new UrlParamAdapter()
      });
      router.sync();
      // Pages open another page with window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' })).
      window.addEventListener('factory-navigate', (event) => router.go({ path: event.detail }));

      this.moduleAdapter = new ModuleRouterAdapter(router);

      this.selection = new KnockoutRouterAdapter(router);

      // Setup the navDataProvider with the routes, excluding the first redirected
      // route.
      // The Admin tab is shown only to administrators.
      const visibleRoutes = () => navData.slice(1)
        .filter((route) => !route.detail.hidden && (!route.detail.adminOnly || session.isAdmin()));
      const navItems = ko.observableArray(visibleRoutes());
      session.user.subscribe(() => navItems(visibleRoutes()));
      this.navDataProvider = new ArrayDataProvider(navItems, {keyAttributes: "path"});

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
      this.canChangePassword = ko.pureComputed(() => !!session.user() && session.user().canChangePassword);

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
        }
      };

     }

     // release the application bootstrap busy state
     Context.getPageContext().getBusyContext().applicationBootstrapComplete();

     return new ControllerViewModel();
  }
);
