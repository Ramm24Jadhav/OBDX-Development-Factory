define(['knockout', './model'], function (ko, Model) {
  return function (rootParams) {
    this.next = function () { rootParams.dashboard.loadComponent('review-transfer', {}); };
    this.retail = rootParams.userSegment === 'RETAIL';
  };
});
