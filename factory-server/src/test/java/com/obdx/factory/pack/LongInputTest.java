package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

/**
 * Long strings and unclosed comments in generated files are checked without a stack overflow and in linear time: a
 * StackOverflowError used to end the background run and leave a change "generating" for good.
 */
class LongInputTest {

    private static final Duration QUICK = Duration.ofSeconds(2);
    private final LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
    private final CheckScope v22 = new CheckScope("22.x", Map.of(), Set.of());

    @Test
    void longStringsAndTemplateLiteralsAreScannedNotRecursed() {
        String js = "define(['knockout'], function (ko) {\n  const a = \"" + "x".repeat(10_000) + "\";\n  const b = `"
                + "y\\n".repeat(5_000) + "`;\n  const c = '" + "z".repeat(10_000) + "'; // let's assume it is fine\n  return ko;\n});\n";

        FileChecks.Result result = assertTimeoutPreemptively(QUICK, () -> checks.check(v22, "ui/js/viewModels/long.js", null, js));

        assertThat(result.message()).contains("no-model-reasoning");
        assertThat(SourceScan.scan(js, SourceScan.Syntax.CODE).strings()).hasSize(3 + 1);
    }

    @Test
    void anApostropheInASqlCommentDoesNotSwallowTheFile() {
        String sql = "-- customer's table\n" + "INSERT INTO T (A) VALUES (1);\n".repeat(100) + "SELECT 'x' FROM DUAL;\n";
        assertThat(sql.length()).isGreaterThan(2_600);

        assertThat(assertTimeoutPreemptively(QUICK, () -> ModelReasoning.findings("db/x.sql", null, sql))).isEmpty();
        assertThat(ModelReasoning.findings("db/x.sql", null, "-- customer's table\n-- the prompt says to add it\nSELECT 1 FROM DUAL;\n"))
                .singleElement().satisfies(f -> assertThat(f.line()).isEqualTo(2));
        // '' inside a string is a quote, not its end
        assertThat(SourceScan.scan("SELECT 'it''s -- no comment' FROM DUAL; -- comment", SourceScan.Syntax.SQL).comments()).hasSize(1);
    }

    @Test
    void unclosedCommentsTakeLinearTime() {
        String block = "/*" + "a".repeat(400_000);
        String markup = "<div><!--" + "b".repeat(400_000);

        assertTimeoutPreemptively(QUICK, () -> checks.check(v22, "ui/js/viewModels/open.js", null, block));
        assertTimeoutPreemptively(QUICK, () -> checks.check(v22, "backend/src/com/bank/Open.java", null, "class Open {}\n" + block));
        assertTimeoutPreemptively(QUICK, () -> ModelReasoning.findings("ui/views/open.html", null, markup));
        assertTimeoutPreemptively(QUICK, () -> ModelReasoning.findings("db/open.sql", null, "/*" + "c".repeat(400_000)));
    }

    @Test
    void aLongAnnotationStringIsReadWithoutOverflow() {
        String java = "package com.bank;\nimport javax.ws.rs.*;\n@Path(\"/x\")\nclass R {\n  @GET @Path(\"/{id}\") @Produces(\"" + "a".repeat(20_000)
                + "\")\n  public String read(@PathParam(\"id\") String id) { return id; }\n}\n";

        FileChecks.Result result = assertTimeoutPreemptively(QUICK, () -> checks.check(v22, "backend/src/com/bank/R.java", null, java));

        assertThat(result.message() == null ? "" : result.message()).doesNotContain("java-path-param");
    }
}
