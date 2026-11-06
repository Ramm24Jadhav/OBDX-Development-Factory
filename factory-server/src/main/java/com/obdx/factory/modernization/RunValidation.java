package com.obdx.factory.modernization;

import com.obdx.factory.change.ChangeBuildStore;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.jenkins.JenkinsClient;
import com.obdx.factory.jenkins.JenkinsSettingsService;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * What Validation shows for a run: the change's latest Jenkins build, its whole test report by suite (each suite typed
 * from its name: unit, functional, API, security, accessibility, UI or performance), line coverage against the
 * workspace's gate, the OBDX rules and service calls of the run's screens, and the build's screenshots as evidence.
 */
@Service
public class RunValidation {

    /** One suite of the report. type: unit, functional, api, security, accessibility, ui or performance. */
    public record Suite(String name, String type, int total, int passed, int failed, int skipped, double seconds, String result) {
    }

    public record Count(int total, int passed, int failed, int skipped) {
    }

    public record FailedCase(String suite, String type, String name, String error) {
    }

    public record BuildFacts(Integer number, String url, String job, String result, int round, OffsetDateTime startedAt, OffsetDateTime finishedAt,
                             List<String> errors, String log) {
    }

    /**
     * published: the job publishes a JUnit report; coverage: line coverage in percent (null: not published); gate: the
     * coverage the workspace's Technology settings ask for.
     */
    public record View(ModernizationService.RunView run, BuildFacts build, boolean published, Count totals, Map<String, Count> byType,
                       List<Suite> suites, List<FailedCase> failed, Double coverage, int gate, List<ModernizationRunService.RuleResult> rules,
                       List<String> calls, List<String> images, String problem) {
    }

    static final List<String> TYPES = List.of("unit", "functional", "api", "security", "accessibility", "ui", "performance");
    private static final Pattern PERCENT = Pattern.compile("([0-9]{1,3})");

    private final ModernizationRunService runs;
    private final ChangeBuildStore builds;
    private final TechnologySettings settings;
    private final JenkinsSettingsService jenkins;

    public RunValidation(ModernizationRunService runs, ChangeBuildStore builds, TechnologySettings settings, JenkinsSettingsService jenkins) {
        this.runs = runs;
        this.builds = builds;
        this.settings = settings;
        this.jenkins = jenkins;
    }

    /** The suite's kind, from words in its name or class (functional, journey and e2e suites, axe, ZAP, Lighthouse ...). */
    static String typeOf(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (n.matches(".*(accessib|a11y|axe|wcag).*")) {
            return "accessibility";
        }
        if (n.matches(".*(security|owasp|zap|dependency-check|vulnerab|sast).*")) {
            return "security";
        }
        if (n.matches(".*(perf|lighthouse|gatling|jmeter|load|k6).*")) {
            return "performance";
        }
        if (n.matches(".*(journey|e2e|functional|playwright|selenium|detox|cypress|acceptance).*")) {
            return "functional";
        }
        if (n.matches(".*(api|service|rest|contract|integration).*")) {
            return "api";
        }
        if (n.matches(".*(visual|snapshot|screenshot|\\.ui\\.|component).*")) {
            return "ui";
        }
        return "unit";
    }

    public View view(UUID workspaceId, UUID runId) {
        ModernizationRunService.RunDetail detail = runs.detail(workspaceId, runId);
        ModernizationService.RunView run = detail.run();
        ChangeBuildStore.Build latest = null;
        if (run.changeId() != null) {
            for (ChangeBuildStore.Build b : builds.list(run.changeId())) {
                if (b.buildNumber() != null) {
                    latest = b;
                }
            }
        }
        ChangeBuildStore.Report report = latest == null ? new ChangeBuildStore.Report(List.of(), false, null, List.of()) : builds.report(latest.id());
        Map<String, List<JenkinsClient.TestCase>> bySuite = new LinkedHashMap<>();
        report.cases().forEach(c -> bySuite.computeIfAbsent(c.suite(), k -> new ArrayList<>()).add(c));
        List<Suite> suites = new ArrayList<>();
        Map<String, int[]> types = new LinkedHashMap<>();
        TYPES.forEach(t -> types.put(t, new int[4]));
        List<FailedCase> failed = new ArrayList<>();
        int[] all = new int[4];
        bySuite.forEach((name, cases) -> {
            String type = typeOf(name + " " + cases.getFirst().className());
            int passed = (int) cases.stream().filter(c -> "PASSED".equals(c.status())).count();
            int fails = (int) cases.stream().filter(c -> "FAILED".equals(c.status())).count();
            int skipped = cases.size() - passed - fails;
            double seconds = cases.stream().mapToDouble(JenkinsClient.TestCase::seconds).sum();
            suites.add(new Suite(name, type, cases.size(), passed, fails, skipped, Math.round(seconds * 10) / 10.0, fails > 0 ? "failed" : "passed"));
            add(types.get(type), cases.size(), passed, fails, skipped);
            add(all, cases.size(), passed, fails, skipped);
            cases.stream().filter(c -> "FAILED".equals(c.status())).forEach(c -> failed.add(new FailedCase(name, type, c.className() + " · " + c.name(), c.error())));
        });
        Map<String, Count> byType = new LinkedHashMap<>();
        types.forEach((t, v) -> byType.put(t, new Count(v[0], v[1], v[2], v[3])));
        BuildFacts facts = latest == null ? null : new BuildFacts(latest.buildNumber(), latest.buildUrl(), latest.job(), latest.result(), latest.round(),
                latest.startedAt(), latest.finishedAt(), latest.errors(), latest.logExcerpt());
        String problem = null;
        if (latest != null && !"SUCCESS".equals(latest.result()) && latest.finishedAt() != null) {
            problem = !latest.errors().isEmpty() ? latest.errors().getFirst() : !failed.isEmpty() ? failed.getFirst().name() + ": " + failed.getFirst().error()
                    : "Jenkins build " + latest.buildNumber() + " ended " + latest.result() + ". Open the log to see why.";
        }
        return new View(run, facts, report.published(), new Count(all[0], all[1], all[2], all[3]), byType, suites, failed, report.coverage(),
                gate(workspaceId, run.technology()), detail.rules(), detail.calls(), report.images(), problem);
    }

