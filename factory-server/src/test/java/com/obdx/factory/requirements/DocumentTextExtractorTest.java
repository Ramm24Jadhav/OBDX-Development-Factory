package com.obdx.factory.requirements;

import com.obdx.factory.common.BadRequestException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentTextExtractorTest {

    private final DocumentTextExtractor extractor = new DocumentTextExtractor();

    @Test
    void keepsHeadingsAndTablesOfWordDocuments() throws IOException {
        byte[] docx;
        try (XWPFDocument document = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            XWPFParagraph heading = document.createParagraph();
            heading.setStyle("Heading1");
            heading.createRun().setText("3. Fund Transfer Screen");
            document.createParagraph().createRun().setText("Add a remarks field to the transfer screen.");
            XWPFTable table = document.createTable(2, 3);
            table.getRow(0).getCell(0).setText("Field");
            table.getRow(0).getCell(1).setText("Type");
            table.getRow(0).getCell(2).setText("Mandatory");
            table.getRow(1).getCell(0).setText("Remarks");
            table.getRow(1).getCell(1).setText("Text (35)");
            table.getRow(1).getCell(2).setText("No");
            document.write(out);
            docx = out.toByteArray();
        }

        String text = extractor.extract("BRD.docx", docx);

        assertThat(text).contains("# 3. Fund Transfer Screen")
                .contains("Add a remarks field to the transfer screen.")
                .contains("| Field | Type | Mandatory |")
                .contains("| Remarks | Text (35) | No |");
    }

    @Test
    void readsPdfText() throws IOException {
        byte[] pdf;
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(72, 700);
                content.showText("Daily transfer limit is INR 500000.");
                content.endText();
            }
            document.save(out);
            pdf = out.toByteArray();
        }

        assertThat(extractor.extract("FSD.pdf", pdf)).isEqualTo("Daily transfer limit is INR 500000.");
    }

    @Test
    void readsTextAndRejectsOtherFormats() {
        assertThat(extractor.extract("notes.md", "# Change\r\n\r\n\r\n\r\nAdd field   \n".getBytes(StandardCharsets.UTF_8)))
                .isEqualTo("# Change\n\nAdd field");
        assertThatThrownBy(() -> extractor.extract("sheet.xlsx", new byte[]{1}))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Unsupported file type");
        assertThatThrownBy(() -> extractor.extract("empty.txt", "  ".getBytes(StandardCharsets.UTF_8)))
                .hasMessageContaining("No text found");
        assertThatThrownBy(() -> extractor.extract("broken.docx", "not a zip".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageStartingWith("Could not read broken.docx");
    }
}
