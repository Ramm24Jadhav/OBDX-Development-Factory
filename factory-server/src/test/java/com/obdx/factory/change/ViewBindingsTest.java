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
    void agreesWhenTheNamesMatchAndSkipsViewModelsThatCopyNamesIn() {
        String view = "<oj-input-text value=\"{{remarks}}\"></oj-input-text><span>[[nls.labels['remarks']]]</span>";

        assertThat(ViewBindings.problems(view, "self.remarks = ko.observable(); self.nls = bundle;")).isEmpty();
        assertThat(ViewBindings.problems(view, "ko.utils.extend(self, params.rootModel);")).isEmpty();
        assertThat(ViewBindings.problems(view, null)).isEmpty();
    }
}
