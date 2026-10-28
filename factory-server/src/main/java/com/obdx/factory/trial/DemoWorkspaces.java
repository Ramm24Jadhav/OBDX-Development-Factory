package com.obdx.factory.trial;

import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.importing.ImportService;
import com.obdx.factory.workspace.WorkspaceRequest;
import com.obdx.factory.workspace.WorkspaceResponse;
import com.obdx.factory.workspace.WorkspaceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * With the trial database, adds the demo SVN repositories that create-demo-svn made (the demo-svn folder next to the
 * factory) as workspaces and imports them, so they appear without typing their file:// URLs. A repository named like
 * bank-a-22 becomes workspace bank-a-22 of "Bank A" on OBDX 22.x. Existing workspaces are left alone.
 */
@Component
@ConditionalOnBooleanProperty("factory.trial-database.enabled")
public class DemoWorkspaces {

    private static final Logger log = LoggerFactory.getLogger(DemoWorkspaces.class);
    private static final Pattern DEMO_NAME = Pattern.compile("([a-z0-9]+(?:-[a-z0-9]+)*)-(22|25)");

    private final WorkspaceService workspaces;
    private final ImportService imports;
    private final AuditLog audit;
    private final Path folder;

    public DemoWorkspaces(WorkspaceService workspaces, ImportService imports, AuditLog audit,
                          @Value("${factory.trial-database.demo-svn}") Path folder) {
        this.workspaces = workspaces;
        this.imports = imports;
        this.audit = audit;
        this.folder = folder;
    }

    /** After {@link ImportService#failInterruptedJobs()}, which would otherwise mark the new imports as interrupted. */
    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.LOWEST_PRECEDENCE)
    public void addDemoRepositories() {
        if (!Files.isDirectory(folder)) {
            return;
        }
        Set<String> existing = workspaces.list().stream().map(WorkspaceResponse::name).collect(Collectors.toSet());
        for (Path repository : repositories()) {
            String name = repository.getFileName().toString();
            Matcher demo = DEMO_NAME.matcher(name);
            if (existing.contains(name) || !demo.matches()) {
                continue;
            }
            String url = repository.toAbsolutePath().toUri().toString().replaceAll("/+$", "") + "/trunk";
            WorkspaceResponse created = workspaces.create(new WorkspaceRequest(name, bankName(demo.group(1)), demo.group(2) + ".x", url));
            audit.recordAs("system", "WORKSPACE_CREATED", created.id(), created.name(), "Demo repository " + url);
            imports.start(created.id());
            log.info("Added demo workspace {} ({}) and started importing it", name, url);
        }
    }

    /** SVN repositories (folders with a "format" file and a "db" folder) directly in the demo folder. */
    private List<Path> repositories() {
        try (Stream<Path> children = Files.list(folder)) {
            return children.filter(p -> Files.isRegularFile(p.resolve("format")) && Files.isDirectory(p.resolve("db"))).sorted().toList();
        } catch (IOException e) {
            log.warn("Could not read the demo repositories in {}: {}", folder.toAbsolutePath(), e.getMessage());
            return List.of();
        }
    }

    /** "bank-a" gives "Bank A". */
    static String bankName(String prefix) {
        return Stream.of(prefix.split("-"))
                .map(word -> word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1))
                .collect(Collectors.joining(" "));
    }
}
