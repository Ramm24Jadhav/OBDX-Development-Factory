package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** QA's BRD2 and BRD5 view models: a regular expression is no name; a method called too early and a name never set are. */
class JsModuleChecksTest {

    /** Shaped like BRD5's transfer-funds.js, as the model wrote it. */
    private static final String TRANSFER_FUNDS = """
            define(['knockout', 'ojs/ojarraydataprovider', 'jquery.validate', 'ojs/ojinputtext'], function (ko, ArrayDataProvider) {
              'use strict';
              return function TransferFundsViewModel(params) {
                const self = this;
                self.costCentres = ko.observableArray([]);
                self.provider = new ArrayDataProvider(self.costCentres, { keyAttributes: 'id' });
                this.loadCostCentres();

                this.loadCostCentres = function () {
                  params.baseModel.fireBatch().then((data) => self.costCentres(data.items));
                };
                this.submit = function () {
                  if (this.amount() > 0) {
                    self.loadCostCentres();
                  }
                };
              };
            });
            """;

    @Test
    void aRegularExpressionHoldsNoNames() {
        // BRD2 transfer-funds.js
        String js = """
                define(['knockout'], function (ko) {
                  return function ViewModel() {
                    this.remarks = ko.observable('');
                    this.valid = ko.pureComputed(() => /^[\\w\\s.,\\-\\/]+$/.test(this.remarks()));
                  };
                });
                """;

        assertThat(JavaScriptCheck.check(js).status()).isEqualTo(FileChecks.Status.PASSED);
        assertThat(JavaScriptCheck.codeOnly(js)).doesNotContain("\\s");
    }

    @Test
    void findsTheMethodCalledBeforeItIsSetTheNameNeverSetAndTheUnknownModule() {
        List<String> problems = JsModuleChecks.problems(TRANSFER_FUNDS, module -> Set.of("knockout").contains(module));

        assertThat(problems).anySatisfy(p -> assertThat(p).startsWith(JsModuleChecks.CALLED_BEFORE_SET + ": this.loadCostCentres()"));
        assertThat(problems).anySatisfy(p -> assertThat(p).startsWith(JsModuleChecks.NEVER_SET + ": this.amount."));
        assertThat(problems).anySatisfy(p -> assertThat(p).startsWith(JsModuleChecks.UNKNOWN_MODULES + ": jquery.validate."));
        // JET's own modules need no other file; a module the code base knows is fine
        assertThat(problems).noneMatch(p -> p.contains("ojs/"));
        assertThat(JsModuleChecks.problems(TRANSFER_FUNDS, module -> true)).noneMatch(p -> p.startsWith(JsModuleChecks.UNKNOWN_MODULES));
        // without indexed JavaScript, modules cannot be judged
        assertThat(JsModuleChecks.problems(TRANSFER_FUNDS, null)).noneMatch(p -> p.startsWith(JsModuleChecks.UNKNOWN_MODULES));
    }

    @Test
    void callsInsideNestedFunctionsAndPrototypeMethodsAreFine() {
        String js = """
                define(['knockout'], function (ko) {
                  function ViewModel() {
                    this.ready = ko.observable(false);
                    this.init();
                    this.load = function () { this.refresh(); };
                    this.refresh = function () { this.ready(true); };
                    setTimeout(function () { this.later(); }, 0);
                    this.later = function () {};
                  }
                  ViewModel.prototype.init = function () {};
                  return ViewModel;
                });
                """;

        assertThat(JsModuleChecks.problems(js, null)).isEmpty();
        // a view model that copies names in cannot be judged by name
        assertThat(JsModuleChecks.problems("define([], function () { return function VM(p) { Object.assign(this, p); this.go(); }; });", null))
                .isEmpty();
    }

    /** BRD3's quick-transfer.js as the model wrote it (shortened): nine modules, three parameters. */
    private static final String QUICK_TRANSFER = """
            define([
              'knockout',
              'ojL10n!nls/quick-transfer',
              'ojs/ojknockout',
              'ojs/ojformlayout',
              'ojs/ojinputtext',
              'ojs/ojselectsingle',
              'ojs/ojbutton',
              'ojs/ojarraydataprovider',
              './model'
            ], function (ko, resourceBundle, oj) {
              'use strict';
              return function QuickTransferViewModel(params) {
                const self = this;
                const rootModel = params.rootModel || params;
                self.nls = resourceBundle;
                self.payees = ko.observableArray([]);
                self.loadPayees = function () {
                  return rootModel.services().fetchPayees()
                    .then(function (response) { self.payees(response.payees.slice(0, 5)); })
                    .catch(function () { oj.getLogger().error('Failed to fetch payees'); });
                };
                self.title = self.nls.quickTransfer.title;
                self.handleSend = function () {
                  self.error(self.nls.get('selectPayee') || 'Please select a payee');
                };
                self.error = ko.observable('');
              };
            });
            """;

    private static final String BUNDLE = """
            define({
              root: {
                quickTransfer: { title: 'Quick Transfer', amount: 'Amount' },
                amountExceedsBalance: 'Enter an amount up to your available balance of INR {balance}.'
              },
              ar: true
            });
            """;

    private static final String MODEL = """
            define(['baseService'], function (BaseService) {
              const baseService = BaseService.getInstance();
              return {
                fetchPayees: function () { return baseService.fetch({ url: 'payments/payees' }); },
                fetchDemandDepositAccounts: function () { return baseService.fetch({ url: 'accounts/demandDeposit' }); }
              };
            });
            """;

