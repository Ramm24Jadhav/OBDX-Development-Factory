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
define(['knockout', 'ojs/ojcontext', 'ojs/ojmodule-element-utils', 'ojs/ojresponsiveutils', 'ojs/ojresponsiveknockoututils', 'ojs/ojcorerouter', 'ojs/ojmodulerouter-adapter', 'ojs/ojknockoutrouteradapter', 'ojs/ojurlparamadapter', 'ojs/ojarraydataprovider', 'ojs/ojknockouttemplateutils', 'ojs/ojmodule-element', 'ojs/ojknockout'],
  function(ko, Context, moduleUtils, ResponsiveUtils, ResponsiveKnockoutUtils, CoreRouter, ModuleRouterAdapter, KnockoutRouterAdapter, UrlParamAdapter, ArrayDataProvider, KnockoutTemplateUtils) {

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
        { path: 'models', detail: { label: 'Models' } },
        { path: 'about', detail: { label: 'About' } },
        // Not in the navigation: the screen preview (shown inside the designer) and the customer review page.
        { path: 'preview', detail: { label: 'Preview', hidden: true } },
        { path: 'review', detail: { label: 'Review', hidden: true } }
      ];
      // Router setup
      let router = new CoreRouter(navData, {
        urlAdapter: new UrlParamAdapter()
      });
      router.sync();

      this.moduleAdapter = new ModuleRouterAdapter(router);

      this.selection = new KnockoutRouterAdapter(router);

      // Setup the navDataProvider with the routes, excluding the first redirected
      // route.
      this.navDataProvider = new ArrayDataProvider(navData.slice(1).filter((route) => !route.detail.hidden), {keyAttributes: "path"});

      // "embed=1" shows a page without the header and navigation: the preview frame and customer review links.
      this.embedded = new URLSearchParams(window.location.search).get('embed') === '1';

      // Header
      // Application Name used in Branding Area
      this.appName = ko.observable("OBDX Development Factory");
      // User Info used in Global Navigation area
      this.userLogin = ko.observable("Not signed in");

     }

     // release the application bootstrap busy state
     Context.getPageContext().getBusyContext().applicationBootstrapComplete();

     return new ControllerViewModel();
  }
);
