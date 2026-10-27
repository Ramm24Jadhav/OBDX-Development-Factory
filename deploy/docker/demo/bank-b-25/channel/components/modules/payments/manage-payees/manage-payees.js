define(['knockout', './model'], function (ko, Model) {
  return function (rootParams) {
    this.next = function () { rootParams.dashboard.loadComponent('add-payee', {}); };
    this.retail = rootParams.userSegment === 'RETAIL';
  };
});
