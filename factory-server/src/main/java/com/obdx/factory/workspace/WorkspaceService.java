package com.obdx.factory.workspace;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class WorkspaceService {

    private final WorkspaceRepository repository;

    public WorkspaceService(WorkspaceRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<WorkspaceResponse> list() {
        return repository.findAllByOrderByCreatedAtDesc().stream().map(WorkspaceResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public WorkspaceResponse get(UUID id) {
        return repository.findById(id)
                .map(WorkspaceResponse::from)
                .orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }

    @Transactional
    public WorkspaceResponse create(WorkspaceRequest request) {
        String name = request.name().trim();
        if (repository.existsByName(name)) {
            throw new ConflictException("A workspace named '" + name + "' already exists");
        }
        String svnUrl = request.svnUrl() == null || request.svnUrl().isBlank() ? null : request.svnUrl().trim();
        Workspace workspace = new Workspace(name, request.bankName().trim(), request.obdxVersion(), svnUrl);
        return WorkspaceResponse.from(repository.save(workspace));
    }

    @Transactional
    public void delete(UUID id) {
        if (!repository.existsById(id)) {
            throw new NotFoundException("Workspace not found: " + id);
        }
        repository.deleteById(id);
    }
}
