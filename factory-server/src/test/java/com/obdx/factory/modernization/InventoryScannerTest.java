package com.obdx.factory.modernization;

import com.obdx.factory.profile.SourceTree;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class InventoryScannerTest {

    /** A small OBDX-like codebase: component modules, a classic JET view, a composite and a VDOM component, services. */
    static final Map<String, String> CODEBASE = Map.ofEntries(
            Map.entry("channel/components/modules/payments/transfer-funds/transfer-funds.html", """
                    <div class="oj-flex">
                      <!-- <oj-input-text label-hint="old"></oj-input-text> -->
                      <oj-select-single label-hint="[[nls.transfer.from]]" value="{{fromAccount}}"></oj-select-single>
                      <oj-input-number label-hint="[[nls.transfer.amount]]" value="{{amount}}"></oj-input-number>
                      <oj-input-text label-hint="[[nls.transfer.remarks]]" value="{{remarks}}"></oj-input-text>
                      <oj-switch label-hint="[[nls.transfer.savePayee]]" value="{{savePayee}}"></oj-switch>
                      <oj-button on-oj-action="[[next]]">Next</oj-button>
                      <oj-button on-oj-action="[[cancel]]">Cancel</oj-button>
                    </div>
                    """),
            Map.entry("channel/components/modules/payments/transfer-funds/transfer-funds.js", """
                    define(['knockout', './model'], function (ko, Model) {
                      return function TransferFunds(rootParams) {
                        this.next = function () {
                          rootParams.dashboard.loadComponent("review-transfer", {});
                        };
                      };
                    });
                    """),
            Map.entry("channel/components/modules/payments/transfer-funds/model.js", """
                    define(['baseService'], function (BaseService) {
                      const baseService = BaseService.getInstance();
                      return {
                        accounts: function () { return baseService.fetch({ url: "accounts/demandDeposit?status=ACTIVE" }); },
                        limits: function () { return baseService.fetch({ url: "limits/{id}" }); }
                      };
                    });
                    """),
            Map.entry("channel/components/modules/payments/review-transfer/review-transfer.html", """
                    <oj-bind-text value="[[amount]]"></oj-bind-text>
                    <oj-button on-oj-action="[[confirm]]">Confirm</oj-button>
                    """),
            Map.entry("channel/components/modules/payments/review-transfer/review-transfer.js", """
                    define([], function () {
                      return function ReviewTransfer(rootParams) {
                        this.confirm = function () {
                          return transferService.post('payments/transfers/' + rootParams.id + '/approve', {})
                            .then(function () { rootParams.dashboard.loadComponent('transfer-confirmation'); });
                        };
                        this.create = function () { return transferService.post('/digx/v1/payments/transfers', {}); };
                      };
                    });
                    """),
            Map.entry("channel/components/modules/payments/transfer-confirmation/transfer-confirmation.html", "<h1>Done</h1>\n"),
            Map.entry("channel/components/modules/payments/transfer-confirmation/transfer-confirmation.js", "define([], function () { return {}; });\n"),
            Map.entry("channel/components/modules/accounts/account-summary/account-summary.html", """
                    <oj-select-single label-hint="[[nls.account]]" value="{{account}}"></oj-select-single>
                    """),
            Map.entry("channel/components/modules/accounts/account-summary/account-summary.js", """
                    define([], function () { return function (p) { this.corporate = p.userSegment === 'CORPORATE'; }; });
                    """),
            Map.entry("channel/resources/nls/transfer-funds.js", "define({root: {transfer: {from: 'From'}}});\n"),
            Map.entry("ui/retail/js/views/fund-transfer.html", """
                    <input type="text" value="{{payee}}" placeholder="Payee">
                    <input type="hidden" value="x">
                    <button>Send</button>
                    """),
            Map.entry("ui/retail/js/viewModels/fund-transfer.js", "define(['knockout'], function (ko) { return function () {}; });\n"),
            Map.entry("channel/jet-composites/obdx-amount/component.json", "{\"name\": \"obdx-amount\"}\n"),
            Map.entry("channel/jet-composites/obdx-amount/view.html", "<oj-input-number value=\"{{$props.value}}\"></oj-input-number>\n"),
            Map.entry("channel/jet-composites/obdx-amount/viewModel.js", "define([], function () { return function () {}; });\n"),
            Map.entry("channel/vcomponents/limits-card/limits-card.tsx", "import { customElement } from 'ojs/ojvcomponent';\nexport function LimitsCard() { return null; }\n"),
            Map.entry("channel/test/foo/foo.html", "<oj-input-text></oj-input-text>\n"),
            Map.entry("channel/test/foo/foo.js", "define([], function () {});\n"),
            Map.entry("mobile/src/screens/x/x.html", "<input>\n"),
            Map.entry("mobile/src/screens/x/x.js", "x\n"),
            Map.entry("backend/src/com/bank/obdx/payments/TransferResource.java", """
                    package com.bank.obdx.payments;

                    import javax.annotation.security.RolesAllowed;
                    import javax.ws.rs.*;

                    @Path("/payments")
                    public class TransferResource {
                        @POST
                        @Path("/transfers")
                        public Object create(Object request) { return null; }

                        @POST
                        @Path("transfers/{id}/approve")
                        @RolesAllowed({"RetailUser", "CorporateMaker"})
                        public Object approve(@PathParam("id") String id) { return null; }

                        @GET
                        @Path("/transfers/{id}")
                        public Object read(@PathParam("id") String id) { return null; }

                        public void helper() { }
                    }
                    """),
            Map.entry("backend/src/com/bank/obdx/limits/LimitController.java", """
                    package com.bank.obdx.limits;

                    @RestController
                    @RequestMapping("/limits")
                    public class LimitController {
                        @GetMapping("/{id}")
                        @PreAuthorize("hasAnyRole('ADMIN', 'ROLE_LimitOfficer')")
                        public Object limit(String id) { return null; }

                        @RequestMapping(value = "/reset", method = RequestMethod.POST)
                        public void reset() { }
                    }
                    """),
            Map.entry("product/com/ofss/digx/app/accounts/DemandDepositResource.java", """
                    package com.ofss.digx.app.accounts;

                    @Path("/accounts/demandDeposit")
                    public class DemandDepositResource {
                        @GET
                        public Object list() { return null; }
                    }
                    """));

    @Test
    void scansScreensServicesRolesAndFlows(@TempDir Path root) throws Exception {
        for (Map.Entry<String, String> file : CODEBASE.entrySet()) {
            Path path = root.resolve(file.getKey());
            Files.createDirectories(path.getParent());
            Files.writeString(path, file.getValue());
        }
        Inventory inventory = InventoryScanner.scan(SourceTree.scan(root, List.of(".svn", "node_modules"), 512_000), 42L, "mobile");

        assertThat(inventory.revision()).isEqualTo(42L);
        assertThat(inventory.screens()).extracting(Inventory.Screen::name, Inventory.Screen::module, Inventory.Screen::kind).containsExactly(
                tuple("Account summary", "accounts", "component"),
                tuple("Obdx amount", "jet-composites", "composite"),
                tuple("Review transfer", "payments", "component"),
                tuple("Transfer confirmation", "payments", "component"),
                tuple("Transfer funds", "payments", "component"),
                tuple("Fund transfer", "retail", "view"),
                tuple("Limits card", "vcomponents", "vdom"));

        Inventory.Screen transfer = inventory.screens().stream().filter(s -> s.name().equals("Transfer funds")).findFirst().orElseThrow();
        assertThat(transfer.files()).containsExactly("channel/components/modules/payments/transfer-funds/transfer-funds.html",
                "channel/components/modules/payments/transfer-funds/transfer-funds.js",
                "channel/components/modules/payments/transfer-funds/model.js", "channel/resources/nls/transfer-funds.js");
        assertThat(transfer.fields()).containsExactly(
                new Inventory.Field("select", "[[nls.transfer.from]]", "fromAccount"),
                new Inventory.Field("number", "[[nls.transfer.amount]]", "amount"),
                new Inventory.Field("text", "[[nls.transfer.remarks]]", "remarks"),
                new Inventory.Field("switch", "[[nls.transfer.savePayee]]", "savePayee"));
        assertThat(transfer.actions()).isEqualTo(2);
        assertThat(transfer.calls()).containsExactly("GET accounts/demandDeposit", "GET limits/{}");
        assertThat(transfer.opens()).containsExactly("channel/components/modules/payments/review-transfer/review-transfer");
        assertThat(transfer.complexity()).isEqualTo("M");

        Inventory.Screen classic = inventory.screens().stream().filter(s -> s.name().equals("Fund transfer")).findFirst().orElseThrow();
        assertThat(classic.fields()).containsExactly(new Inventory.Field("text", "Payee", "payee"));
        assertThat(classic.actions()).isEqualTo(1);

        assertThat(inventory.endpoints()).extracting(Inventory.Endpoint::method, Inventory.Endpoint::path, Inventory.Endpoint::product,
                Inventory.Endpoint::usedBy).containsExactly(
                tuple("GET", "/accounts/demandDeposit", true, List.of("channel/components/modules/payments/transfer-funds/transfer-funds")),
                tuple("POST", "/limits/reset", false, List.of()),
                tuple("GET", "/limits/{id}", false, List.of("channel/components/modules/payments/transfer-funds/transfer-funds")),
                tuple("POST", "/payments/transfers", false, List.of("channel/components/modules/payments/review-transfer/review-transfer")),
                tuple("GET", "/payments/transfers/{id}", false, List.of()),
                tuple("POST", "/payments/transfers/{id}/approve", false, List.of("channel/components/modules/payments/review-transfer/review-transfer")));
        assertThat(inventory.calls()).extracting(Inventory.ServiceCall::method, Inventory.ServiceCall::path, Inventory.ServiceCall::endpoint)
                .containsExactly(
                        tuple("GET", "accounts/demandDeposit", "GET /accounts/demandDeposit"),
                        tuple("POST", "digx/v1/payments/transfers", "POST /payments/transfers"),
                        tuple("GET", "limits/{}", "GET /limits/{id}"),
                        tuple("POST", "payments/transfers/{}/approve", "POST /payments/transfers/{id}/approve"));

        assertThat(inventory.roles()).extracting(Inventory.Role::name, Inventory.Role::source).containsExactly(
                tuple("ADMIN", "Java security annotation"),
                tuple("CORPORATE", "User segment check in the UI"),
                tuple("CorporateMaker", "Java security annotation"),
                tuple("LimitOfficer", "Java security annotation"),
                tuple("retail", "User segment folder in the UI"),
                tuple("RetailUser", "Java security annotation"));

        assertThat(inventory.flows()).singleElement().satisfies(flow -> {
            assertThat(flow.name()).isEqualTo("Transfer funds");
            assertThat(flow.steps()).containsExactly("Transfer funds → Review transfer", "Review transfer → Transfer confirmation");
        });
        assertThat(inventory.summary().screens()).isEqualTo(7);
        assertThat(inventory.summary().callsWithoutBackend()).isZero();
        assertThat(inventory.modules()).extracting(Inventory.Module::name, Inventory.Module::screens).contains(tuple("payments", 3));
    }

    @Test
    void normalizesAndMatchesServicePaths() {
        assertThat(InventoryScanner.normalize("/digx/v1/payments/transfers/{id}?x=1")).isEqualTo("digx/v1/payments/transfers/{}");
        assertThat(InventoryScanner.normalize("https://host:8080/a/123/b")).isEqualTo("a/{}/b");
        assertThat(InventoryScanner.pathOf("'payments/transfers/' + rootParams.id + '/approve'")).isEqualTo("payments/transfers/{}/approve");
        assertThat(InventoryScanner.pathOf("'accounts/' + getId() + '/balances'")).isEqualTo("accounts/{}/balances");
        assertThat(InventoryScanner.matches("/payments/transfers/{id}", "digx/v1/payments/transfers/77")).isTrue();
        assertThat(InventoryScanner.matches("/payments/transfers", "payments/payees")).isFalse();
        assertThat(InventoryScanner.matches("/accounts", "deposits/accounts")).isFalse();
        assertThat(InventoryScanner.module("ui/js/views/fund-transfer.html", "fund-transfer")).isEqualTo("general");
        assertThat(InventoryScanner.humanize("fundTransfer")).isEqualTo("Fund transfer");
    }
}
