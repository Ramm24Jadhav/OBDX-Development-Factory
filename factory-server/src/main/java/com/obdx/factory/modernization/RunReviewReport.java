package com.obdx.factory.modernization;

import com.obdx.factory.change.ChangeService;
import com.obdx.factory.change.PlanReviewStore;
import com.obdx.factory.common.BadRequestException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The review report of a run as a PDF: the change, its review steps, the test results, the OBDX rules, every file with
 * its check, and the comments, for the bank's records of what was approved.
 */
@Service
public class RunReviewReport {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm");
    private static final float MARGIN = 50;
    private static final float WIDTH = PDRectangle.A4.getWidth() - 2 * MARGIN;

    private final ModernizationRunService runs;
    private final RunValidation validation;
    private final ChangeService changes;

    public RunReviewReport(ModernizationRunService runs, RunValidation validation, ChangeService changes) {
        this.runs = runs;
        this.validation = validation;
        this.changes = changes;
    }

    public byte[] pdf(UUID workspaceId, UUID runId) {
        ModernizationRunService.RunDetail detail = runs.detail(workspaceId, runId);
        ModernizationService.RunView run = detail.run();
        if (run.changeId() == null) {
            throw new BadRequestException("This run has no change yet, so there is nothing to report.");
        }
        ChangeService.ChangeDetail change = changes.get(run.changeId());
        RunValidation.View v = validation.view(workspaceId, runId);
        List<PlanReviewStore.Comment> comments = changes.planReview(run.changeId()).comments();

        Writer w = new Writer();
        w.title(change.title());
        w.text(run.subject() + (run.technology() == null ? "" : " - " + run.technology()) + " - review report");
        w.heading("Review steps");
        w.row("Validation", v.build() == null ? "No build yet" : "Build #" + v.build().number() + " " + v.build().result());
        w.row("Technical review", change.planApprovedBy() == null ? "Waiting" : "Plan approved by " + change.planApprovedBy());
        w.row("Security review", run.securityBy() == null ? "Waiting" : "Signed off by " + run.securityBy() + (run.securityAt() == null ? "" : ", " + WHEN.format(run.securityAt())));
        w.row("Approval", change.deliveredRevision() == null ? "Waiting" : "Delivered to SVN at r" + change.deliveredRevision());
        w.heading("Tests");
        w.row("All tests", v.published() ? v.totals().passed() + " of " + v.totals().total() + " passed, " + v.totals().failed() + " failed, " + v.totals().skipped() + " skipped" : "No JUnit report published");
        w.row("Line coverage", v.coverage() == null ? "Not published (gate " + v.gate() + "%)" : Math.round(v.coverage()) + "% (gate " + v.gate() + "%)");
        v.suites().forEach(s -> w.row(s.name(), s.type() + ": " + s.passed() + " of " + s.total() + " passed" + (s.failed() > 0 ? ", " + s.failed() + " failed" : "")));
        w.heading("OBDX rules");
        detail.rules().forEach(r -> w.row(r.id() + " " + r.text(), r.result() + (r.failing().isEmpty() ? "" : ": " + String.join(", ", r.failing()))));
        w.heading("Files (" + change.files().size() + ")");
        change.files().forEach(f -> w.row(f.path(), f.action() + ", +" + f.linesAdded() + " -" + f.linesRemoved() + ", "
                + (f.checkStatus() == null ? "not checked" : f.checkStatus().name().toLowerCase()) + (f.checkMessage() == null ? "" : ": " + f.checkMessage())));
        w.heading("OBDX service calls");
        if (detail.calls().isEmpty()) {
            w.text("None.");
        }
        detail.calls().forEach(w::text);
        w.heading("Comments (" + comments.size() + ")");
        if (comments.isEmpty()) {
            w.text("No comments.");
        }
        comments.forEach(c -> w.row((c.author() == null ? "Someone" : c.author()) + (c.createdAt() == null ? "" : ", " + WHEN.format(c.createdAt())), c.text()));
        return w.done();
    }

    /** Lays out text on A4 pages, top to bottom, with a new page when one is full. */
    static final class Writer {
        private final PDDocument doc = new PDDocument();
        private final PDType1Font regular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        private final PDType1Font bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        private PDPageContentStream out;
        private float y;

        Writer() {
            page();
        }

        private void page() {
            try {
                if (out != null) {
                    out.close();
                }
                PDPage p = new PDPage(PDRectangle.A4);
                doc.addPage(p);
                out = new PDPageContentStream(doc, p);
                y = PDRectangle.A4.getHeight() - MARGIN;
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        void title(String s) {
            line(bold, 16, MARGIN, s, 22);
        }

        void heading(String s) {
            y -= 8;
            line(bold, 12, MARGIN, s, 18);
        }

        void text(String s) {
            for (String l : wrap(regular, 10, s, WIDTH)) {
                line(regular, 10, MARGIN, l, 14);
            }
        }

        void row(String key, String value) {
            float keyWidth = WIDTH * 0.38f;
            List<String> k = wrap(bold, 9.5f, key, keyWidth - 8);
            List<String> v = wrap(regular, 9.5f, value, WIDTH - keyWidth);
            int n = Math.max(k.size(), v.size());
            for (int i = 0; i < n; i++) {
                if (y < MARGIN + 14) {
                    page();
                }
                if (i < k.size()) {
                    put(bold, 9.5f, MARGIN, k.get(i));
                }
                if (i < v.size()) {
                    put(regular, 9.5f, MARGIN + keyWidth, v.get(i));
                }
                y -= 13;
            }
            y -= 2;
        }

        private void line(PDType1Font font, float size, float x, String s, float step) {
            if (y < MARGIN + step) {
                page();
            }
            put(font, size, x, s);
            y -= step;
        }

        private void put(PDType1Font font, float size, float x, String s) {
            try {
                out.beginText();
                out.setFont(font, size);
                out.newLineAtOffset(x, y);
                out.showText(s);
                out.endText();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        /** Words on lines no wider than the width, in characters the standard fonts have. */
        static List<String> wrap(PDType1Font font, float size, String text, float width) {
            List<String> lines = new ArrayList<>();
            StringBuilder current = new StringBuilder();
            for (String word : plain(text).split(" ")) {
                String next = current.isEmpty() ? word : current + " " + word;
                if (!current.isEmpty() && widthOf(font, size, next) > width) {
                    lines.add(current.toString());
                    current = new StringBuilder(word);
                } else {
                    current = new StringBuilder(next);
                }
            }
            lines.add(current.toString());
            return lines;
        }

        private static float widthOf(PDType1Font font, float size, String s) {
            try {
                return font.getStringWidth(s) / 1000 * size;
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        /** The text with typographic characters replaced and anything else outside Latin-1 dropped. */
        static String plain(String s) {
            String t = (s == null ? "" : s).replace('’', '\'').replace('‘', '\'').replace('“', '"').replace('”', '"')
                    .replace('–', '-').replace('—', '-').replace('−', '-').replace("·", "-").replace("…", "...")
                    .replace('\t', ' ').replace('\r', ' ').replace('\n', ' ');
            StringBuilder out = new StringBuilder();
            t.codePoints().filter(c -> c >= 32 && c < 256 && c != 127 && (c < 128 || c >= 160)).forEach(out::appendCodePoint);
            return out.toString().replaceAll(" {2,}", " ").trim();
        }

        byte[] done() {
            try {
                out.close();
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                doc.save(bytes);
                doc.close();
                return bytes.toByteArray();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }
}
