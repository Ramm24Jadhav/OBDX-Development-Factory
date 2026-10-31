package com.obdx.factory.knowledge;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Reading Oracle's documentation pages (as Oracle writes them, cut down) and checking the files fetched from them.
 */
class OracleLibraryTest {

    private static final String INDEX = "https://www.oracle.com/technical-resources/documentation/fsgbu.html";

    private final OracleLibrary library = new OracleLibrary(new KnowledgeProperties(false, List.of(), 5, 1000, 3000, 8000, true, true,
            new KnowledgeProperties.Oracle(true, INDEX, List.of("docs.oracle.com", "www.oracle.com"), Duration.ofDays(7),
                    DataSize.ofMegabytes(150), Duration.ZERO)), JsonMapper.builder().build());

    @Test
    void findsTheReleasesOnTheIndexWithoutTheCloudService() {
        String html = """
                <h4>Documentation Library for Oracle Banking Digital Experience</h4><table>
                <tr><td>G27931-01 </td><td><a href=" https://docs.oracle.com/en/industries/financial-services/banking-digital-experience/25.2.0.0.0/index.html">View Library</a></td>
                <td><a href="https://docs.oracle.com/x.zip ">Download</a></td><td>Documentation Library for Oracle Banking Digital Experience 25.2.0.0.0</td></tr>
                <tr><td>F72987-01 </td><td><a href="http://docs.oracle.com/cd/F72987_01/homepage.htm">View Library</a></td>
                <td><a href="http://docs.oracle.com/cds/F72987_01.zip">Download</a></td><td>Documentation Library for Oracle Banking Digital Experience 22.2.0.0.0</td></tr>
                </table><h4>Documentation Library for Oracle Banking Digital Experience Cloud Service </h4><table>
                <tr><td>G55938-01 </td><td><a href="https://docs.oracle.com/en/industries/financial-services/banking-digital-experience-cloud-service/25.1.2.0.0/">View Library</a></td>
                <td>Documentation Library for Oracle Banking Digital Experience Cloud Service 25.1.2.0.0</td></tr></table>""";

        List<OracleLibrary.Release> releases = OracleLibrary.parseReleases(html, INDEX);

        assertThat(releases).extracting(OracleLibrary.Release::version).containsExactly("25.2.0.0.0", "22.2.0.0.0");
        assertThat(releases.get(1).libraryUrl()).isEqualTo("http://docs.oracle.com/cd/F72987_01/homepage.htm");
    }

    @Test
    void takesTheNewestPatchsetsFileOfEachManualInAnOlderLibrary() {
        String html = """
                <a href="tech_docs/Oracle Banking Digital Experience Security Guide.pdf" target="pdf">
                <a href="tech_docs-22.2.6/Oracle Banking Digital Experience Security Guide.pdf" target="pdf">
                <a href="tech_docs-22.2.2/Oracle Banking Digital Experience Security Guide.pdf" target="pdf">
                <a href="um_docs/User Manual Oracle Banking Digital Experience Core.pdf" target="pdf">""";
        var release = new OracleLibrary.Release("22.2.0.0.0", "http://docs.oracle.com/cd/F72987_01/homepage.htm");

        List<OracleLibrary.Manual> manuals = OracleLibrary.newestOfEach(OracleLibrary.parseOldLibrary(html, release));

        assertThat(manuals).hasSize(2);
        assertThat(manuals.get(0).title()).isEqualTo("Security Guide");
        assertThat(manuals.get(0).release()).isEqualTo("22.2.6");
        assertThat(manuals.get(0).technical()).isTrue();
        assertThat(manuals.get(0).url()).endsWith("/cd/F72987_01/tech_docs-22.2.6/Oracle%20Banking%20Digital%20Experience%20Security%20Guide.pdf");
        assertThat(manuals.get(1).title()).isEqualTo("User Manual - Core");
        assertThat(manuals.get(1).technical()).isFalse();
        assertThat(OracleManuals.patchset("22.2.6")).isEqualTo("22.2.6");
        assertThat(OracleManuals.patchset("22.2.0.0.0")).isNull();
    }

