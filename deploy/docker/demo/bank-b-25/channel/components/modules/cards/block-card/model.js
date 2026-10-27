define(['baseService'], function (BaseService) {
  const baseService = BaseService.getInstance();
  return {
    call0: function (id) { return baseService.add({ url: "cards/debit/" + id + "/block" }); },
  };
});
