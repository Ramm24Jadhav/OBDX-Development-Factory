package com.obdx.factory.requirements;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.knowledge.KnowledgeService;
import com.obdx.factory.search.CodeSearchService;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Turns requirement documents into reviewed specifications: extract the text, let the model draft a spec, link
 * screens to existing code, collect the analyst's answers to open questions, update the spec with them, approve.
 */
@Service
public class RequirementService {

    private static final Logger log = LoggerFactory.getLogger(RequirementService.class);

    /** Profile facts that help the model ask the right questions. */
    private static final List<String> CONTEXT_FACTS = List.of(
            "obdx.version", "ui.jetVersion", "ui.architecture", "backend.frameworks", "data.databaseType",
            "integration.hostSystems", "conventions.errorCodes");

    private final RequirementRepository requirements;
    private final RequirementSpecRepository specs;
    private final WorkspaceRepository workspaces;
    private final DocumentTextExtractor textExtractor;
    private final SpecDrafter drafter;
    private final ProjectProfileService profiles;
    private final CodeSearchService codeSearch;
    private final StorageProperties storage;
    private final TaskExecutor executor;
    private final KnowledgeService knowledge;

    public RequirementService(RequirementRepository requirements, RequirementSpecRepository specs,
                              WorkspaceRepository workspaces, DocumentTextExtractor textExtractor, SpecDrafter drafter,
                              ProjectProfileService profiles, CodeSearchService codeSearch, StorageProperties storage,
                              @Qualifier("requirementExecutor") TaskExecutor executor, KnowledgeService knowledge) {
        this.requirements = requirements;
        this.specs = specs;
        this.workspaces = workspaces;
        this.textExtractor = textExtractor;
        this.drafter = drafter;
        this.profiles = profiles;
        this.codeSearch = codeSearch;
        this.storage = storage;
        this.executor = executor;
        this.knowledge = knowledge;
    }

    public record RequirementSummary(UUID id, String title, String fileName, Requirement.Status status, String message,
                                     Integer currentVersion, int screens, int openQuestions,
                                     OffsetDateTime createdAt, OffsetDateTime updatedAt) {
    }

    public record RequirementDetail(UUID id, UUID workspaceId, String title, String fileName, int sizeBytes,
                                    Requirement.Status status, String message, Integer currentVersion,
                                    OffsetDateTime createdAt, OffsetDateTime updatedAt, OffsetDateTime approvedAt,
                                    String approvedBy, String documentText, RequirementSpec spec) {
    }

    public record Answer(int index, String answer) {
    }

    // --- create ---

    public RequirementDetail upload(UUID workspaceId, String title, String fileName, byte[] bytes) {
        requireWorkspace(workspaceId);
        String text = textExtractor.extract(fileName, bytes);
        String name = title == null || title.isBlank() ? stripExtension(fileName) : title.trim();
        Requirement requirement = requirements.save(new Requirement(workspaceId, truncate(name, 300), fileName, bytes.length, text));
        saveOriginal(requirement, fileName, bytes);
        return startDraft(requirement);
    }

    public RequirementDetail fromText(UUID workspaceId, String title, String text) {
        requireWorkspace(workspaceId);
        if (text == null || text.isBlank()) {
            throw new BadRequestException("Describe the requirement");
        }
        String name = title == null || title.isBlank() ? truncate(text.strip().lines().findFirst().orElse("Requirement"), 80) : title.trim();
        Requirement requirement = requirements.save(new Requirement(workspaceId, truncate(name, 300), null,
                text.length(), text.strip()));
        return startDraft(requirement);
    }

    // --- read ---

