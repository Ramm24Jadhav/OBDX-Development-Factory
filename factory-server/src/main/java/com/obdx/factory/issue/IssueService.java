package com.obdx.factory.issue;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.issue.IssueRepository.Issue;
import com.obdx.factory.issue.IssueRepository.IssueFile;
import com.obdx.factory.issue.IssueRepository.Knowledge;
import com.obdx.factory.issue.IssueRepository.Status;
import com.obdx.factory.knowledge.KnowledgeImporter;
import com.obdx.factory.knowledge.KnowledgePolicy;
import com.obdx.factory.knowledge.KnowledgeRepository;
import com.obdx.factory.knowledge.KnowledgeSearch;
import com.obdx.factory.model.ModelGatewayException;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.search.CodeSearchService;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Issue Analyzer: a bank's error report with its logs and screenshots becomes evidence (found without a model),
 * matching code and configuration of the bank (found with code search), similar solved issues, and a diagnosis with
 * fix steps (from the chat model). Analysis runs in the background; the page polls the issue.
 */
@Service
public class IssueService {

    private static final Logger log = LoggerFactory.getLogger(IssueService.class);

    static final Set<String> ENVIRONMENTS = Set.of("DEV", "SIT", "UAT", "PROD");
    static final int MAX_FILES = 10;
    static final int MAX_LOG_BYTES = 5 * 1024 * 1024;
    static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final int MAX_QUERIES = 8;
    private static final int MAX_CODE_ITEMS = 8;
    private static final int MAX_SNIPPET = 1500;
    private static final int MAX_NOTES = 4;
    private static final int MAX_MANUAL_SECTIONS = 3;
    private static final int MAX_LIBRARY_QUERIES = 5;

    /** A file sent with a new issue. */
    public record Upload(String name, byte[] content) {
    }

    public record IssueSummary(UUID id, String title, Status status, String category, String environment, String createdBy,
                               OffsetDateTime createdAt, OffsetDateTime updatedAt, String source, UUID groupId) {
    }

    /**
     * @param sharedKnowledgeId the shared knowledge made from this issue; null when not shared
     * @param group             the other issues with the same error (repeated issues); empty when alone
     * @param checks            fix checks and the bank's answers, oldest first
     * @param checkFiles        the files sent with fix checks
     */
    public record IssueDetail(UUID id, UUID workspaceId, String title, String description, String environment, String logText,
                              Status status, String message, Evidence evidence, Diagnosis diagnosis, String resolution,
                              String srDraft, List<IssueFile> files, String createdBy, OffsetDateTime createdAt,
                              OffsetDateTime updatedAt, UUID sharedKnowledgeId, String source, String reporterEmail,
                              OffsetDateTime releasedAt, UUID groupId, List<IssueSummary> group, List<IssueRepository.Check> checks,
                              List<IssueFile> checkFiles, List<IssueRepository.Question> questions) {
    }

    public record ShareRequest(String title, String component, String category, String rootCause, String resolution) {
    }

    /** Shared knowledge as every workspace sees it: without the source workspace and issue. */
    public record KnowledgeView(UUID id, String obdxVersion, String component, String category, String title, String rootCause,
                                String resolution, String sharedBy, OffsetDateTime sharedAt, boolean canWithdraw) {
    }

    private final IssueRepository issues;
    private final IssueAnalyzer analyzer;
    private final CodeSearchService codeSearch;
    private final ProjectProfileService profiles;
    private final WorkspaceRepository workspaces;
    private final KnowledgeSearch knowledgeSearch;
    private final KnowledgeRepository knowledgeDocuments;
    private final TaskExecutor executor;
    private final Duration repeatWindow;
    private final ScreenshotBlur blur;
    private final LiveChecks liveChecks;
    private final KnowledgePolicy knowledgePolicy;

    public IssueService(IssueRepository issues, IssueAnalyzer analyzer, CodeSearchService codeSearch, ProjectProfileService profiles,
                        WorkspaceRepository workspaces, KnowledgeSearch knowledgeSearch, KnowledgeRepository knowledgeDocuments,
                        @Qualifier("issueExecutor") TaskExecutor executor,
                        @Value("${factory.issue.repeat-window:24h}") Duration repeatWindow, ScreenshotBlur blur, LiveChecks liveChecks,
                        KnowledgePolicy knowledgePolicy) {
        this.knowledgePolicy = knowledgePolicy;
        this.blur = blur;
        this.liveChecks = liveChecks;
        this.issues = issues;
        this.analyzer = analyzer;
        this.codeSearch = codeSearch;
        this.profiles = profiles;
        this.workspaces = workspaces;
        this.knowledgeSearch = knowledgeSearch;
        this.knowledgeDocuments = knowledgeDocuments;
        this.executor = executor;
        this.repeatWindow = repeatWindow;
    }

