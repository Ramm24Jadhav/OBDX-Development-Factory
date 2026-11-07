package com.obdx.factory.issue;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.issue.IssueRepository.Issue;
import com.obdx.factory.issue.IssueRepository.Link;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Issue links: a lead makes one for a workspace, and the bank's administrators use it to report errors without a
 * factory account. Each report gets its own follow link. Only SHA-256 hashes of the tokens are stored.
 */
@Service
public class IssueLinks {

    static final int DEFAULT_DAYS = 30;
    static final int MAX_DAYS = 90;
    static final int MAX_REPORTS_PER_DAY = 20;
    static final int REQUESTS_PER_MINUTE = 60;
    private static final SecureRandom RANDOM = new SecureRandom();

    public record LinkView(UUID id, String label, OffsetDateTime expiresAt, OffsetDateTime revokedAt, String createdBy,
                           OffsetDateTime createdAt, boolean active) {
    }

    /** @param token shown once, when the link is made */
    public record CreatedLink(LinkView link, String token) {
    }

    /** What the report page shows before anything is sent. */
    public record ReportPage(String bankName, String label, String obdxVersion) {
    }

    public record Reported(String title, String followToken) {
    }

    private final IssueRepository issues;
    private final IssueService service;
    private final IssueFollowUps followUps;
    private final WorkspaceRepository workspaces;
    // shortcut: request counts per address are kept in memory, per factory instance; fine for one server
    private final Map<String, Deque<Long>> requests = new ConcurrentHashMap<>();

    public IssueLinks(IssueRepository issues, IssueService service, IssueFollowUps followUps, WorkspaceRepository workspaces) {
        this.issues = issues;
        this.service = service;
        this.followUps = followUps;
        this.workspaces = workspaces;
    }

    public CreatedLink create(UUID workspaceId, String label, Integer days, String by) {
        if (!workspaces.existsById(workspaceId)) {
            throw new NotFoundException("Workspace not found: " + workspaceId);
        }
        if (label == null || label.isBlank()) {
            throw new BadRequestException("Name the link, for example \"Bank admins, UAT\"");
        }
        int valid = days == null ? DEFAULT_DAYS : Math.clamp(days, 1, MAX_DAYS);
        String token = newToken();
        UUID id = UUID.randomUUID();
        issues.insertLink(id, workspaceId, label.strip().substring(0, Math.min(200, label.strip().length())), hash(token),
                OffsetDateTime.now().plusDays(valid), by);
        return new CreatedLink(view(issues.findLink(id).orElseThrow()), token);
    }

    public List<LinkView> list(UUID workspaceId) {
        return issues.links(workspaceId).stream().map(IssueLinks::view).toList();
    }

    public void revoke(UUID workspaceId, UUID linkId) {
        Link link = issues.findLink(linkId).filter(l -> l.workspaceId().equals(workspaceId))
                .orElseThrow(() -> new NotFoundException("Link not found"));
        issues.revokeLink(link.id());
    }

    private static LinkView view(Link l) {
        boolean active = l.revokedAt() == null && l.expiresAt().isAfter(OffsetDateTime.now());
        return new LinkView(l.id(), l.label(), l.expiresAt(), l.revokedAt(), l.createdBy(), l.createdAt(), active);
    }

    // --- used without signing in, through the token ---

    public ReportPage page(String token, String address) {
        limit(address);
        Link link = activeLink(token);
        Workspace workspace = workspaces.findById(link.workspaceId()).orElseThrow(() -> invalidLink());
        return new ReportPage(workspace.getBankName(), link.label(), workspace.getObdxVersion());
    }

    public Reported report(String token, String address, String name, String email, String description, String environment,
                           String logText, List<IssueService.Upload> uploads) {
        limit(address);
        Link link = activeLink(token);
        String reporter = reporter(name);
        if (email != null && !email.isBlank() && !email.strip().matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
            throw new BadRequestException("Enter a valid email address, or leave it empty");
        }
        if (issues.reportsSince(link.id(), OffsetDateTime.now().minusDays(1)) >= MAX_REPORTS_PER_DAY) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "This link took " + MAX_REPORTS_PER_DAY
                    + " reports in the last day. Try again tomorrow, or contact the support team.");
        }
        IssueService.IssueDetail created = service.create(link.workspaceId(), null, description, environment, logText, uploads,
                "bank: " + reporter, "BANK", email == null ? null : email.strip());
        String follow = newToken();
        issues.insertFollow(created.id(), link.id(), hash(follow));
        issues.addEvent(link.workspaceId(), created.id(), "FILED", reporter + " reported \"" + created.title() + "\" through " + link.label() + ".", false);
        return new Reported(created.title(), follow);
    }

    public IssueFollowUps.FollowView follow(String token, String address) {
        limit(address);
        return followUps.follow(byFollow(token));
    }

    public IssueFollowUps.FollowView works(String token, String address, String name) {
        limit(address);
        Issue issue = byFollow(token);
        String reporter = reporter(name);
        followUps.bankAnswer(issue.id(), "BANK_WORKS", reporter + " said it works now.", "bank: " + reporter);
        return followUps.follow(issues.find(issue.id()).orElseThrow());
    }

    public IssueFollowUps.FollowView stillFailing(String token, String address, String name, String logText, List<IssueService.Upload> uploads) {
        limit(address);
        Issue issue = byFollow(token);
        String reporter = reporter(name);
        boolean evidence = (logText != null && !logText.isBlank()) || !uploads.isEmpty();
        if (evidence && issue.evidence() != null) {
            followUps.check(issue.workspaceId(), issue.id(), logText, uploads, "bank: " + reporter);
        } else {
            followUps.bankAnswer(issue.id(), "BANK_STILL_FAILING", reporter + " said it still fails.", "bank: " + reporter);
        }
        return followUps.follow(issues.find(issue.id()).orElseThrow());
    }

    private Link activeLink(String token) {
        Link link = issues.findLinkByHash(hash(token)).orElseThrow(IssueLinks::invalidLink);
        if (link.revokedAt() != null || !link.expiresAt().isAfter(OffsetDateTime.now()) || !workspaces.existsById(link.workspaceId())) {
            throw invalidLink();
        }
        return link;
    }

    private Issue byFollow(String token) {
        return issues.issueByFollowHash(hash(token)).flatMap(issues::find)
                .orElseThrow(() -> new NotFoundException("This follow link is not valid. Use the link you got when you reported the issue."));
    }

    private static NotFoundException invalidLink() {
        return new NotFoundException("This link is not valid any more. Ask the support team for a new one.");
    }

    private static String reporter(String name) {
        if (name == null || name.isBlank()) {
            throw new BadRequestException("Enter your name, so the support team knows who reported it");
        }
        String n = name.strip().replaceAll("\\s+", " ");
        return n.length() > 100 ? n.substring(0, 100) : n;
    }

    /** At most REQUESTS_PER_MINUTE requests a minute from one address. */
    void limit(String address) {
        long now = System.currentTimeMillis();
        Deque<Long> times = requests.computeIfAbsent(address == null ? "?" : address, k -> new ArrayDeque<>());
        synchronized (times) {
            while (!times.isEmpty() && times.peekFirst() < now - 60_000) {
                times.pollFirst();
            }
            if (times.size() >= REQUESTS_PER_MINUTE) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Wait a minute and try again.");
            }
            times.addLast(now);
        }
        if (requests.size() > 10_000) {
            requests.entrySet().removeIf(e -> e.getValue().isEmpty() || e.getValue().peekLast() < now - 60_000);
        }
    }

    static String newToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((token == null ? "" : token).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
