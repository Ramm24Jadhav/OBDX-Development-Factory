package com.obdx.factory.knowledge;

import com.obdx.factory.common.BadRequestException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Splitting manuals into cited sections, and reading versions and titles from what an administrator enters. */
class ManualSplitterTest {

    private static final String HEADER = "Oracle Banking Digital Experience Extensibility Guide";
    private static final String FOOTER = "Copyright © 2006, 2025, Oracle and/or its affiliates.";

    private static String page(String body, int n) {
        return HEADER + "\n" + body + "\n" + FOOTER + "\n" + n;
    }

    @Test
    void startsSectionsAtNumberedHeadingsAndKeepsTheirPages() {
        List<String> pages = List.of(
                page("Table of Contents\n1. Preface .......... 1\n2. Extending services .......... 3\n2.1 Service hooks .......... 4\n"
                        + "3. UI extensions .......... 7\n4. Security .......... 9\n5. Logging .......... 11", 1),
                page("1. Preface\nThis guide explains how a bank extends OBDX without changing the product code. " + "It covers services and the UI. ".repeat(4), 2),
                page("2. Extending services\nEvery service has pre and post hooks that a bank implements in its own module. " + "Hooks are configured per transaction. ".repeat(4), 3),
                page("2.1 Service hooks\nA hook class implements the interface of the service and is registered in the extension "
                        + "configuration table. " + "The hook runs inside the transaction. ".repeat(4), 4),
                page("More about hooks on the next page. " + "They can stop the transaction with a business error. ".repeat(4), 5),
                page("3. UI extensions\nComponents are replaced through the extension folder of the UI. " + "Use the same names as the product. ".repeat(4), 6));

        List<ManualSplitter.Section> sections = ManualSplitter.split(pages);

        // The preface is front matter; a subsection carries its chapter
        assertThat(sections).extracting(ManualSplitter.Section::heading)
                .containsExactly("2. Extending services", "2. Extending services › 2.1 Service hooks", "3. UI extensions");
        ManualSplitter.Section hooks = sections.get(1);
        assertThat(hooks.pageFrom()).isEqualTo(4);
        assertThat(hooks.pageTo()).isEqualTo(5);
        assertThat(hooks.content()).contains("registered in the extension configuration table").contains("business error");
        // Running headers, footers, page numbers and the table of contents are left out
        assertThat(sections).allSatisfy(s -> {
            assertThat(s.content()).doesNotContain(HEADER).doesNotContain("Copyright").doesNotContain("..........");
        });
    }

    @Test
    void cutsLongSectionsAtParagraphsAndKeepsTheHeading() {
        List<String> pages = new ArrayList<>();
        StringBuilder long1 = new StringBuilder("4. Limits\n");
        for (int i = 0; i < 12; i++) {
            long1.append("Paragraph ").append(i).append(": daily and per-transaction limits are checked before the host call. ".repeat(3)).append("\n\n");
        }
        pages.add(long1.toString());

        List<ManualSplitter.Section> sections = ManualSplitter.split(pages);

        assertThat(sections).hasSizeGreaterThan(1);
        assertThat(sections).allSatisfy(s -> assertThat(s.content().length()).isLessThanOrEqualTo(ManualSplitter.MAX_CHARS));
        assertThat(sections.get(0).heading()).isEqualTo("4. Limits");
        assertThat(sections.get(1).heading()).isEqualTo("4. Limits (continued)");
        assertThat(String.join(" ", sections.stream().map(ManualSplitter.Section::content).toList())).contains("Paragraph 0").contains("Paragraph 11");
    }

    @Test
    void joinsAVeryShortSectionToTheNextOne() {
        List<ManualSplitter.Section> sections = ManualSplitter.split(List.of(
                "5. Payments\nSee below.\n5.1 Fund transfer\n" + "A fund transfer moves money between accounts of the same bank. ".repeat(4)));

        assertThat(sections).hasSize(1);
        assertThat(sections.get(0).heading()).isEqualTo("5. Payments");
        assertThat(sections.get(0).content()).contains("See below.").contains("5.1 Fund transfer").contains("moves money");
    }