    public List<IssueSummary> list(UUID workspaceId) {
        return issues.list(workspaceId).stream().map(IssueService::summary).toList();
    }

    private static IssueSummary summary(Issue i) {
        return new IssueSummary(i.id(), i.title(), i.status(), i.diagnosis() == null ? null : i.diagnosis().category(), i.environment(),
                i.createdBy(), i.createdAt(), i.updatedAt(), i.source(), i.groupId());
    }

    public IssueDetail detail(UUID workspaceId, UUID id) {
        Issue issue = find(workspaceId, id);
        List<IssueSummary> group = issue.groupId() == null ? List.of()
                : issues.group(issue.groupId()).stream().filter(i -> !i.id().equals(id)).map(IssueService::summary).toList();
        List<IssueFile> checkFiles = issues.allFiles(id).stream().filter(f -> f.checkId() != null).toList();
        return new IssueDetail(issue.id(), issue.workspaceId(), issue.title(), issue.description(), issue.environment(), issue.logText(),
                issue.status(), issue.message(), issue.evidence(), issue.diagnosis(), issue.resolution(), issue.srDraft(),
                issues.files(id), issue.createdBy(), issue.createdAt(), issue.updatedAt(),
                issues.knowledgeOf(id).map(Knowledge::id).orElse(null), issue.source(), issue.reporterEmail(), issue.releasedAt(),
                issue.groupId(), group, issues.checks(id), checkFiles, issues.questions(id));
    }

    /** Creates the issue and starts analyzing it. No transaction: the analysis thread must see the inserted rows. */
    public IssueDetail create(UUID workspaceId, String title, String description, String environment, String logText,
                              List<Upload> uploads, String username) {
        return create(workspaceId, title, description, environment, logText, uploads, username, "FACTORY", null);
    }

    /** @param source FACTORY or BANK (through an issue link); reporterEmail: the bank's contact, optional */
    public IssueDetail create(UUID workspaceId, String title, String description, String environment, String logText,
                              List<Upload> uploads, String username, String source, String reporterEmail) {
        if (!workspaces.existsById(workspaceId)) {
            throw new NotFoundException("Workspace not found: " + workspaceId);
        }
        String env = environment == null || environment.isBlank() ? null : environment.strip().toUpperCase(Locale.ROOT);
        if (env != null && !ENVIRONMENTS.contains(env)) {
            throw new BadRequestException("Environment must be one of DEV, SIT, UAT or PROD");
        }
        if (uploads.size() > MAX_FILES) {
            throw new BadRequestException("Attach at most " + MAX_FILES + " files");
        }
        if (blank(description) && blank(logText) && uploads.isEmpty()) {
            throw new BadRequestException("Describe the error, paste a log or attach a log or screenshot");
        }
        List<String[]> kinds = uploads.stream().map(IssueService::kindOf).toList();
        String name = blank(title) ? firstLine(description, logText, uploads) : title.strip();
        UUID id = UUID.randomUUID();
        issues.insert(id, workspaceId, cap(name, 300), blankToNull(description), env, blankToNull(logText), username, source,
                blankToNull(cap(reporterEmail, 200)));
        for (int i = 0; i < uploads.size(); i++) {
            issues.insertFile(id, i, cap(uploads.get(i).name(), 300), kinds.get(i)[0], kinds.get(i)[1], uploads.get(i).content(), null);
        }
        return analyze(workspaceId, id);
    }

    /** Starts (or repeats) the analysis in the background. */
    public IssueDetail analyze(UUID workspaceId, UUID id) {
        Issue issue = find(workspaceId, id);
        if (issue.status() == Status.ANALYZING) {
            throw new BadRequestException("The issue is being analyzed; wait until it finishes");
        }
        issues.startAnalysis(id, "Reading the evidence, the bank's code and the Library, then asking the model...");
        executor.execute(() -> run(id));
        return detail(workspaceId, id);
    }

