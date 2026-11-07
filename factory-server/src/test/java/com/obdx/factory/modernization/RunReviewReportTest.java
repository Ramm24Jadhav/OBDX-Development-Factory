package com.obdx.factory.modernization;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RunReviewReportTest {

    @Test
    void writesPlainTextOnPagesAndWrapsLongLines() throws Exception {
        RunReviewReport.Writer w = new RunReviewReport.Writer();
        w.title("CHG-0057 Payments moved to React");
        w.heading("Review steps");
        for (int i = 0; i < 80; i++) {
            w.row("File " + i, "Passed · the factory’s checks ✓ with a long note that wraps onto a second line because it does not fit in the column");
        }
        try (PDDocument doc = Loader.loadPDF(w.done())) {
            assertThat(doc.getNumberOfPages()).isGreaterThan(1);
            String text = new PDFTextStripper().getText(doc);
            assertThat(text).contains("CHG-0057 Payments moved to React").contains("Passed - the factory's checks with");
        }
        PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        assertThat(RunReviewReport.Writer.wrap(font, 10, "one two three four five six seven", 60)).hasSizeGreaterThan(1);
    }
}
