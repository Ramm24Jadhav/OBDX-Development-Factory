package com.obdx.factory.modernization;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.indexing.IndexingProperties;
import com.obdx.factory.profile.SourceTree;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The modernization inventory of each workspace: scanned from the imported code after every import (and on demand),
 * stored as one JSON document, and exported for planning.
 */
@Service
public class InventoryService {

    private final InventoryRepository repository;
    private final WorkspaceRepository workspaces;
    private final StorageProperties storage;
    private final IndexingProperties indexing;

    public InventoryService(InventoryRepository repository, WorkspaceRepository workspaces, StorageProperties storage,
                            IndexingProperties indexing) {
        this.repository = repository;
        this.workspaces = workspaces;
        this.storage = storage;
        this.indexing = indexing;
    }

    /** Told each step of a scan as it starts (0: read the files, 1: find screens and modules, 3: save); can stop it. */
    public interface Progress {
        void step(int index);

        boolean stopped();

        Progress NONE = new Progress() {
            public void step(int index) {
            }

            public boolean stopped() {
                return false;
            }
        };
    }

    /** Thrown when a scan is stopped between steps; nothing is saved. */
    public static class Stopped extends RuntimeException {
        public Stopped() {
            super("The analysis was stopped; the last analysis stays.");
        }
    }

    /** Scans the workspace's working copy and stores the inventory. The workspace's new app (if any) is left out. */
    public Inventory scan(UUID workspaceId) {
        return scan(workspaceId, Progress.NONE);
    }

    public Inventory scan(UUID workspaceId, Progress progress) {
        Workspace workspace = workspaces.findById(workspaceId).orElseThrow(() -> new NotFoundException("Workspace not found: " + workspaceId));
        Path workingCopy = storage.workingCopy(workspaceId);
        if (!Files.isDirectory(workingCopy)) {
            throw new BadRequestException("Import the workspace's code first; the inventory is scanned from it");
        }
        try {
            progress.step(0);
            SourceTree tree = SourceTree.scan(workingCopy, indexing.excludeDirs(), indexing.maxFileSize().toBytes());
            if (progress.stopped()) {
                throw new Stopped();
            }
            progress.step(1);
            Inventory inventory = InventoryScanner.scan(tree, workspace.getIndexedRevision(),
                    "jet".equals(workspace.getTarget()) ? null : workspace.getAppFolder());
            if (progress.stopped()) {
                throw new Stopped();
            }
            progress.step(3);
            repository.save(workspaceId, inventory);
            return inventory;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the working copy", e);
        }
    }

    public Optional<Inventory> find(UUID workspaceId) {
        return repository.find(workspaceId);
    }

    /** The screens as CSV (Excel-friendly, UTF-8 with BOM) for wave planning. */
    public String screensCsv(UUID workspaceId) {
        Inventory inventory = find(workspaceId).orElseThrow(() -> new NotFoundException("The workspace has not been scanned yet"));
        StringBuilder csv = new StringBuilder("﻿Module,Screen,Kind,Complexity,Score,Fields,Actions,Services,Opens,Lines,Files\r\n");
        for (Inventory.Screen s : inventory.screens()) {
            csv.append(String.join(",", List.of(cell(s.module()), cell(s.name()), cell(s.kind()), cell(s.complexity()),
                    String.valueOf(s.score()), String.valueOf(s.fields().size()), String.valueOf(s.actions()), cell(String.join("; ", s.calls())),
                    cell(s.opens().stream().map(InventoryService::lastSegment).collect(Collectors.joining("; "))), String.valueOf(s.lines()),
                    cell(String.join("; ", s.files()))))).append("\r\n");
        }
        return csv.toString();
    }

    private static String lastSegment(String id) {
        return id.substring(id.lastIndexOf('/') + 1);
    }

    private static String cell(String value) {
        String text = value == null ? "" : value;
        // A leading =, +, - or @ would be read as a formula by spreadsheet programs.
        if (!text.isEmpty() && "=+-@".indexOf(text.charAt(0)) >= 0) {
            text = "'" + text;
        }
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }

    /** Stores one inventory per workspace as JSON. */
    @org.springframework.stereotype.Repository
    public static class InventoryRepository {

        private final JdbcTemplate jdbc;
        private final ObjectMapper json;

        public InventoryRepository(JdbcTemplate jdbc, ObjectMapper json) {
            this.jdbc = jdbc;
            this.json = json;
        }

        void save(UUID workspaceId, Inventory inventory) {
            jdbc.update("INSERT INTO modernization_inventory (workspace_id, revision, scanned_at, inventory) VALUES (?, ?, ?, ?::jsonb) "
                            + "ON CONFLICT (workspace_id) DO UPDATE SET revision = EXCLUDED.revision, scanned_at = EXCLUDED.scanned_at, "
                            + "inventory = EXCLUDED.inventory",
                    workspaceId, inventory.revision(), Timestamp.from(inventory.scannedAt().toInstant()), json.writeValueAsString(inventory));
        }

        Optional<Inventory> find(UUID workspaceId) {
            return jdbc.query("SELECT inventory FROM modernization_inventory WHERE workspace_id = ?",
                    (rs, row) -> json.readValue(rs.getString("inventory"), Inventory.class), workspaceId).stream().findFirst();
        }
    }
}