    void run(UUID id) {
        Issue issue = issues.find(id).orElse(null);
        if (issue == null) {
            return;
        }
        List<String> notes = new ArrayList<>();
        Evidence evidence = Evidence.empty();
        try {
            Workspace workspace = workspaces.findById(issue.workspaceId()).orElseThrow();
            hideCustomerData(id, issues.files(id), notes);
            readScreenshots(id, notes);
            evidence = withLiveChecks(id, withLibrary(workspace, withCode(issue.workspaceId(), LogEvidenceParser.parse(sources(issue)))));
            List<Diagnosis.Similar> similar = similar(issue.workspaceId(), id, evidence.signature());
            IssueAnalyzer.Context context = context(issue, workspace);
            if (!context.libraryAllowed() && evidence.items().stream().anyMatch(i -> i.kind().equals("ORACLE_NOTE") || i.kind().equals("MANUAL"))) {
                notes.add("Matching Oracle notes and manuals are listed with the evidence but were not given to the model: "
                        + knowledgePolicy.chatProblem());
            }
            Diagnosis diagnosis = analyzer.diagnose(context, evidence, similar);
            issues.saveAnalysis(id, evidence, diagnosis, Status.DIAGNOSED, notes.isEmpty() ? null : String.join(" ", notes));
            issues.addEvent(issue.workspaceId(), id, "ANALYZED", "The diagnosis of \"" + issue.title() + "\" is ready: "
                    + diagnosis.category().toLowerCase(Locale.ROOT).replace('_', ' ') + ".", false);
            group(issue, evidence.signature());
        } catch (ModelGatewayException e) {
            issues.saveAnalysis(id, evidence, null, Status.FAILED,
                    "The model could not be used: " + e.getMessage() + " Check the Models page, then analyze again.");
            issues.addEvent(issue.workspaceId(), id, "ANALYZED", "Analyzing \"" + issue.title() + "\" failed: the model could not be used.", true);
        } catch (RuntimeException e) {
            log.warn("Issue analysis {} failed", id, e);
            issues.saveAnalysis(id, evidence, null, Status.FAILED, e.getMessage());
            issues.addEvent(issue.workspaceId(), id, "ANALYZED", "Analyzing \"" + issue.title() + "\" failed.", true);
        }
    }

    /**
     * Blacks out customer data in screenshots not checked yet, when the chat model is on this machine; the blurred
     * copy replaces the original.
     */
    void hideCustomerData(UUID id, List<IssueFile> files, List<String> notes) {
        if (!blur.enabled()) {
            return;
        }
        for (IssueFile file : files) {
            if (!file.kind().equals("SCREENSHOT") || file.hiddenAreas() != null) {
                continue;
            }
            try {
                ScreenshotBlur.Result result = blur.blur(issues.fileContent(id, file.position()).orElseThrow(), file.mimeType());
                if (result.hidden() != null) {
                    issues.replaceScreenshot(id, file.position(), result.image(), result.hidden());
                }
                if (result.note() != null) {
                    notes.add(file.name() + ": " + result.note());
                }
            } catch (ModelGatewayException e) {
                notes.add("Customer data in the screenshots could not be hidden (" + e.getMessage() + ").");
                return;
            }
        }
    }

    /** The results of live checks (L ids), so the next diagnosis knows what the factory could reach. */
    Evidence withLiveChecks(UUID id, Evidence evidence) {
        List<Evidence.Item> items = new ArrayList<>(evidence.items());
        int n = 0;
        for (IssueRepository.Check check : issues.checks(id)) {
            if (check.result().startsWith("LIVE_")) {
                items.add(new Evidence.Item("L" + ++n, "LIVE_CHECK", "live check " + check.createdAt().atZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalDate(), null, check.summary()));
            }
        }
        return n == 0 ? evidence : new Evidence(items, evidence.signature());
    }

    /** The hosts and ports of an issue that can be checked live. */
    public List<LiveChecks.Target> liveTargets(UUID workspaceId, UUID id) {
        return LiveChecks.targets(find(workspaceId, id).evidence());
    }

    /** A read-only check of a host the issue mentions, from the factory; kept with the fix checks. */
    public IssueDetail liveCheck(UUID workspaceId, UUID id, String host, Integer port, String by) {
        Issue issue = find(workspaceId, id);
        LiveChecks.Target target = LiveChecks.targets(issue.evidence()).stream()
                .filter(t -> t.host().equalsIgnoreCase(host == null ? "" : host.strip()) && port != null && t.port() == port)
                .findFirst().orElseThrow(() -> new BadRequestException("Only hosts and ports found in this issue can be checked"));
        LiveChecks.Result result;
        try {
            result = liveChecks.check(target);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(e.getMessage());
        }
        Evidence details = new Evidence(result.details().stream().map(d -> new Evidence.Item("D", "LIVE_DETAIL", target.label(), null, d)).toList(), "");
        issues.insertCheck(UUID.randomUUID(), id, result.result(), result.summary(), details, by);
        issues.touch(id);
        return detail(workspaceId, id);
    }

    /** Removes a screenshot (for example when customer data is still visible); analyze again afterwards. */
    public IssueDetail removeScreenshot(UUID workspaceId, UUID id, int position) {
        Issue issue = find(workspaceId, id);
        if (issue.status() == Status.ANALYZING) {
            throw new BadRequestException("Wait until the analysis finishes");
        }
        boolean screenshot = issues.allFiles(id).stream().anyMatch(f -> f.position() == position && f.kind().equals("SCREENSHOT"));
        if (!screenshot || !issues.deleteFile(id, position)) {
            throw new NotFoundException("Screenshot not found: " + position);
        }
        issues.touch(id);
        return detail(workspaceId, id);
    }

