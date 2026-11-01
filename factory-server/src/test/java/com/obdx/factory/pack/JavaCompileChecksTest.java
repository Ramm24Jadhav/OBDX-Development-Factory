package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** QA round 12's BeneficiaryValidatorTest parsed and passed, but did not compile: helpers never written, a test written twice. */
public class JavaCompileChecksTest {

    public static String roundTwelve() throws IOException {
        try (InputStream in = JavaCompileChecksTest.class.getResourceAsStream("/qa/BeneficiaryValidatorTest-round12.java.txt")) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void methodsNeverWrittenAndATestWrittenTwiceFailTheFile() throws IOException {
        String test = roundTwelve();

        // assertFalse is used without its static import, the helpers are never written
        assertThat(JavaCompileChecks.undeclaredCalls(test)).containsOnlyKeys("createValidEntry", "hasErrorCode", "assertFalse");
        assertThat(JavaCompileChecks.duplicates(test)).singleElement()
                .satisfies(d -> assertThat(d.signature()).isEqualTo("testDuplicateClientRef()"));

        FileChecks.Result check = new LocalChecks(VersionPacks.builtIn())
                .check(new CheckScope("22.x", Map.of(), Set.of()), "backend/src/com/bank/obdx/payments/BeneficiaryValidatorTest.java", null, test);
        assertThat(check.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(check.message()).contains("(java-undeclared-method, error): Calls createValidEntry(...), which this class does not declare",
                "(java-duplicate-method, error): The method testDuplicateClientRef() is declared twice");
    }

    @Test
    void methodsTheClassMayGetElsewhereAreNotReported() {
        String helperCalls = "package x;\nclass A {\n    void a() { helper(); toString(); }\n}\n";
        assertThat(JavaCompileChecks.undeclaredCalls(helperCalls)).containsOnlyKeys("helper");
        // inherited from a superclass, an interface that is not the JDK's, or a static import of a class's members
        assertThat(JavaCompileChecks.undeclaredCalls(helperCalls.replace("class A {", "class A extends Base {"))).isEmpty();
        assertThat(JavaCompileChecks.undeclaredCalls(helperCalls.replace("class A {", "class A implements Helpers {"))).isEmpty();
        assertThat(JavaCompileChecks.undeclaredCalls("package x;\nimport static org.junit.Assert.*;\n" + helperCalls.substring(11))).isEmpty();
        // a JDK interface brings no such method: still reported
        assertThat(JavaCompileChecks.undeclaredCalls(helperCalls.replace("class A {", "class A implements Runnable {")
                .replace("void a()", "public void run()"))).containsOnlyKeys("helper");
        // a method of a nested class, an enum's values(), a statically imported method
        assertThat(JavaCompileChecks.undeclaredCalls("""
                package x;
                import static java.util.Objects.requireNonNull;
                class A {
                    enum Kind { ONE; static Kind first() { return values()[0]; } }
                    void a() { requireNonNull(this); new Inner().b(); c(); }
                    class Inner { void b() { } }
                    private void c() { }
                }
                """)).isEmpty();
        // overloads with other parameters are fine
        assertThat(JavaCompileChecks.duplicates("package x;\nclass A { void a(int i) { } void a(String s) { } }\n")).isEmpty();
    }

    @Test
    void theOutlineOfAPartTellsWhatIsWrittenAndWhatIsMissing() throws IOException {
        String test = roundTwelve();
        // cut off part-way, as a continuation sees it
        String part = test.substring(0, test.indexOf("// BR-006 / AC-004"));

        JavaCompileChecks.Outline outline = JavaCompileChecks.outline(part);

        assertThat(outline.methods()).containsExactly("setUp", "testInvalidIfscFormat", "testDuplicateClientRef");
        assertThat(outline.fields()).containsExactly("validator");
        assertThat(outline.missing()).containsExactly("createValidEntry", "hasErrorCode");
    }
}
