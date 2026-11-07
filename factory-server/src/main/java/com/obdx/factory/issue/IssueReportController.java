package com.obdx.factory.issue;

import com.obdx.factory.auth.AuditLog;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/**
 * What bank administrators use without signing in, through an issue link (report) or a follow link (one issue). Only
 * the token gives access; everything is limited per address and per link (IssueLinks).
 */
@RestController
public class IssueReportController {

    private final IssueLinks links;
    private final AuditLog audit;

    public IssueReportController(IssueLinks links, AuditLog audit) {
        this.links = links;
        this.audit = audit;
    }

    @GetMapping("/api/issue-report/{token}")
    public IssueLinks.ReportPage page(@PathVariable String token, HttpServletRequest request) {
        return links.page(token, request.getRemoteAddr());
    }

    @PostMapping(path = "/api/issue-report/{token}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IssueLinks.Reported report(@PathVariable String token, HttpServletRequest request,
                                      @RequestParam(value = "name", required = false) String name,
                                      @RequestParam(value = "email", required = false) String email,
                                      @RequestParam(value = "description", required = false) String description,
                                      @RequestParam(value = "environment", required = false) String environment,
                                      @RequestParam(value = "logText", required = false) String logText,
                                      @RequestParam(value = "files", required = false) List<MultipartFile> files) throws IOException {
        IssueLinks.Reported reported = links.report(token, request.getRemoteAddr(), name, email, description, environment, logText,
                IssueController.uploads(files));
        audit.recordAs("issue link: " + name, "ISSUE_REPORTED", null, reported.title(), null);
        return reported;
    }

    @GetMapping("/api/issue-follow/{token}")
    public IssueFollowUps.FollowView follow(@PathVariable String token, HttpServletRequest request) {
        return links.follow(token, request.getRemoteAddr());
    }

    @PostMapping("/api/issue-follow/{token}/works")
    public IssueFollowUps.FollowView works(@PathVariable String token, HttpServletRequest request, @RequestBody NameRequest body) {
        return links.works(token, request.getRemoteAddr(), body.name());
    }

    @PostMapping(path = "/api/issue-follow/{token}/still-failing", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public IssueFollowUps.FollowView stillFailing(@PathVariable String token, HttpServletRequest request,
                                                  @RequestParam(value = "name", required = false) String name,
                                                  @RequestParam(value = "logText", required = false) String logText,
                                                  @RequestParam(value = "files", required = false) List<MultipartFile> files) throws IOException {
        return links.stillFailing(token, request.getRemoteAddr(), name, logText, IssueController.uploads(files));
    }

    public record NameRequest(String name) {
    }
}