    /** The issue events the user should see: all for leads, else those of issues they filed or released. */
    public List<IssueRepository.Event> events(UUID workspaceId, String username, boolean all) {
        return issues.events(workspaceId, OffsetDateTime.now().minusDays(30), username, all);
    }

    /** Reads screenshots that have no text yet; when the chat model cannot, notes why and goes on with text only. */
    private void readScreenshots(UUID id, List<String> notes) {
        readScreenshots(id, issues.files(id), notes);
    }

    void readScreenshots(UUID id, List<IssueFile> files, List<String> notes) {
        for (IssueFile file : files) {
            if (!file.kind().equals("SCREENSHOT") || file.extractedText() != null) {
                continue;
            }
            try {
                byte[] image = issues.fileContent(id, file.position()).orElseThrow();
                issues.setExtractedText(id, file.position(), analyzer.readScreenshot(image, file.mimeType()));
            } catch (ModelGatewayException e) {
                notes.add("The chat model could not read the screenshots (" + e.getMessage() + "). Type the error text under each "
                        + "screenshot and analyze again, or choose a chat model that reads images on the Models page.");
                return;
            }
        }
    }

    private List<LogEvidenceParser.Source> sources(Issue issue) {
        List<LogEvidenceParser.Source> sources = new ArrayList<>();
        sources.add(new LogEvidenceParser.Source("description", issue.description(), false));
        sources.add(new LogEvidenceParser.Source("pasted log", issue.logText(), false));
        sources.addAll(fileSources(issue.id(), issues.files(issue.id())));
        return sources;
    }

    /** Logs as text and screenshots as the text read from them. Re-reads the files, so screenshot text is current. */
    List<LogEvidenceParser.Source> fileSources(UUID issueId, List<IssueFile> files) {
        List<LogEvidenceParser.Source> sources = new ArrayList<>();
        Map<Integer, String> texts = issues.allFiles(issueId).stream().filter(f -> f.extractedText() != null)
                .collect(Collectors.toMap(IssueFile::position, IssueFile::extractedText));
        for (IssueFile file : files) {
            if (file.kind().equals("SCREENSHOT")) {
                sources.add(new LogEvidenceParser.Source(file.name(), texts.get(file.position()), true));
            } else {
                byte[] content = issues.fileContent(issueId, file.position()).orElse(new byte[0]);
                sources.add(new LogEvidenceParser.Source(file.name(), new String(content, StandardCharsets.UTF_8), false));
            }
        }
        return sources;
    }

    /** Adds the bank's code and configuration that the code search finds for the frames, keys, codes and hosts. */
    Evidence withCode(UUID workspaceId, Evidence evidence) {
        Set<String> queries = new LinkedHashSet<>();
        for (Evidence.Item item : evidence.items()) {
            String query = switch (item.kind()) {
                case "FRAME" -> frameQuery(item.text());
                case "KEY", "ERROR_CODE" -> item.text().split(" in: ")[0];
                case "URL" -> host(item.text());
                default -> null;
            };
            if (query != null && !query.isBlank()) {
                queries.add(query);
            }
        }
        Map<String, Evidence.Item> code = new LinkedHashMap<>();
        for (String query : queries.stream().limit(MAX_QUERIES).toList()) {
            try {
                for (CodeSearchService.SearchResult result : codeSearch.search(workspaceId, query, 3).results()) {
                    code.putIfAbsent(result.path() + ":" + result.startLine(), new Evidence.Item(null, "CODE", result.path(),
                            result.startLine(), cap(result.snippet(), MAX_SNIPPET)));
                }
            } catch (RuntimeException e) {
                log.debug("Code search for '{}' failed: {}", query, e.getMessage());
            }
            if (code.size() >= MAX_CODE_ITEMS) {
                break;
            }
        }
        List<Evidence.Item> items = new ArrayList<>(evidence.items());
        int n = 1;
        for (Evidence.Item item : code.values().stream().limit(MAX_CODE_ITEMS).toList()) {
            items.add(new Evidence.Item("C" + n++, item.kind(), item.source(), item.line(), item.text()));
        }
        return new Evidence(items, evidence.signature());
    }

