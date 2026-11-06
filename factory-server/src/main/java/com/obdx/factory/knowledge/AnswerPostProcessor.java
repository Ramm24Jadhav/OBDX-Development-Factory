package com.obdx.factory.knowledge;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks a model's answer against the sources it was given before anyone reads it, without another model: citations to
 * sources that do not exist are removed, identifiers, menu paths and code the sources do not have are marked, other
 * vendors' products and OBDX versions other than the workspace's are caught, statements are compared with the words of
 * the source they cite, and the Markdown is tidied (headings, repeated paragraphs, unclosed code, too much bold, filler
 * at the start and end). The result says how well the answer is supported: VERIFIED, PARTIALLY_VERIFIED or
 * INSUFFICIENT_EVIDENCE. These checks find unsupported details; they cannot prove an answer right.
 */
final class AnswerPostProcessor {

    enum Status { VERIFIED, PARTIALLY_VERIFIED, INSUFFICIENT_EVIDENCE }

    /**
     * @param status   how well the sources support the answer
     * @param reason   one sentence on why
     * @param findings what the checks found, in plain words
     */
    record Quality(Status status, String reason, List<String> findings) {
    }

    record Section(String heading, String content, List<Integer> citations) {
    }

    record CodeExample(String language, String code) {
    }

    /**
     * The checked answer and its structure. needsCorrection: a problem worth one more attempt by the model (citations
     * to sources that do not exist, identifiers or other vendors not in the sources, no citation at all).
     */
    record Checked(String answer, Quality quality, String summary, List<Section> sections, List<CodeExample> codeExamples,
                   List<String> tables, List<Integer> cited, List<String> limitations, boolean needsCorrection) {
    }

    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final Pattern CITATION_GROUP = Pattern.compile("\\[(?:sources?\\s*)?(\\d{1,2}(?:\\s*(?:,|and|-|–)\\s*\\d{1,2})*)\\](?!\\()",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CITATION = Pattern.compile("\\[(\\d{1,2})\\]");
    private static final Pattern OPENER = Pattern.compile("^(?:(?:sure|certainly|of course)[!,.]\\s*)?(?:(?:based on|according to|from) (?:the )?"
            + "(?:provided |given |available |numbered )?(?:sources?|documentation|manuals?|context)(?: provided| given)?(?: \\[\\d+\\])?"
            + "(?: for OBDX [0-9.x]+)?(?: \\([^)]{0,40}\\))?,\\s*)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CLOSER = Pattern.compile("^(?:i hope|hope this|let me know|feel free|if you (?:have|need) (?:any )?(?:other|further|more)"
            + "|please let me know|is there anything else)", Pattern.CASE_INSENSITIVE);
    private static final Pattern NOT_COVERED = Pattern.compile("(?:do(?:es)? not|don't|doesn't) (?:cover|describe|document|mention|explain|contain|include)"
            + "|(?:not|isn't|is not) (?:covered|documented|described|mentioned)|no source (?:covers|describes|answers)", Pattern.CASE_INSENSITIVE);
    private static final Pattern VERSION = Pattern.compile("(?i)\\b(?:obdx|version|release|patchset)\\s+(?:v\\.?\\s*)?(\\d{2})\\.(?:x|\\d+)");
    // A menu path: three or more names in Title Case ("Toggle menu" too) joined by >, → or ›
    private static final String MENU_STEP = "(?:\\*\\*)?[A-Z][\\w/&'-]*(?: (?:[A-Z][\\w/&'-]*|menu|of|and|for|&|-))*(?:\\*\\*)?";
    private static final Pattern MENU_PATH = Pattern.compile(MENU_STEP + "(?:\\s*(?:>|→|›)\\s*" + MENU_STEP + "){2,}");
    private static final Pattern INLINE_CODE = Pattern.compile("`([^`\\n]{2,120})`");
    private static final List<String> VENDORS = List.of("Temenos", "T24", "Transact", "Infinity", "Finastra", "Fusion Essence", "Finacle",
            "Infosys", "FIS ", "Fiserv", "Jack Henry", "Backbase", "Mambu", "Thought Machine", "nCino", "Q2 ", "Avaloq", "TCS BaNCS", "BaNCS",
            "Sopra", "Intellect Design", "Nymbus", "Alkami", "Kony", "Temenos Infinity");
    private static final Set<String> STOP = Set.of("the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "will",
            "can", "you", "your", "have", "has", "not", "but", "they", "their", "then", "than", "into", "which", "when", "where", "what",
            "also", "each", "only", "must", "should", "would", "could", "there", "these", "those", "such", "been", "being", "here",
            "about", "after", "before", "under", "over", "more", "most", "other", "some", "any", "all", "one", "two", "use", "used",
            "using", "click", "select", "screen", "appears", "displayed", "field", "fields", "option", "user", "users", "obdx", "source", "sources");

    private AnswerPostProcessor() {
    }

    /**
     * @param texts       the text each source gave the model, in source order (source [n] is texts[n - 1])
     * @param asked       the question and the conversation before it: identifiers there are the user's, not invented
     * @param versionLine the workspace's version line (22, 25), or null
     */
    static Checked process(String raw, List<String> texts, String asked, String versionLine) {
        List<String> findings = new ArrayList<>();
        List<String> limitations = new ArrayList<>();
        boolean correct = false;
        String all = String.join("\n", texts);
        String allLower = all.toLowerCase(Locale.ROOT);
        String askedText = asked == null ? "" : asked;

        String text = (raw == null ? "" : raw).replace("\r\n", "\n").replace('\r', '\n').strip();
        // An unclosed code block would swallow the rest of the answer
        if (countFences(text) % 2 == 1) {
            text = text + "\n```";
            findings.add("A code block was not closed; it is closed at the end.");
        }
        List<Block> blocks = blocks(text);

        // Citations: one number per bracket, and only to sources that exist
        Set<Integer> invalid = new TreeSet<>();
        for (Block b : blocks) {
            if (!b.code) {
                b.text = citations(b.text, texts.size(), invalid);
            }
        }
        if (!invalid.isEmpty()) {
            correct = true;
            findings.add("Removed citations to sources that do not exist: " + invalid.stream().map(n -> "[" + n + "]").toList() + ".");
        }

        // Filler at the start and the end
        Block first = blocks.stream().filter(b -> !b.code && !b.text.isBlank()).findFirst().orElse(null);
        if (first != null) {
            Matcher m = OPENER.matcher(first.text);
            if (m.find()) {
                String rest = first.text.substring(m.end());
                first.text = rest.isEmpty() ? rest : Character.toUpperCase(rest.charAt(0)) + rest.substring(1);
            }
        }
        for (Block b : blocks) {
            if (!b.code) {
                b.text = withoutClosers(b.text);
            }
        }

        // Other vendors' products are not OBDX: sentences about them go unless the sources name them
        for (Block b : blocks) {
            if (b.code) {
                continue;
            }
            for (String vendor : VENDORS) {
                String v = vendor.strip();
                if (b.text.contains(v) && !all.contains(v)) {
                    b.text = withoutSentencesNaming(b.text, v);
                    correct = true;
                    findings.add("Removed what was said about " + v + ", which is not part of OBDX and not in the sources.");
                }
            }
        }

        // Identifiers, menu paths and code the sources do not have are marked where they first appear
        Set<String> marked = new HashSet<>();
        for (Block b : blocks) {
            if (b.code) {
                continue;
            }
            b.text = markUnsupportedIdentifiers(b.text, all, allLower, askedText, marked, findings);
            b.text = markMenuPaths(b.text, allLower, findings);
        }
        if (!marked.isEmpty()) {
            correct = true;
        }
        List<CodeExample> code = new ArrayList<>();
        for (int i = 0; i < blocks.size(); i++) {
            Block b = blocks.get(i);
            if (!b.code) {
                continue;
            }
            String language = b.language();
            String body = b.body();
            code.add(new CodeExample(language, body));
            if (language.equals("json") && !validJson(body)) {
                findings.add("A JSON example is not valid JSON as written.");
                b.note = "_This JSON is not valid as written; check it against the manual._";
            } else if (!codeInSources(body, all)) {
                findings.add("A code example is not in the sources.");
                b.note = "_This code is not in the sources: treat it as an illustration, not as OBDX's code._";
            }
        }

        // OBDX versions other than the workspace's
        if (versionLine != null) {
            Set<String> others = new LinkedHashSet<>();
            for (Block b : blocks) {
                Matcher m = VERSION.matcher(b.text);
                while (m.find()) {
                    if (!m.group(1).equals(versionLine) && !all.contains(m.group(1) + ".")) {
                        others.add(m.group(1) + ".x");
                    }
                }
            }
            if (!others.isEmpty()) {
                findings.add("The answer mentions OBDX " + String.join(", ", others) + "; this workspace is on " + versionLine + ".x.");
                limitations.add("Parts of the answer mention OBDX " + String.join(", ", others) + ", not this workspace's " + versionLine + ".x.");
            }
        }

        // Each statement against the words of what it cites
        int weak = 0;
        int unsupported = 0;
        int statements = 0;
        int uncited = 0;
        for (Block b : blocks) {
            if (b.code) {
                continue;
            }
            StringBuilder out = new StringBuilder();
            for (String line : b.text.split("\n", -1)) {
                String checked = line;
                if (saysSomething(line)) {
                    statements++;
                    if (citedIn(line).isEmpty() && !NOT_COVERED.matcher(line).find()) {
                        uncited++;
                    }
                }
                if (isStatement(line)) {
                    List<Integer> cites = citedIn(line);
                    double support = cites.isEmpty() ? overlap(line, allLower) : overlap(line, cited(texts, cites));
                    if (!cites.isEmpty() && support < 0.3) {
                        weak++;
                        checked = line + " _(not confirmed by the cited source)_";
                    } else if (cites.isEmpty() && support < 0.35 && contentWords(line).size() >= 8 && !NOT_COVERED.matcher(line).find()
                            && !line.toLowerCase(Locale.ROOT).matches(".*\\b(this suggests|in practice)\\b.*")) {
                        unsupported++;
                        checked = line + " _(not found in the sources)_";
                    }
                }
                out.append(checked).append('\n');
            }
            b.text = out.substring(0, out.length() - 1);
        }
        if (weak > 0) {
            findings.add(weak + (weak == 1 ? " statement is" : " statements are") + " not confirmed by the source " + (weak == 1 ? "it cites." : "they cite."));
        }
        if (unsupported > 0) {
            findings.add(unsupported + (unsupported == 1 ? " statement was" : " statements were") + " not found in the sources.");
        }
        // Steps and statements without a citation cannot be checked against a source: most of an answer needs one
        if (!texts.isEmpty() && uncited >= 3 && uncited * 2 >= statements) {
            correct = true;
            findings.add(uncited + " of " + statements + " statements and steps cite no source.");
        }

        // Markdown: one heading level, no empty or repeated sections, no repeated paragraphs, bold kept for names
        String markdown = tidy(join(blocks));

        List<Integer> cited = citedIn(markdown.replaceAll("```[\\s\\S]*?```", ""));
        boolean saysNotCovered = NOT_COVERED.matcher(markdown).find();
        if (saysNotCovered && !cited.isEmpty()) {
            limitations.add("The manuals in the factory do not cover all of the question.");
        }
        if (cited.isEmpty() && !texts.isEmpty() && !saysNotCovered) {
            correct = true;
            findings.add("The answer cites none of its sources.");
        }

        Status status;
        String reason;
        if (texts.isEmpty() || (saysNotCovered && cited.isEmpty())) {
            status = Status.INSUFFICIENT_EVIDENCE;
            reason = texts.isEmpty() ? "Nothing in the knowledge base matched the question." : "The sources found do not answer the question.";
        } else if (findings.isEmpty() && limitations.isEmpty()) {
            status = Status.VERIFIED;
            reason = "Every citation points to a source given, and the cited sources contain what the answer says.";
        } else {
            status = Status.PARTIALLY_VERIFIED;
            reason = findings.isEmpty() ? limitations.getFirst() : "Parts of the answer could not be confirmed from the sources.";
        }
        return new Checked(markdown, new Quality(status, reason, List.copyOf(findings)), summary(markdown), sections(markdown),
                List.copyOf(code), tables(markdown), cited, List.copyOf(limitations), correct);
    }

    // --- blocks: code is kept as written ---

    private static final class Block {
        String text;
        final boolean code;
        String note;

        Block(String text, boolean code) {
            this.text = text;
            this.code = code;
        }

        String language() {
            String head = text.substring(3, text.indexOf('\n') < 0 ? text.length() : text.indexOf('\n')).strip().toLowerCase(Locale.ROOT);
            return head.isEmpty() ? "text" : head.split("\\s+")[0];
        }

        String body() {
            int start = text.indexOf('\n');
            int end = text.lastIndexOf("```");
            return start < 0 || end <= start ? "" : text.substring(start + 1, end).replaceAll("\n$", "");
        }
    }

    private static int countFences(String text) {
        int n = 0;
        for (String line : text.split("\n")) {
            if (line.strip().startsWith("```")) {
                n++;
            }
        }
        return n;
    }

    private static List<Block> blocks(String text) {
        List<Block> blocks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inCode = false;
        for (String line : text.split("\n", -1)) {
            boolean fence = line.strip().startsWith("```");
            if (fence && !inCode) {
                if (!current.isEmpty()) {
                    blocks.add(new Block(current.toString().replaceAll("\n$", ""), false));
                }
                current = new StringBuilder(line.strip()).append('\n');
                inCode = true;
            } else if (fence) {
                current.append("```");
                blocks.add(new Block(current.toString(), true));
                current = new StringBuilder();
                inCode = false;
            } else {
                current.append(line).append('\n');
            }
        }
        if (!current.isEmpty()) {
            blocks.add(new Block(current.toString().replaceAll("\n$", ""), inCode));
        }
        return blocks;
    }

    private static String join(List<Block> blocks) {
        StringBuilder out = new StringBuilder();
        for (Block b : blocks) {
            if (!out.isEmpty()) {
                out.append("\n\n");
            }
            out.append(b.code ? b.text : b.text.strip());
            if (b.note != null) {
                out.append("\n\n").append(b.note);
            }
        }
        return out.toString();
    }

    // --- citations ---

    /** "[1, 3]", "[1-3]" and "[Source 2]" written as [1][3], [1][2][3] and [2]; numbers past the sources dropped. */
    static String citations(String text, int sources, Set<Integer> invalid) {
        Matcher m = CITATION_GROUP.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            List<Integer> numbers = new ArrayList<>();
            Matcher range = Pattern.compile("(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})").matcher(m.group(1));
            String rest = m.group(1);
            while (range.find()) {
                int from = Integer.parseInt(range.group(1));
                int to = Integer.parseInt(range.group(2));
                for (int n = from; n <= to && n - from < 10; n++) {
                    numbers.add(n);
                }
                rest = rest.replace(range.group(), "");
            }
            for (String part : rest.split("\\s*(?:,|and)\\s*")) {
                if (!part.isBlank()) {
                    numbers.add(Integer.parseInt(part.strip()));
                }
            }
            StringBuilder kept = new StringBuilder();
            for (int n : new LinkedHashSet<>(numbers)) {
                if (n >= 1 && n <= sources) {
                    kept.append('[').append(n).append(']');
                } else {
                    invalid.add(n);
                }
            }
            m.appendReplacement(out, Matcher.quoteReplacement(kept.toString()));
        }
        m.appendTail(out);
        return out.toString().replaceAll(" +([.,;:])", "$1").replaceAll("  +", " ");
    }

    static List<Integer> citedIn(String text) {
        Set<Integer> cited = new TreeSet<>();
        Matcher m = CITATION.matcher(text);
        while (m.find()) {
            cited.add(Integer.parseInt(m.group(1)));
        }
        return List.copyOf(cited);
    }

    private static String cited(List<String> texts, List<Integer> numbers) {
        StringBuilder out = new StringBuilder();
        for (int n : numbers) {
            if (n >= 1 && n <= texts.size()) {
                out.append(texts.get(n - 1)).append('\n');
            }
        }
        return out.toString().toLowerCase(Locale.ROOT);
    }

    // --- checks ---

    private static String withoutClosers(String text) {
        List<String> kept = new ArrayList<>();
        for (String paragraph : text.split("\n\n")) {
            if (!CLOSER.matcher(paragraph.strip()).find()) {
                kept.add(paragraph);
            }
        }
        return String.join("\n\n", kept);
    }

    private static String withoutSentencesNaming(String text, String name) {
        StringBuilder out = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            if (!line.contains(name)) {
                out.append(line).append('\n');
                continue;
            }
            String kept = String.join(" ", java.util.Arrays.stream(line.split("(?<=[.!?])\\s+")).filter(s -> !s.contains(name)).toList());
            // A list item that only spoke of the vendor goes with it
            if (!kept.isBlank() && !kept.strip().matches("^([-*]|\\d+\\.)\\s*$")) {
                out.append(kept).append('\n');
            }
        }
        return out.toString().replaceAll("\n$", "");
    }

