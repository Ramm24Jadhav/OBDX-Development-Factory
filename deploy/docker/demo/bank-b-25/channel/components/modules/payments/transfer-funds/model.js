define(['baseService'], function (BaseService) {
  const baseService = BaseService.getInstance();
  return {
    call0: function (id) { return baseService.fetch({ url: "accounts/demandDeposit" }); },
    call1: function (id) { return baseService.add({ url: "payments/transfers" }); },
  };
});
