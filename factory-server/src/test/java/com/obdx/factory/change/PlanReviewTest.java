package com.obdx.factory.change;

import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.requirements.SpecParser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** A plan is checked against the spec and the existing code, and ordered so that what others use is written first. */
class PlanReviewTest {

    private static final RequirementSpec SPEC = SpecParser.parse("""
            {"title": "Standing instructions",
             "apis": [{"name": "GET /payments/standingInstructions", "method": "GET"},
                      {"name": "DELETE /payments/standingInstructions/{instructionId}", "method": "DELETE"},
                      {"name": "GET /extensions/limits", "method": "GET"}],
             "acceptanceCriteria": [{"id": "AC-001", "description": "Given ... then ..."}]}
            """, "x");

    private static ChangePlan.Item item(String path, String action, String layer) {
        return new ChangePlan.Item(path, action, layer, null, List.of(), null);
    }

    @Test
    void namesAMissingTestAnUnservedApiAndAResourceOnAServedPath() {
        ChangePlan plan = new ChangePlan("x", List.of(
                item("backend/src/com/bank/si/StandingInstructionResource.java", "create", "service"),
                item("backend/src/com/bank/si/StandingInstructionService.java", "create", "service")), List.of("Own risk"));

        ChangePlan reviewed = PlanReview.review(plan, SPEC, Map.of("payments/standinginstructions", "backend/src/com/bank/si/OldSiResource.java"));

        assertThat(reviewed.risks()).first().isEqualTo("Own risk");
        assertThat(reviewed.risks()).anySatisfy(r -> assertThat(r).startsWith(PlanReview.NO_TEST).contains("1 criteria"));
        assertThat(reviewed.risks()).anySatisfy(r -> assertThat(r).startsWith(PlanReview.UNSERVED_API + "GET /extensions/limits"));
        assertThat(reviewed.risks()).noneMatch(r -> r.startsWith(PlanReview.UNSERVED_API + "GET /payments"));
        assertThat(reviewed.risks()).anySatisfy(r -> assertThat(r).startsWith(PlanReview.SERVED_PATH + "GET /payments/standingInstructions")
                .contains("OldSiResource.java"));
        // reviewing again replaces the review's risks instead of adding them twice
        assertThat(PlanReview.review(reviewed, SPEC, Map.of("payments/standinginstructions", "x")).risks()).hasSize(reviewed.risks().size());
    }

    @Test
    void aResourceUnderOneOfObdxsOwnPathsIsARisk() {
        RequirementSpec spec = SpecParser.parse("{\"title\": \"x\", \"apis\": [{\"name\": \"POST /payments/standingInstructions\"}]}", "x");
        ChangePlan plan = new ChangePlan("x", List.of(item("backend/src/com/bank/si/StandingInstructionResource.java", "create", "service"),
                item("backend/src/com/bank/si/StandingInstructionResourceTest.java", "create", "test")), List.of());

        List<String> risks = PlanReview.review(plan, spec, Map.of()).risks();

        assertThat(risks).singleElement().asString().startsWith(PlanReview.SERVED_PATH).contains("under /payments");
    }

    @Test
    void aUiOnlyPlanCallsExistingServicesWithoutARisk() {
        ChangePlan plan = new ChangePlan("x", List.of(item("ui/js/viewModels/si-list.js", "create", "ui"),
                item("ui/js/viewModels/si-list.spec.js", "create", "test")), List.of());

        assertThat(PlanReview.review(plan, SPEC, Map.of()).risks()).isEmpty();
    }

    @Test
    void aUiOnlyPlanForASpecThatAsksForNewEndpointsIsFlagged() {
        // BRD1: FR-008 asks for REST endpoints; the plan the model wrote had only screens
        RequirementSpec spec = SpecParser.parse("""
                {"title": "Standing instructions",
                 "apis": [{"name": "/payments/standingInstructions", "method": "POST"}, {"name": "/payments/transfers", "method": "POST"}],
                 "scope": ["Create a standing instruction.", "A new REST service in the OBDX payments module, request and response DTOs."],
                 "requirements": [{"id": "FR-008", "description": "The system shall expose REST endpoints under /payments/standingInstructions."}]}
                """, "x");
        ChangePlan plan = new ChangePlan("x", List.of(item("channel/components/modules/payments/create-si/create-si.js", "create", "ui"),
                item("channel/components/modules/payments/create-si/model.js", "create", "ui")), List.of());

        List<String> risks = PlanReview.review(plan, spec, Map.of("payments/transfers", "backend/src/TransferResource.java")).risks();

        assertThat(risks).singleElement().asString().startsWith(PlanReview.UNSERVED_API + "POST /payments/standingInstructions");
    }

