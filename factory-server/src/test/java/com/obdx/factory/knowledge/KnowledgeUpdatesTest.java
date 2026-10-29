package com.obdx.factory.knowledge;

import com.obdx.factory.requirements.DocumentTextExtractor;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The bank's own documents (Word, text, HTML) and what tells one revision of a document from the next. */
class KnowledgeUpdatesTest {

    @Test
    void wordAndMarkdownDocumentsAreSplitAtTheirHeadings() {
        String text = "# Payments customisation\n\nThe bank adds a purpose code to every domestic transfer and sends it to the host "
                + "in the remarks field, because the core system has no separate field for it.\n\n## Purpose codes\n\n"
                + "Purpose codes come from the bank's own list, maintained by operations, and are shown as a drop-down on the "
                + "transfer screen with the code and its description.";
        List<ManualSplitter.Section> sections = ManualSplitter.split(List.of(text));
        assertThat(sections).extracting(ManualSplitter.Section::heading).containsExactly("Payments customisation", "Purpose codes");
        assertThat(sections.get(1).content()).startsWith("Purpose codes come from");
    }

    @Test
    void htmlPagesKeepHeadingsParagraphsAndTables() {
        String html = "<html><head><title>x</title><style>p{}</style></head><body><nav>menu</nav><h2>Limits &amp; approvals</h2>"
                + "<p>Daily limit</p><table><tr><th>Segment</th><th>Limit</th></tr><tr><td>Retail</td><td>5 lakh</td></tr></table>"
                + "<script>alert(1)</script><ul><li>One</li><li>Two</li></ul></body></html>";
        String text = new DocumentTextExtractor().extract("page.html", html.getBytes(StandardCharsets.UTF_8));
        assertThat(text).contains("## Limits & approvals").contains("Daily limit").contains("Segment | Limit |").contains("Retail | 5 lakh |")
                .contains("- One").doesNotContain("alert").doesNotContain("menu").doesNotContain("<");
    }

    @Test
    void sectionsAreComparedByTheirWordsNotTheirSpacing() {
        assertThat(KnowledgeRevisions.sameText("The daily  limit\nis 5 lakh. ", "The daily limit is 5 lakh.")).isTrue();
        assertThat(KnowledgeRevisions.sameText("The daily limit is 5 lakh.", "The daily limit is 10 lakh.")).isFalse();
        assertThat(KnowledgeRevisions.sameText("text", null)).isFalse();
        assertThat(KnowledgeRepository.baseHeading("4.2 Limits (continued) (continued)")).isEqualTo("4.2 Limits");
        assertThat(KnowledgeRepository.baseHeading(null)).isEmpty();
    }

    @Test
    void saysWhichCitedSectionsChanged() {
        var newer = new KnowledgeRepository.Document(UUID.randomUUID(), null, "25.2", "25", "Extensibility Guide", "guide.pdf", "sha",
                10, 20, 20, "READY", null, "admin", null, null, "25.2.0.1", null, null, null);
        String reason = KnowledgeRevisions.changedReason(newer, new LinkedHashSet<>(List.of("4.2 Limits", "4.3 Approvals")));
        assertThat(reason).isEqualTo("A newer revision of Extensibility Guide (25.2, 25.2.0.1) changed or removed what this note cites: "
                + "\"4.2 Limits\", \"4.3 Approvals\". Check the note against the new text.");
    }

    @Test
    void acceptsTheBanksDocumentFormatsAndKeepsPatchsetsAsEntered() {
        assertThat(KnowledgeImporter.supported("Design.DOCX")).isTrue();
        assertThat(KnowledgeImporter.supported("notes.md")).isTrue();
        assertThat(KnowledgeImporter.supported("page.htm")).isTrue();
        assertThat(KnowledgeImporter.supported("sheet.xlsx")).isFalse();
        assertThat(KnowledgeImporter.supported("noextension")).isFalse();
        assertThat(KnowledgeImporter.patchset("  25.2.0.1 ")).isEqualTo("25.2.0.1");
        assertThat(KnowledgeImporter.patchset(" ")).isNull();
        assertThat(KnowledgeImporter.title("payments-customisation.docx")).isEqualTo("Payments Customisation");
        assertThat(KnowledgeService.documentLabel(true, "Payments Customisation", "25.2", "25.2.0.1", "Purpose codes", 0, 0))
                .isEqualTo("Bank document: Payments Customisation (OBDX 25.2, patchset 25.2.0.1), Purpose codes");
        assertThat(KnowledgeService.documentLabel(false, "Extensibility Guide", "25.2", null, "4.2 Limits", 12, 13))
                .isEqualTo("Extensibility Guide (OBDX 25.2), 4.2 Limits, pp. 12-13");
    }
}
