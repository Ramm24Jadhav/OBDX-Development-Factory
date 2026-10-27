define(['knockout', './model'], function (ko, Model) {
  return function (rootParams) {
    this.next = function () { rootParams.dashboard.loadComponent('transfer-confirmation', {}); };
    this.retail = rootParams.userSegment === 'RETAIL';
  };
});
