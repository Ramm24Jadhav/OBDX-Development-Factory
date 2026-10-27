package com.obdx.factory.profile;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.indexing.IndexingProperties;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Project Profile: what a bank's OBDX codebase is built with and how its code is written, detected from the
 * working copy. Developers confirm or correct each fact; their values are kept across scans and win over detection.
 */
@Service
public class ProjectProfileService {

    private static final Pattern MAJOR_VERSION = Pattern.compile("^(\\d{2})\\.");

    private final List<ProfileDetector> detectors;
    private final ProjectProfileRepository repository;
    private final WorkspaceRepository workspaces;
    private final StorageProperties storage;
    private final IndexingProperties indexing;

    public ProjectProfileService(List<ProfileDetector> detectors, ProjectProfileRepository repository,
                                 WorkspaceRepository workspaces, StorageProperties storage, IndexingProperties indexing) {
        this.detectors = detectors;
        this.repository = repository;
        this.workspaces = workspaces;
        this.storage = storage;
        this.indexing = indexing;
    }

    /** One fact as shown to users: the detected value plus any confirmed or corrected value. */
    public record FactView(String key, ProfileFact.Section section, String label, String detectedValue, String value,
                           ProfileFact.Confidence confidence, List<String> evidence, String status, OffsetDateTime updatedAt) {
    }

    public record ProfileResponse(Long revision, OffsetDateTime detectedAt, String declaredObdxVersion,
                                  List<String> warnings, List<FactView> facts) {
    }

    /** Scans the workspace's working copy and stores the detected facts. */
    public ProfileResponse refresh(UUID workspaceId) {
        Workspace workspace = findWorkspace(workspaceId);
        Path workingCopy = storage.workingCopy(workspaceId);
        if (!Files.isDirectory(workingCopy)) {
            throw new BadRequestException("Import the workspace's code first; the profile is detected from it");
        }
        try {
            SourceTree tree = SourceTree.scan(workingCopy, indexing.excludeDirs(), indexing.maxFileSize().toBytes());
            List<ProfileFact> facts = new ArrayList<>();
            for (ProfileDetector detector : detectors) {
                facts.addAll(detector.detect(tree));
            }
            repository.save(workspaceId, workspace.getIndexedRevision(), facts);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not scan the working copy", e);
        }
        return get(workspaceId);
    }

    public ProfileResponse get(UUID workspaceId) {
        Workspace workspace = findWorkspace(workspaceId);
        ProjectProfileRepository.StoredProfile stored = repository.find(workspaceId)
                .orElseThrow(() -> new NotFoundException("No project profile yet. Import the code or click Detect."));
        Map<String, ProjectProfileRepository.Override> overrides = repository.findOverrides(workspaceId);

        List<FactView> views = stored.facts().stream()
                .sorted(Comparator.comparing(ProfileFact::section))
                .map(fact -> view(fact, overrides.get(fact.key())))
                .toList();
        return new ProfileResponse(stored.revision(), stored.detectedAt(), workspace.getObdxVersion(),
                warnings(workspace, views), views);
    }

    public ProfileResponse setValue(UUID workspaceId, String key, String value) {
        requireFact(workspaceId, key);
        if (value == null || value.isBlank()) {
            throw new BadRequestException("Enter a value, or reset the fact to use the detected value");
        }
        repository.saveOverride(workspaceId, key, value.trim());
        return get(workspaceId);
    }

    public ProfileResponse reset(UUID workspaceId, String key) {
        requireFact(workspaceId, key);
        repository.deleteOverride(workspaceId, key);
        return get(workspaceId);
    }

    private static FactView view(ProfileFact fact, ProjectProfileRepository.Override override) {
        String status;
        String value;
        if (override == null) {
            status = fact.value() == null ? "missing" : "detected";
            value = fact.value();
        } else {
            status = override.value().equals(fact.value()) ? "confirmed" : "corrected";
            value = override.value();
        }
        return new FactView(fact.key(), fact.section(), fact.label(), fact.value(), value, fact.confidence(),
                fact.evidence(), status, override == null ? null : override.updatedAt());
    }

    /** Points out where the code disagrees with what the workspace says, such as a different OBDX release. */
    private static List<String> warnings(Workspace workspace, List<FactView> facts) {
        List<String> warnings = new ArrayList<>();
        facts.stream().filter(f -> f.key().equals("obdx.version") && f.value() != null).findFirst().ifPresent(f -> {
            Matcher matcher = MAJOR_VERSION.matcher(f.value());
            String declaredMajor = workspace.getObdxVersion().replace(".x", "");
            if (matcher.find() && !matcher.group(1).equals(declaredMajor)) {
                warnings.add("The workspace is set to OBDX " + workspace.getObdxVersion() + ", but the code looks like OBDX "
                        + f.value() + ". Check the workspace version or correct the detected value.");
            }
        });
        if (workspace.getIndexedRevision() != null && facts.stream().noneMatch(f -> f.value() != null)) {
            warnings.add("Nothing could be detected. Check that the SVN URL points at the OBDX source folder.");
        }
        return warnings;
    }

    private void requireFact(UUID workspaceId, String key) {
        boolean exists = repository.find(workspaceId)
                .map(profile -> profile.facts().stream().anyMatch(fact -> fact.key().equals(key)))
                .orElse(false);
        if (!exists) {
            throw new NotFoundException("Unknown profile fact: " + key);
        }
    }

    private Workspace findWorkspace(UUID id) {
        return workspaces.findById(id).orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }
}