    @Test
    void aDefineListBoundToTheWrongParametersAndABundleUsedWronglyAreErrors() {
        java.util.Map<String, String> written = java.util.Map.of(
                "channel/resources/nls/quick-transfer.js", BUNDLE,
                "channel/components/modules/dashboard/quick-transfer/model.js", MODEL);
        String path = "channel/components/modules/dashboard/quick-transfer/quick-transfer.js";

        List<String> problems = JsModuleChecks.defineProblems(QUICK_TRANSFER, module -> ChangeService.moduleSource(path, module, written));

        assertThat(problems).hasSize(4);
        assertThat(problems.get(0)).startsWith(JsModuleChecks.WRONG_BINDING).contains("oj receives 'ojs/ojknockout' (module 3), not 'ojs/ojcore'");
        assertThat(problems.get(1)).startsWith(JsModuleChecks.NOT_RECEIVED).contains("./model (whose fetchPayees this file calls on other objects)");
        assertThat(problems.get(2)).startsWith(JsModuleChecks.BUNDLE_GET).contains("ojL10n!nls/quick-transfer");
        assertThat(problems.get(3)).startsWith(JsModuleChecks.BUNDLE_KEYS).contains(": selectPayee.").doesNotContain("quickTransfer,  ");
        // all of them certain: they fail the file
        assertThat(problems).allMatch(ChangeService::crossError);
    }

    @Test
    void aWellBoundModuleHasNoDefineProblems() {
        String js = """
                define(['knockout', 'ojs/ojcore', 'ojL10n!nls/quick-transfer', './model', 'ojs/ojknockout', 'ojs/ojbutton'],
                  function (ko, oj, nls, Model) {
                    return function ViewModel() {
                      this.title = nls.quickTransfer.title;
                      this.load = function () { return Model.fetchPayees().catch(function () { oj.Logger.error('x'); }); };
                    };
                  });
                """;
        java.util.Map<String, String> written = java.util.Map.of("channel/resources/nls/quick-transfer.js", BUNDLE, "a/model.js", MODEL);

        assertThat(JsModuleChecks.defineProblems(js, module -> ChangeService.moduleSource("a/vm.js", module, written))).isEmpty();
        // a bundle or a ./ module the change does not write is not judged
        assertThat(JsModuleChecks.defineProblems(QUICK_TRANSFER.replace("self.title = self.nls.quickTransfer.title;", ""), module -> null))
                .extracting(p -> p.substring(0, 20)).containsExactly(JsModuleChecks.WRONG_BINDING.substring(0, 20));
    }

    @Test
    void validDefineListsAreNoFinding() {
        java.util.Map<String, String> written = java.util.Map.of("a/model.js", MODEL, "channel/resources/nls/quick-transfer.js", BUNDLE);
        java.util.function.Function<String, String> source = module -> ChangeService.moduleSource("a/vm.js", module, written);
        // ojs/ojknockout-keyset exports ObservableKeySet; ojs/ojcore-base is ojcore
        assertThat(JsModuleChecks.defineProblems("""
                define(['ojs/ojknockout-keyset', 'ojs/ojcore-base', 'ojs/ojcomposite'], function (keySet, oj, Composite) {
                  return function VM() { this.selected = new keySet.ObservableKeySet(); oj.Logger.info('x'); Composite.register('x', {}); };
                });
                """, source)).isEmpty();
        // a ./ loader kept for what it does, whose functions the file does not call
        assertThat(JsModuleChecks.defineProblems("""
                define(['knockout', './extensions', './model'], function (ko) {
                  return function VM() { this.a = ko.observable(1); };
                });
                """, source)).isEmpty();
        // destructured parameters keep their positions
        assertThat(JsModuleChecks.defineProblems("""
                define(['knockout', 'ojs/ojcore'], function ({ observable, computed }, oj) {
                  return function VM() { this.a = observable(1); oj.Logger.info('x'); };
                });
                """, source)).isEmpty();
        // the bundle's keys past its first 100 are keys too
        StringBuilder many = new StringBuilder("define({ root: {\n");
        for (int i = 0; i < 150; i++) {
            many.append("  key").append(i).append(": 'Label ").append(i).append("',\n");
        }
        many.append("  last: 'x'\n} });\n");
        assertThat(JsModuleChecks.defineProblems("""
                define(['ojL10n!nls/big'], function (nls) {
                  return function VM() { this.label = nls.key140 + nls.last; };
                });
                """, module -> module.equals("ojL10n!nls/big") ? many.toString() : null)).isEmpty();
    }

    @Test
    void findsTheModulesAViewModelLoadsWhenTheChangeWritesThem() {
        java.util.Map<String, String> written = java.util.Map.of("channel/resources/nls/quick-transfer.js", BUNDLE, "a/b/model.js", MODEL);

        assertThat(ChangeService.moduleSource("a/b/vm.js", "./model", written)).isEqualTo(MODEL);
        assertThat(ChangeService.moduleSource("a/b/c/vm.js", "../model", written)).isEqualTo(MODEL);
        assertThat(ChangeService.moduleSource("a/b/vm.js", "ojL10n!nls/quick-transfer", written)).isEqualTo(BUNDLE);
        assertThat(ChangeService.moduleSource("a/b/vm.js", "ojL10n!nls/other", written)).isNull();
        assertThat(ChangeService.moduleSource("a/b/vm.js", "knockout", written)).isNull();
    }
}
