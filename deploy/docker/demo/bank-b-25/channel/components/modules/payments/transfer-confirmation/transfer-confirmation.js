define(['knockout', './model'], function (ko, Model) {
  return function (rootParams) {
    this.retail = rootParams.userSegment === 'RETAIL';
  };
});
