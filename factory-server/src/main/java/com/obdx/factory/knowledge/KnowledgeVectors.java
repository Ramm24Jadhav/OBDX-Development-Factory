package com.obdx.factory.knowledge;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.PriorityQueue;
import java.util.UUID;

/**
 * Finds the manual sections nearest to a question by meaning, in memory. The trial database has no pgvector: there
 * embeddings are text and every SQL search parses all of them again (seconds for the manuals of two versions). Here
 * they are parsed once and compared in Java (milliseconds). With pgvector the SQL search is used instead: this
 * reports {@link #inUse()} false. The copy is refreshed when sections were embedded or removed since it was loaded,
 * at most every {@link #REFRESH_MILLIS} while an import is embedding; a removed section that is still in the copy is
 * dropped when the results are loaded.
 */
@Component
public class KnowledgeVectors {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeVectors.class);
    private static final long REFRESH_MILLIS = 20_000;
    // Beyond this the copy would take too much memory; the SQL search is used
    private static final int MAX_SECTIONS = 200_000;

    private final JdbcTemplate jdbc;
    private volatile Boolean inUse;
    private volatile Snapshot snapshot;
    private volatile boolean changed = true;

    public KnowledgeVectors(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private record Snapshot(UUID[] ids, UUID[] workspaceIds, String[] versionLines, float[][] vectors, long loadedAt) {
    }

    /** True on the trial database (vector is its text stand-in), where this in-memory search replaces the SQL one. */
    public boolean inUse() {
        Boolean known = inUse;
        if (known == null) {
            List<String> type = jdbc.queryForList("SELECT typtype::text FROM pg_type WHERE typname = 'vector'", String.class);
            known = !type.isEmpty() && "d".equals(type.getFirst());
            inUse = known;
        }
        return known;
    }

    /** Sections were embedded, replaced or removed: the next search loads them again. */
    public void changed() {
        changed = true;
    }

    /**
     * The ids of the nearest sections, nearest first, among the Oracle manuals and the given workspace's documents
     * for one version line (null: every version). Null when there are too many sections to keep in memory.
     */
    public List<UUID> nearest(float[] query, String versionLine, UUID workspaceId, int limit) {
        Snapshot s = current();
        if (s == null) {
            return null;
        }
        float[] q = normalized(query);
        PriorityQueue<double[]> best = new PriorityQueue<>((a, b) -> Double.compare(a[0], b[0]));
        for (int i = 0; i < s.ids().length; i++) {
            float[] v = s.vectors()[i];
            if (v.length != q.length
                    || (s.workspaceIds()[i] != null && !s.workspaceIds()[i].equals(workspaceId))
                    || (versionLine != null && s.versionLines()[i] != null && !versionLine.equals(s.versionLines()[i]))) {
                continue;
            }
            double dot = 0;
            for (int d = 0; d < q.length; d++) {
                dot += q[d] * v[d];
            }
            if (best.size() < limit) {
                best.add(new double[]{dot, i});
            } else if (dot > best.peek()[0]) {
                best.poll();
                best.add(new double[]{dot, i});
            }
        }
        List<UUID> ids = new ArrayList<>(best.size());
        while (!best.isEmpty()) {
            ids.addFirst(s.ids()[(int) best.poll()[1]]);
        }
        return ids;
    }

    private Snapshot current() {
        Snapshot s = snapshot;
        if (s != null && (!changed || System.currentTimeMillis() - s.loadedAt() < REFRESH_MILLIS)) {
            return s;
        }
        synchronized (this) {
            s = snapshot;
            if (s != null && (!changed || System.currentTimeMillis() - s.loadedAt() < REFRESH_MILLIS)) {
                return s;
            }
            changed = false;
            snapshot = s = load();
            return s;
        }
    }

    private Snapshot load() {
        long started = System.currentTimeMillis();
        Integer count = jdbc.queryForObject("SELECT count(*) FROM knowledge_chunk WHERE embedding IS NOT NULL", Integer.class);
        if (count == null || count > MAX_SECTIONS) {
            return null;
        }
        List<UUID> ids = new ArrayList<>(count);
        List<UUID> workspaces = new ArrayList<>(count);
        List<String> versions = new ArrayList<>(count);
        List<float[]> vectors = new ArrayList<>(count);
        jdbc.query("SELECT id, workspace_id, version_line, embedding::text FROM knowledge_chunk WHERE embedding IS NOT NULL", rs -> {
            float[] v = parse(rs.getString(4));
            if (v.length > 0) {
                ids.add(rs.getObject(1, UUID.class));
                workspaces.add(rs.getObject(2, UUID.class));
                versions.add(rs.getString(3));
                vectors.add(normalized(v));
            }
        });
        log.debug("Loaded {} section embeddings for the knowledge search in {} ms", ids.size(), System.currentTimeMillis() - started);
        return new Snapshot(ids.toArray(new UUID[0]), workspaces.toArray(new UUID[0]), versions.toArray(new String[0]),
                vectors.toArray(new float[0][]), System.currentTimeMillis());
    }

    /** pgvector's text form: [0.1,-0.2,3e-05]. */
    static float[] parse(String text) {
        String body = Objects.requireNonNullElse(text, "").strip();
        if (body.length() < 3 || body.charAt(0) != '[' || body.charAt(body.length() - 1) != ']') {
            return new float[0];
        }
        String[] parts = body.substring(1, body.length() - 1).split(",");
        float[] v = new float[parts.length];
        for (int i = 0; i < parts.length; i++) {
            v[i] = Float.parseFloat(parts[i].strip());
        }
        return v;
    }

    /** Scaled to length 1, so the dot product is the cosine similarity. */
    static float[] normalized(float[] v) {
        double sum = 0;
        for (float x : v) {
            sum += x * x;
        }
        double length = Math.sqrt(sum);
        float[] n = new float[v.length];
        for (int i = 0; i < v.length && length > 0; i++) {
            n[i] = (float) (v[i] / length);
        }
        return n;
    }
}
