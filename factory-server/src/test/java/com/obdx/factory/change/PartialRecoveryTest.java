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
    void aKeptPartWithTooLittleLeftIsDroppedAndTheFileWrittenWhole() {
        String early = "package com.bank.beneficiary;\n\npublic class BeneficiaryValidationServiceTest {\n"
                + "    void a() { foo(; }\n" + "    void b() {\n        service.validate(\"x\");\n    }\n".repeat(60);

        assertThat(CodeGenerator.cleanPartial(PATH, early)).isNull();
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
