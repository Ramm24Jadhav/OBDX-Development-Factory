package com.obdx.factory.change;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.CallableDeclaration;
import com.github.javaparser.ast.body.EnumConstantDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.RecordDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;

import java.util.stream.Collectors;

/**
 * A Java file as its outline: package, types with their fields, method and constructor signatures, enum constants,
 * record components and nested types, without bodies. What another file needs to call it, in a fraction of its size.
 */
final class JavaOutline {

    private JavaOutline() {
    }

    /** The outline, or the first 30 lines when the file does not parse. */
    static String of(String content) {
        if (content == null) {
            return "";
        }
        ParseResult<CompilationUnit> result = new JavaParser(new ParserConfiguration()
                .setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21)).parse(content);
        if (!result.isSuccessful() || result.getResult().isEmpty()) {
            return content.lines().limit(30).collect(Collectors.joining("\n"));
        }
        CompilationUnit unit = result.getResult().get();
        StringBuilder out = new StringBuilder();
        unit.getPackageDeclaration().ifPresent(p -> out.append("package ").append(p.getNameAsString()).append(";\n"));
        for (TypeDeclaration<?> type : unit.getTypes()) {
            type(type, "", out);
        }
        return out.toString();
    }

    private static void type(TypeDeclaration<?> type, String indent, StringBuilder out) {
        out.append(indent).append(header(type)).append(" {\n");
        String inner = indent + "    ";
        if (type instanceof EnumDeclaration e) {
            out.append(inner).append(e.getEntries().stream().map(EnumConstantDeclaration::getNameAsString).collect(Collectors.joining(", ")))
                    .append(";\n");
        }
        for (BodyDeclaration<?> member : type.getMembers()) {
            if (member instanceof FieldDeclaration f) {
                out.append(inner).append(withoutComment(f).toString().replaceAll("\\s*=.*;$", ";").replaceAll("\\s+", " ")).append('\n');
            } else if (member instanceof CallableDeclaration<?> c) {
                out.append(inner).append(c.getDeclarationAsString(true, true, true)).append(";\n");
            } else if (member instanceof TypeDeclaration<?> nested) {
                type(nested, inner, out);
            }
        }
        out.append(indent).append("}\n");
    }

    /** "public record SiView(String amount, String currency)", "public class SiService implements X" */
    private static String header(TypeDeclaration<?> type) {
        String text = withoutComment(type).toString();
        int body = text.indexOf('{');
        String header = (body < 0 ? text : text.substring(0, body)).replaceAll("@\\w+(\\([^)]*\\))?\\s*", "").replaceAll("\\s+", " ").strip();
        return type instanceof RecordDeclaration || !header.isEmpty() ? header : type.getNameAsString();
    }

    private static Node withoutComment(Node node) {
        Node copy = node.clone();
        copy.getAllContainedComments().forEach(com.github.javaparser.ast.comments.Comment::remove);
        copy.removeComment();
        return copy;
    }
}
