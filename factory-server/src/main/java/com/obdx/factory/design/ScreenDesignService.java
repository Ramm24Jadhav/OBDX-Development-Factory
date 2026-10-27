package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.requirements.Requirement;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.target.TargetPack;
import com.obdx.factory.target.TargetPacks;
import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/**
 * Screen designs: created from approved requirement specs, edited in the designer (by hand or by instruction),
 * reviewed by the customer through a review link, and approved.
 */
@Service
public class ScreenDesignService {

    static final Duration DEFAULT_REVIEW_PERIOD = Duration.ofDays(14);

    private final ScreenDesignRepository designs;
    private final DesignStore store;
    private final WorkspaceRepository workspaces;
    private final RequirementService requirements;
    private final ScreenModelEditor editor;
    private final TargetPacks targets;
    private final SecureRandom random = new SecureRandom();

    public ScreenDesignService(ScreenDesignRepository designs, DesignStore store, WorkspaceRepository workspaces,
                               RequirementService requirements, ScreenModelEditor editor, TargetPacks targets) {
        this.designs = designs;
        this.targets = targets;
        this.store = store;
        this.workspaces = workspaces;
        this.requirements = requirements;
        this.editor = editor;
    }

    public record DesignSummary(UUID id, String name, ScreenDesign.Status status, int currentVersion, UUID requirementId,
                                long components, OffsetDateTime updatedAt) {
    }

    public record DesignDetail(UUID id, UUID workspaceId, UUID requirementId, String name, ScreenDesign.Status status,
                               int currentVersion, ScreenModel model, List<DesignStore.VersionInfo> versions,
                               List<DesignStore.Comment> comments, String reviewToken, OffsetDateTime reviewExpiresAt,
                               Integer approvedVersion, String approvedBy, OffsetDateTime approvedAt) {
    }

    /** preview: which renderer shows the screen (jet, react-native or react), from the workspace's UI target. */
    public record ReviewView(String name, ScreenDesign.Status status, int version, ScreenModel model,
                             List<DesignStore.Comment> comments, OffsetDateTime expiresAt, String approvedBy,
                             OffsetDateTime approvedAt, String preview) {
    }

    // --- create ---

    /** One design per screen of an approved requirement spec. */
    @Transactional
    public List<DesignSummary> fromRequirement(UUID requirementId) {
        RequirementService.RequirementDetail requirement = requirements.get(requirementId);
        if (requirement.status() != Requirement.Status.APPROVED) {
            throw new BadRequestException("Approve the requirement's spec before designing its screens");
        }
        if (designs.existsByRequirementId(requirementId)) {
            throw new ConflictException("Designs for this requirement already exist");
        }
        List<DesignSummary> created = new ArrayList<>();
        for (RequirementSpec.Screen screen : requirement.spec().screens()) {
            ScreenModel model = ScreenModels.fromSpec(screen);
            ScreenDesign design = new ScreenDesign(requirement.workspaceId(), requirementId, model.name());
            designs.saveAndFlush(design);
            int version = store.addVersion(design.getId(), DesignStore.Origin.GENERATED,
                    "From requirement \"" + requirement.title() + "\" (spec version " + requirement.currentVersion() + ")", model);
            design.newVersion(version, model.name());
            created.add(summary(designs.save(design), model));
        }
        return created;
    }

    @Transactional
    public DesignDetail blank(UUID workspaceId, String name) {
        if (!workspaces.existsById(workspaceId)) {
            throw new NotFoundException("Workspace not found: " + workspaceId);
        }
        ScreenModel model = ScreenModels.blank(name);
        ScreenDesign design = designs.saveAndFlush(new ScreenDesign(workspaceId, null, model.name()));
        design.newVersion(store.addVersion(design.getId(), DesignStore.Origin.BLANK, null, model), model.name());
        return detail(designs.save(design));
    }

    // --- read ---

    @Transactional(readOnly = true)
    public List<DesignSummary> list(UUID workspaceId) {
        return designs.findByWorkspaceIdOrderByCreatedAt(workspaceId).stream()
                .map(design -> summary(design, currentModel(design))).toList();
    }

    @Transactional(readOnly = true)
    public DesignDetail get(UUID id) {
        return detail(find(id));
    }

    @Transactional(readOnly = true)
    public ScreenModel version(UUID id, int version) {
        return store.model(find(id).getId(), version).orElseThrow(() -> new NotFoundException("No version " + version));
    }

    // --- edit ---

    @Transactional
    public DesignDetail save(UUID id, ScreenModel model, String note) {
        ScreenDesign design = editable(find(id));
        ScreenModel normalized = ScreenModels.normalize(model);
        design.newVersion(store.addVersion(id, DesignStore.Origin.EDITED, blankToNull(note), normalized), normalized.name());
        return detail(designs.save(design));
    }

    /** Lets the model apply a plain-language change and saves the result as a new version. */
    @Transactional
    public DesignDetail aiChange(UUID id, String instruction) {
        if (instruction == null || instruction.isBlank()) {
            throw new BadRequestException("Describe the change");
        }
        ScreenDesign design = editable(find(id));
        ScreenModel current = currentModel(design);
        ScreenModel changed = editor.apply(current, instruction.trim());
        if (changed.equals(current)) {
            throw new BadRequestException("The model made no change. Try describing it differently.");
        }
        design.newVersion(store.addVersion(id, DesignStore.Origin.AI, instruction.trim(), changed), changed.name());
        return detail(designs.save(design));
    }

