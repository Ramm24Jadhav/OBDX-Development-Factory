package com.obdx.factory.knowledge;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a question before it is searched, without a model: the technical identifiers in it (class names, configuration
 * keys, error codes), which are searched exactly and never changed; words the manuals do not have, corrected to the
 * nearest word in the manuals ("benficiary" to "beneficiary"); abbreviations ("txn"); a question with several
 * parts split into one search per part; and what kind of question it is, which shapes the answer.
 */
@Component
public class QueryUnderstanding {

    private static final Logger log = LoggerFactory.getLogger(QueryUnderstanding.class);

    /** What a question asks for; the answer is laid out for it (see AnswerGeneration). */
    public enum Type {
        CONCEPT, ARCHITECTURE, PROCEDURE, IMPLEMENTATION, CONFIGURATION, API, TROUBLESHOOTING, COMPARISON, INTEGRATION, SECURITY, PERFORMANCE
    }

    /**
     * @param searched    the question as searched: corrected and with its abbreviations written out
     * @param identifiers the technical identifiers, exactly as written
     * @param corrections what was corrected ("benficiary" → "beneficiary")
     * @param parts       one question per part when it asks several things, else empty
     */
    public record Understood(String original, String searched, List<String> identifiers, Map<String, String> corrections,
                             List<String> parts, Type type) {
    }

    // A class or bean (TransferService, digxPaymentService), a dotted key (digx.payment.timeout), a snake or constant name
    // (DIGX_PY_0001, max_retry), an error code (ORA-00942, DIGX-PY-0042), a path or file (config/app.properties), or quoted
    private static final Pattern IDENTIFIER = Pattern.compile(
            "`[^`]{2,120}`"
                    + "|\"[^\"]{2,120}\""
                    + "|\\b[A-Za-z][A-Za-z0-9]*(?:[._/-][A-Za-z0-9]+){1,}\\.[A-Za-z0-9]+\\b"
                    + "|\\b[a-zA-Z][a-zA-Z0-9]*(?:\\.[a-zA-Z0-9_]+){2,}\\b"
                    + "|\\b[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+\\b"
                    + "|\\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\\b"
                    + "|\\b[a-z]+(?:[A-Z][a-z0-9]+)+\\b"
                    + "|\\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\\b");

    private static final Map<String, String> ABBREVIATIONS = Map.ofEntries(
            Map.entry("txn", "transaction"), Map.entry("txns", "transactions"), Map.entry("trxn", "transaction"),
            Map.entry("acct", "account"), Map.entry("acc", "account"), Map.entry("accts", "accounts"),
            Map.entry("pwd", "password"), Map.entry("passwd", "password"),
            Map.entry("config", "configuration"), Map.entry("cfg", "configuration"), Map.entry("conf", "configuration"),
            Map.entry("auth", "authentication"), Map.entry("authn", "authentication"), Map.entry("authz", "authorization"),
            Map.entry("pmt", "payment"), Map.entry("pymt", "payment"), Map.entry("td", "term deposit"), Map.entry("rd", "recurring deposit"),
            Map.entry("sso", "single sign on"), Map.entry("db", "database"), Map.entry("env", "environment"),
            Map.entry("admin", "administrator"), Map.entry("info", "information"), Map.entry("msg", "message"),
            Map.entry("err", "error"), Map.entry("svc", "service"), Map.entry("ws", "web service"));

    private static final Set<String> COMMON = Set.of("what", "which", "where", "when", "does", "about", "there", "their", "should",
            "would", "could", "explain", "steps", "please", "using", "between", "difference", "differences", "versus", "after", "before",
            "other", "these", "those", "first", "again", "configure", "configured", "works", "work", "working", "happens", "happen",
            "error", "errors", "failed", "failure", "fails", "issue", "issues", "problem", "compare", "change", "changes", "customer",
            "customers", "onboard", "onboarding", "screen", "screens", "field", "fields", "users", "retail", "corporate");

    private final JdbcTemplate jdbc;
    private final AtomicBoolean counting = new AtomicBoolean();
    private volatile Map<String, Integer> vocabulary = Map.of();
    private volatile long checkedAt;
    private volatile Integer sectionCount = -1;

