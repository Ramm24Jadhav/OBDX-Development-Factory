package com.obdx.factory.modernization;

import com.obdx.factory.componentpack.ComponentRegistry.JetMapping;
import com.obdx.factory.componentpack.ComponentRegistry.Part;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Shows how a JET element in a bank's view reads as its premium element: the element's markup from the view, and the
 * same markup with the premium tag and the mapping's renamed attributes. Attributes the premium element does not take are
 * left in place with a comment, so nothing is silently lost. This is for showing the mapping; the change itself is made
 * by the run (docs/MODERNIZATION.md).
 */
public final class MarkupConverter {

    private static final int MAX_LINES = 24;

    private MarkupConverter() {
    }

    /** The first use of an element in a view: from its opening tag to its closing tag (or the opening tag alone), or null. */
    public static String snippet(String view, String element) {
        if (view == null) {
            return null;
        }
        String text = view.replaceAll("(?s)<!--.*?-->", "");
        Matcher open = Pattern.compile("<" + Pattern.quote(element) + "\\b[^>]*?(/?)>", Pattern.CASE_INSENSITIVE).matcher(text);
        if (!open.find()) {
            return null;
        }
        int start = text.lastIndexOf('\n', open.start()) + 1;
        String indent = text.substring(start, open.start()).replaceAll("\\S.*", "");
        int end = open.end();
        if (open.group(1).isEmpty()) {
            int close = text.toLowerCase(Locale.ROOT).indexOf("</" + element.toLowerCase(Locale.ROOT) + ">", open.end());
            if (close > 0) {
                end = close + element.length() + 3;
            }
        }
        String block = text.substring(open.start(), end);
        // Indent relative to the opening tag, at most MAX_LINES lines
        StringBuilder out = new StringBuilder();
        String[] lines = block.split("\\R", -1);
        for (int i = 0; i < lines.length && i < MAX_LINES; i++) {
            String line = i == 0 ? lines[i] : lines[i].startsWith(indent) ? lines[i].substring(indent.length()) : lines[i].stripLeading();
            out.append(line).append('\n');
        }
        if (lines.length > MAX_LINES) {
            out.append("<!-- ").append(lines.length - MAX_LINES).append(" more lines -->\n");
        }
        return out.toString().stripTrailing();
    }

    /** The snippet with the premium tag and attributes; null when there is no premium element (kept or unsupported). */
    public static String convert(String snippet, JetMapping mapping, String premiumTag) {
        if (snippet == null || premiumTag == null) {
            return null;
        }
        String out = snippet.replaceAll("(?i)<" + Pattern.quote(mapping.source()) + "\\b", "<" + premiumTag)
                .replaceAll("(?i)</" + Pattern.quote(mapping.source()) + ">", "</" + premiumTag + ">");
        StringBuilder notes = new StringBuilder();
        for (Part p : mapping.properties()) {
            Pattern attribute = Pattern.compile("(\\s)(:?)" + Pattern.quote(p.from()) + "(\\s*=)");
            if (!attribute.matcher(out).find()) {
                continue;
            }
            if (p.to() == null) {
                notes.append("\n<!-- ").append(p.from()).append(" is not carried over: ").append(p.conversion()).append(" -->");
            } else if (!p.to().equals(p.from())) {
                out = attribute.matcher(out).replaceAll("$1$2" + Matcher.quoteReplacement(p.to()) + "$3");
            }
        }
        for (Part e : mapping.events()) {
            if (e.to() != null && !e.to().equals(e.from())) {
                out = out.replaceAll("(\\s)" + Pattern.quote(e.from()) + "(\\s*=)", "$1" + Matcher.quoteReplacement(e.to()) + "$2");
            }
        }
        return out + notes;
    }
}
