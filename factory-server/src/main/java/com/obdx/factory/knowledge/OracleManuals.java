package com.obdx.factory.knowledge;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Keeps Oracle's manuals of the OBDX versions an administrator follows current, straight from Oracle's documentation
 * site. A check reads Oracle's index for the version's releases, lists their manuals (the newest patchset's file of
 * each) and asks Oracle for each one only if it changed since the last check. A changed file must pass
 * {@link PdfSafety}, then it is imported like an upload: a manual already there is skipped, a changed one becomes a
 * newer revision and the notes citing changed sections go back to review. One check runs at a time, its requests one
 * after another with a pause, and the reading and embedding go through the library's queue, one document at a time.
 */
@Service
public class OracleManuals {

    private static final Logger log = LoggerFactory.getLogger(OracleManuals.class);
    private static final String IMPORTED_BY = "docs.oracle.com";

    /** A followed version with how its last check went. running: a check is under way or waiting. */
    public record Follow(String obdxVersion, String scope, String followedBy, OffsetDateTime followedAt, String release,
                         OffsetDateTime lastCheckAt, String lastResult, boolean running, int files) {
    }

    private final OracleLibrary library;
    private final KnowledgeImporter importer;
    private final KnowledgeRepository repository;
    private final KnowledgeProperties.Oracle settings;
    private final JdbcTemplate jdbc;
    private final ExecutorService checks = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("oracle-manuals").factory());
    private final Set<String> pending = ConcurrentHashMap.newKeySet();
    private volatile List<OracleLibrary.Release> releases;
    private volatile Instant releasesAt = Instant.EPOCH;

    public OracleManuals(OracleLibrary library, KnowledgeImporter importer, KnowledgeRepository repository, KnowledgeProperties properties,
                         JdbcTemplate jdbc) {
        this.library = library;
        this.importer = importer;
        this.repository = repository;
        this.settings = properties.oracle();
        this.jdbc = jdbc;
    }

    public boolean enabled() {
        return library.enabled();
    }

    public List<Follow> follows() {
        return jdbc.query("""
                SELECT f.*, (SELECT count(*) FROM knowledge_oracle_file o WHERE o.obdx_version = f.obdx_version) AS files
                FROM knowledge_oracle_follow f ORDER BY f.obdx_version DESC""", follow());
    }

    /** The OBDX versions on Oracle's index (22.2, 25.2), newest first; read again at most once an hour. */
    public List<String> versions() {
        requireEnabled();
        return releases().stream().map(r -> KnowledgeImporter.normalizeVersion(r.version())).distinct().toList();
    }

    /** Follows a version (or changes what is taken of it) and checks it now. scope: TECHNICAL or ALL. */
    public Follow follow(String obdxVersion, String scope, String user) {
        requireEnabled();
        String version = KnowledgeImporter.normalizeVersion(obdxVersion);
        String s = "ALL".equalsIgnoreCase(scope) ? "ALL" : "TECHNICAL";
        if (versions().stream().noneMatch(version::equals)) {
            throw new BadRequestException("Oracle's documentation site lists no OBDX " + version + " release.");
        }
        jdbc.update("""
                INSERT INTO knowledge_oracle_follow (obdx_version, scope, followed_by) VALUES (?, ?, ?)
                ON CONFLICT (obdx_version) DO UPDATE SET scope = EXCLUDED.scope""", version, s, user);
        check(version);
        return find(version);
    }

    /** Stops following a version; the manuals already imported stay in the library. */
    public void unfollow(String obdxVersion) {
        String version = KnowledgeImporter.normalizeVersion(obdxVersion);
        if (jdbc.update("DELETE FROM knowledge_oracle_follow WHERE obdx_version = ?", version) == 0) {
            throw new NotFoundException("OBDX " + version + " is not followed");
        }
    }

    /** Queues a check of a followed version; a version already waiting or being checked is not queued twice. */
    public Follow check(String obdxVersion) {
        requireEnabled();
        String version = KnowledgeImporter.normalizeVersion(obdxVersion);
        find(version);
        if (pending.add(version)) {
            jdbc.update("UPDATE knowledge_oracle_follow SET check_started = now() WHERE obdx_version = ?", version);
            checks.execute(() -> {
                try {
                    run(version);
                } finally {
                    pending.remove(version);
                }
            });
        }
        return find(version);
    }

    /** On a schedule: the followed versions whose last check is older than the interval (or never finished). */
    public void checkDue() {
        if (!library.enabled()) {
            return;
        }
        Instant due = Instant.now().minus(settings.checkInterval());
        for (Follow f : follows()) {
            if (f.lastCheckAt() == null || f.lastCheckAt().toInstant().isBefore(due)) {
                check(f.obdxVersion());
            }
        }
    }

    private Follow find(String version) {
        return jdbc.query("""
                SELECT f.*, (SELECT count(*) FROM knowledge_oracle_file o WHERE o.obdx_version = f.obdx_version) AS files
                FROM knowledge_oracle_follow f WHERE f.obdx_version = ?""", follow(), version).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("OBDX " + version + " is not followed"));
    }

    private void requireEnabled() {
        if (!library.enabled()) {
            throw new BadRequestException("Getting manuals from Oracle's site is off on this factory (FACTORY_KNOWLEDGE_ORACLE). "
                    + "Import them from a folder or upload them.");
        }
    }

    private List<OracleLibrary.Release> releases() {
        if (releases == null || releasesAt.isBefore(Instant.now().minus(Duration.ofHours(1)))) {
            releases = library.releases();
            releasesAt = Instant.now();
        }
        return releases;
    }

    // --- a check ---

    private void run(String version) {
        String result;
        String newest = null;
        try {
            var follow = find(version);
            releasesAt = Instant.EPOCH;  // a check always reads the index, so a new release is seen
            List<OracleLibrary.Release> line = releases().stream()
                    .filter(r -> KnowledgeImporter.normalizeVersion(r.version()).equals(version)).limit(3).toList();
            if (line.isEmpty()) {
                throw new IllegalStateException("Oracle's documentation site lists no OBDX " + version + " release now");
            }
            newest = line.getFirst().version();
            List<OracleLibrary.Manual> manuals = new ArrayList<>();
            for (OracleLibrary.Release release : line) {
                manuals.addAll(library.manuals(release));
                library.pause();
            }
            manuals = OracleLibrary.newestOfEach(manuals).stream().filter(m -> "ALL".equals(follow.scope()) || m.technical()).toList();
            if (manuals.isEmpty()) {
                throw new IllegalStateException("No manuals found on Oracle's library page for OBDX " + version);
            }
            int changed = 0;
            int unchanged = 0;
            int refused = 0;
            int failed = 0;
            for (OracleLibrary.Manual manual : manuals) {
                if (jdbc.queryForObject("SELECT count(*) FROM knowledge_oracle_follow WHERE obdx_version = ?", Integer.class, version) == 0) {
                    return;  // no longer followed
                }
                switch (fetch(version, manual)) {
                    case CHANGED -> changed++;
                    case UNCHANGED -> unchanged++;
                    case REFUSED -> refused++;
                    case FAILED -> failed++;
                }
                library.pause();
            }
            // Manuals Oracle no longer lists are forgotten here; their documents stay in the library
            List<String> urls = manuals.stream().map(OracleLibrary.Manual::url).toList();
            jdbc.query("SELECT url FROM knowledge_oracle_file WHERE obdx_version = ?", (rs, n) -> rs.getString(1), version).stream()
                    .filter(u -> !urls.contains(u))
                    .forEach(u -> jdbc.update("DELETE FROM knowledge_oracle_file WHERE url = ?", u));
            result = changed + " new or changed, " + unchanged + " unchanged" + (refused > 0 ? ", " + refused + " refused by the safety check" : "")
                    + (failed > 0 ? ", " + failed + " not downloaded (checked again next time)" : "");
            log.info("Oracle manuals for OBDX {} ({}): {}", version, newest, result);
        } catch (RuntimeException e) {
            result = e.getMessage();
            log.info("Oracle manuals for OBDX {} not checked: {}", version, e.getMessage());
        }
        jdbc.update("UPDATE knowledge_oracle_follow SET last_check_at = now(), last_result = ?, release = COALESCE(?, release) "
                + "WHERE obdx_version = ?", result, newest, version);
    }

    private enum Outcome { CHANGED, UNCHANGED, REFUSED, FAILED }

    private Outcome fetch(String version, OracleLibrary.Manual manual) {
        Map<String, Object> known = jdbc.queryForList("SELECT etag, last_modified, document_id FROM knowledge_oracle_file WHERE url = ?",
                manual.url()).stream().findFirst().orElse(Map.of());
        // A file whose document was removed from the library is downloaded again
        boolean imported = known.get("document_id") != null;
        String etag = imported ? (String) known.get("etag") : null;
        String lastModified = imported ? (String) known.get("last_modified") : null;
        String patchset = patchset(manual.release());
        OracleLibrary.Download download;
        try {
            download = library.download(manual.url(), etag, lastModified);
        } catch (RuntimeException e) {
            save(version, manual, patchset, etag, lastModified, null, "Not downloaded: " + e.getMessage());
            return Outcome.FAILED;
        }
        if (!download.changed()) {
            save(version, manual, patchset, etag, lastModified, null, "Unchanged");
            return Outcome.UNCHANGED;
        }
        Path file = download.file();
        try {
            String problem = PdfSafety.problem(file);
            if (problem != null) {
                log.warn("Oracle manual {} refused: {}", manual.url(), problem);
                save(version, manual, patchset, null, null, null, "Refused by the safety check: " + problem);
                return Outcome.REFUSED;
            }
            byte[] bytes = Files.readAllBytes(file);
            var result = importer.importFile(manual.title() + ".pdf", bytes, version, null, patchset, IMPORTED_BY);
            var document = result.queued().isEmpty() ? repository.findDocument(version, sha256(bytes), null).orElse(null) : result.queued().getFirst();
            save(version, manual, patchset, download.etag(), download.lastModified(), document == null ? null : document.id(),
                    result.queued().isEmpty() ? "Already in the library" : "Imported");
            return result.queued().isEmpty() ? Outcome.UNCHANGED : Outcome.CHANGED;
        } catch (IOException | RuntimeException e) {
            save(version, manual, patchset, null, null, null, "Not imported: " + e.getMessage());
            return Outcome.FAILED;
        } finally {
            OracleLibrary.deleteQuietly(file);
        }
    }

    private void save(String version, OracleLibrary.Manual manual, String patchset, String etag, String lastModified,
                      java.util.UUID documentId, String result) {
        jdbc.update("""
                INSERT INTO knowledge_oracle_file (url, obdx_version, title, patchset, etag, last_modified, document_id, checked_at, result)
                VALUES (?, ?, ?, ?, ?, ?, ?, now(), ?)
                ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, patchset = EXCLUDED.patchset, etag = EXCLUDED.etag,
                    last_modified = EXCLUDED.last_modified, document_id = COALESCE(EXCLUDED.document_id, knowledge_oracle_file.document_id),
                    checked_at = now(), result = EXCLUDED.result""",
                manual.url(), version, manual.title(), patchset, etag, lastModified, documentId, result);
    }

    /** 22.2.6 is a patchset; a release itself (22.2.0.0.0) is not. */
    static String patchset(String release) {
        return release == null || release.matches("\\d+\\.\\d+(\\.0)*") ? null : release;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private RowMapper<Follow> follow() {
        return (rs, n) -> {
            String version = rs.getString("obdx_version");
            return new Follow(version, rs.getString("scope"), rs.getString("followed_by"),
                    rs.getObject("followed_at", OffsetDateTime.class), rs.getString("release"),
                    rs.getObject("last_check_at", OffsetDateTime.class), rs.getString("last_result"),
                    pending.contains(version),
                    rs.getInt("files"));
        };
    }
}
