package com.obdx.factory.knowledge;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionLaunch;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Checks a PDF fetched from the internet before the factory keeps it: it must be a PDF that opens without a password,
 * with no active content (document scripts, an action that runs when it opens, launching programs) and no files
 * embedded in it. Oracle's manuals have none of these; a file that has them is refused, not cleaned.
 */
final class PdfSafety {

    private PdfSafety() {
    }

    /** Why the file is refused, or null when it passed. */
    static String problem(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            byte[] head = in.readNBytes(1024);
            if (!new String(head, java.nio.charset.StandardCharsets.ISO_8859_1).contains("%PDF-")) {
                return "it is not a PDF";
            }
        } catch (IOException e) {
            return "it cannot be read";
        }
        try (PDDocument pdf = Loader.loadPDF(file.toFile())) {
            if (pdf.getNumberOfPages() == 0) {
                return "it has no pages";
            }
            PDDocumentCatalog catalog = pdf.getDocumentCatalog();
            var openAction = catalog.getOpenAction();
            if (openAction instanceof PDActionJavaScript || openAction instanceof PDActionLaunch) {
                return "it runs an action when opened";
            }
            if (catalog.getCOSObject().containsKey(COSName.AA)) {
                return "it has automatic actions";
            }
            PDDocumentNameDictionary names = catalog.getNames();
            if (names != null && names.getJavaScript() != null) {
                return "it contains scripts";
            }
            if (names != null && names.getEmbeddedFiles() != null) {
                return "it has files embedded in it";
            }
            return null;
        } catch (InvalidPasswordException e) {
            return "it needs a password";
        } catch (IOException | RuntimeException e) {
            return "it is not a valid PDF (" + e.getMessage() + ")";
        }
    }
}
