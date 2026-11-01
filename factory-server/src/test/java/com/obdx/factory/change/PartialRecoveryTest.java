package com.obdx.factory.change;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A file the model's limit stopped part-way: what is kept, cleaned, or given up when Continue cannot use it. */
class PartialRecoveryTest {

    private static final UUID CHANGE = UUID.randomUUID();
    private static final String PATH = "backend/src/com/bank/beneficiary/BeneficiaryValidationServiceTest.java";

    /** QA round 10's kept part: a seam that lost text around line 143, then the model's reasoning. */
    private static String roundTenPartial() {
        StringBuilder java = new StringBuilder("""
                package com.bank.beneficiary;

                import org.junit.jupiter.api.Test;

                public class BeneficiaryValidationServiceTest {

                    private final BeneficiaryValidationService service = new BeneficiaryValidationService();

                """);
        for (int i = 0; java.toString().lines().count() < 138; i++) {
            java.append("    @Test\n    void rule").append(i).append("() {\n        service.validate(\"name").append(i).append("\");\n    }\n\n");
        }
        java.append("    @Test\n    void rejectsAShortName() {\n");
        java.append("        BeneficiaryValidationRequest request = new BeneficiaryValidationRequest();\n");
        // the old stitch joined the cut line and the continuation in the middle of a call
        java.append("        request.setBeneficiary(new BeneficiaryValidationRequest.BeneficiaryName(\"AB\"); // 2 chars, too short\n");
        java.append("        service.validate(request);\n    }\n\n");
        java.append("    // Wait, I already wrote that line\n    // Let's check the remaining tests\n    @Test\n    void more() {\n");
        return java.toString();
    }

    private static ChangeFileStore.ChangeFile kept(String generated) {
        return new ChangeFileStore.ChangeFile(0, PATH, "create", "test", null, ChangeFileStore.Status.FAILED, null, generated, false,
                FileChecks.Status.FAILED, CodeGenerator.PARTIAL + " Continue generation goes on from here when the limit resets, or write it again.", 2);
    }

    @Test
    void aJoinThatFailsWhileResumingClearsTheKeptPart() {
        ChangeFileStore files = mock(ChangeFileStore.class);
        when(files.file(CHANGE, PATH)).thenReturn(Optional.of(kept("public class BeneficiaryValidationServiceTest {\n")));
        CodeGenerator.JoinFailed failed = new CodeGenerator.JoinFailed(
                "The model's answer came in pieces that did not join cleanly (Java does not parse: (line 144,col 1)); write it again.");

        Logger logger = (Logger) LoggerFactory.getLogger(ChangeService.class);
        ListAppender<ILoggingEvent> logged = new ListAppender<>();
        logged.start();
        logger.addAppender(logged);
        String reason;
        try {
            reason = ChangeService.recordFailure(files, CHANGE, PATH, null, failed);
        } finally {
            logger.detachAppender(logged);
        }

        assertThat(reason).contains("did not join cleanly");
        // no content and no "Cut off" status: not written, so Continue writes it whole instead of failing on the same text
        verify(files).saveResult(eq(CHANGE), eq(PATH), eq(ChangeFileStore.Status.FAILED), isNull(), isNull(), eq(false),
                eq(new FileChecks.Result(FileChecks.Status.FAILED, failed.getMessage())), eq(2));
        ChangeFileStore.ChangeFile after = new ChangeFileStore.ChangeFile(0, PATH, "create", "test", null, ChangeFileStore.Status.FAILED,
                null, null, false, FileChecks.Status.FAILED, failed.getMessage(), 2);
        assertThat(ChangeService.partial(after)).isFalse();
        assertThat(ChangeService.notWritten(java.util.List.of(after))).containsExactly(PATH);
        // one line, without a stack trace
        assertThat(logged.list).singleElement().satisfies(e -> {
            assertThat(e.getLevel()).isEqualTo(ch.qos.logback.classic.Level.WARN);
            assertThat(e.getThrowableProxy()).isNull();
        });

        // any other failure keeps the part for the next Continue
        ChangeFileStore others = mock(ChangeFileStore.class);
        when(others.file(CHANGE, PATH)).thenReturn(Optional.of(kept("public class BeneficiaryValidationServiceTest {\n")));
        ChangeService.recordFailure(others, CHANGE, PATH, null, new IllegalStateException("timed out"));
        verify(others, never()).saveResult(any(), anyString(), any(), any(), any(), eq(false), any(), anyInt());
    }

