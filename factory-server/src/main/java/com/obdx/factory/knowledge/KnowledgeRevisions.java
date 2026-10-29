package com.obdx.factory.knowledge;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Oracle republishes its manuals for patchsets and fixes, and banks update their own documents. When a newer file of
 * a document (the same file name for the same OBDX version and owner) is ready, it replaces the older one: the older
 * revision is kept as history without its sections, so answers and code generation use only the current text. The
 * notes that cite the older revision move to the newer one; a note whose cited section changed or is gone is flagged
 * for review, and an approved one goes back to suggested until someone checks it.
 */
@Component
public class KnowledgeRevisions {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeRevisions.class);

    private final KnowledgeRepository repository;
    private final KnowledgeVectors vectors;
    private final ObjectMapper json;

    public KnowledgeRevisions(KnowledgeRepository repository, KnowledgeVectors vectors, ObjectMapper json) {
        this.repository = repository;
        this.vectors = vectors;
        this.json = json;
    }

    /** Called when a document is ready: retires the revisions it replaces. Returns how many notes need checking. */
    public int replaceEarlier(UUID newerId) {
        var newer = repository.findDocument(newerId).orElse(null);
        if (newer == null || !"READY".equals(newer.status())) {
            return 0;
        }
        int flagged = 0;
        for (var older : repository.earlierRevisions(newer)) {
            flagged += moveNotes(older, newer);
            repository.supersede(older.id(), newer.id());
            vectors.changed();
            log.info("Knowledge document \"{}\" ({}) replaced by a newer revision; {} note(s) to check", older.title(), older.obdxVersion(), flagged);
        }
        return flagged;
    }

    private int moveNotes(KnowledgeRepository.Document older, KnowledgeRepository.Document newer) {
        List<KnowledgeRepository.Note> notes = repository.notesCiting(older.id());
        if (notes.isEmpty()) {
            return 0;
        }
        Map<String, String> before = repository.sectionTexts(older.id());
        Map<String, String> after = repository.sectionTexts(newer.id());
        Map<String, Integer> pages = repository.sectionPages(newer.id());
        int flagged = 0;
        for (var note : notes) {
            List<Map<String, Object>> sources = parse(note.sources());
            Set<String> changed = new LinkedHashSet<>();
            for (Map<String, Object> source : sources) {
                // Notes saved before the document id was kept name it in the link
                if (!older.id().toString().equals(String.valueOf(source.get("documentId")))
                        && !String.valueOf(source.get("url")).contains(older.id().toString())) {
                    continue;
                }
                String heading = KnowledgeRepository.baseHeading((String) source.get("heading"));
                if (!sameText(before.get(heading), after.get(heading))) {
                    changed.add(heading.isEmpty() ? "page " + source.get("pageFrom") : heading);
                }
                // The citation follows the document; a section that moved keeps its new first page
                source.put("documentId", newer.id().toString());
                Integer page = pages.get(heading);
                if (page != null) {
                    source.put("pageFrom", page);
                    source.put("url", "api/knowledge/documents/" + newer.id() + "/file" + (page > 0 ? "#page=" + page : ""));
                }
            }
            String reason = changed.isEmpty() ? null : changedReason(newer, changed);
            repository.reviseNoteSources(note.id(), json.writeValueAsString(sources), reason);
            if (reason != null) {
                flagged++;
            }
        }
        return flagged;
    }

    static String changedReason(KnowledgeRepository.Document newer, Set<String> changed) {
        String list = changed.stream().limit(5).map(h -> "\"" + h + "\"").collect(Collectors.joining(", "));
        return "A newer revision of " + newer.title() + " (" + newer.obdxVersion()
                + (newer.patchset() == null ? "" : ", " + newer.patchset()) + ") changed or removed what this note cites: "
                + list + (changed.size() > 5 ? " and " + (changed.size() - 5) + " more" : "") + ". Check the note against the new text.";
    }

    /** The same words in the same order; spacing and line breaks (which differ between PDF builds) do not count. */
    static boolean sameText(String a, String b) {
        return a != null && b != null && normalized(a).equals(normalized(b));
    }

    private static String normalized(String text) {
        return text.replaceAll("\\s+", " ").strip();
    }

    private List<Map<String, Object>> parse(String sources) {
        if (sources == null || sources.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<Map<String, Object>> list = json.readValue(sources, new TypeReference<List<Map<String, Object>>>() {
            });
            List<Map<String, Object>> copy = new ArrayList<>();
            list.forEach(m -> copy.add(new LinkedHashMap<>(m)));
            return copy;
        } catch (RuntimeException e) {
            return new ArrayList<>();
        }
    }
}
