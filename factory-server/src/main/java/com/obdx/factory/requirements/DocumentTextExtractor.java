package com.obdx.factory.requirements;

import com.obdx.factory.common.BadRequestException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns an uploaded requirement document into plain text for the model. Word documents keep their structure:
 * headings become "#" lines and tables become "|" rows, because BRDs and FSDs put most field definitions in tables.
 */
@Component
public class DocumentTextExtractor {

    private static final Pattern HEADING_STYLE = Pattern.compile("(?i)heading\\s*(\\d)|^(\\d)$|title");

    public String extract(String fileName, byte[] bytes) {
        String lower = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        try {
            String text;
            if (lower.endsWith(".docx")) {
                text = docx(bytes);
            } else if (lower.endsWith(".doc")) {
                text = doc(bytes);
            } else if (lower.endsWith(".pdf")) {
                text = pdf(bytes);
            } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
                text = new String(bytes, StandardCharsets.UTF_8);
            } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
                text = html(new String(bytes, StandardCharsets.UTF_8));
            } else {
                throw new BadRequestException("Unsupported file type. Upload a Word (.docx, .doc), PDF, HTML, .txt or .md file.");
            }
            text = text.replace("\r\n", "\n").replaceAll("[ \\t]+\n", "\n").replaceAll("\n{3,}", "\n\n").trim();
            if (text.isEmpty()) {
                throw new BadRequestException("No text found in " + fileName
                        + ". If it is a scanned PDF, it needs OCR before upload.");
            }
            return text;
        } catch (IOException | RuntimeException e) {
            if (e instanceof BadRequestException badRequest) {
                throw badRequest;
            }
            throw new BadRequestException("Could not read " + fileName + ": " + e.getMessage());
        }
    }

    private static String docx(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            StringBuilder text = new StringBuilder();
            for (IBodyElement element : document.getBodyElements()) {
                if (element instanceof XWPFParagraph paragraph) {
                    String line = paragraph.getText().trim();
                    if (line.isEmpty()) {
                        continue;
                    }
                    int level = headingLevel(paragraph.getStyle(), document, paragraph);
                    text.append(level > 0 ? "#".repeat(level) + " " : "").append(line).append(level > 0 ? "\n\n" : "\n");
                } else if (element instanceof XWPFTable table) {
                    text.append('\n').append(table(table)).append('\n');
                }
            }
            return text.toString();
        }
    }

    private static int headingLevel(String styleId, XWPFDocument document, XWPFParagraph paragraph) {
        if (styleId == null) {
            return 0;
        }
        String styleName = document.getStyles() != null && document.getStyles().getStyle(styleId) != null
                ? document.getStyles().getStyle(styleId).getName() : styleId;
        Matcher matcher = HEADING_STYLE.matcher(styleName == null ? styleId : styleName);
        if (!matcher.find()) {
            return 0;
        }
        if (matcher.group(1) != null) {
            return Integer.parseInt(matcher.group(1));
        }
        return matcher.group(2) != null ? Integer.parseInt(matcher.group(2)) : 1;
    }

    private static String table(XWPFTable table) {
        StringBuilder text = new StringBuilder();
        boolean header = true;
        for (XWPFTableRow row : table.getRows()) {
            List<String> cells = new ArrayList<>();
            for (XWPFTableCell cell : row.getTableCells()) {
                cells.add(cell.getText().replace('\n', ' ').replace("|", "/").trim());
            }
            text.append("| ").append(String.join(" | ", cells)).append(" |\n");
            if (header) {
                text.append("|").append(" --- |".repeat(cells.size())).append('\n');
                header = false;
            }
        }
        return text.toString();
    }

    private static String doc(byte[] bytes) throws IOException {
        try (HWPFDocument document = new HWPFDocument(new ByteArrayInputStream(bytes));
             WordExtractor extractor = new WordExtractor(document)) {
            // Older Word files: table cells come out separated by tab-like cell marks.
            return extractor.getText().replace('\u0007', '\t');
        }
    }

    private static final Pattern HTML_DROP = Pattern.compile("(?is)<(script|style|head|nav)\\b.*?</\\1>|<!--.*?-->");
    private static final Pattern HTML_HEADING = Pattern.compile("(?is)<h([1-4])\\b[^>]*>(.*?)</h\\1>");
    private static final Pattern HTML_CELL = Pattern.compile("(?i)</t[dh]>\\s*");

    /**
     * An HTML page (an exported wiki or Confluence page, Oracle's HTML documentation) as text: headings become "#"
     * lines, paragraphs, list items and table rows become lines, table cells are separated by "|".
     */
    static String html(String html) {
        String text = HTML_DROP.matcher(html).replaceAll(" ");
        Matcher h = HTML_HEADING.matcher(text);
        StringBuilder out = new StringBuilder();
        while (h.find()) {
            String heading = h.group(2).replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").strip();
            h.appendReplacement(out, Matcher.quoteReplacement("\n\n" + "#".repeat(Integer.parseInt(h.group(1))) + " " + heading + "\n\n"));
        }
        h.appendTail(out);
        text = HTML_CELL.matcher(out).replaceAll(" | ");
        text = text.replaceAll("(?i)<br\\s*/?>|</(p|div|li|tr|table|ul|ol|section|article|pre)>", "\n").replaceAll("(?i)<li\\b[^>]*>", "- ");
        text = text.replaceAll("<[^>]+>", " ");
        text = text.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'")
                .replace("&amp;", "&");
        return text.replaceAll("[ \\t]+", " ").replaceAll(" *\n *", "\n");
    }

    private static String pdf(byte[] bytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return stripper.getText(document);
        }
    }
}
