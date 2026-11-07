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
import java.util.Objects;
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
    private final ComponentPalette palette;
    private final ComponentCompatibility compatibility;
    private final SecureRandom random = new SecureRandom();

    public ScreenDesignService(ScreenDesignRepository designs, DesignStore store, WorkspaceRepository workspaces,
                               RequirementService requirements, ScreenModelEditor editor, TargetPacks targets,
                               ComponentPalette palette, ComponentCompatibility compatibility) {
        this.compatibility = compatibility;
        this.designs = designs;
        this.palette = palette;
        this.targets = targets;
        this.store = store;
        this.workspaces = workspaces;
        this.requirements = requirements;
        this.editor = editor;
    }

    public record DesignSummary(UUID id, String name, ScreenDesign.Status status, int currentVersion, UUID requirementId,
                                long components, OffsetDateTime updatedAt, String stage, List<String> channels) {
    }

    public record DesignDetail(UUID id, UUID workspaceId, UUID requirementId, String name, ScreenDesign.Status status,
                               int currentVersion, ScreenModel model, List<DesignStore.VersionInfo> versions,
                               List<DesignStore.Comment> comments, String reviewToken, OffsetDateTime reviewExpiresAt,
                               Integer approvedVersion, String approvedBy, OffsetDateTime approvedAt) {
    }

    /**
     * What a review link shows: the one shared screen (its current version, without where its values are loaded from),
     * the comments and approval made through review links, and nothing else of the workspace. No ids, no team comments,
     * no names of the team.
     *
     * @param preview which renderer shows the screen (jet, react-native, react or angular), from the workspace's UI target
     */
    public record ReviewView(String name, ScreenDesign.Status status, int version, ScreenModel model,
                             List<ReviewComment> comments, OffsetDateTime expiresAt, String approvedBy,
                             OffsetDateTime approvedAt, String preview) {
    }

    /** A comment as reviewers see it: resolved says the team has dealt with it, not who did. */
    public record ReviewComment(int version, String componentId, String author, String text, OffsetDateTime createdAt,
                                DesignStore.Kind kind, boolean resolved) {
    }

    /** The longest comment a reviewer can send. */
    static final int MAX_COMMENT = 4000;

    // --- create ---

    /**
     * The channels the requirement names ("mobile app only", "internet or mobile banking"): from the spec (summary,
     * scope, requirements, answers) first, where they are stated for this change; from the whole document only when the
     * spec names none; all channels (empty) when neither does.
     */
    static List<String> channels(RequirementSpec spec, String documentText) {
        StringBuilder text = new StringBuilder(spec.summary() == null ? "" : spec.summary());
        spec.scope().forEach(s -> text.append('\n').append(s));
        spec.requirements().forEach(r -> text.append('\n').append(r.title() == null ? "" : r.title() + ". ")
                .append(r.description() == null ? "" : r.description()));
        spec.decisions().forEach(d -> text.append('\n').append(d.question()).append(' ').append(d.answer()));
        // The document's own statements of channels (its scope and non-functional sections, "NFR-003: desktop and mobile
        // web") count too; the whole document only when neither names one
        java.util.Set<String> channels = new java.util.LinkedHashSet<>(ScreenModels.channelsIn(text.toString()));
        channels.addAll(ScreenModels.channelsIn(ScreenModels.channelStatements(documentText)));
        if (channels.isEmpty()) {
            return ScreenModels.channelsIn(documentText);
        }
        // In the order the designer lists them
        return ScreenModels.CHANNELS_ORDER.stream().filter(channels::contains).toList();
    }

    /**
     * A review or confirmation screen the spec drafted with hardly any fields (a single "details" text) after an initiate
     * screen: it shows that screen's captured fields read-only instead, keeping the spec's name, title and actions.
     */
    static ScreenModel stepAfter(ScreenModel model, ScreenModel initiate) {
        boolean step = "review".equals(model.stage()) || "confirm".equals(model.stage());
        List<ScreenModel.Component> fields = model.sections().stream().flatMap(s -> s.components().stream()).toList();
        // Only a placeholder is replaced (no field, or one "details" text); a field of its own is never thrown away
        boolean placeholder = fields.isEmpty() || (fields.size() == 1
                && (fields.getFirst().name() + " " + fields.getFirst().label()).toLowerCase(java.util.Locale.ROOT)
                .matches(".*\\b(details|summary|review|information|info|data)\\b.*"));
        if (!step || initiate == null || !placeholder) {
            return model;
        }
        ScreenModel derived = ScreenModels.reviewAndConfirm(initiate).get("review".equals(model.stage()) ? 0 : 1);
        return ScreenModels.normalize(new ScreenModel(model.name(), model.title(), model.description() != null ? model.description()
                : derived.description(), model.changeType(), derived.sections(), model.actions(), model.stage(), model.channels()));
    }

    /**
     * A list or details screen whose requirement lets the customer cancel ("cancel a standing instruction from the list")
     * gets a Cancel button, and a Back button when it has none to leave by.
     */
    static ScreenModel withRequirementActions(ScreenModel model, RequirementSpec spec) {
        if (!"inquiry".equals(model.stage())) {
            return model;
        }
        String key = model.name().toLowerCase(java.util.Locale.ROOT);
        boolean cancels = spec.requirements().stream()
                .filter(r -> r.screens().stream().anyMatch(s -> s.equalsIgnoreCase(model.name())) || (r.description() != null
                        && r.description().toLowerCase(java.util.Locale.ROOT).contains(key)))
                .anyMatch(r -> ((r.title() == null ? "" : r.title()) + " " + (r.description() == null ? "" : r.description()))
                        .toLowerCase(java.util.Locale.ROOT).matches("(?s).*\\bcancel\\w*\\b.*"));
        // "Cancel Instruction" is the cancel already: no second, generic one
        if (!cancels || model.actions().stream().anyMatch(a -> a.label().toLowerCase(java.util.Locale.ROOT).contains("cancel"))) {
            return model;
        }
        List<ScreenModel.ActionButton> actions = new ArrayList<>(model.actions());
        actions.add(new ScreenModel.ActionButton(null, "Cancel", "secondary"));
        if (actions.stream().noneMatch(a -> a.label().equalsIgnoreCase("Back"))) {
            actions.add(new ScreenModel.ActionButton(null, "Back", "link"));
        }
        return ScreenModels.normalize(new ScreenModel(model.name(), model.title(), model.description(), model.changeType(), model.sections(),
                actions, model.stage(), model.channels()));
    }

    /**
     * A list screen the spec drafted without fields gets a table whose columns are what its requirement says the list
     * shows ("The list shows the beneficiary, amount, frequency and next execution date"); unchanged when it says none.
     */
    static ScreenModel fillEmptyList(ScreenModel model, RequirementSpec spec) {
        boolean empty = model.sections().stream().allMatch(s -> s.components().isEmpty());
        boolean list = ScreenModels.isList(model.name());
        // A list gets a table; a details screen (an inquiry) its fields read-only
        if (!empty || !(list || "inquiry".equals(model.stage()))) {
            return model;
        }
        for (RequirementSpec.FunctionalRequirement r : spec.requirements()) {
            if (r.screens().stream().noneMatch(s -> s.equalsIgnoreCase(model.name()))) {
                continue;
            }
            List<String> columns = ScreenModels.columnsIn(r.description());
            if (!columns.isEmpty()) {
                List<ScreenModel.Component> components = list
                        ? List.of(new ScreenModel.Component(null, "table", ScreenModels.camel(model.name()), model.name(), null, null, null, null,
                        null, columns, List.of(), true))
                        : columns.stream().map(c -> new ScreenModel.Component(null, "display", ScreenModels.camel(c), c, null, null, null, null,
                        null, List.of(), List.of(), true)).toList();
                List<ScreenModel.Section> sections = new ArrayList<>(model.sections());
                ScreenModel.Section first = sections.getFirst();
                sections.set(0, new ScreenModel.Section(first.id(), first.title(), first.columns(), components));
                return ScreenModels.normalize(new ScreenModel(model.name(), model.title(), model.description(), model.changeType(),
                        sections, model.actions(), model.stage(), model.channels()));
            }
        }
        return model;
    }

    /** Whether a screen has a field the customer fills in (not only read-only text and tables). */
    static boolean capturesInput(ScreenModel model) {
        return model.sections().stream().flatMap(s -> s.components().stream())
                .anyMatch(c -> !"display".equals(c.type()) && !"table".equals(c.type()) && !Boolean.TRUE.equals(c.readonly()));
    }

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
        List<String> channels = channels(requirement.spec(), requirement.documentText());
        ScreenModel initiate = null;
        for (RequirementSpec.Screen screen : requirement.spec().screens()) {
            ScreenModel model = withRequirementActions(fillEmptyList(stepAfter(ScreenModels.fromSpec(screen, channels,
                    requirement.spec().businessRules()), initiate), requirement.spec()), requirement.spec());
            // The nearest screen before that captures input (an initiate screen, or a dashboard widget with inputs)
            if (capturesInput(model)) {
                initiate = model;
            }
            ScreenDesign design = new ScreenDesign(requirement.workspaceId(), requirementId, model.name());
            designs.saveAndFlush(design);
            int version = store.addVersion(design.getId(), DesignStore.Origin.GENERATED,
                    "From requirement \"" + requirement.title() + "\" (spec version " + requirement.currentVersion() + ")", model);
            design.newVersion(version, model.name());
            created.add(summary(designs.save(design), model));
        }
        return created;
    }

    /**
     * The review and confirmation screens of an OBDX transaction flow, made from its initiate screen and linked to the
     * same requirement. The initiate screen is marked as such.
     */
    @Transactional
    public List<DesignSummary> flowScreens(UUID id) {
        ScreenDesign initiate = editable(find(id));
        ScreenModel model = currentModel(initiate);
        List<ScreenModel> made = ScreenModels.reviewAndConfirm(model);
        List<String> existing = designs.findByWorkspaceIdOrderByCreatedAt(initiate.getWorkspaceId()).stream()
                .filter(d -> Objects.equals(d.getRequirementId(), initiate.getRequirementId())).map(ScreenDesign::getName).toList();
        for (ScreenModel screen : made) {
            if (existing.contains(screen.name())) {
                throw new ConflictException("\"" + screen.name() + "\" already exists. Delete it first to make it again.");
            }
        }
        if (!"initiate".equals(model.stage())) {
            ScreenModel marked = ScreenModels.normalize(new ScreenModel(model.name(), model.title(), model.description(), model.changeType(),
                    model.sections(), model.actions(), "initiate", model.channels()));
            initiate.newVersion(store.addVersion(id, DesignStore.Origin.EDITED, "Marked as the initiate screen of its flow", marked), marked.name());
            designs.save(initiate);
        }
        List<DesignSummary> created = new ArrayList<>();
        for (ScreenModel screen : made) {
            ScreenDesign design = designs.saveAndFlush(new ScreenDesign(initiate.getWorkspaceId(), initiate.getRequirementId(), screen.name()));
            design.newVersion(store.addVersion(design.getId(), DesignStore.Origin.GENERATED,
                    "The " + screen.stage() + " screen of \"" + model.name() + "\"", screen), screen.name());
            created.add(summary(designs.save(design), screen));
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

    /** Saves an earlier version again as the newest one, so going back never loses a version. */
    @Transactional
    public DesignDetail restore(UUID id, int version) {
        ScreenDesign design = editable(find(id));
        if (version == design.getCurrentVersion()) {
            throw new BadRequestException("Version " + version + " is already the current version");
        }
        ScreenModel model = store.model(id, version).orElseThrow(() -> new NotFoundException("No version " + version));
        design.newVersion(store.addVersion(id, DesignStore.Origin.RESTORED, "Restored version " + version, model), model.name());
        return detail(designs.save(design));
    }

    public DesignDetail aiChange(UUID id, String instruction) {
        return aiChange(id, instruction, null);
    }

    /**
     * Lets the model apply a plain-language change and saves the result as a new version.
     *
     * @param targetId the selected component, section or action: only it changes; null changes the whole screen
     */
    @Transactional
    public DesignDetail aiChange(UUID id, String instruction, String targetId) {
        if (instruction == null || instruction.isBlank()) {
            throw new BadRequestException("Describe the change");
        }
        ScreenDesign design = editable(find(id));
        ScreenModel current = currentModel(design);
        String target = blankToNull(targetId);
        if (target != null && !ScreenModels.contains(current, target)) {
            throw new BadRequestException("The selected element is no longer on the screen. Select it again.");
        }
        ScreenModel answer = editor.apply(current, instruction.trim(), palette.palette(design.getWorkspaceId()).items(), target);
        ScreenModel changed = target == null ? answer : ScreenModels.onlyChange(current, answer, target);
        if (changed.equals(current)) {
            throw new BadRequestException("The model made no change. Try describing it differently.");
        }
        design.newVersion(store.addVersion(id, DesignStore.Origin.AI, instruction.trim(), changed), changed.name());
        return detail(designs.save(design));
    }

    /**
     * Refuses an approved design before anything is fetched for it (a Figma import calls figma.com with the user's
     * token: not for a design that cannot take the result).
     */
    @Transactional(readOnly = true)
    public void requireEditable(UUID id) {
        editable(find(id));
    }

    /** Turns a design made in a design tool into this screen's next version. */
    @Transactional
    public DesignDetail importDesign(UUID id, DesignImporter.Design source) {
        ScreenDesign design = editable(find(id));
        ScreenModel imported = editor.fromDesign(currentModel(design), source, palette.palette(design.getWorkspaceId()).items());
        design.newVersion(store.addVersion(id, DesignStore.Origin.IMPORTED, "From " + source.source(), imported), imported.name());
        return detail(designs.save(design));
    }

    @Transactional
    public DesignDetail comment(UUID id, String author, String text, String componentId) {
        ScreenDesign design = find(id);
        store.addComment(id, design.getCurrentVersion(), target(design, componentId), requireAuthor(author), false, requireText(text));
        return detail(design);
    }

    /** Marks a comment resolved (by the team member who dealt with it) or open again. */
    @Transactional
    public DesignDetail resolveComment(UUID id, UUID commentId, boolean resolved, String by) {
        ScreenDesign design = find(id);
        if (!store.setResolved(id, commentId, resolved ? requireAuthor(by) : null)) {
            throw new NotFoundException("This comment is no longer there. Reload the page.");
        }
        return detail(design);
    }

    // --- review and approval ---

    /** Creates (or replaces) the review link. Anyone with the link can view, comment and approve until it expires. */
    @Transactional
    public DesignDetail openReview(UUID id, Integer days) {
        ScreenDesign design = editable(find(id));
        Duration period = days == null ? DEFAULT_REVIEW_PERIOD : Duration.ofDays(Math.clamp(days, 1, 90));
        design.openReview(newToken(), OffsetDateTime.now().plus(period));
        return detail(designs.save(design));
    }

    /** 192 random bits, URL-safe: a link cannot be guessed, only shared. */
    String newToken() {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    @Transactional
    public DesignDetail closeReview(UUID id) {
        ScreenDesign design = find(id);
        design.closeReview();
        return detail(designs.save(design));
    }

    @Transactional
    public DesignDetail approve(UUID id, String by) {
        return approve(id, by, false).detail();
    }

    /** An approved design, with the elements the version pack forbids that the approver confirmed (empty: none). */
    public record Approved(DesignDetail detail, List<String> unsupported) {
    }

    /** How a refused approval of a screen with elements the version pack forbids starts, so the UI can ask to confirm it. */
    public static final String UNSUPPORTED = "Unsupported components: ";

    /**
     * @param unsupported true: the approver confirmed approving although the workspace's version pack forbids elements
     *                    of the screen; without it the approval is refused, naming them and the rules
     */
    @Transactional
    public Approved approve(UUID id, String by, boolean unsupported) {
        ScreenDesign design = editable(find(id));
        String author = requireAuthor(by);
        List<ComponentCompatibility.Entry> forbidden = compatibility == null ? List.of()
                : compatibility.unsupported(design.getWorkspaceId(), currentModel(design));
        if (!forbidden.isEmpty() && !unsupported) {
            throw new ConflictException(unsupportedMessage(forbidden));
        }
        design.approve(author);
        return new Approved(detail(designs.save(design)), forbidden.stream().map(ComponentCompatibility.Entry::element).toList());
    }

    /** "Unsupported components: oj-select-one (Version pack rule ...). Replace ..., or approve it as it is." */
    static String unsupportedMessage(List<ComponentCompatibility.Entry> forbidden) {
        return UNSUPPORTED + "the workspace's version pack forbids " + forbidden.stream().map(e -> e.element() + " (" + e.evidence() + ")")
                .collect(java.util.stream.Collectors.joining("; ")) + ". Replace " + (forbidden.size() == 1 ? "it" : "them")
                + " in the designer, or approve the screen as it is if you have checked that it works in this OBDX version.";
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
        return reviewView(design, design.getReviewExpiresAt());
    }

    private ReviewView reviewView(ScreenDesign design, OffsetDateTime expiresAt) {
        ScreenModel model = currentModel(design);
        return new ReviewView(design.getName(), design.getStatus(), design.getCurrentVersion(), model == null ? null : forReviewer(model),
                forReviewer(store.comments(design.getId())), expiresAt, design.getApprovedBy(), design.getApprovedAt(), preview(design));
    }

    /**
     * The screen as reviewers see it: where values are loaded from (the bank's API paths) and a custom component's own
     * HTML, CSS and script (the bank's code) stay internal; the preview draws such a component as a placeholder of its kind.
     */
    static ScreenModel forReviewer(ScreenModel model) {
        List<ScreenModel.Section> sections = model.sections().stream().map(s -> new ScreenModel.Section(s.id(), s.title(), s.columns(),
                s.components().stream().map(c -> c.dataSource() == null && c.html() == null && c.css() == null && c.script() == null ? c
                        : new ScreenModel.Component(c.id(), c.type(), c.name(), c.label(),
                        c.required(), c.helpText(), c.placeholder(), c.maxLength(), c.defaultValue(), c.options(), c.validations(), c.readonly(),
                        c.component(), c.params(), null, null, null, null, c.visibleWhen(), c.requiredWhen())).toList())).toList();
        return new ScreenModel(model.name(), model.title(), model.description(), model.changeType(), sections, model.actions(),
                model.stage(), model.channels());
    }

    /** Only what was said through review links; the team's own comments and who resolved what stay internal. */
    static List<ReviewComment> forReviewer(List<DesignStore.Comment> comments) {
        return comments.stream().filter(DesignStore.Comment::fromReview)
                .map(c -> new ReviewComment(c.version(), c.componentId(), c.author(), c.text(), c.createdAt(), c.kind(),
                        c.resolvedAt() != null)).toList();
    }

    /** The workspace a review link belongs to, for the audit log. */
    @Transactional(readOnly = true)
    public UUID workspaceOfReview(String token) {
        return byToken(token).getWorkspaceId();
    }

    @Transactional
    public ReviewView reviewComment(String token, String author, String text, String componentId) {
        ScreenDesign design = byToken(token);
        String body = requireText(text);
        if (body.length() > MAX_COMMENT) {
            throw new BadRequestException("The comment is too long. Keep it under " + MAX_COMMENT + " characters, or send it in parts.");
        }
        store.addComment(design.getId(), design.getCurrentVersion(), target(design, componentId), requireAuthor(author), true, body);
        return review(token);
    }

    @Transactional
    public ReviewView reviewApprove(String token, String author) {
        ScreenDesign design = byToken(token);
        String name = requireAuthor(author);
        // A reviewer cannot confirm elements the version pack forbids: the team approves such a screen (and confirms them)
        if (compatibility != null && !compatibility.unsupported(design.getWorkspaceId(), currentModel(design)).isEmpty()) {
            throw new ConflictException(UNSUPPORTED + "this screen uses components that this OBDX version does not support, so the "
                    + "bank's team has to check and approve it. Add a comment for them, or ask them to approve it.");
        }
        store.addComment(design.getId(), design.getCurrentVersion(), null, name, true,
                "Approved version " + design.getCurrentVersion() + ".", DesignStore.Kind.APPROVAL);
        design.approve(name);
        designs.save(design);
        return reviewView(design, null);
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

    /** The field, section or button a comment is about: one of the screen's current version, or null for the whole screen. */
    private String target(ScreenDesign design, String componentId) {
        String id = blankToNull(componentId);
        ScreenModel model = currentModel(design);
        if (id != null && (model == null || !ScreenModels.contains(model, id))) {
            throw new BadRequestException("That part of the screen is no longer there. Pick it again, or comment on the whole screen.");
        }
        return id;
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
                design.getRequirementId(), components, design.getUpdatedAt(), model == null ? null : model.stage(),
                model == null ? List.of() : model.channels());
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