    private static String markUnsupportedIdentifiers(String text, String all, String allLower, String asked, Set<String> marked, List<String> findings) {
        Set<String> candidates = new LinkedHashSet<>(QueryUnderstanding.identifiers(text.replaceAll("\\[\\d+\\]", "")));
        Matcher code = INLINE_CODE.matcher(text);
        while (code.find()) {
            candidates.add(code.group(1).strip());
        }
        String out = text;
        for (String id : candidates) {
            boolean known = all.contains(id) || asked.contains(id) || (!id.matches(".*[._/A-Z].*") && allLower.contains(id.toLowerCase(Locale.ROOT)))
                    || (id.matches("[A-Za-z ]+") && allLower.contains(id.toLowerCase(Locale.ROOT)));
            if (known || marked.contains(id)) {
                continue;
            }
            marked.add(id);
            findings.add("\"" + id + "\" is not in the sources.");
            String quoted = "`" + id + "`";
            int at = out.indexOf(quoted);
            if (at >= 0) {
                out = out.substring(0, at + quoted.length()) + " _(not in the sources)_" + out.substring(at + quoted.length());
            } else {
                Matcher m = Pattern.compile("(?<![\\w.])" + Pattern.quote(id) + "(?![\\w])").matcher(out);
                if (m.find()) {
                    out = out.substring(0, m.end()) + " _(not in the sources)_" + out.substring(m.end());
                }
            }
        }
        return out;
    }

