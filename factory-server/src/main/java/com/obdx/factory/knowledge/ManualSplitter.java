package com.obdx.factory.knowledge;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Splits a manual's pages into sections for search: a new section starts at a heading, long sections are cut at
 * paragraph breaks, and each keeps the pages it spans so answers can cite them. The headings are the PDF's bookmarks
 * when it has them (Oracle's manuals do: "2.2 User Management - Search and View"); otherwise numbered headings ("4.3
 * Transfer Limits", but not the numbered steps of a procedure) and, in Word, Markdown and HTML documents, "#" headings.
 * The lines repeated on most pages (running headers, footers, copyright) and the table of contents are left out.
 */
final class ManualSplitter {

    record Section(String heading, int pageFrom, int pageTo, String content) {
    }

    /** A bookmark of the PDF: the page it points to and its title. */
    record Bookmark(int page, String title) {
    }

    static final int MAX_CHARS = 1800;
    private static final int MIN_CHARS = 120;
    // A heading of a Word or Markdown document: "## Fund transfer limits"
    private static final Pattern MARKDOWN_HEADING = Pattern.compile("^#{1,4}\\s+(\\S[^\\n]{0,200})$");
    private static final Pattern HEADING = Pattern.compile("^(\\d{1,2}(\\.\\d{1,2}){0,4})\\.?\\s+(\\p{Lu}[^\\n]{2,110})$");
    // A contents line: a title, dot leaders or spaces, and a page number at the end
    private static final Pattern CONTENTS_LINE = Pattern.compile(".*(\\.{3,}|\\s{2,}|…)\\s*\\d{1,4}\\s*$");
    // The first word of a numbered step ("1. Navigate to the above path.") or question, which is not a heading
    private static final java.util.Set<String> STEP_WORDS = java.util.Set.of("click", "navigate", "enter", "select", "perform",
            "type", "choose", "specify", "provide", "if", "can", "does", "do", "is", "are", "what", "how", "why", "when", "in", "from",
            "on", "the", "to", "a", "an", "check", "view", "update", "add", "delete", "modify", "go", "open", "log", "login", "verify",
            "upload", "download", "search", "set", "define", "tap", "swipe", "scroll", "press", "fill", "edit", "save", "submit",
            "confirm", "review", "approve", "reject", "create", "run", "copy", "install", "start", "stop", "restart", "ensure", "make",
            "use", "repeat", "once", "after", "before", "for", "this", "user", "system", "all", "you", "it", "there", "note");
    // The footer of Oracle's manuals: "Copyright © 2015, 2026, Oracle and/or its affiliates." and "Page 23 of 37"
    private static final Pattern FOOTER = Pattern.compile("Oracle and/or its affiliates|^Page \\d+ of \\d+\\b", Pattern.CASE_INSENSITIVE);
    private static final char PAGE_MARK = '\u0001';
    private static final char PAGE_MARK_END = '\u0002';
    private static final Pattern MARK = Pattern.compile("\u0001(\\d+)\u0002");
    private static final Pattern PAGE_NUMBER = Pattern.compile("^\\s*(page\\s*)?\\d{1,4}(\\s*(of|/)\\s*\\d{1,4})?\\s*$", Pattern.CASE_INSENSITIVE);

    private ManualSplitter() {
    }

    static List<Section> split(List<String> pages) {
        return split(pages, List.of());
    }

    static List<Section> split(List<String> pages, List<Bookmark> bookmarks) {
        Map<Integer, List<Bookmark>> marks = new HashMap<>();
        bookmarks.forEach(b -> marks.computeIfAbsent(b.page(), p -> new ArrayList<>()).add(b));
        Map<String, Integer> lineCounts = new HashMap<>();
        for (String page : pages) {
            page.lines().map(String::strip).filter(l -> !l.isEmpty()).distinct().forEach(l -> lineCounts.merge(l, 1, Integer::sum));
        }
        // Running headers and footers appear on at least half of the pages (in a manual of more than four pages)
        int repeated = Math.max(3, pages.size() / 2);

        List<Section> sections = new ArrayList<>();
        String heading = null;
        StringBuilder text = new StringBuilder();
        int from = 1;
        int last = 1;
        for (int p = 0; p < pages.size(); p++) {
            int pageNo = p + 1;
            List<String> lines = pages.get(p).lines().map(String::strip).toList();
            if (isContentsPage(lines)) {
                continue;
            }
            List<Bookmark> here = new ArrayList<>(marks.getOrDefault(pageNo, List.of()));
            List<String> kept = lines.stream().filter(l -> !l.isEmpty() && !((pages.size() > 4 && lineCounts.getOrDefault(l, 0) >= repeated)
                    || PAGE_NUMBER.matcher(l).matches() || FOOTER.matcher(l).find())).toList();
            // A bookmark whose title is not a line of its page (split over two lines, or only in the running header)
            // starts its section at the top of the page
            for (Bookmark b : List.copyOf(here)) {
                if (kept.stream().noneMatch(l -> sameTitle(l, b.title()))) {
                    flush(sections, heading, from, last, text);
                    heading = b.title();
                    from = pageNo;
                    text.setLength(0);
                    here.remove(b);
                }
            }
            for (String line : lines) {
                if (line.isEmpty()) {
                    if (!text.isEmpty() && text.charAt(text.length() - 1) != '\n') {
                        text.append('\n');
                    }
                    continue;
                }
                if ((pages.size() > 4 && lineCounts.getOrDefault(line, 0) >= repeated) || PAGE_NUMBER.matcher(line).matches()
                        || FOOTER.matcher(line).find()) {
                    continue;
                }
                var markdown = MARKDOWN_HEADING.matcher(line);
                Bookmark mark = here.stream().filter(b -> sameTitle(line, b.title())).findFirst().orElse(null);
                if (mark != null) {
                    here.remove(mark);
                }
                if (mark != null || markdown.matches() || (bookmarks.isEmpty() && isNumberedHeading(line))) {
                    flush(sections, heading, from, last, text);
                    heading = mark != null ? mark.title() : markdown.matches() ? markdown.group(1).strip() : line;
                    from = pageNo;
                    text.setLength(0);
                } else {
                    if (text.isEmpty()) {
                        from = pageNo;
                    }
                    if (pageNo != last || text.isEmpty()) {
                        // Where each page starts in the text, so the parts of a long section cite their own pages
                        text.append(PAGE_MARK).append(pageNo).append(PAGE_MARK_END);
                    }
                    text.append(line).append(' ');
                }
                last = pageNo;
            }
        }
        flush(sections, heading, from, last, text);
        return merge(sections);
    }

    /**
     * "4.3 Transfer Limits" is a heading; "1. Navigate to the above path." and "15. If a user's ID is locked ..." are
     * the steps of a procedure or questions, numbered the same way.
     */
    static boolean isNumberedHeading(String line) {
        var m = HEADING.matcher(line);
        if (!m.matches() || CONTENTS_LINE.matcher(line).matches()) {
            return false;
        }
        if (m.group(2) != null) {
            return true;  // 4.3, 2.1.1: a numbered section
        }
        String text = m.group(3).strip();
        String first = text.split("[^A-Za-z]+")[0].toLowerCase(java.util.Locale.ROOT);
        return text.length() <= 70 && !text.matches(".*[.:?;,]$") && !STEP_WORDS.contains(first);
    }

    /** A line of the page is a bookmark's title when the words match; numbering and spacing aside. */
    static boolean sameTitle(String line, String title) {
        String a = titleWords(line);
        return !a.isEmpty() && a.equals(titleWords(title));
    }

    private static String titleWords(String s) {
        return s.toLowerCase(java.util.Locale.ROOT).replaceFirst("^\\s*(chapter|part|appendix)\\s+[0-9a-z]+\\s*", "")
                .replaceFirst("^\\s*[0-9]+(\\.[0-9]+)*\\.?\\s+", "").replaceAll("[^\\p{L}\\p{N}]+", " ").strip();
    }

    /** A contents page: most of its lines end with a page number after dots or spaces. */
    private static boolean isContentsPage(List<String> lines) {
        List<String> filled = lines.stream().filter(l -> l.length() > 3).toList();
        if (filled.size() < 6) {
            return false;
        }
        long contents = filled.stream().filter(l -> CONTENTS_LINE.matcher(l).matches()).count();
        return contents * 2 > filled.size();
    }

    private static void flush(List<Section> sections, String heading, int from, int to, StringBuilder text) {
        String content = text.toString().replaceAll("[ \\t]+", " ").replaceAll(" ?\\n ?", "\n").strip();
        if (content.isEmpty()) {
            return;
        }
        // Long sections are cut at paragraph (or sentence) breaks; each part keeps the heading and its own pages
        int part = 0;
        int page = from;
        while (plain(content).length() > MAX_CHARS) {
            int cut = content.lastIndexOf('\n', MAX_CHARS);
            if (cut < MAX_CHARS / 2) {
                cut = content.lastIndexOf(". ", MAX_CHARS);
            }
            if (cut < MAX_CHARS / 2) {
                cut = MAX_CHARS;
            } else {
                cut++;
            }
            String piece = content.substring(0, cut);
            int[] range = pages(piece, page);
            sections.add(new Section(partHeading(heading, part++), range[0], range[1], plain(piece).strip()));
            page = range[1];
            content = content.substring(cut).strip();
        }
        if (!plain(content).isBlank()) {
            int[] range = pages(content, page);
            sections.add(new Section(partHeading(heading, part), range[0], range[1], plain(content).strip()));
        }
    }

    /** The first and last page of a piece of text: the page it starts on, and the pages that start in it. */
    private static int[] pages(String piece, int page) {
        Matcher m = MARK.matcher(piece);
        int first = page;
        int last = page;
        boolean leading = true;
        while (m.find()) {
            int p = Integer.parseInt(m.group(1));
            if (leading && piece.substring(0, m.start()).isBlank()) {
                first = p;
            }
            leading = false;
            last = p;
        }
        return new int[] {first, Math.max(first, last)};
    }

    private static String plain(String text) {
        return MARK.matcher(text).replaceAll("").replace(String.valueOf(PAGE_MARK), "").replace(String.valueOf(PAGE_MARK_END), "");
    }

    private static String partHeading(String heading, int part) {
        return part == 0 || heading == null ? heading : heading + " (continued)";
    }

    /** A very short section (a heading with a line under it) joins the next one, so search finds it with its context. */
    private static List<Section> merge(List<Section> sections) {
        List<Section> out = new ArrayList<>();
        Section carry = null;
        for (Section s : sections) {
            if (carry != null) {
                s = new Section(carry.heading() != null ? carry.heading() : s.heading(), carry.pageFrom(), s.pageTo(),
                        (carry.heading() != null && s.heading() != null && !s.heading().equals(carry.heading()) ? carry.content() + "\n" + s.heading() + "\n" : carry.content() + "\n") + s.content());
                carry = null;
            }
            if (s.content().length() < MIN_CHARS) {
                carry = s;
            } else {
                out.add(s);
            }
        }
        if (carry != null) {
            out.add(carry);
        }
        return out;
    }
}