    @Test
    void readsTheBookListOfANewerLibrary() {
        String base = "https://docs.oracle.com/en/industries/financial-services/banking-digital-experience/25.2.0.0.0/";
        String home = """
                <script type="application/json" id="book-data">
                [{"title":"01. Core","html":"fxcre/","pdf":"//docs-stage.oracle.com/en/industries/financial-services/banking-digital-experience/25.2.0.0.0/fxcre/core.pdf","category":"Base"},
                 {"title":"02. Core - Corporate Admin","pdf":"fxcca/core-corporate-admin.pdf","category":"Base"}]
                </script><a href="technical.html">Technical</a><a href="index.html">Home</a><a href="/">Oracle</a>""";
        String technical = """
                <script type="application/json" id="book-data">[{"title":"05. Extensibility Guide","pdf":"txext/extensibility-guide.pdf","category":"Technical Guides"}]</script>""";

        List<OracleLibrary.Manual> manuals = library.parseBookData(home, "25.2.0.0.0", false, base + "index.html");
        List<OracleLibrary.Manual> guides = library.parseBookData(technical, "25.2.0.0.0", true, base + "technical.html");

        assertThat(manuals).extracting(OracleLibrary.Manual::title).containsExactly("User Manual - Core", "User Manual - Core - Corporate Admin");
        assertThat(manuals.get(1).url()).isEqualTo(base + "fxcca/core-corporate-admin.pdf");
        // Oracle's staging copy is fetched from the published site
        assertThat(library.allowed(manuals.get(0).url()).toString()).isEqualTo(base + "fxcre/core.pdf");
        assertThat(guides).singleElement().satisfies(g -> {
            assertThat(g.title()).isEqualTo("Extensibility Guide");
            assertThat(g.technical()).isTrue();
        });
        assertThat(OracleLibrary.libraryPages(home, base + "index.html")).containsExactly(base + "technical.html");
    }

    @Test
    void fetchesOnlyFromOraclesDocumentationSitesOverHttps() {
        assertThat(library.allowed("http://docs.oracle.com/cd/F72987_01/homepage.htm").toString())
                .isEqualTo("https://docs.oracle.com/cd/F72987_01/homepage.htm");
        assertThatThrownBy(() -> library.allowed("https://docs.example.com/core.pdf")).hasMessageContaining("Not one of Oracle");
        assertThatThrownBy(() -> library.allowed("https://docs.oracle.com.evil.example/core.pdf")).hasMessageContaining("Not one of Oracle");
        assertThatThrownBy(() -> library.allowed("https://user@docs.oracle.com/core.pdf")).hasMessageContaining("Not one of Oracle");
        assertThatThrownBy(() -> library.allowed("https://docs.oracle.com:8443/core.pdf")).hasMessageContaining("Not one of Oracle");
        assertThatThrownBy(() -> library.allowed("file:///etc/passwd")).hasMessageContaining("Not a web address");
    }

    @Test
    void keepsAPlainPdfAndRefusesActiveContent(@TempDir Path dir) throws Exception {
        Path plain = dir.resolve("plain.pdf");
        try (PDDocument pdf = new PDDocument()) {
            pdf.addPage(new PDPage());
            pdf.save(plain.toFile());
        }
        Path script = dir.resolve("script.pdf");
        try (PDDocument pdf = new PDDocument()) {
            pdf.addPage(new PDPage());
            pdf.getDocumentCatalog().setOpenAction(new PDActionJavaScript("app.alert('hi')"));
            pdf.save(script.toFile());
        }
        Path html = Files.writeString(dir.resolve("page.pdf"), "<html>not found</html>");

        assertThat(PdfSafety.problem(plain)).isNull();
        assertThat(PdfSafety.problem(script)).isEqualTo("it runs an action when opened");
        assertThat(PdfSafety.problem(html)).isEqualTo("it is not a PDF");
    }
}