    @Transactional(readOnly = true)
    public List<RequirementSummary> list(UUID workspaceId) {
        requireWorkspace(workspaceId);
        return requirements.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream().map(requirement -> {
            RequirementSpec spec = currentSpec(requirement);
            return new RequirementSummary(requirement.getId(), requirement.getTitle(), requirement.getFileName(),
                    requirement.getStatus(), requirement.getMessage(), requirement.getCurrentVersion(),
                    spec == null ? 0 : spec.screens().size(),
                    spec == null ? 0 : (int) spec.openQuestions().stream().filter(q -> q.answer() == null).count(),
                    requirement.getCreatedAt(), requirement.getUpdatedAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public RequirementDetail get(UUID id) {
        return detail(find(id));
    }

    // --- review ---

    /** Saves answers to open questions (by position in the list) as a new spec version. */
    public RequirementDetail saveAnswers(UUID id, List<Answer> answers) {
        Requirement requirement = requireStatus(find(id), Requirement.Status.READY);
        RequirementSpec spec = currentSpec(requirement);
        List<RequirementSpec.OpenQuestion> questions = new ArrayList<>(spec.openQuestions());
        for (Answer answer : answers) {
            if (answer.index() < 0 || answer.index() >= questions.size()) {
                throw new BadRequestException("There is no open question number " + (answer.index() + 1));
            }
            RequirementSpec.OpenQuestion q = questions.get(answer.index());
            String text = answer.answer() == null || answer.answer().isBlank() ? null : answer.answer().trim();
            questions.set(answer.index(), q.withAnswer(text));
        }
        return addVersion(requirement, RequirementSpecRepository.Origin.ANSWERED, withQuestions(spec, questions, spec.decisions()),
                "Answers saved. Click \"Update spec with answers\" to apply them.");
    }

    /** Turns answered questions into decisions and lets the model update the spec with them, in the background. */
    public RequirementDetail refine(UUID id) {
        Requirement requirement = requireStatus(find(id), Requirement.Status.READY);
        RequirementSpec spec = currentSpec(requirement);
        List<RequirementSpec.OpenQuestion> answered = spec.openQuestions().stream().filter(q -> q.answer() != null).toList();
        if (answered.isEmpty()) {
            throw new BadRequestException("Answer at least one open question first");
        }
        List<RequirementSpec.Decision> decisions = new ArrayList<>(spec.decisions());
        answered.forEach(q -> decisions.add(new RequirementSpec.Decision(q.question(), q.answer())));
        RequirementSpec withDecisions = withQuestions(spec,
                spec.openQuestions().stream().filter(q -> q.answer() == null).toList(), decisions);

        requirement.processing("Updating the spec with " + answered.size() + " answer(s)...");
        requirements.save(requirement);
        executor.execute(() -> runRefine(requirement.getId(), withDecisions));
        return detail(requirement);
    }

    /** Replaces the spec with an analyst's edited JSON. */
    public RequirementDetail updateSpec(UUID id, String specJson) {
        Requirement requirement = requireStatus(find(id), Requirement.Status.READY);
        RequirementSpec edited;
        try {
            edited = SpecParser.parse(specJson, requirement.getTitle());
        } catch (SpecParser.InvalidSpecException e) {
            throw new BadRequestException(e.getMessage());
        }
        return addVersion(requirement, RequirementSpecRepository.Origin.EDITED, edited, "Spec edited.");
    }

    public RequirementDetail approve(UUID id, String by) {
        Requirement requirement = requireStatus(find(id), Requirement.Status.READY);
        RequirementSpec spec = currentSpec(requirement);
        long open = spec.openQuestions().size();
        if (open > 0) {
            throw new BadRequestException("Resolve the " + open + " open question(s) first: answer them and update the spec, "
                    + "or remove them by editing the spec.");
        }
        if (spec.screens().isEmpty()) {
            throw new BadRequestException("The spec has no screens to build yet");
        }
        requirement.approve(by);
        return detail(requirements.save(requirement));
    }

    /** Drafts the spec again from the document, for example after a failure. */
    public RequirementDetail retry(UUID id) {
        Requirement requirement = find(id);
        if (requirement.getStatus() == Requirement.Status.PROCESSING || requirement.getStatus() == Requirement.Status.APPROVED) {
            throw new ConflictException("The requirement is " + requirement.getStatus().name().toLowerCase() + "; it cannot be drafted again now");
        }
        return startDraft(requirement);
    }

    @Transactional
    public void delete(UUID id) {
        Requirement requirement = find(id);
        requirements.delete(requirement);
        try {
            FileSystemUtils.deleteRecursively(originalDir(requirement));
        } catch (IOException e) {
            log.warn("Could not delete the uploaded file of requirement {}", id, e);
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void failInterrupted() {
        // Updating a spec with answers: the spec and the answers are kept, so it is not drafted again from the start
        int updating = requirements.readyAgain("Updating the spec with the answers was interrupted because the server restarted. "
                + "The answers are kept: click Update spec with answers again.", OffsetDateTime.now());
        if (updating > 0) {
            log.warn("{} requirement(s) were being updated with answers when the server stopped; their specs are kept", updating);
        }
        int count = requirements.failProcessing("Interrupted because the server restarted. Click Retry.", OffsetDateTime.now());
        if (count > 0) {
            log.warn("Marked {} requirement(s) as failed after restart", count);
        }
    }

    // --- background work ---

    private RequirementDetail startDraft(Requirement requirement) {
        requirement.processing("Drafting the spec from the document...");
        requirements.save(requirement);
        executor.execute(() -> runDraft(requirement.getId()));
        return detail(requirement);
    }

    void runDraft(UUID id) {
        Requirement requirement = find(id);
        try {
            RequirementSpec spec = drafter.draft(requirement.getTitle(), requirement.getDocumentText(), systemContext(requirement.getWorkspaceId(),
                    requirement.getTitle() + "\n" + head(requirement.getDocumentText(), 1500)), progress -> {
                        // A long document on a local model takes a while: the page shows how far it is
                        requirement.processing(progress);
                        requirements.save(requirement);
                    });
            // The document's own tables and lists (requirements, rules, criteria, questions) exactly as written
            spec = DocumentStructure.apply(spec, DocumentStructure.read(requirement.getDocumentText()));
            spec = SpecGrounding.apply(spec, requirement.getDocumentText());
            spec = linkRelatedCode(requirement.getWorkspaceId(), spec, Map.of());
            int version = specs.add(id, RequirementSpecRepository.Origin.DRAFTED, spec);
            requirement.ready(version, "Spec drafted: " + spec.screens().size() + " screen(s), "
                    + spec.openQuestions().size() + " open question(s).");
        } catch (RuntimeException e) {
            log.error("Drafting the spec for requirement {} failed", id, e);
            requirement.failed("Drafting failed: " + e.getMessage());
        }
        requirements.save(requirement);
    }

    void runRefine(UUID id, RequirementSpec withDecisions) {
        Requirement requirement = find(id);
        try {
            RequirementSpec refined = drafter.refine(withDecisions, systemContext(requirement.getWorkspaceId(), requirement.getTitle()));
            // Decisions are kept exactly as the analyst gave them, and answered questions must not come back.
            Set<String> decided = withDecisions.decisions().stream().map(d -> SpecMerger.normalize(d.question())).collect(Collectors.toSet());
            List<RequirementSpec.OpenQuestion> stillOpen = refined.openQuestions().stream()
                    .filter(q -> !decided.contains(SpecMerger.normalize(q.question())))
                    .map(q -> q.withAnswer(null))
                    .toList();
            Map<String, List<String>> previousCode = withDecisions.screens().stream()
                    .collect(Collectors.toMap(s -> SpecMerger.normalize(s.name()), RequirementSpec.Screen::relatedCode, (a, b) -> a));
            RequirementSpec result = linkRelatedCode(requirement.getWorkspaceId(),
                    withQuestions(refined, stillOpen, withDecisions.decisions()), previousCode);
            result = DocumentStructure.apply(result, DocumentStructure.read(requirement.getDocumentText()));
            result = SpecGrounding.apply(result, requirement.getDocumentText());
            int version = specs.add(id, RequirementSpecRepository.Origin.REFINED, result);
            requirement.ready(version, "Spec updated with the answers; " + result.openQuestions().size() + " open question(s) left.");
        } catch (RuntimeException e) {
            log.error("Updating the spec for requirement {} failed", id, e);
            requirement.ready(requirement.getCurrentVersion(), "Updating with the answers failed: " + e.getMessage()
                    + ". The answers are kept; try again.");
        }
        requirements.save(requirement);
    }

    // --- helpers ---

    private static String head(String text, int max) {
        return text == null ? "" : text.length() <= max ? text : text.substring(0, max);
    }

    /**
     * Facts from the confirmed Project Profile, so the model knows what the bank runs, and what the OBDX knowledge base
     * (manuals and approved notes for the workspace's version) says about the requirement. Empty if there is neither.
     */
    private String systemContext(UUID workspaceId, String about) {
        String facts;
        try {
            facts = profiles.get(workspaceId).facts().stream()
                    .filter(f -> CONTEXT_FACTS.contains(f.key()) && f.value() != null)
                    .map(f -> "- " + f.label() + ": " + f.value())
                    .collect(Collectors.joining("\n"));
        } catch (NotFoundException e) {
            facts = "";
        }
        String known = knowledge.contextFor(workspaceId, about, 4000);
        return known.isBlank() ? facts : facts + (facts.isEmpty() ? "" : "\n\n")
                + "OBDX knowledge (Oracle manuals and approved notes; use it for how OBDX does this):\n" + known;
    }

    /** Adds up to three existing files that look related to each screen, found by code search. */
    private RequirementSpec linkRelatedCode(UUID workspaceId, RequirementSpec spec, Map<String, List<String>> known) {
        List<RequirementSpec.Screen> screens = new ArrayList<>();
        for (RequirementSpec.Screen screen : spec.screens()) {
            List<String> related = screen.relatedCode().isEmpty()
                    ? known.getOrDefault(SpecMerger.normalize(screen.name()), List.of()) : screen.relatedCode();
            if (related.isEmpty()) {
                related = searchRelated(workspaceId, screen);
            }
            screens.add(new RequirementSpec.Screen(screen.name(), screen.changeType(), screen.description(),
                    screen.reference(), screen.fields(), screen.actions(), related));
        }
        return spec.withScreens(screens);
    }

    private List<String> searchRelated(UUID workspaceId, RequirementSpec.Screen screen) {
        String asWritten = screen.name() + " " + screen.fields().stream().limit(6).map(RequirementSpec.Field::name).collect(Collectors.joining(" "));
        // In OBDX's own words too: a BRD's "beneficiary" is a payee in the code
        String inCode = com.obdx.factory.knowledge.ObdxGlossary.inManualWords(asWritten);
        String query = inCode == null ? asWritten : asWritten + " " + inCode;
        try {
            Set<String> paths = new LinkedHashSet<>();
            for (CodeSearchService.SearchResult result : codeSearch.search(workspaceId, query, 10).results()) {
                paths.add(result.path());
                if (paths.size() == 3) {
                    break;
                }
            }
            return List.copyOf(paths);
        } catch (RuntimeException e) {
            log.debug("Code search for screen '{}' failed: {}", screen.name(), e.getMessage());
            return List.of();
        }
    }

    private RequirementDetail addVersion(Requirement requirement, RequirementSpecRepository.Origin origin, RequirementSpec spec, String message) {
        int version = specs.add(requirement.getId(), origin, spec);
        requirement.ready(version, message);
        return detail(requirements.save(requirement));
    }

    private static RequirementSpec withQuestions(RequirementSpec spec, List<RequirementSpec.OpenQuestion> questions,
                                                 List<RequirementSpec.Decision> decisions) {
        return spec.withQuestions(questions, decisions);
    }

    private RequirementDetail detail(Requirement r) {
        return new RequirementDetail(r.getId(), r.getWorkspaceId(), r.getTitle(), r.getFileName(), r.getSizeBytes(),
                r.getStatus(), r.getMessage(), r.getCurrentVersion(), r.getCreatedAt(), r.getUpdatedAt(), r.getApprovedAt(),
                r.getApprovedBy(), r.getDocumentText(), currentSpec(r));
    }

    private RequirementSpec currentSpec(Requirement requirement) {
        return requirement.getCurrentVersion() == null ? null
                : specs.find(requirement.getId(), requirement.getCurrentVersion()).orElse(null);
    }

    private Requirement requireStatus(Requirement requirement, Requirement.Status status) {
        if (requirement.getStatus() != status) {
            throw new ConflictException("The requirement is " + requirement.getStatus().name().toLowerCase()
                    + "; this needs it to be " + status.name().toLowerCase());
        }
        return requirement;
    }

    private Requirement find(UUID id) {
        return requirements.findById(id).orElseThrow(() -> new NotFoundException("Requirement not found: " + id));
    }

    private void requireWorkspace(UUID workspaceId) {
        if (!workspaces.existsById(workspaceId)) {
            throw new NotFoundException("Workspace not found: " + workspaceId);
        }
    }

    private void saveOriginal(Requirement requirement, String fileName, byte[] bytes) {
        try {
            Path dir = originalDir(requirement);
            Files.createDirectories(dir);
            Files.write(dir.resolve(Path.of(fileName).getFileName().toString()), bytes);
        } catch (IOException | RuntimeException e) {
            log.warn("Could not keep the uploaded file of requirement {}", requirement.getId(), e);
        }
    }

    private Path originalDir(Requirement requirement) {
        return storage.workingCopy(requirement.getWorkspaceId()).getParent().resolve("requirements").resolve(requirement.getId().toString());
    }

    private static String stripExtension(String fileName) {
        String name = Path.of(fileName).getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
