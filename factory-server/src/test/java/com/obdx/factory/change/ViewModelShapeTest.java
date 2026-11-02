package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A view bound against a view model of the same change is failed only when the view model's shape is clear and the
 * name is really missing: each way a correct view model defines a name, and each binding that is not the view's own,
 * is no error.
 */
class ViewModelShapeTest {

    private static List<String> inChange(String view, String viewModel) {
        return ViewBindings.problems(view, viewModel, true);
    }

    private static void noProblem(String view, String viewModel) {
        assertThat(inChange(view, viewModel)).as(view).isEmpty();
    }

    // --- review 1: a class's members are its names ---

    @Test
    void aClassViewModelsOutlineHasItsMethodsGettersAndFields() {
        String viewModel = """
                define(['knockout'], function (ko) {
                  class TransferViewModel {
                    selected = ko.observable();
                    static pageSize = 10;
                    constructor(params) {
                      this.amount = ko.observable();
                      const options = { keyAttributes: 'id' };
                    }
                    send(event) {
                      return this.amount();
                    }
                    get total() {
                      return 1;
                    }
                    reset() { this.amount(null); }
                  }
                  return TransferViewModel;
                });
                """;

        String outline = ViewBindings.outline(viewModel);

        assertThat(outline).contains("Observables: amount, selected", "Computed: total", "Functions: send, reset", "Other values: pageSize")
                // neither the constructor, its class's name nor a nested object's keys
                .doesNotContain("constructor").doesNotContain("TransferViewModel").doesNotContain("keyAttributes");
        noProblem("<span>[[amount]]</span><span>[[total]]</span><button on-click='[[send]]'>[[reset]]</button><i>[[selected]]</i>", viewModel);
        assertThat(inChange("<span>[[remarks]]</span>", viewModel)).singleElement().asString().startsWith(ViewBindings.UNDEFINED_IN_CHANGE);
        // a class whose last line has no line break, and one that never closes
        assertThat(ViewBindings.outline("class A {\n  send() {}\n  total = 1;")).isEqualTo("Functions: send; Other values: total");
        assertThat(ViewBindings.outline("class A {\n  send() {}\n}")).isEqualTo("Functions: send");
    }

    // --- review 2: correct view models and views that are no error ---

    @Test
    void anAliasOfThisDefinesNames() {
        noProblem("<span>[[amount]]</span>[[send]]", "function VM() { var that = this; that.amount = ko.observable(); that.send = function () {}; }");
        String viewModel = "function VM() {\n  const model = this;\n  model.amount = ko.observable();\n  model.send = () => 1;\n}";
        noProblem("<span>[[amount]]</span>[[send]]", viewModel);
        assertThat(ViewBindings.outline(viewModel)).isEqualTo("Observables: amount; Functions: send");
    }

    @Test
    void theObjectAModuleReturnsDefinesItsEntries() {
        String viewModel = """
                define(['knockout'], function (ko) {
                  var amount = ko.observable();
                  function send() { }
                  return {
                    amount,
                    send,
                    total: ko.pureComputed(function () { return 1; }),
                    reset() { amount(null); }
                  };
                });
                """;
        noProblem("[[amount]] [[send]] [[total]] [[reset]]", viewModel);
        assertThat(ViewBindings.outline(viewModel)).contains("Computed: total", "Functions: reset", "Other values: amount, send");
        assertThat(inChange("[[remarks]]", viewModel)).singleElement().asString().startsWith(ViewBindings.UNDEFINED_IN_CHANGE);
    }

    @Test
    void viewModelsThatCopyNamesInAreNotCheckedByName() {
        for (String copies : List.of("ko.mapping.fromJS(data, {}, self);", "_.assign(self, params);", "_.merge(self, defaults);",
                "Object.defineProperty(this, 'total', { get: function () { return 1; } });", "Object.assign(this, params);")) {
            noProblem("[[total]] [[remarks]]", "function VM(params) { var self = this; self.amount = ko.observable(); self.x = 1; " + copies + " }");
        }
    }

