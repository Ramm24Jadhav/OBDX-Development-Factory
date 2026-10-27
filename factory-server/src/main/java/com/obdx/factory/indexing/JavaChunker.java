package com.obdx.factory.indexing;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.Range;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.CallableDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Splits Java files along their structure: one chunk per class outline (declaration, fields, method signatures)
 * and one per method or constructor, each with its Javadoc. Falls back to line windows if the file does not parse.
 */
class JavaChunker {

    private final LineWindowChunker fallback;
    private final JavaParser parser = new JavaParser(
            new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21));

    JavaChunker(LineWindowChunker fallback) {
        this.fallback = fallback;
    }

    List<Chunk> chunk(String fileName, String content) {
        ParseResult<CompilationUnit> result = parser.parse(content);
        if (!result.isSuccessful() || result.getResult().isEmpty()) {
            return fallback.chunk(fileName, content, 1);
        }
        String[] lines = content.split("\n", -1);
        List<Chunk> chunks = new ArrayList<>();
        for (TypeDeclaration<?> type : result.getResult().get().findAll(TypeDeclaration.class)) {
            String typeName = qualifiedTypeName(type);
            chunks.add(outline(type, typeName, lines));
            for (BodyDeclaration<?> member : type.getMembers()) {
                if (member instanceof CallableDeclaration<?> callable) {
                    addCallable(chunks, callable, typeName, lines);
                }
            }
        }
        return chunks.isEmpty() ? fallback.chunk(fileName, content, 1) : chunks;
    }

    private void addCallable(List<Chunk> chunks, CallableDeclaration<?> callable, String typeName, String[] lines) {
        Optional<Range> range = rangeWithComment(callable);
        if (range.isEmpty()) {
            return;
        }
        String params = callable.getParameters().stream()
                .map(p -> p.getType().asString())
                .collect(Collectors.joining(", "));
        String symbol = typeName + "." + callable.getNameAsString() + "(" + params + ")";
        int start = range.get().begin.line;
        int end = range.get().end.line;
        String body = slice(lines, start, end);
        // Very long methods are split so each chunk stays a useful size for search and for the model.
        List<Chunk> parts = fallback.chunk(symbol, body, start);
        for (Chunk part : parts) {
            chunks.add(new Chunk("method", symbol, part.startLine(), part.endLine(), part.content()));
        }
    }

    /** The type's declaration, fields and member signatures without method bodies: a compact summary of the class. */
    private Chunk outline(TypeDeclaration<?> type, String typeName, String[] lines) {
        Range range = rangeWithComment(type).orElseThrow();
        StringBuilder text = new StringBuilder();
        type.findCompilationUnit()
                .flatMap(CompilationUnit::getPackageDeclaration)
                .ifPresent(pkg -> text.append("package ").append(pkg.getNameAsString()).append(";\n\n"));
        int headerEnd = type.getMembers().isEmpty()
                ? range.end.line
                : rangeWithComment(type.getMember(0)).map(r -> r.begin.line - 1).orElse(range.begin.line);
        text.append(slice(lines, range.begin.line, Math.max(range.begin.line, headerEnd))).append('\n');
        for (BodyDeclaration<?> member : type.getMembers()) {
            if (member instanceof CallableDeclaration<?> callable) {
                text.append("    ").append(callable.getDeclarationAsString(true, true, true)).append(";\n");
            } else if (!(member instanceof TypeDeclaration<?>)) {
                member.getRange().ifPresent(r -> text.append(slice(lines, r.begin.line, r.end.line)).append('\n'));
            }
        }
        text.append("}");
        return new Chunk("class", typeName, range.begin.line, range.end.line, text.toString());
    }

    private static String qualifiedTypeName(TypeDeclaration<?> type) {
        List<String> names = new ArrayList<>();
        Node node = type;
        while (node != null) {
            if (node instanceof TypeDeclaration<?> t) {
                names.addFirst(t.getNameAsString());
            }
            node = node.getParentNode().orElse(null);
        }
        return String.join(".", names);
    }

    private static Optional<Range> rangeWithComment(Node node) {
        Optional<Range> range = node.getRange();
        Optional<Range> comment = node.getComment().flatMap(Node::getRange);
        if (range.isPresent() && comment.isPresent() && comment.get().begin.isBefore(range.get().begin)) {
            return Optional.of(new Range(comment.get().begin, range.get().end));
        }
        return range;
    }

    private static String slice(String[] lines, int startLine, int endLine) {
        int from = Math.max(0, startLine - 1);
        int to = Math.min(lines.length, endLine);
        return from >= to ? "" : String.join("\n", Arrays.copyOfRange(lines, from, to));
    }
}
