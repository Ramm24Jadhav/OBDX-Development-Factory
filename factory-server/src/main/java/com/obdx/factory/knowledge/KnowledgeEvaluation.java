package com.obdx.factory.knowledge;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Measures how well the OBDX Library answers: a set of questions in people's own words (knowledge/evaluation.json), each
 * with the manual sections that answer it, run through the same retrieval the Library uses. SEARCH runs only the
 * search (no model call), CHOOSE also lets the chat model pick the sources, ANSWER writes the whole answer too and
 * checks it: questions the manuals do not answer must say so, and every [n] must cite a source given. Run it after a
 * change to the search or the models to see that nothing got worse.
 */
@Component
public class KnowledgeEvaluation {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeEvaluation.class);
    private static final Pattern CITATION = Pattern.compile("\\[(\\d+)]");
    // How an answer says the manuals do not cover something
    private static final Pattern NOT_COVERED = Pattern.compile(
            "(do(es)? not (cover|contain|describe|document|mention|provide|include|say)|not (covered|documented|described|mentioned|available) in"
                    + "|no (information|details|mention|source)|cannot (find|answer)|isn't (covered|documented)|don't (cover|contain))",
            Pattern.CASE_INSENSITIVE);

    public enum Mode { SEARCH, CHOOSE, ANSWER }

    /** One question of the set. expect: the sections that answer it, any of them; heading words "" match the whole manual. */
    public record Case(String id, String version, String question, String kind, List<Expected> expect, String thread, Boolean followUp,
                       Boolean unsupported) {

        boolean isFollowUp() {
            return Boolean.TRUE.equals(followUp);
        }

        boolean isUnsupported() {
            return Boolean.TRUE.equals(unsupported);
        }
    }

    public record Expected(String document, String heading) {
    }

    /**
     * How one question went. rank: where the first expected section came among the sources kept (1 is best, 0: not
     * among them); shortListRank: the same in the short list. searched: the question as searched (a follow-up made
     * standalone). passed: for an answer, whether it holds up (the sources found it, citations are real, and an
     * unanswerable question was said to be so). unknownCitations: citations to sources that do not exist, which the
     * check of the answer removed; quality: that check's verdict, and corrected whether the model wrote it again.
     */
    public record Row(String id, String version, String kind, String question, String searched, int rank, int shortListRank,
                      List<String> kept, String answer, int citations, int unknownCitations, boolean saysNotCovered, boolean passed,
                      long millis, String quality, boolean corrected) {
    }

    /** The whole run: the cases, the scores, and each row. recallAt5: the share whose expected section was kept. */
    public record Report(Mode mode, String chatModel, Instant startedAt, Instant finishedAt, boolean running, int done, int total,
                         double recallAt5, double recallAtShortList, double mrr, double answersPassed, double unsupportedRefused,
                         long averageMillis, Map<String, Double> recallByKind, List<Row> rows, String error) {
    }

    private final KnowledgeService knowledge;
    private final ModelSettings settings;
    private final ObjectMapper json;
    private volatile Report last;

    public KnowledgeEvaluation(KnowledgeService knowledge, ModelSettings settings, ObjectMapper json) {
        this.knowledge = knowledge;
        this.settings = settings;
        this.json = json;
    }

    public Report last() {
        return last;
    }

    /** Starts a run in the background; one at a time. */
    public synchronized Report start(Mode mode) {
        var current = settings.current();
        String model = current.chatModel() + " at " + current.baseUrl() + ", embeddings " + current.embeddingModel();
        if (last != null && last.running()) {
            throw new BadRequestException("An evaluation is already running. Wait until it finishes.");
        }
        List<Case> cases = cases();
        last = new Report(mode, model, Instant.now(), null, true, 0, cases.size(), 0, 0, 0, 0, 0, 0, Map.of(), List.of(), null);
        Thread.ofVirtual().name("knowledge-evaluation").start(() -> run(mode, model, cases));
        return last;
    }

    List<Case> cases() {
        try (InputStream in = new ClassPathResource("knowledge/evaluation.json").getInputStream()) {
            return json.readValue(in, new TypeReference<List<Case>>() {
            });
        } catch (IOException e) {
            throw new IllegalStateException("The evaluation questions cannot be read: " + e.getMessage(), e);
        }
    }

    private void run(Mode mode, String model, List<Case> cases) {
        Instant started = last.startedAt();
        List<Row> rows = new ArrayList<>();
        Map<String, List<KnowledgeService.Turn>> threads = new HashMap<>();
        try {
            for (Case c : cases) {
                List<KnowledgeService.Turn> history = c.isFollowUp() ? threads.getOrDefault(c.thread(), List.of()) : List.of();
                Row row = evaluate(c, mode, history);
                rows.add(row);
                if (c.thread() != null) {
                    List<KnowledgeService.Turn> turns = new ArrayList<>(threads.getOrDefault(c.thread(), List.of()));
                    turns.add(new KnowledgeService.Turn(c.question(), row.answer() == null ? "" : row.answer()));
                    threads.put(c.thread(), turns);
                }
                last = report(mode, model, started, null, true, cases.size(), rows, null);
            }
            last = report(mode, model, started, Instant.now(), false, cases.size(), rows, null);
            log.info("Knowledge evaluation ({}): recall@5 {}, MRR {}", mode, last.recallAt5(), last.mrr());
        } catch (RuntimeException e) {
            log.warn("Knowledge evaluation stopped", e);
            last = report(mode, model, started, Instant.now(), false, cases.size(), rows, e.getMessage());
        }
    }

    private Row evaluate(Case c, Mode mode, List<KnowledgeService.Turn> history) {
        long start = System.nanoTime();
        String line = KnowledgeImporter.versionLine(c.version());
        KnowledgeService.Retrieved found = knowledge.retrieve(c.question(), history, line, null, mode != Mode.SEARCH);
        int rank = rankOf(c, found.kept());
        int shortRank = rankOf(c, found.shortList());
        List<String> kept = found.kept().stream().map(h -> h.title() + " | " + KnowledgeRepository.baseHeading(h.heading())).toList();
        String answer = null;
        int citations = 0;
        int unknown = 0;
        boolean notCovered = false;
        String quality = null;
        boolean corrected = false;
        boolean passed = c.isUnsupported() || rank > 0;
        if (mode == Mode.ANSWER) {
            KnowledgeService.Question prepared = knowledge.prepareFor(c.question(), history, line, found);
            KnowledgeService.Answer answered = knowledge.answer(prepared, piece -> { });
            answer = answered.answer();
            quality = answered.report().quality().status().name();
            corrected = answered.report().corrected();
            Matcher m = CITATION.matcher(answer);
            while (m.find()) {
                citations++;
            }
            unknown = (int) answered.report().quality().findings().stream().filter(x -> x.startsWith("Removed citations")).count();
            notCovered = NOT_COVERED.matcher(answer).find();
            passed = unknown == 0 && (c.isUnsupported() ? notCovered : rank > 0 && citations > 0);
        }
        return new Row(c.id(), c.version(), c.kind(), c.question(), found.searched(), rank, shortRank, kept, answer, citations, unknown,
                notCovered, passed, (System.nanoTime() - start) / 1_000_000, quality, corrected);
    }

    /** Where the first section that answers the case is among the hits: 1 is first, 0 none of them. */
    static int rankOf(Case c, List<KnowledgeSearch.Hit> hits) {
        for (int i = 0; i < hits.size(); i++) {
            KnowledgeSearch.Hit h = hits.get(i);
            for (Expected e : c.expect()) {
                if (e.document().equalsIgnoreCase(h.title()) && words(h.heading()).contains(words(e.heading()))) {
                    return i + 1;
                }
            }
        }
        return 0;
    }

    private static String words(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").strip();
    }

    private static Report report(Mode mode, String model, Instant started, Instant finished, boolean running, int total, List<Row> rows,
                                 String error) {
        List<Row> answerable = rows.stream().filter(r -> !"unsupported".equals(r.kind())).toList();
        List<Row> unsupported = rows.stream().filter(r -> "unsupported".equals(r.kind())).toList();
        double recall = share(answerable.stream().filter(r -> r.rank() > 0).count(), answerable.size());
        double shortRecall = share(answerable.stream().filter(r -> r.shortListRank() > 0).count(), answerable.size());
        double mrr = answerable.isEmpty() ? 0 : round(answerable.stream().mapToDouble(r -> r.rank() > 0 ? 1.0 / r.rank() : 0).sum() / answerable.size());
        double passed = share(rows.stream().filter(Row::passed).count(), rows.size());
        double refused = share(unsupported.stream().filter(Row::saysNotCovered).count(), unsupported.size());
        long millis = rows.isEmpty() ? 0 : (long) rows.stream().mapToLong(Row::millis).average().orElse(0);
        Map<String, Double> byKind = new java.util.TreeMap<>();
        answerable.stream().map(Row::kind).distinct().forEach(k -> {
            List<Row> of = answerable.stream().filter(r -> r.kind().equals(k)).toList();
            byKind.put(k, share(of.stream().filter(r -> r.rank() > 0).count(), of.size()));
        });
        return new Report(mode, model, started, finished, running, rows.size(), total, recall, shortRecall, mrr, passed, refused, millis,
                byKind, List.copyOf(rows), error);
    }

    private static double share(long n, int of) {
        return of == 0 ? 0 : round((double) n / of);
    }

    private static double round(double d) {
        return Math.round(d * 1000) / 1000.0;
    }
}
