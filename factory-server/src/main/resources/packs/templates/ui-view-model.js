/*
 * <<Screen title>>: view model.
 * Started from the OBDX Development Factory template. Follow the bank's reference examples where they differ
 * (module paths, base modules, how services are called, naming).
 */
define([
  'knockout',
  'ojL10n!<<path of the screen resource bundle>>',
  'ojs/ojknockout',
  'ojs/ojformlayout',
  'ojs/ojinputtext',
  'ojs/ojbutton'
], function (ko, resourceBundle) {
  'use strict';

  return function <<ScreenName>>ViewModel(params) {
    const self = this;

    self.nls = resourceBundle;

    // One observable per field of the approved screen design.
    self.<<fieldName>> = ko.observable();

    // The screen's action: validate the input, then call the service through the component's model,
    // as the reference examples do.
    self.<<actionName>> = function () {
    };
  };
});
