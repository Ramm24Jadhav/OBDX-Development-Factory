define(['knockout', 'ojs/ojasyncvalidator-numberrange', 'baseService'], function (ko, NumberRangeValidator, BaseService) {
  'use strict';

  function FundTransferViewModel() {
    this.fromAccount = ko.observable();
    this.toAccount = ko.observable();
    this.amount = ko.observable();
    this.remarks = ko.observable('');

    this.submitTransfer = () => {
      return BaseService.post('payments/transfers', {
        debitAccountId: this.fromAccount(),
        creditAccountId: this.toAccount(),
        amount: this.amount(),
        remarks: this.remarks()
      });
    };
  }

  return FundTransferViewModel;
});
