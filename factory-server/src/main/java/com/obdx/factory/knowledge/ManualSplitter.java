package com.obdx.factory.knowledge;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Splits a manual's pages into sections for search: a new section starts at a numbered heading ("4.3 Transfer
 * Limits"), long sections are cut at paragraph breaks, and each keeps the pages it spans so answers can cite them.
 * The lines repeated on most pages (running headers, footers, copyright) and the table of contents are left out.
 */
final class ManualSplitter {

    record Section(String heading, int pageFrom, int pageTo, String content) {
    }

    static final int MAX_CHARS = 1800;
    private static final int MIN_CHARS = 120;
    private static final Pattern HEADING = Pattern.compile("^(\\d{1,2}(\\.\\d{1,2}){0,4})\\.?\\s+(\\p{Lu}[^\\n]{2,110})$");
    // A contents line: a title, dot leaders or spaces, and a page number at the end
    private static final Pattern CONTENTS_LINE = Pattern.compile(".*(\\.{3,}|\\s{2,}|…)\\s*\\d{1,4}\\s*$");
    private static final Pattern PAGE_NUMBER = Pattern.compile("^\\s*(page\\s*)?\\d{1,4}(\\s*(of|/)\\s*\\d{1,4})?\\s*$", Pattern.CASE_INSENSITIVE);

    private ManualSplitter() {
    }

    static List<Section> split(List<String> pages) {
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
            for (String line : lines) {
                if (line.isEmpty()) {
                    if (!text.isEmpty() && text.charAt(text.length() - 1) != '\n') {
                        text.append('\n');
                    }
                    continue;
                }
                if ((pages.size() > 4 && lineCounts.getOrDefault(line, 0) >= repeated) || PAGE_NUMBER.matcher(line).matches()) {
                    continue;
                }
                if (HEADING.matcher(line).matches() && !CONTENTS_LINE.matcher(line).matches()) {
                    flush(sections, heading, from, last, text);
                    heading = line;
                    from = pageNo;
                    text.setLength(0);
                } else {
                    if (text.isEmpty()) {
                        from = pageNo;
                    }
                    text.append(line).append(' ');
                }
                last = pageNo;
            }
        }
        flush(sections, heading, from, last, text);
        return merge(sections);
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
        // Long sections are cut at paragraph (or sentence) breaks; each part keeps the heading
        int part = 0;
        while (content.length() > MAX_CHARS) {
            int cut = content.lastIndexOf('\n', MAX_CHARS);
            if (cut < MAX_CHARS / 2) {
                cut = content.lastIndexOf(". ", MAX_CHARS);
            }
            if (cut < MAX_CHARS / 2) {
                cut = MAX_CHARS;
            } else {
                cut++;
            }
            sections.add(new Section(partHeading(heading, part++), from, to, content.substring(0, cut).strip()));
            content = content.substring(cut).strip();
        }
        if (!content.isEmpty()) {
            sections.add(new Section(partHeading(heading, part), from, to, content));
        }
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