    @Test
    void aNameSetInBracketsIsDefinedAndANameMadeAtRunTimeMakesItAWarning() {
        noProblem("[[amount]] [[total]]", "function VM() { this['amount'] = ko.observable(); this[\"total\"] = 1; this.x = 2; }");
        List<String> dynamic = inChange("[[remarks]]", "function VM() { var self = this; self.a = 1; self.b = 2; self[key] = 3; }");
        assertThat(dynamic).singleElement().asString().startsWith(ViewBindings.UNDEFINED);
        assertThat(ChangeService.crossError(dynamic.getFirst())).isFalse();
    }

    @Test
    void aViewModelWithoutAClearShapeGivesAWarning() {
        // one name only: not enough to tell what the view model is
        List<String> problems = inChange("[[remarks]]", "function VM() { this.amount = ko.observable(); }");
        assertThat(problems).singleElement().asString().startsWith(ViewBindings.UNDEFINED);
    }

    @Test
    void loopAliasesInAnyQuotesAreNotNames() {
        String viewModel = "function VM() { this.rows = ko.observableArray(); this.items = []; }";
        noProblem("<oj-bind-for-each data='[[rows]]' as='row'><template>[[row.data.name]]</template></oj-bind-for-each>", viewModel);
        noProblem("<oj-list-view data='[[rows]]'><template slot='itemTemplate' data-oj-as='item'>[[item.data]]</template></oj-list-view>",
                viewModel);
        noProblem("<!-- ko foreach: { data: items, as: 'r' } --><span>[[r.name]]</span><!-- /ko -->", viewModel);
    }

    @Test
    void globalsAreNotNames() {
        noProblem("[[parseInt(amount())]] [[Object.keys(rows)]] [[Array.isArray(rows)]] [[Boolean(amount())]] [[isNaN(amount())]]"
                        + " [[Intl.NumberFormat]] [[encodeURIComponent(amount())]] [[parseFloat(amount())]]",
                "function VM() { this.amount = ko.observable(); this.rows = []; }");
    }

    @Test
    void bindingsInCommentsAndScriptTemplatesAreNotTheViews() {
        String viewModel = "function VM() { this.amount = ko.observable(); this.rows = []; }";
        noProblem("<!-- <span>[[oldName]]</span> --><span>[[amount]]</span>", viewModel);
        noProblem("<script type=\"text/html\" id=\"row\"><span>[[rowLabel]]</span></script><span>[[amount]]</span>", viewModel);
        // an ordinary script's tag is kept (and the view's bindings after it are read)
        assertThat(inChange("<script src=\"x.js\"></script><span>[[remarks]]</span>", viewModel)).singleElement().asString()
                .contains("remarks");
    }

    @Test
    void anUnclosedBindingIsSkippedAndTheNextOnesAreRead() {
        String viewModel = "function VM() { this.amount = ko.observable(); this.rows = []; }";
        assertThat(ViewBindings.bound("[[amount " + "x".repeat(3_000) + " [[rows]] {{remarks}}")).containsExactly("rows", "remarks");
        assertThat(ViewBindings.bound("[[ no close at all {{ amount }}")).containsExactly("amount");
        assertThat(inChange("[[amount]] [[", viewModel)).isEmpty();
    }

    @Test
    void namesAreCappedInNumberAndLength() {
        StringBuilder view = new StringBuilder();
        for (int i = 0; i < 500; i++) {
            view.append("[[name").append(i).append("]]");
        }
        view.append("[[").append("n".repeat(200)).append("]]");
        assertThat(ViewBindings.bound(view.toString())).hasSize(ViewBindings.MAX_NAMES).allMatch(n -> n.length() <= ViewBindings.MAX_NAME);

        StringBuilder viewModel = new StringBuilder("function VM() {\n");
        for (int i = 0; i < 500; i++) {
            viewModel.append("  this.observableWithAFairlyLongName").append(i).append(" = ko.observable();\n");
        }
        assertThat(ViewBindings.outline(viewModel.append("}\n").toString()).length()).isLessThanOrEqualTo(ViewBindings.MAX_OUTLINE + 4);
    }
}