    private static String markMenuPaths(String text, String allLower, List<String> findings) {
        Matcher m = MENU_PATH.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String path = m.group();
            boolean known = true;
            for (String step : path.split("\\s*(?:>|→|›)\\s*")) {
                String s = step.replace("**", "").strip().toLowerCase(Locale.ROOT);
                if (!s.isEmpty() && !allLower.contains(s)) {
                    known = false;
                    break;
                }
            }
            String replacement = path;
            if (!known) {
                findings.add("The menu path \"" + path.replace("**", "") + "\" is not in the sources.");
                replacement = path + " _(menu path not confirmed by the sources)_";
            }
            m.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(out);
        return out.toString();
    }

    static boolean validJson(String body) {
        try {
            JSON.readTree(body);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Most of a code example's names are in the sources (a short example made of ordinary words counts as there). */
    static boolean codeInSources(String body, String all) {
        Set<String> names = new LinkedHashSet<>();
        Matcher m = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]{3,}").matcher(body);
        while (m.find()) {
            String name = m.group();
            if (!name.matches("[a-z]+") || name.length() > 8) {
                names.add(name);
            }
        }
        if (names.size() < 3) {
            return true;
        }
        long there = names.stream().filter(all::contains).count();
        return there * 2 >= names.size();
    }

    /** A sentence or list item with a few words of its own, not a heading, table row or note. */
    private static boolean saysSomething(String line) {
        String s = line.strip();
        return !s.isEmpty() && !s.startsWith("#") && !s.startsWith("|") && !s.startsWith("_") && !s.startsWith(">")
                && contentWords(s).size() >= 2;
    }

    /** A line that says something: a sentence or list item, not a heading, table row or note. */
    private static boolean isStatement(String line) {
        String s = line.strip();
        return !s.isEmpty() && !s.startsWith("#") && !s.startsWith("|") && !s.startsWith("_") && !s.startsWith(">")
                && contentWords(s).size() >= 5;
    }

    private static List<String> contentWords(String line) {
        List<String> words = new ArrayList<>();
        for (String w : line.toLowerCase(Locale.ROOT).replaceAll("\\[\\d+\\]", " ").split("[^a-z0-9]+")) {
            if (w.length() >= 4 && !STOP.contains(w)) {
                words.add(w);
            }
        }
        return words;
    }

    /** The share of a statement's words found in the text, by their first five letters (configure, configuration). */
    static double overlap(String line, String textLower) {
        List<String> words = contentWords(line);
        if (words.isEmpty()) {
            return 1;
        }
        long found = words.stream().filter(w -> textLower.contains(w.length() > 5 ? w.substring(0, 5) : w)).count();
        return (double) found / words.size();
    }

    // --- Markdown ---

    static String tidy(String markdown) {
        List<String> out = new ArrayList<>();
        Set<String> paragraphs = new HashSet<>();
        Set<String> headings = new HashSet<>();
        boolean inCode = false;
        for (String paragraph : markdown.split("\n{2,}")) {
            String p = paragraph;
            if (p.strip().startsWith("```") || inCode) {
                out.add(p);
                inCode = countFences(p) % 2 == 1 ? !inCode : inCode;
                continue;
            }
            p = p.replaceAll("(?m)^#\\s+", "## ").replaceAll("(?m)^#{4,6}\\s+", "### ");
            String key = p.toLowerCase(Locale.ROOT).replaceAll("\\[\\d+\\]", "").replaceAll("[^a-z0-9]+", " ").strip();
            if (key.isEmpty()) {
                continue;
            }
            if (p.strip().startsWith("#")) {
                if (!headings.add(key)) {
                    continue;
                }
            } else if (key.length() > 20 && !paragraphs.add(key)) {
                continue;
            }
            out.add(lessBold(p));
        }
        // A heading with nothing under it (the next is a heading of the same level or higher, or the end)
        List<String> kept = new ArrayList<>();
        for (int i = 0; i < out.size(); i++) {
            String p = out.get(i).strip();
            if (p.startsWith("#") && !p.contains("\n")) {
                int level = p.indexOf(' ');
                String next = i + 1 < out.size() ? out.get(i + 1).strip() : null;
                if (next == null || (next.startsWith("#") && next.indexOf(' ') <= level && !next.contains("\n"))) {
                    continue;
                }
            }
            kept.add(out.get(i));
        }
        return String.join("\n\n", kept).strip();
    }

    /** Bold kept for a few names: a paragraph that is mostly bold, or bolds more than six things, loses it. */
    private static String lessBold(String paragraph) {
        Matcher m = Pattern.compile("\\*\\*([^*\\n]+)\\*\\*").matcher(paragraph);
        int count = 0;
        int chars = 0;
        while (m.find()) {
            count++;
            chars += m.group(1).length();
        }
        String plain = paragraph.replaceAll("\\*\\*([^*\\n]+)\\*\\*", "$1");
        boolean heading = paragraph.strip().startsWith("#");
        if (!heading && (count > 6 || (plain.length() > 40 && chars > plain.length() * 0.4))) {
            return plain;
        }
        return heading ? plain : paragraph;
    }

    static String summary(String markdown) {
        for (String paragraph : markdown.split("\n{2,}")) {
            String p = paragraph.strip();
            if (!p.isEmpty() && !p.startsWith("#") && !p.startsWith("```") && !p.startsWith("|")) {
                return p.replaceAll("\\*\\*|`|_", "").replaceAll("\\s+", " ");
            }
        }
        return "";
    }

    static List<Section> sections(String markdown) {
        List<Section> sections = new ArrayList<>();
        String heading = null;
        StringBuilder content = new StringBuilder();
        boolean inCode = false;
        for (String line : markdown.split("\n", -1)) {
            if (line.strip().startsWith("```")) {
                inCode = !inCode;
            }
            if (!inCode && line.startsWith("## ")) {
                if (heading != null || !content.toString().isBlank()) {
                    sections.add(new Section(heading, content.toString().strip(), citedIn(content.toString())));
                }
                heading = line.substring(3).strip();
                content = new StringBuilder();
            } else {
                content.append(line).append('\n');
            }
        }
        if (heading != null || !content.toString().isBlank()) {
            sections.add(new Section(heading, content.toString().strip(), citedIn(content.toString())));
        }
        return List.copyOf(sections);
    }

    static List<String> tables(String markdown) {
        List<String> tables = new ArrayList<>();
        StringBuilder table = new StringBuilder();
        for (String line : (markdown + "\n").split("\n", -1)) {
            if (line.strip().startsWith("|")) {
                table.append(line).append('\n');
            } else if (!table.isEmpty()) {
                if (table.toString().split("\n").length >= 2) {
                    tables.add(table.toString().strip());
                }
                table = new StringBuilder();
            }
        }
        return List.copyOf(tables);
    }
}