    /**
     * Adds the Oracle notes (O ids) and OBDX manual sections (M ids) the Library finds for the evidence, for the
     * workspace's OBDX version: shared documents and the bank's own.
     */
    Evidence withLibrary(Workspace workspace, Evidence evidence) {
        List<String> wordings = libraryQueries(evidence);
        if (wordings.isEmpty()) {
            return evidence;
        }
        List<KnowledgeSearch.Hit> hits;
        try {
            hits = knowledgeSearch.search(wordings, KnowledgeImporter.versionLine(workspace.getObdxVersion()), workspace.getId(), 12, false).hits();
        } catch (RuntimeException e) {
            log.debug("Library search for issue evidence failed: {}", e.getMessage());
            return evidence;
        }
        Map<UUID, KnowledgeRepository.Document> documents = knowledgeDocuments.documents(
                hits.stream().map(KnowledgeSearch.Hit::documentId).filter(Objects::nonNull).collect(Collectors.toSet()));
        List<Evidence.Item> items = new ArrayList<>(evidence.items());
        int notes = 0;
        int manuals = 0;
        for (KnowledgeSearch.Hit hit : hits) {
            KnowledgeRepository.Document document = hit.documentId() == null ? null : documents.get(hit.documentId());
            boolean note = document != null && KnowledgeRepository.Document.ORACLE_NOTE.equals(document.kind());
            if (note ? notes >= MAX_NOTES : manuals >= MAX_MANUAL_SECTIONS) {
                continue;
            }
            String id = note ? "O" + ++notes : "M" + ++manuals;
            String version = hit.obdxVersion() == null ? null : hit.obdxVersion() + (hit.patchset() == null ? "" : ", patchset " + hit.patchset());
            String source = hit.title() + (hit.heading() == null || hit.heading().isBlank() ? "" : " > " + hit.heading());
            items.add(new Evidence.Item(id, note ? "ORACLE_NOTE" : "MANUAL", source, hit.pageFrom() > 0 ? hit.pageFrom() : null,
                    cap(hit.text(), MAX_SNIPPET), hit.documentId(), note ? document.reference() : null, version));
        }
        return new Evidence(items, evidence.signature());
    }

    /** What to look up in the Library: error codes, the root exception and its message, screenshot errors, the top frame. */
    static List<String> libraryQueries(Evidence evidence) {
        Set<String> queries = new LinkedHashSet<>();
        for (Evidence.Item item : evidence.items()) {
            switch (item.kind()) {
                case "ERROR_CODE" -> queries.add(item.text().split(" in: ")[0]);
                case "CAUSE", "EXCEPTION" -> queries.add(cap(item.text(), 150));
                case "SCREENSHOT" -> item.text().lines().filter(l -> l.startsWith("Error message:") || l.startsWith("Error code:"))
                        .map(l -> l.substring(l.indexOf(':') + 1).strip()).filter(l -> !l.isEmpty()).forEach(queries::add);
                case "FRAME" -> {
                    if (queries.stream().noneMatch(q -> q.startsWith("frame:"))) {
                        queries.add("frame:" + frameQuery(item.text()));
                    }
                }
                default -> {
                }
            }
        }
        return queries.stream().map(q -> q.startsWith("frame:") ? q.substring(6) : q).limit(MAX_LIBRARY_QUERIES).toList();
    }

    IssueAnalyzer.Context context(Issue issue, Workspace workspace) {
        return new IssueAnalyzer.Context(issue.title(), issue.description(), issue.environment(), workspace.getObdxVersion(),
                profile(issue.workspaceId()), knowledgePolicy.chatAllowed());
    }

    /** Joins the group of an issue of the same workspace with the same error, filed within the repeat window. */
    void group(Issue issue, String signature) {
        if (signature == null || signature.isBlank()) {
            return;
        }
        for (Issue other : issues.filedBetween(issue.workspaceId(), issue.id(), issue.createdAt().minus(repeatWindow),
                issue.createdAt().plus(repeatWindow))) {
            if (Signatures.sameError(signature, other.signature())) {
                UUID groupId = other.groupId() != null ? other.groupId() : other.id();
                if (other.groupId() == null) {
                    issues.setGroup(other.id(), groupId);
                }
                issues.setGroup(issue.id(), groupId);
                int size = issues.group(groupId).size();
                issues.addEvent(issue.workspaceId(), issue.id(), "GROUPED", size + " issues with the same error, latest \"" + issue.title()
                        + "\": probably one outage or configuration problem.", false);
                return;
            }
        }
    }

    /** Shows the diagnosis to the bank on the issue's follow link. */
    public IssueDetail release(UUID workspaceId, UUID id, String by) {
        Issue issue = find(workspaceId, id);
        if (issue.diagnosis() == null || issue.status() == Status.ANALYZING) {
            throw new BadRequestException("Release a diagnosis once the analysis has finished");
        }
        issues.setReleased(id, OffsetDateTime.now(), by);
        return detail(workspaceId, id);
    }

    /** The same outcome for every issue of the group (the same error reported several times). */
    public IssueDetail groupOutcome(UUID workspaceId, UUID id, Status status, String resolution) {
        Issue issue = find(workspaceId, id);
        if (issue.groupId() == null) {
            throw new BadRequestException("This issue is not in a group");
        }
        for (Issue member : issues.group(issue.groupId())) {
            if (member.status() != Status.ANALYZING) {
                outcome(workspaceId, member.id(), status, resolution);
            }
        }
        return detail(workspaceId, id);
    }