    public QueryUnderstanding(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Understood understand(String question) {
        String q = question == null ? "" : question.strip();
        List<String> identifiers = identifiers(q);
        Map<String, String> corrections = new LinkedHashMap<>();
        String searched = rewrite(q, corrections);
        return new Understood(q, searched, identifiers, corrections, parts(searched), type(q));
    }

    /** The technical identifiers in a question, exactly as written (quotes and backticks taken off). */
    static List<String> identifiers(String question) {
        Set<String> found = new LinkedHashSet<>();
        Matcher m = IDENTIFIER.matcher(question == null ? "" : question);
        while (m.find()) {
            String id = m.group();
            if (id.startsWith("`") || id.startsWith("\"")) {
                id = id.substring(1, id.length() - 1).strip();
            }
            // "OBDX" and "Retail" are words, not identifiers; ordinary hyphenated words ("step-by-step") are too
            if (!id.isEmpty() && !id.matches("[A-Z]+|[a-z]+(-[a-z]+)+")) {
                found.add(id);
            }
        }
        return List.copyOf(found);
    }

    /** Abbreviations written out and unknown words corrected, leaving the identifiers as they are. */
    private String rewrite(String question, Map<String, String> corrections) {
        StringBuilder out = new StringBuilder();
        Matcher m = IDENTIFIER.matcher(question);
        int at = 0;
        while (m.find()) {
            out.append(rewriteWords(question.substring(at, m.start()), corrections)).append(m.group());
            at = m.end();
        }
        return out.append(rewriteWords(question.substring(at), corrections)).toString();
    }

    private String rewriteWords(String text, Map<String, String> corrections) {
        StringBuilder out = new StringBuilder();
        Matcher words = Pattern.compile("[A-Za-z][A-Za-z0-9']*|[^A-Za-z]+").matcher(text);
        while (words.find()) {
            String token = words.group();
            String lower = token.toLowerCase(Locale.ROOT);
            if (!Character.isLetter(token.charAt(0))) {
                out.append(token);
            } else if (ABBREVIATIONS.containsKey(lower)) {
                out.append(ABBREVIATIONS.get(lower));
            } else {
                String corrected = correct(lower);
                if (corrected != null) {
                    corrections.put(token, corrected);
                    out.append(corrected);
                } else {
                    out.append(token);
                }
            }
        }
        return out.toString();
    }

    /**
     * The nearest word of the manuals to a word no manual has: one letter off for a short word, two for a long
     * one, and only when one word is nearest. Null when the word is known (or too short to tell).
     */
    String correct(String word) {
        if (word.length() < 5 || COMMON.contains(word) || ABBREVIATIONS.containsValue(word) || !word.matches("[a-z]+")) {
            return null;
        }
        Map<String, Integer> vocabulary = vocabulary();
        if (vocabulary.isEmpty() || vocabulary.containsKey(word) || anywhere(word)) {
            return null;
        }
        int allowed = word.length() >= 8 ? 2 : 1;
        String best = null;
        int bestDistance = Integer.MAX_VALUE;
        int bestCount = 0;
        boolean tie = false;
        for (Map.Entry<String, Integer> e : vocabulary.entrySet()) {
            String candidate = e.getKey();
            if (Math.abs(candidate.length() - word.length()) > allowed) {
                continue;
            }
            int d = distance(word, candidate, allowed);
            if (d > allowed) {
                continue;
            }
            if (d < bestDistance || (d == bestDistance && e.getValue() > bestCount)) {
                tie = d == bestDistance && e.getValue() == bestCount;
                best = candidate;
                bestDistance = d;
                bestCount = e.getValue();
            } else if (d == bestDistance && e.getValue() == bestCount) {
                tie = true;
            }
        }
        return tie ? null : best;
    }

    /** Whether any manual section or note has the word (in any form). */
    boolean anywhere(String word) {
        try {
            Boolean found = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM knowledge_chunk WHERE search_vector @@ to_tsquery('english', ?))"
                    + " OR EXISTS (SELECT 1 FROM knowledge_note WHERE search_vector @@ to_tsquery('english', ?))", Boolean.class, word, word);
            return Boolean.TRUE.equals(found);
        } catch (RuntimeException e) {
            return true;
        }
    }

    /**
     * The manuals' words (in three sections or more, so their own typos do not count) with how often they appear. Counted
     * in the background, at startup and again when the library changes; until then nothing is corrected.
     */
    Map<String, Integer> vocabulary() {
        long now = System.currentTimeMillis();
        if (now - checkedAt > 60_000 && counting.compareAndSet(false, true)) {
            checkedAt = now;
            Thread.ofVirtual().name("knowledge-vocabulary").start(this::count);
        }
        return vocabulary;
    }

    @EventListener(ApplicationReadyEvent.class)
    void countAtStartup() {
        vocabulary();
    }

    private void count() {
        try {
            Integer sections = jdbc.queryForObject("SELECT count(*) FROM knowledge_chunk", Integer.class);
            if (sections != null && !sections.equals(sectionCount)) {
                Map<String, Integer> words = new HashMap<>();
                jdbc.query("SELECT w, count(*) AS n FROM (SELECT regexp_split_to_table(lower(coalesce(heading, '') || ' ' || content), '[^a-z]+') AS w"
                                + " FROM knowledge_chunk) t WHERE length(w) >= 4 GROUP BY w HAVING count(*) >= 3",
                        rs -> {
                            words.put(rs.getString("w"), rs.getInt("n"));
                        });
                vocabulary = Map.copyOf(words);
                sectionCount = sections;
            }
        } catch (RuntimeException e) {
            log.info("The manuals' words were not counted: {}", e.getMessage());
        } finally {
            counting.set(false);
        }
    }

    /** Optimal string alignment distance, given up past the limit. */
    static int distance(String a, String b, int limit) {
        int[][] d = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) {
            d[i][0] = i;
        }
        for (int j = 0; j <= b.length(); j++) {
            d[0][j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            int rowMin = Integer.MAX_VALUE;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1)) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
                }
                rowMin = Math.min(rowMin, d[i][j]);
            }
            if (rowMin > limit) {
                return limit + 1;
            }
        }
        return d[a.length()][b.length()];
    }

    /**
     * The parts of a question that asks several things ("Explain the payment flow and how errors are handled"): each is
     * searched, and the answer covers them all. Empty for a question with one part.
     */
    static List<String> parts(String question) {
        List<String> parts = new ArrayList<>();
        for (String sentence : question.split("(?<=\\?)\\s+|;\\s*|\\n+")) {
            for (String part : sentence.split("(?i),?\\s+and\\s+(?=(how|what|where|why|which|when|who|can|does|do|is|are)\\b)")) {
                String p = part.strip();
                if (p.split("\\s+").length >= 3) {
                    parts.add(p);
                }
            }
        }
        return parts.size() > 1 ? List.copyOf(parts) : List.of();
    }

    /** What kind of question it is, from its words; a procedure when nothing else fits. */
    static Type type(String question) {
        String q = " " + question.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9.]+", " ") + " ";
        if (q.matches(".*\\b(difference|differences|differ|compare|comparison|versus|vs\\.?|better than)\\b.*")) {
            return Type.COMPARISON;
        }
        if (q.matches(".*\\b(error|errors|exception|fail|fails|failed|failing|failure|not working|issue|troubleshoot|unable|cannot|can t|stuck|timeout|timed out)\\b.*")
                || q.matches(".*\\b[a-z]{2,6} ?-?\\d{3,6}\\b.*")) {
            return Type.TROUBLESHOOTING;
        }
        if (q.matches(".*\\b(api|apis|endpoint|endpoints|rest|request|response|payload|swagger|openapi)\\b.*")) {
            return Type.API;
        }
        if (q.matches(".*\\b(architecture|architectural|layers?|tiers?|components? diagram|how .* works?|how does .* work)\\b.*")) {
            return Type.ARCHITECTURE;
        }
        if (q.matches(".*\\b(security|secure|encrypt|encryption|csrf|xss|vulnerab\\w*|certificate|ssl|tls|jwt|token|oauth|saml|sso|single sign on)\\b.*")) {
            return Type.SECURITY;
        }
        if (q.matches(".*\\b(performance|slow|latency|tuning|cache|caching|throughput|memory|scal\\w+)\\b.*")) {
            return Type.PERFORMANCE;
        }
        if (q.matches(".*\\b(integrat\\w*|host|adapter|adapters|third party|interface with|connect to|cbs|flexcube|ubs)\\b.*")) {
            return Type.INTEGRATION;
        }
        if (q.matches(".*\\b(config|configure|configuration|configured|property|properties|setting|settings|parameter|parameters|system rules?|enable|turn on)\\b.*")) {
            return Type.CONFIGURATION;
        }
        if (q.matches(".*\\b(extend|extension|extensibility|customi[sz]\\w*|override|add a field|new field|code|class|classes|implement\\w*|develop\\w*|viewmodel|component)\\b.*")) {
            return Type.IMPLEMENTATION;
        }
        if (q.matches("^ (what is|what are|what does|explain|define|meaning of|purpose of|why) .*") || q.split(" ").length <= 4) {
            return q.matches(".*\\b(how|steps?|create|add|delete|onboard|set up|setup)\\b.*") ? Type.PROCEDURE : Type.CONCEPT;
        }
        return Type.PROCEDURE;
    }
}