    @Test
    void readsVersionsAndTitles() {
        assertThat(KnowledgeImporter.normalizeVersion("25.2.0.0.0")).isEqualTo("25.2");
        assertThat(KnowledgeImporter.normalizeVersion("OBDX 22.2")).isEqualTo("22.2");
        assertThat(KnowledgeImporter.normalizeVersion("25")).isEqualTo("25");
        assertThatThrownBy(() -> KnowledgeImporter.normalizeVersion("latest")).isInstanceOf(BadRequestException.class);
        assertThat(KnowledgeImporter.versionLine("22.x")).isEqualTo("22");
        assertThat(KnowledgeImporter.versionLine("25.2")).isEqualTo("25");
        assertThat(KnowledgeImporter.versionLine("25")).isEqualTo("25");
        assertThat(KnowledgeImporter.title("Oracle Banking Digital Experience Extensibility Guide.pdf")).isEqualTo("Extensibility Guide");
        assertThat(KnowledgeImporter.title("User Manual Oracle Banking Digital Experience Retail Payments.pdf")).isEqualTo("User Manual Retail Payments");
        assertThat(KnowledgeImporter.title("extensibility-api-toolkit-guide.pdf")).isEqualTo("Extensibility Api Toolkit Guide");
    }

    @Test
    void keepsTheNumberedStepsOfAProcedureInItsSection() {
        String step = "The User Management screen appears with the users that match the search criteria entered. ";
        List<ManualSplitter.Section> sections = ManualSplitter.split(List.of(
                "2.3 User Management - Change user status\nThis section allows you to lock and unlock a user.\n"
                        + "1. Navigate to the above path.\n" + step + "\n2. Enter the search criteria, click Search.\n" + step
                        + "\n3. Click the icon in the Status column to lock / unlock a user.\n" + step
                        + "\n15. If a user's User ID is locked, does the admin need to unlock it?\nNo, it is unlocked when the password is reset.\n"
                        + "3 Party Preferences\n" + "Party preferences hold the limits and approvals of a party. ".repeat(3)));

        assertThat(sections).extracting(ManualSplitter.Section::heading).containsExactly("2.3 User Management - Change user status", "3 Party Preferences");
        assertThat(sections.get(0).content()).contains("lock and unlock").contains("1. Navigate").contains("3. Click the icon").contains("15. If a user");
        assertThat(ManualSplitter.isNumberedHeading("4.3 Transfer Limits")).isTrue();
        assertThat(ManualSplitter.isNumberedHeading("12 Party Resource Access")).isTrue();
        assertThat(ManualSplitter.isNumberedHeading("1. Navigate to the above path.")).isFalse();
        assertThat(ManualSplitter.isNumberedHeading("4. Perform any one of the following navigation to access the create screen:")).isFalse();
    }

    @Test
    void takesThePdfsBookmarksAsHeadings() {
        String text = "Each user of the bank has a status that an administrator changes on the User Management screen. ";
        List<ManualSplitter.Section> sections = ManualSplitter.split(List.of(
                "Chapter 2\nUser Management\n" + text.repeat(2),
                "2.2 User Management - Search and View\n" + text + "\n1. Navigate to the above path.\n" + text,
                // The title of this one is split over two lines on its page: its section starts at the top of the page
                text.repeat(2)),
                List.of(new ManualSplitter.Bookmark(1, "2 User Management"), new ManualSplitter.Bookmark(2, "2.2 User Management - Search and View"),
                        new ManualSplitter.Bookmark(3, "2.3 User Management - Edit")));

        assertThat(sections).extracting(ManualSplitter.Section::heading)
                .containsExactly("2 User Management", "2.2 User Management - Search and View", "2.3 User Management - Edit");
        assertThat(sections.get(1).content()).contains("1. Navigate");
        assertThat(sections.get(1).pageFrom()).isEqualTo(2);
    }

    @Test
    void searchesForAnyMeaningfulWord() {
        assertThat(KnowledgeSearch.toTsQuery("How do I add a field to the fund transfer in OBDX?")).isEqualTo("add | field:* | fund:* | transfer:*");
        assertThat(KnowledgeSearch.toTsQuery("the of a")).isEmpty();
        // The manuals' names for what people ask about
        assertThat(ObdxGlossary.inManualWords("onboarding new customer as Retail user"))
                .isEqualTo("user management create registration new party user as retail user");
        assertThat(ObdxGlossary.inManualWords("how do I add a payee")).isNull();
        // The words around a question say nothing about what is asked
        assertThat(KnowledgeSearch.toTsQuery("Give me steps for onboarding new customer in OBDX as Retail user")).isEqualTo("onboarding:* | customer:* | retail:* | user:*");
    }
}