    @Transactional
    public DesignDetail comment(UUID id, String author, String text, String componentId) {
        ScreenDesign design = find(id);
        store.addComment(id, design.getCurrentVersion(), blankToNull(componentId), requireAuthor(author), false, requireText(text));
        return detail(design);
    }

    // --- review and approval ---

    /** Creates (or replaces) the review link. Anyone with the link can view, comment and approve until it expires. */
    @Transactional
    public DesignDetail openReview(UUID id, Integer days) {
        ScreenDesign design = editable(find(id));
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        Duration period = days == null ? DEFAULT_REVIEW_PERIOD : Duration.ofDays(Math.clamp(days, 1, 90));
        design.openReview(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes), OffsetDateTime.now().plus(period));
        return detail(designs.save(design));
    }

    @Transactional
    public DesignDetail closeReview(UUID id) {
        ScreenDesign design = find(id);
        design.closeReview();
        return detail(designs.save(design));
    }

    @Transactional
    public DesignDetail approve(UUID id, String by) {
        ScreenDesign design = editable(find(id));
        design.approve(requireAuthor(by));
        return detail(designs.save(design));
    }

    /** Unlocks an approved design for further changes. */
    @Transactional
    public DesignDetail reopen(UUID id) {
        ScreenDesign design = find(id);
        if (design.getStatus() != ScreenDesign.Status.APPROVED) {
            throw new ConflictException("Only approved designs can be reopened");
        }
        design.reopen();
        return detail(designs.save(design));
    }

    @Transactional
    public void delete(UUID id) {
        designs.delete(find(id));
    }

    @Transactional(readOnly = true)
    public ReviewView review(String token) {
        ScreenDesign design = byToken(token);
        return new ReviewView(design.getName(), design.getStatus(), design.getCurrentVersion(), currentModel(design),
                store.comments(design.getId()), design.getReviewExpiresAt(), design.getApprovedBy(), design.getApprovedAt(), preview(design));
    }

    /** The workspace a review link belongs to, for the audit log. */
    @Transactional(readOnly = true)
    public UUID workspaceOfReview(String token) {
        return byToken(token).getWorkspaceId();
    }

    @Transactional
    public ReviewView reviewComment(String token, String author, String text, String componentId) {
        ScreenDesign design = byToken(token);
        store.addComment(design.getId(), design.getCurrentVersion(), blankToNull(componentId), requireAuthor(author), true, requireText(text));
        return review(token);
    }

    @Transactional
    public ReviewView reviewApprove(String token, String author) {
        ScreenDesign design = byToken(token);
        String name = requireAuthor(author);
        store.addComment(design.getId(), design.getCurrentVersion(), null, name, true,
                "Approved version " + design.getCurrentVersion() + ".");
        design.approve(name);
        designs.save(design);
        return new ReviewView(design.getName(), design.getStatus(), design.getCurrentVersion(), currentModel(design),
                store.comments(design.getId()), null, design.getApprovedBy(), design.getApprovedAt(), preview(design));
    }

    // --- helpers ---

    /** The preview renderer of the design's workspace (its UI target). */
    private String preview(ScreenDesign design) {
        String target = workspaces.findById(design.getWorkspaceId()).map(w -> w.getTarget()).orElse(TargetPack.JET);
        return targets.find(target).map(TargetPack::preview).orElse(TargetPack.JET);
    }

    private ScreenDesign byToken(String token) {
        ScreenDesign design = designs.findByReviewToken(token)
                .orElseThrow(() -> new NotFoundException("This review link is not valid. It may have been closed or the design approved."));
        if (design.getReviewExpiresAt() != null && design.getReviewExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new NotFoundException("This review link has expired. Ask the team for a new one.");
        }
        return design;
    }

    private ScreenDesign editable(ScreenDesign design) {
        if (design.getStatus() == ScreenDesign.Status.APPROVED) {
            throw new ConflictException("The design is approved. Reopen it to make changes.");
        }
        return design;
    }

    private DesignSummary summary(ScreenDesign design, ScreenModel model) {
        long components = model == null ? 0 : model.sections().stream().mapToLong(s -> s.components().size()).sum();
        return new DesignSummary(design.getId(), design.getName(), design.getStatus(), design.getCurrentVersion(),
                design.getRequirementId(), components, design.getUpdatedAt());
    }

    private DesignDetail detail(ScreenDesign d) {
        return new DesignDetail(d.getId(), d.getWorkspaceId(), d.getRequirementId(), d.getName(), d.getStatus(),
                d.getCurrentVersion(), currentModel(d), store.versions(d.getId()), store.comments(d.getId()),
                d.getReviewToken(), d.getReviewExpiresAt(), d.getApprovedVersion(), d.getApprovedBy(), d.getApprovedAt());
    }

    private ScreenModel currentModel(ScreenDesign design) {
        return store.model(design.getId(), design.getCurrentVersion()).orElse(null);
    }

    private ScreenDesign find(UUID id) {
        return designs.findById(id).orElseThrow(() -> new NotFoundException("Design not found: " + id));
    }

    private static String requireAuthor(String author) {
        if (author == null || author.isBlank()) {
            throw new BadRequestException("Enter your name");
        }
        return author.trim().length() > 200 ? author.trim().substring(0, 200) : author.trim();
    }

    private static String requireText(String text) {
        if (text == null || text.isBlank()) {
            throw new BadRequestException("Write a comment");
        }
        return text.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