    @Test
    void theKeptPartIsCutBeforeItsBrokenSeamAndItsReasoningBeforeContinuing() {
        String partial = roundTenPartial();

        String cleaned = CodeGenerator.cleanPartial(PATH, partial);

        assertThat(cleaned).contains("public class BeneficiaryValidationServiceTest {", "void rule0()")
                .doesNotContain("BeneficiaryName(\"AB\")").doesNotContain("Wait").doesNotContain("Let's check")
                .endsWith("\n");
        assertThat(cleaned.lines().count()).isLessThan(partial.lines().count() - 5).isGreaterThan(partial.lines().count() / 2);
        // what is left parses up to its end: the next continuation joins on a whole, valid line
        assertThat(CodeGenerator.brokenLine(PATH, cleaned)).isZero();
        // a part that is only cut off at its end is kept as it is
        assertThat(CodeGenerator.cleanPartial(PATH, cleaned)).isEqualTo(cleaned);
    }

    @Test
    void aRewriteStoppedByTheLimitIsKeptBesideThePreviousVersionAndResumed() {
        String previousVersion = "public class RemarksValidator {\n    void check(String remarks) { }\n}\n";
        ChangeFileStore.ChangeFile written = new ChangeFileStore.ChangeFile(0, "backend/RemarksValidator.java", "create", "service", null,
                ChangeFileStore.Status.GENERATED, null, previousVersion, false, FileChecks.Status.FAILED, "Line 2 (java-x, error): ...", 1);
        java.util.Deque<String> replies = new java.util.ArrayDeque<>();
        java.util.List<String> prompts = new java.util.ArrayList<>();
        com.obdx.factory.model.ModelGateway groq = new com.obdx.factory.model.ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                prompts.add(userPrompt);
                String reply = replies.removeFirst();
                if (reply.equals("LIMIT")) {
                    throw new com.obdx.factory.model.ModelLimitReachedException("daily limit", true, "about 15 minutes", null);
                }
                return reply.startsWith("CUT:") ? new ChatResult(reply.substring(4), "scripted", 1, true) : new ChatResult(reply, "scripted", 1);
            }

            @Override
            public ChatResult chatJson(String systemPrompt, String userPrompt) {
                throw new UnsupportedOperationException();
            }

            @Override
            public float[] embed(String text) {
                throw new UnsupportedOperationException();
            }

