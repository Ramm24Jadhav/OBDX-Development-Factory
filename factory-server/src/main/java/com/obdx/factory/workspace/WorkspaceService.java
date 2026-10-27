package com.obdx.factory.workspace;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.security.SecretCipher;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.svn.SvnCredentials;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

@Service
public class WorkspaceService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceService.class);

    private final WorkspaceRepository repository;
    private final SecretCipher secretCipher;
    private final SvnClient svnClient;
    private final StorageProperties storage;

    public WorkspaceService(WorkspaceRepository repository, SecretCipher secretCipher, SvnClient svnClient,
                            StorageProperties storage) {
        this.repository = repository;
        this.secretCipher = secretCipher;
        this.svnClient = svnClient;
        this.storage = storage;
    }

    @Transactional(readOnly = true)
    public List<WorkspaceResponse> list() {
        return repository.findAllByOrderByCreatedAtDesc().stream().map(WorkspaceResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public WorkspaceResponse get(UUID id) {
        return WorkspaceResponse.from(find(id));
    }

    @Transactional
    public WorkspaceResponse create(WorkspaceRequest request) {
        String name = request.name().trim();
        if (repository.existsByName(name)) {
            throw new ConflictException("A workspace named '" + name + "' already exists");
        }
        Workspace workspace = new Workspace(name, request.bankName().trim(), request.obdxVersion(), blankToNull(request.svnUrl()));
        return WorkspaceResponse.from(repository.save(workspace));
    }

    @Transactional
    public WorkspaceResponse updateSvnSettings(UUID id, SvnSettingsRequest request) {
        Workspace workspace = find(id);
        workspace.setSvnUrl(request.svnUrl().trim());
        workspace.setSvnUsername(blankToNull(request.svnUsername()));
        if (request.svnPassword() != null) {
            workspace.setSvnPasswordEncrypted(request.svnPassword().isEmpty() ? null : secretCipher.encrypt(request.svnPassword()));
        }
        return WorkspaceResponse.from(workspace);
    }

    /** Connects to the workspace's SVN URL with its stored credentials and reports the repository's latest revision. */
    @Transactional(readOnly = true)
    public SvnConnectionResponse testSvnConnection(UUID id) {
        Workspace workspace = find(id);
        if (workspace.getSvnUrl() == null) {
            throw new BadRequestException("Set the workspace's SVN URL first");
        }
        SvnClient.SvnInfo info = svnClient.info(workspace.getSvnUrl(), credentials(workspace));
        return new SvnConnectionResponse(info.url(), info.repositoryRoot(), info.revision());
    }

    public record SvnConnectionResponse(String url, String repositoryRoot, long headRevision) {
    }

    public SvnCredentials credentials(Workspace workspace) {
        String password = workspace.getSvnPasswordEncrypted() == null ? null : secretCipher.decrypt(workspace.getSvnPasswordEncrypted());
        return new SvnCredentials(workspace.getSvnUsername(), password);
    }

    @Transactional
    public void delete(UUID id) {
        if (!repository.existsById(id)) {
            throw new NotFoundException("Workspace not found: " + id);
        }
        repository.deleteById(id);
        Path workspaceDir = storage.workingCopy(id).getParent();
        try {
            FileSystemUtils.deleteRecursively(workspaceDir);
        } catch (IOException e) {
            log.warn("Could not delete files of workspace {} in {}", id, workspaceDir, e);
        }
    }

    private Workspace find(UUID id) {
        return repository.findById(id).orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
