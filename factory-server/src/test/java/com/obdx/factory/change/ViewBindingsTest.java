package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ViewBindingsTest {

    /** As a model wrote them for the sample BRD's Fund Transfer screen: the two files disagree. */
    private static final String VIEW = """
            <oj-input-number label-hint="[[nls.fund-transfer.labels.transferAmount]]" value="{{transferAmount}}"></oj-input-number>
            <oj-select-single value="{{beneficiaryId}}" data-provider="{{beneficiaryDataProvider}}"></oj-select-single>
            <oj-bind-for-each data="[[rows]]" as="row"><template><span>[[row.data.name]]</span></template></oj-bind-for-each>
            <oj-button on-oj-action="[[submit]]" disabled="[[!canSubmit()]]"></oj-button>
            <span>[[$current.data]]</span>
            """;

    private static final String VIEW_MODEL = """
            define(['knockout'], function (ko) {
              return function FundTransferViewModel(params) {
                const self = this;
                self.nls = {};
                self.transferAmount = ko.observable();
                self.beneficiaryId = ko.observable();
                self.beneficiariesProvider = null;
                self.rows = ko.observableArray([]);
                self.canSubmit = function () { return true; };
                self.submit = function () {};
              };
            });
            """;

    @Test
    void findsNamesTheViewModelLacksAndBindingsThatAreNotExpressions() {
        var problems = ViewBindings.problems(VIEW, VIEW_MODEL);

        assertThat(problems).hasSize(2);
        assertThat(problems.get(0)).contains("nls.fund-transfer.labels.transferAmount", "nls['fund-transfer']");
        assertThat(problems.get(1)).contains("beneficiaryDataProvider").doesNotContain("transferAmount").doesNotContain("row,");
    }

    @Test
    void aSubtractionIsAValidExpression() {
        String view = "<span>[[items().length-1]]</span><span>[[$current.index-1]]</span><span>[[nls.labels.step-two]]</span>";

        var problems = ViewBindings.problems(view, "self.items = ko.observableArray([]); self.nls = {};");

        assertThat(problems).singleElement().asString().contains("nls.labels.step-two").doesNotContain("length-1").doesNotContain("index-1");
    }

    @Test
    void aClassViewModelDefinesItsMethodsFieldsAndPrototypeNames() {
        String view = """
                <h1>[[nls.title]]</h1>
                <oj-select-single value="{{selectedId}}" data="[[dataProvider]]" on-value-changed="[[handleSelect]]"></oj-select-single>
                <oj-bind-for-each data="[[rows]]"><template><span>[[$current.index-1]]: [[formatAmount($current.data.amount)]]</span></template></oj-bind-for-each>
                <span>[[rows().length-1]]</span>
                <oj-button on-oj-action="[[submit]]" disabled="[[!canSubmit]]"></oj-button>
                <oj-button on-oj-action="[[cancel]]"></oj-button>
                """;
        String viewModel = """
                define(['knockout', 'ojs/ojarraydataprovider'], function (ko, ArrayDataProvider) {
                  class TransferViewModel {
                    selectedId = ko.observable();
                    static pageSize = 10;

                    constructor(params) {
                      this.nls = params.nls;
                      this.rows = ko.observableArray([]);
                      this.dataProvider = new ArrayDataProvider(this.rows, { keyAttributes: 'id' });
                    }

                    handleSelect = (event) => {
                      this.selectedId(event.detail.value);
                    };

                    async submit(event) {
                      await Promise.resolve();
                    }

                    get canSubmit() {
                      return this.selectedId() != null;
                    }

                    cancel() {
                    }

                    connected() {
                    }
                  }

                  TransferViewModel.prototype.formatAmount = function (amount) {
                    return amount;
                  };

                  return TransferViewModel;
                });
                """;

        assertThat(ViewBindings.problems(view, viewModel)).isEmpty();
        // a name the class does not have is still found
        assertThat(ViewBindings.problems(view + "<span>[[remarks]]</span>", viewModel)).singleElement().asString().contains("remarks");
    }

    @Test
    void agreesWhenTheNamesMatchAndSkipsViewModelsThatCopyNamesIn() {
        String view = "<oj-input-text value=\"{{remarks}}\"></oj-input-text><span>[[nls.labels['remarks']]]</span>";

        assertThat(ViewBindings.problems(view, "self.remarks = ko.observable(); self.nls = bundle;")).isEmpty();
        assertThat(ViewBindings.problems(view, "ko.utils.extend(self, params.rootModel);")).isEmpty();
        assertThat(ViewBindings.problems(view, null)).isEmpty();
    }
}
