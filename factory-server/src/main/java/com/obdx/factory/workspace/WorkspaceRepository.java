package com.obdx.factory.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {

    boolean existsByName(String name);

    List<Workspace> findAllByOrderByCreatedAtDesc();
}