    private static void add(int[] v, int total, int passed, int failed, int skipped) {
        v[0] += total;
        v[1] += passed;
        v[2] += failed;
        v[3] += skipped;
    }

    /** The coverage gate of the run's technology (Technology settings, Tests and build); 80 when none is set. */
    int gate(UUID workspaceId, String technology) {
        if (technology == null || !TechnologySettings.TECHNOLOGIES.contains(technology)) {
            return 80;
        }
        String value = settings.get(workspaceId, technology).groups().stream().flatMap(g -> g.rows().stream())
                .filter(r -> "tests.coverage".equals(r.key())).map(TechnologySettings.Row::value).findFirst().orElse("80%");
        Matcher m = PERCENT.matcher(value);
        return m.find() ? Math.min(100, Integer.parseInt(m.group(1))) : 80;
    }

    /** The test report as CSV: one row per suite, then one per failed test. */
    public String reportCsv(UUID workspaceId, UUID runId) {
        View v = view(workspaceId, runId);
        StringBuilder out = new StringBuilder("Suite,Type,Total,Passed,Failed,Skipped,Seconds,Result\n");
        v.suites().forEach(s -> out.append(cell(s.name())).append(',').append(s.type()).append(',').append(s.total()).append(',').append(s.passed())
                .append(',').append(s.failed()).append(',').append(s.skipped()).append(',').append(s.seconds()).append(',').append(s.result()).append('\n'));
        out.append("\nFailed test,Suite,Error\n");
        v.failed().forEach(f -> out.append(cell(f.name())).append(',').append(cell(f.suite())).append(',').append(cell(f.error())).append('\n'));
        out.append("\nLine coverage,").append(v.coverage() == null ? "not published" : v.coverage() + "%").append(",gate ").append(v.gate()).append("%\n");
        return out.toString();
    }

    /** Everything a reviewer needs as evidence: the report, the build log and the build's screenshots, in one zip. */
    public byte[] evidenceZip(UUID workspaceId, UUID runId) {
        View v = view(workspaceId, runId);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            put(zip, "test-report.csv", reportCsv(workspaceId, runId).getBytes(StandardCharsets.UTF_8));
            if (v.build() != null && v.build().log() != null) {
                put(zip, "build-" + v.build().number() + ".log", v.build().log().getBytes(StandardCharsets.UTF_8));
            }
            if (v.build() != null && !v.images().isEmpty()) {
                JenkinsClient client = jenkins.client(workspaceId);
                for (String path : v.images()) {
                    try {
                        put(zip, "screenshots/" + path.replace('\\', '/'), client.artifact(v.build().url(), path));
                    } catch (RuntimeException e) {
                        put(zip, "screenshots/" + path.replace('\\', '/') + ".missing.txt", e.getMessage().getBytes(StandardCharsets.UTF_8));
                    }
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return bytes.toByteArray();
    }

    /** One of the build's screenshots, through the factory (the browser has no Jenkins credentials). */
    public byte[] image(UUID workspaceId, UUID runId, String path) {
        View v = view(workspaceId, runId);
        if (v.build() == null || !v.images().contains(path)) {
            throw new NotFoundException("The build has no image " + path + ".");
        }
        return jenkins.client(workspaceId).artifact(v.build().url(), path);
    }

    private static void put(ZipOutputStream zip, String name, byte[] content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content);
        zip.closeEntry();
    }

    private static String cell(String s) {
        String v = s == null ? "" : s;
        if (!v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }
}
