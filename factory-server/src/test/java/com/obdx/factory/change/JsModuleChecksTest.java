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
}