            @Override
            public java.util.List<float[]> embedAll(java.util.List<String> texts) {
                throw new UnsupportedOperationException();
            }
        };
        CodeGenerator generator = new CodeGenerator(groq, new ChangeProperties(30, 25, org.springframework.util.unit.DataSize.ofKilobytes(80), 0,
                "branches/factory", "-"), new com.obdx.factory.pack.LocalChecks(com.obdx.factory.pack.VersionPacks.builtIn()));
        ChangeContext context = new ChangeContext("Remarks", "{\"screens\": []}", "[]", "- Java version: Java 8", "backend/: 3");
        ChangePlan.Item item = new ChangePlan.Item("backend/RemarksValidator.java", "create", "service", "Validate remarks", java.util.List.of(), null);
        ChangePlan plan = new ChangePlan("Add remarks", java.util.List.of(item), java.util.List.of());

        // Write again: the first piece is cut off at max_tokens, the continuation refused on the daily limit
        replies.add("CUT:public class RemarksValidator {\n    void check(String remarks) {\n        if (remarks.length() > 35) {\n");
        replies.add("LIMIT");
        CodeGenerator.Partial stopped = org.assertj.core.api.Assertions.catchThrowableOfType(CodeGenerator.Partial.class,
                () -> generator.generate(context, plan, item, null, java.util.Map.of(), java.util.Map.of(), "use a constant"));
        ChangeFileStore files = mock(ChangeFileStore.class);
        when(files.file(CHANGE, item.path())).thenReturn(Optional.of(written));
        ChangeService.recordPartial(files, CHANGE, item.path(), null, stopped);

        // the previous version stays the content; the new part is kept beside it
        verify(files).saveRewrite(CHANGE, item.path(), stopped.content());
        verify(files, never()).saveResult(any(), anyString(), any(), any(), any(), eq(false), any(), anyInt());
        ChangeFileStore.ChangeFile withRewrite = new ChangeFileStore.ChangeFile(0, item.path(), "create", "service", null,
                ChangeFileStore.Status.GENERATED, null, previousVersion, false, FileChecks.Status.FAILED, "Line 2 (java-x, error): ...", 1,
                stopped.content());
        assertThat(ChangeService.withRewrite(withRewrite)).startsWith("Rewrite in progress: " + stopped.content().length()
                + " characters written; Write again (or Continue) goes on from it.\nLine 2");
        // Continue takes it up; delivery still has the previous version
        assertThat(ChangeService.continued(java.util.List.of(withRewrite))).containsExactly(item.path());
        assertThat(ChangeService.unwritten(java.util.List.of(withRewrite))).isEmpty();
        assertThat(ChangeService.stoppedMessage(new com.obdx.factory.model.ModelLimitReachedException("x", true, "about 15 minutes", null),
                item.path(), 1, 1, item.path())).endsWith("The rewrite written so far is kept beside it; Write again (or Continue) goes on from it.");

        // the next Write again resumes the rewrite instead of starting over
        String resumed = ChangeService.resumable(files, CHANGE, withRewrite);
        assertThat(resumed).isEqualTo(stopped.content());
        prompts.clear();
        replies.add("        if (remarks.length() > 35) {\n            throw new IllegalArgumentException();\n        }\n    }\n}\n");
        CodeGenerator.Result done = generator.generate(context, plan, item, null, null, java.util.Map.of(), java.util.Map.of(), "use a constant", null, resumed);

        assertThat(prompts).singleElement().asString().contains("The file so far ends with:\npublic class RemarksValidator {");
        assertThat(done.content()).contains("throw new IllegalArgumentException();").endsWith("}\n");
    }

    @Test
    void aWholeAnswerWhoseFixWasStoppedIsTheContentOfAFileThatHadNone() {
        FileChecks.Result failed = new FileChecks.Result(FileChecks.Status.FAILED, "Line 3 (java-duplicate-method, error): ...");
        CodeGenerator.Partial stopped = new CodeGenerator.Partial(new com.obdx.factory.model.ModelLimitReachedException("x", true, null),
                "public class A { }\n", failed);

        ChangeFileStore none = mock(ChangeFileStore.class);
        when(none.file(CHANGE, PATH)).thenReturn(Optional.empty());
        ChangeService.recordPartial(none, CHANGE, PATH, null, stopped);
        verify(none).saveResult(CHANGE, PATH, ChangeFileStore.Status.GENERATED, null, "public class A { }\n", false, failed, 1);

        // a file with a version keeps it, and the whole answer waits beside it for the next Write again
        ChangeFileStore written = mock(ChangeFileStore.class);
        when(written.file(CHANGE, PATH)).thenReturn(Optional.of(new ChangeFileStore.ChangeFile(0, PATH, "create", "test", null,
                ChangeFileStore.Status.GENERATED, null, "public class Old { }\n", false, FileChecks.Status.PASSED, null, 1)));
        ChangeService.recordPartial(written, CHANGE, PATH, null, stopped);
        verify(written).saveRewrite(CHANGE, PATH, "public class A { }\n");
    }

    @Test
    void aCleanShortKeptPartIsResumedNotDropped() {
        // QA round 16: a clean 3,305-character first piece of a file of about 12,000, the day's only progress
        StringBuilder part = new StringBuilder("""
                package com.bank.obdx.payments;

                import org.junit.Before;
                import org.junit.Test;

                import static org.junit.Assert.assertEquals;

                public class BeneficiaryValidatorTest {

                    private BeneficiaryValidator validator;

                    @Before
                    public void setUp() {
                        validator = new BeneficiaryValidator();
                    }

                """);
        for (int i = 0; part.length() < 3300; i++) {
            part.append("    @Test\n    public void rule").append(i).append("() {\n        assertEquals(").append(i)
                    .append(", validator.count(\"REF").append(i).append("\"));\n    }\n\n");
        }
        String clean = part.toString().stripTrailing() + "\n";

        assertThat(CodeGenerator.cleanPartial(PATH, clean)).isEqualTo(clean);
        // the model named the class otherwise than the file: still a class, still resumed
        assertThat(CodeGenerator.cleanPartial(PATH, clean.replace("class BeneficiaryValidatorTest", "class BeneficiaryValidatorTests")))
                .contains("class BeneficiaryValidatorTests");
        ChangeFileStore files = mock(ChangeFileStore.class);
        assertThat(ChangeService.usablePartial(files, CHANGE, kept(clean))).isEqualTo(clean);
        verify(files, never()).saveResult(any(), anyString(), any(), any(), any(), eq(false), any(), anyInt());
    }

    @Test
    void aKeptPartWithTooLittleLeftIsDroppedAndTheFileWrittenWhole() {
        // the model's reasoning starts early: what is before it is too little to go on from
        String early = "package com.bank.beneficiary;\n\npublic class BeneficiaryValidationServiceTest {\n"
                + "    // Wait, I already wrote the tests below\n" + "    void b() {\n        service.validate(\"x\");\n    }\n".repeat(60);

        assertThat(CodeGenerator.cleanPartial(PATH, early)).isNull();
        // a parse error early in the part is the model's own (seams are at its end): the part is kept, and fixed when complete
        String ownError = "package com.bank.beneficiary;\n\npublic class BeneficiaryValidationServiceTest {\n"
                + "    void a() { foo(; }\n" + "    void b() {\n        service.validate(\"x\");\n    }\n".repeat(60);
        assertThat(CodeGenerator.cleanPartial(PATH, ownError)).isEqualTo(ownError);
        // without its class it is no use either
        assertThat(CodeGenerator.cleanPartial(PATH, "    void b() {\n        service.validate(\"x\");\n    }\n")).isNull();

        // Continue saves the outcome: the cleaned part, or no part at all
        ChangeFileStore files = mock(ChangeFileStore.class);
        assertThat(ChangeService.usablePartial(files, CHANGE, kept(early))).isNull();
        verify(files).saveResult(eq(CHANGE), eq(PATH), eq(ChangeFileStore.Status.FAILED), isNull(), isNull(), eq(false), any(), eq(2));

        ChangeFileStore cleanedStore = mock(ChangeFileStore.class);
        String cleaned = ChangeService.usablePartial(cleanedStore, CHANGE, kept(roundTenPartial()));
        verify(cleanedStore).saveResult(eq(CHANGE), eq(PATH), eq(ChangeFileStore.Status.FAILED), isNull(), eq(cleaned), eq(false),
                eq(new FileChecks.Result(FileChecks.Status.FAILED, kept(cleaned).checkMessage())), eq(2));
        assertThat(ChangeService.partial(kept(cleaned))).isTrue();
    }
}
