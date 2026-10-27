package com.obdx.factory.indexing;

import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class ChunkersTest {

    private final Chunkers chunkers = new Chunkers(new IndexingProperties(List.of(), DataSize.ofKilobytes(512), 60, true, 16));

    @Test
    void splitsJavaIntoClassOutlineAndMethods() {
        String source = """
                package com.bank.obdx.payments;

                import java.math.BigDecimal;

                /**
                 * Handles own-account fund transfers.
                 */
                public class FundTransferService {

                    private final LimitChecker limits;

                    public FundTransferService(LimitChecker limits) {
                        this.limits = limits;
                    }

                    /** Moves money between two accounts of the same customer. */
                    public TransferResult transfer(TransferRequest request, BigDecimal amount) {
                        limits.check(request.customerId(), amount);
                        return TransferResult.ok();
                    }
                }
                """;

        List<Chunk> chunks = chunkers.chunk("src/com/bank/obdx/payments/FundTransferService.java", "java", source);

        assertThat(chunks).extracting(Chunk::kind, Chunk::symbol).containsExactly(
                org.assertj.core.groups.Tuple.tuple("class", "FundTransferService"),
                org.assertj.core.groups.Tuple.tuple("method", "FundTransferService.FundTransferService(LimitChecker)"),
                org.assertj.core.groups.Tuple.tuple("method", "FundTransferService.transfer(TransferRequest, BigDecimal)"));

        Chunk outline = chunks.get(0);
        assertThat(outline.startLine()).isEqualTo(5);
        assertThat(outline.content())
                .contains("package com.bank.obdx.payments;")
                .contains("Handles own-account fund transfers.")
                .contains("private final LimitChecker limits;")
                .contains("public TransferResult transfer(TransferRequest request, BigDecimal amount);")
                .doesNotContain("limits.check");

        Chunk transfer = chunks.get(2);
        assertThat(transfer.startLine()).isEqualTo(16);
        assertThat(transfer.endLine()).isEqualTo(20);
        assertThat(transfer.content()).startsWith("    /** Moves money").contains("limits.check(request.customerId(), amount);");
    }

    @Test
    void fallsBackToLineWindowsWhenJavaDoesNotParse() {
        List<Chunk> chunks = chunkers.chunk("Broken.java", "java", "public class Broken { void x( }");

        assertThat(chunks).singleElement().satisfies(chunk -> {
            assertThat(chunk.kind()).isEqualTo("file");
            assertThat(chunk.symbol()).isEqualTo("Broken.java");
        });
    }

    @Test
    void splitsLongFilesIntoOverlappingWindows() {
        String content = IntStream.rangeClosed(1, 150).mapToObj(i -> "line " + i).collect(Collectors.joining("\n"));

        List<Chunk> chunks = chunkers.chunk("js/viewModels/transfer.js", "javascript", content);

        assertThat(chunks).extracting(Chunk::startLine, Chunk::endLine).containsExactly(
                org.assertj.core.groups.Tuple.tuple(1, 60),
                org.assertj.core.groups.Tuple.tuple(51, 110),
                org.assertj.core.groups.Tuple.tuple(101, 150));
        assertThat(chunks.get(1).content()).startsWith("line 51").endsWith("line 110");
        assertThat(chunks).allSatisfy(chunk -> assertThat(chunk.symbol()).isEqualTo("transfer.js"));
    }

    @Test
    void keepsSmallFilesWhole() {
        assertThat(chunkers.chunk("config/app.properties", "properties", "a=1\nb=2\n\n"))
                .singleElement()
                .satisfies(chunk -> {
                    assertThat(chunk.kind()).isEqualTo("file");
                    assertThat(chunk.endLine()).isEqualTo(2);
                });
    }
}
