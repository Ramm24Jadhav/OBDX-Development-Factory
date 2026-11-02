package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.requirements.Requirement;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.requirements.RequirementSpec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The Design Studio's view of a BRD: its screens in flow order with their models, the functional requirements each
 * one serves, and approving a requirement's screens in one action.
 */
@Service
public class DesignFlowService {

    private final ScreenDesignRepository designs;
    private final DesignStore store;
    private final RequirementService requirements;

    private final ComponentCompatibility compatibility;

    public DesignFlowService(ScreenDesignRepository designs, DesignStore store, RequirementService requirements,
                             ComponentCompatibility compatibility) {
        this.compatibility = compatibility;
        this.designs = designs;
        this.store = store;
        this.requirements = requirements;
    }

    /**
     * @param needsSteps  the screen takes input but has no review and confirmation screens after it
     * @param criteria    the acceptance criteria (ID, or text without one) the screen helps meet
     * @param unconfirmed labels of its choices and tables whose values the BRD does not give
     * @param decisions   design decisions the BRD leaves open on it
     */
    public record FlowScreen(UUID id, String name, ScreenDesign.Status status, int currentVersion, Integer approvedVersion,
                             String approvedBy, String stage, List<String> channels, ScreenModel model, boolean needsSteps,
                             List<String> criteria, List<String> unconfirmed, List<String> decisions) {
    }

    /** An open question of the spec without an answer, and the requirements (IDs) and screens it mentions. */
    public record OpenQuestion(String question, String reason, String reference, List<String> options, String suggestedAnswer,
                               List<String> requirements, List<UUID> screens) {
    }

    public record FlowRequirement(String id, String title, String description, String priority, List<String> screenNames,
                                  List<UUID> screens, List<RequirementSpec.BusinessRule> rules,
                                  List<RequirementSpec.AcceptanceCriterion> criteria) {
    }

    /**
     * @param screens      every screen of the BRD in flow order
     * @param requirements the spec's functional requirements, each with its screens
     * @param others       screens no functional requirement names
     * @param rules        all business rules of the spec
     * @param uncovered    the criteria no screen helps meet
     * @param questions    the spec's open questions that have no answer yet
     * @param decisions    the answered ones
     */
    public record DesignFlow(UUID requirementId, UUID workspaceId, String title, Requirement.Status status, List<FlowScreen> screens,
                             List<FlowRequirement> requirements, List<UUID> others,
                             List<RequirementSpec.BusinessRule> rules, List<RequirementSpec.AcceptanceCriterion> criteria,
                             List<String> uncovered, List<OpenQuestion> questions, List<RequirementSpec.Decision> decisions) {
    }

    /** What approving changed, for the audit log, and the flow after it. */
    /** @param unsupported the screens approved with elements the version pack forbids (confirmed): name to "oj-x, oj-y" */
    public record Approval(List<String> approved, DesignFlow flow, Map<String, String> unsupported) {
    }