    @Test
    void readsWhetherTheSpecAsksForNewEndpoints() {
        assertThat(PlanReview.asksForEndpoints(SpecParser.parse("{\"scope\": [\"A new REST endpoint POST /x in the backend.\"]}", "x"))).isTrue();
        assertThat(PlanReview.asksForEndpoints(SpecParser.parse(
                "{\"requirements\": [{\"id\": \"FR-001\", \"description\": \"The system shall expose POST /payments/x accepting a list.\"}]}", "x")))
                .isTrue();
        assertThat(PlanReview.asksForEndpoints(SpecParser.parse(
                "{\"requirements\": [{\"id\": \"FR-001\", \"description\": \"The widget shall call the existing payments/payees service.\"}]}",
                "x"))).isFalse();
        assertThat(PlanReview.asksForEndpoints(SpecParser.parse(
                "{\"requirements\": [{\"id\": \"FR-001\", \"description\": \"The system shall expose an API for the list.\"}]}", "x"))).isTrue();
        // BRD3: UI only, and saying so
        assertThat(PlanReview.asksForEndpoints(SpecParser.parse("""
                {"scope": ["A new Quick Transfer dashboard widget (UI component, view model, resource bundle).", "Uses no new REST service."],
                 "outOfScope": ["Any backend change: no new or changed REST service, Java class, DTO."]}
                """, "x"))).isFalse();
        // "new" that is not said of an endpoint, and existing services
        assertThat(PlanReview.asksForEndpoints(SpecParser.parse("""
                {"scope": ["Show the new balance using the existing REST API.", "Add a new payee via the payee API.",
                           "A new service charge on transfers."]}
                """, "x"))).isFalse();
    }

    @Test
    void readsTheRestPathsOfExistingCode() {
        assertThat(PlanReview.pathsIn("""
                @Path("/v1/payments/standingInstructions")
                public class SiResource {
                    @GET @Path("/{id}") public Response read(@PathParam("id") String id) { return null; }
                }
                """)).containsExactly("payments/standinginstructions", "payments/standinginstructions/{}");
        assertThat(PlanReview.serves("backend/StandingInstructionService.java", "/payments/standingInstructions/{id}")).isTrue();
        assertThat(PlanReview.serves("backend/LimitService.java", "/payments/standingInstructions")).isFalse();
        // "and/or" and "dd/mm/yyyy" are words, not paths
        assertThat(PlanReview.pathOf(new RequirementSpec.Api("Date service", "GET", "Accept and/or reject; due dd/mm/yyyy"))).isNull();
        assertThat(PlanReview.pathOf(new RequirementSpec.Api("Instructions (see /payments/standingInstructions)", "GET", null)))
                .isEqualTo("/payments/standingInstructions");
    }

    @Test
    void writesWhatOthersUseFirst() {
        Set<String> existing = Set.of();
        ChangePlan plan = PlanParser.parse("""
                {"items": [
                  {"path": "backend/src/com/bank/si/StandingInstructionResource.java", "layer": "service"},
                  {"path": "backend/src/com/bank/si/StandingInstructionService.java", "layer": "service"},
                  {"path": "backend/src/com/bank/si/dto/StandingInstructionDTO.java", "layer": "service"},
                  {"path": "ui/js/views/si-list.html", "layer": "ui"},
                  {"path": "ui/js/viewModels/si-list.js", "layer": "ui"},
                  {"path": "ui/resources/nls/si-list.js", "layer": "ui"}]}
                """, existing::contains, 10);

        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactly(
                "backend/src/com/bank/si/dto/StandingInstructionDTO.java", "backend/src/com/bank/si/StandingInstructionService.java",
                "backend/src/com/bank/si/StandingInstructionResource.java", "ui/resources/nls/si-list.js", "ui/js/viewModels/si-list.js",
                "ui/js/views/si-list.html");
    }
}