    /** "com.bank.payments.FundTransferService.transfer(FundTransferService.java:142)" becomes "FundTransferService transfer". */
    static String frameQuery(String frame) {
        String method = frame.contains("(") ? frame.substring(0, frame.indexOf('(')) : frame;
        String[] parts = method.split("\\.");
        return parts.length < 2 ? method : parts[parts.length - 2] + " " + parts[parts.length - 1].replaceAll("[<>$].*", "");
    }

    static String host(String url) {
        try {
            return URI.create(url).getHost();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Solved issues of this workspace and shared knowledge whose signatures share the most tokens with this one. */
    List<Diagnosis.Similar> similar(UUID workspaceId, UUID issueId, String signature) {
        Set<String> tokens = tokens(signature);
        if (tokens.isEmpty()) {
            return List.of();
        }
        record Scored(Diagnosis.Similar similar, long score) {
        }
        List<Scored> scored = new ArrayList<>();
        for (Issue past : issues.resolved(workspaceId, issueId)) {
            long score = tokens(past.signature()).stream().filter(tokens::contains).count();
            if (score > 0 && past.diagnosis() != null) {
                scored.add(new Scored(new Diagnosis.Similar(past.title(), past.diagnosis().category(), past.diagnosis().rootCause(),
                        past.resolution(), false, past.id().toString()), score));
            }
        }
        for (Knowledge k : issues.knowledge()) {
            long score = tokens(k.signature()).stream().filter(tokens::contains).count();
            if (score > 0 && !issueId.equals(k.sourceIssueId())) {
                scored.add(new Scored(new Diagnosis.Similar(k.title(), k.category(), k.rootCause(), k.resolution(), true, null), score));
            }
        }
        return scored.stream().sorted(Comparator.comparingLong(Scored::score).reversed()).limit(3).map(Scored::similar).toList();
    }

    private static Set<String> tokens(String signature) {
        return signature == null || signature.isBlank() ? Set.of() : new LinkedHashSet<>(Arrays.asList(signature.split(" ")));
    }

    private String profile(UUID workspaceId) {
        try {
            return profiles.get(workspaceId).facts().stream().filter(f -> f.value() != null)
                    .map(f -> "- " + f.label() + ": " + f.value()).collect(Collectors.joining("\n"));
        } catch (NotFoundException e) {
            return "";
        }
    }

    public IssueDetail updateScreenshotText(UUID workspaceId, UUID id, int position, String text) {
        find(workspaceId, id);
        if (!issues.setExtractedText(id, position, text == null ? "" : cap(text.strip(), 5000))) {
            throw new NotFoundException("Screenshot not found: " + position);
        }
        return detail(workspaceId, id);
    }

    public IssueDetail outcome(UUID workspaceId, UUID id, Status status, String resolution) {
        Issue issue = find(workspaceId, id);
        if (status != Status.RESOLVED && status != Status.NOT_RESOLVED && status != Status.ESCALATED) {
            throw new BadRequestException("The outcome must be RESOLVED, NOT_RESOLVED or ESCALATED");
        }
        if (issue.status() == Status.ANALYZING) {
            throw new BadRequestException("Wait until the analysis finishes");
        }
        if (status == Status.RESOLVED && blank(resolution)) {
            throw new BadRequestException("Say what fixed it, so the next similar issue can use it");
        }
        issues.setOutcome(id, status, blankToNull(resolution));
        return detail(workspaceId, id);
    }

    /** A draft Oracle Service Request to copy into My Oracle Support, with secrets and customer numbers masked. */
    public IssueDetail srDraft(UUID workspaceId, UUID id) {
        Issue issue = find(workspaceId, id);
        Workspace workspace = workspaces.findById(workspaceId).orElseThrow();
        Diagnosis d = issue.diagnosis();
        Evidence evidence = issue.evidence() == null ? Evidence.empty() : issue.evidence();
        StringBuilder sr = new StringBuilder();
        sr.append("# ").append(issue.title()).append("\n\n## Summary\n")
                .append(d != null && d.summary() != null ? d.summary() : blankTo(issue.description(), "(describe the problem)")).append("\n\n");
        sr.append("## Environment\n- OBDX version: ").append(blankTo(workspace.getObdxVersion(), "(fill in)"))
                .append(" (add the patch level)\n- Environment: ").append(blankTo(issue.environment(), "(fill in)")).append("\n\n");
        sr.append("## Problem description\n").append(blankTo(issue.description(), "(describe the problem)")).append("\n\n");
        sr.append("## Steps to reproduce\n1. (fill in the steps that make the error happen)\n\n");
        sr.append("## Expected and actual behaviour\n- Expected: (fill in)\n- Actual: ")
                .append(d != null ? d.summary() : "(fill in)").append("\n\n");
        List<Evidence.Item> errors = evidence.items().stream()
                .filter(i -> Set.of("EXCEPTION", "CAUSE", "ERROR_CODE", "HTTP_STATUS", "FRAME", "SCREENSHOT").contains(i.kind())).toList();
        if (!errors.isEmpty()) {
            sr.append("## Error details\n");
            errors.forEach(i -> sr.append("- ").append(i.kind().toLowerCase(Locale.ROOT).replace('_', ' ')).append(" (")
                    .append(i.source()).append(i.line() == null ? "" : ":" + i.line()).append("): ").append(i.text().replace("\n", "; ")).append('\n'));
            sr.append('\n');
        }
        List<Evidence.Item> lines = evidence.items().stream().filter(i -> i.kind().equals("ERROR_LINE")).toList();
        if (!lines.isEmpty()) {
            sr.append("## Log extract\n```\n");
            lines.forEach(i -> sr.append(i.text()).append('\n'));
            sr.append("```\n\n");
        }
        sr.append("## Investigation so far\n");
        if (d != null) {
            sr.append("- Analysis: ").append(d.category()).append(", ").append(d.state().toLowerCase(Locale.ROOT)).append(": ")
                    .append(d.rootCause()).append('\n');
            d.steps().forEach(s -> sr.append("- Suggested check: ").append(s.action()).append('\n'));
            if (!d.similar().isEmpty()) {
                sr.append("- Similar issues checked: ").append(d.similar().stream().map(Diagnosis.Similar::title).collect(Collectors.joining("; ")))
                        .append('\n');
            }
            List<Diagnosis.OracleReference> oracle = d.oracleReferences() == null ? List.of() : d.oracleReferences();
            oracle.stream().filter(r -> "ORACLE_NOTE".equals(r.kind())).forEach(r -> sr.append("- Oracle note checked: ").append(r.title())
                    .append(r.reference() == null ? "" : " (" + r.reference() + ")").append(r.version() == null ? "" : ", for " + r.version())
                    .append(r.why() == null ? "" : ": " + r.why()).append('\n'));
        } else {
            sr.append("- (not analyzed yet)\n");
        }
        for (IssueRepository.Check check : issues.checks(id)) {
            sr.append(check.result().startsWith("LIVE_") ? "- Live check (" : "- Fix check (")
                    .append(check.createdAt().atZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalDate()).append("): ")
                    .append(check.summary()).append('\n');
        }
        if (!blank(issue.resolution())) {
            sr.append("- Tried: ").append(issue.resolution()).append('\n');
        }
        List<IssueFile> screenshots = issues.files(id).stream().filter(f -> f.kind().equals("SCREENSHOT")).toList();
        if (!screenshots.isEmpty()) {
            sr.append("\n## Attachments\nAttach in My Oracle Support (crop customer data first): ")
                    .append(screenshots.stream().map(IssueFile::name).collect(Collectors.joining(", "))).append('\n');
        }
        sr.append("\n## Business impact\n(fill in: who is affected and how badly)\n");
        issues.setSrDraft(id, SecretMasker.mask(sr.toString()));
        return detail(workspaceId, id);
    }

    public void delete(UUID workspaceId, UUID id) {
        find(workspaceId, id);
        issues.delete(id);
    }

    /** Shares a resolved issue as product knowledge for every workspace, refusing bank data. */
    public KnowledgeView share(UUID workspaceId, UUID id, ShareRequest request, String username) {
        Issue issue = find(workspaceId, id);
        if (issue.status() != Status.RESOLVED) {
            throw new BadRequestException("Only resolved issues can be shared");
        }
        if (issues.knowledgeOf(id).isPresent()) {
            throw new BadRequestException("This issue is already shared");
        }
        if (request == null || blank(request.title()) || blank(request.rootCause()) || blank(request.resolution())) {
            throw new BadRequestException("Fill in the title, root cause and resolution");
        }
        String category = request.category() == null ? "" : request.category().strip().toUpperCase(Locale.ROOT);
        if (!Diagnosis.CATEGORIES.contains(category)) {
            throw new BadRequestException("Choose a category");
        }
        Workspace workspace = workspaces.findById(workspaceId).orElseThrow();
        String all = String.join("\n", request.title(), blankTo(request.component(), ""), request.rootCause(), request.resolution());
        List<String> bankData = SecretMasker.bankData(all, Set.of(workspace.getBankName(), workspace.getName()));
        if (!bankData.isEmpty()) {
            throw new BadRequestException("Remove bank-specific details before sharing: " + String.join(", ", bankData));
        }
        Knowledge knowledge = new Knowledge(UUID.randomUUID(), id, workspaceId, workspace.getObdxVersion(),
                blankToNull(SecretMasker.mask(cap(blankTo(request.component(), ""), 200))), category, issue.signature(),
                SecretMasker.mask(cap(request.title().strip(), 300)), SecretMasker.mask(request.rootCause().strip()),
                SecretMasker.mask(request.resolution().strip()), username, OffsetDateTime.now());
        issues.insertKnowledge(knowledge);
        return view(knowledge, username, false);
    }

    public List<KnowledgeView> knowledge(String username, boolean admin) {
        return issues.knowledge().stream().map(k -> view(k, username, admin)).toList();
    }

    public void withdraw(UUID knowledgeId, String username, boolean admin) {
        Knowledge knowledge = issues.findKnowledge(knowledgeId).orElseThrow(() -> new NotFoundException("Shared knowledge not found"));
        if (!admin && !knowledge.sharedBy().equals(username)) {
            throw new AccessDeniedException("Only the person who shared it or an administrator can withdraw it");
        }
        issues.deleteKnowledge(knowledgeId);
    }

    private static KnowledgeView view(Knowledge k, String username, boolean admin) {
        return new KnowledgeView(k.id(), k.obdxVersion(), k.component(), k.category(), k.title(), k.rootCause(), k.resolution(),
                k.sharedBy(), k.sharedAt(), admin || k.sharedBy().equals(username));
    }

    public byte[] file(UUID workspaceId, UUID id, int position) {
        find(workspaceId, id);
        return issues.fileContent(id, position).orElseThrow(() -> new NotFoundException("File not found: " + position));
    }

    public String mimeType(UUID id, int position) {
        return issues.allFiles(id).stream().filter(f -> f.position() == position).map(IssueFile::mimeType).findFirst().orElse("application/octet-stream");
    }

    @EventListener(ApplicationReadyEvent.class)
    public void failInterrupted() {
        int count = issues.failRunning("Interrupted because the server restarted. Analyze again.");
        if (count > 0) {
            log.warn("Marked {} issue analysis(es), check(s) or answer(s) as failed after restart", count);
        }
    }

    Issue find(UUID workspaceId, UUID id) {
        return issues.find(id).filter(i -> i.workspaceId().equals(workspaceId))
                .orElseThrow(() -> new NotFoundException("Issue not found: " + id));
    }

    /** {kind, mime type} of an uploaded file, checking its type and size. */
    static String[] kindOf(Upload upload) {
        String name = upload.name() == null ? "" : upload.name().toLowerCase(Locale.ROOT);
        byte[] c = upload.content();
        if (name.endsWith(".log") || name.endsWith(".txt") || name.endsWith(".out")) {
            if (c.length > MAX_LOG_BYTES) {
                throw new BadRequestException(upload.name() + " is larger than 5 MB; attach the part around the error");
            }
            return new String[]{"LOG", "text/plain"};
        }
        boolean png = c.length > 4 && (c[0] & 0xFF) == 0x89 && c[1] == 'P' && c[2] == 'N' && c[3] == 'G';
        boolean jpeg = c.length > 3 && (c[0] & 0xFF) == 0xFF && (c[1] & 0xFF) == 0xD8 && (c[2] & 0xFF) == 0xFF;
        if ((name.endsWith(".png") && png) || ((name.endsWith(".jpg") || name.endsWith(".jpeg")) && jpeg)) {
            if (c.length > MAX_IMAGE_BYTES) {
                throw new BadRequestException(upload.name() + " is larger than 10 MB");
            }
            return new String[]{"SCREENSHOT", png ? "image/png" : "image/jpeg"};
        }
        throw new BadRequestException(upload.name() + ": attach logs (.log, .txt, .out) or screenshots (.png, .jpg)");
    }

    private static String firstLine(String description, String logText, List<Upload> uploads) {
        String text = !blank(description) ? description : !blank(logText) ? logText : null;
        if (text == null) {
            return "Issue from " + uploads.getFirst().name();
        }
        return title(text.strip().lines().findFirst().orElse("Issue").strip());
    }

    /** The first sentence of a line, at most 100 characters (cut at a word). */
    static String title(String line) {
        java.util.regex.Matcher sentence = java.util.regex.Pattern.compile("^(.{12,}?[.!?])\\s").matcher(line + " ");
        String first = sentence.find() ? sentence.group(1) : line;
        if (first.length() <= 100) {
            return first;
        }
        int space = first.lastIndexOf(' ', 99);
        return first.substring(0, space > 40 ? space : 99) + "...";
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String blankToNull(String value) {
        return blank(value) ? null : value.strip();
    }

    private static String blankTo(String value, String fallback) {
        return blank(value) ? fallback : value;
    }

    private static String cap(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