    @Transactional(readOnly = true)
    public DesignFlow flow(UUID requirementId) {
        RequirementService.RequirementDetail requirement = requirements.get(requirementId);
        List<ScreenDesign> all = designs.findByRequirementIdOrderByCreatedAt(requirementId);
        List<RequirementFlows.Screen> ordered = RequirementFlows.order(all.stream()
                .map(d -> new RequirementFlows.Screen(d.getId(), d.getName(), store.model(d.getId(), d.getCurrentVersion()).orElse(null)))
                .toList());
        RequirementSpec spec = requirement.spec();
        List<RequirementFlows.Flow> flows = RequirementFlows.flows(spec, ordered);
        Map<UUID, List<String>> criteria = RequirementFlows.criteriaByScreen(ordered, flows);
        List<FlowScreen> screens = new ArrayList<>();
        for (RequirementFlows.Screen s : ordered) {
            ScreenDesign d = all.stream().filter(x -> x.getId().equals(s.id())).findFirst().orElseThrow();
            screens.add(new FlowScreen(d.getId(), d.getName(), d.getStatus(), d.getCurrentVersion(), d.getApprovedVersion(),
                    d.getApprovedBy(), s.stage(), s.model() == null ? List.of() : s.model().channels(), s.model(),
                    RequirementFlows.needsSteps(s, ordered), criteria.get(s.id()), RequirementFlows.unconfirmed(s.model()),
                    RequirementFlows.openDecisions(spec, s)));
        }
        return new DesignFlow(requirementId, requirement.workspaceId(), requirement.title(), requirement.status(), screens,
                flows.stream().map(f -> new FlowRequirement(f.id(), f.title(), f.description(), f.priority(), f.screenNames(),
                        f.screens(), f.rules(), f.criteria())).toList(),
                RequirementFlows.others(ordered, flows),
                spec == null || spec.businessRules() == null ? List.of() : spec.businessRules(),
                spec == null ? List.of() : spec.acceptanceCriteria(),
                spec == null ? List.of() : RequirementFlows.uncovered(spec.acceptanceCriteria(), criteria),
                RequirementFlows.unresolved(spec, ordered).stream().map(q -> new OpenQuestion(q.question(), q.reason(), q.reference(),
                        q.options(), q.suggestedAnswer(), q.requirements(), q.screens())).toList(),
                spec == null || spec.decisions() == null ? List.of() : spec.decisions());
    }

    /**
     * Approves the BRD's screens that are not approved yet, in one transaction.
     *
     * @param ids the screens to approve; null or empty: all of the BRD's screens
     */
    @Transactional
    public Approval approve(UUID requirementId, List<UUID> ids, String by) {
        return approve(requirementId, ids, by, false);
    }

    /**
     * @param unsupported true: the approver confirmed approving screens with elements the workspace's version pack
     *                    forbids; without it the approval is refused (nothing approved), naming the screens and elements
     */
    @Transactional
    public Approval approve(UUID requirementId, List<UUID> ids, String by, boolean unsupported) {
        if (by == null || by.isBlank()) {
            throw new BadRequestException("Enter your name");
        }
        List<ScreenDesign> all = designs.findByRequirementIdOrderByCreatedAt(requirementId);
        if (all.isEmpty()) {
            throw new BadRequestException("Generate the screens first");
        }
        Set<UUID> wanted = ids == null || ids.isEmpty() ? null : Set.copyOf(ids);
        if (wanted != null && !all.stream().map(ScreenDesign::getId).toList().containsAll(wanted)) {
            throw new BadRequestException("Some of these screens are not part of this requirement. Reload the page and try again.");
        }
        List<ScreenDesign> toApprove = all.stream().filter(design -> (wanted == null || wanted.contains(design.getId()))
                && design.getStatus() != ScreenDesign.Status.APPROVED).toList();
        Map<String, String> forbidden = new java.util.LinkedHashMap<>();
        for (ScreenDesign design : toApprove) {
            List<ComponentCompatibility.Entry> found = compatibility == null ? List.of()
                    : compatibility.unsupported(design.getWorkspaceId(), store.model(design.getId(), design.getCurrentVersion()).orElse(null));
            if (!found.isEmpty()) {
                forbidden.put(design.getName(), String.join(", ", found.stream().map(ComponentCompatibility.Entry::element).toList()));
            }
        }
        if (!forbidden.isEmpty() && !unsupported) {
            throw new com.obdx.factory.common.ConflictException(ScreenDesignService.UNSUPPORTED + "the workspace's version pack forbids elements of "
                    + String.join("; ", forbidden.entrySet().stream().map(f -> f.getKey() + " (" + f.getValue() + ")").toList()) + ". Replace them in the designer, or approve the screens as they are if you have "
                    + "checked that they work in this OBDX version.");
        }
        List<String> approved = new ArrayList<>();
        for (ScreenDesign design : toApprove) {
            design.approve(by.trim());
            designs.save(design);
            approved.add(design.getName());
        }
        return new Approval(approved, flow(requirementId), unsupported ? forbidden : Map.of());
    }
}
