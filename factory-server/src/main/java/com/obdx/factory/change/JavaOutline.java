package com.obdx.factory.change;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.AnnotationDeclaration;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
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

    /**
     * "public record SiView(String amount, String currency)", "public class SiService extends Base implements X",
     * "public @interface Audited": built from the syntax tree, without annotations (whose values may hold braces).
     */
    static String header(TypeDeclaration<?> type) {
        StringBuilder out = new StringBuilder();
        type.getModifiers().forEach(m -> out.append(m.getKeyword().asString()).append(' '));
        if (type instanceof ClassOrInterfaceDeclaration c) {
            out.append(c.isInterface() ? "interface " : "class ").append(c.getNameAsString());
            if (!c.getTypeParameters().isEmpty()) {
                out.append(c.getTypeParameters().stream().map(Object::toString).collect(Collectors.joining(", ", "<", ">")));
            }
            if (!c.getExtendedTypes().isEmpty()) {
                out.append(" extends ").append(c.getExtendedTypes().stream().map(Object::toString).collect(Collectors.joining(", ")));
            }
            if (!c.getImplementedTypes().isEmpty()) {
                out.append(" implements ").append(c.getImplementedTypes().stream().map(Object::toString).collect(Collectors.joining(", ")));
            }
        } else if (type instanceof RecordDeclaration r) {
            out.append("record ").append(r.getNameAsString()).append(r.getParameters().stream()
                    .map(p -> p.getTypeAsString() + " " + p.getNameAsString()).collect(Collectors.joining(", ", "(", ")")));
            if (!r.getImplementedTypes().isEmpty()) {
                out.append(" implements ").append(r.getImplementedTypes().stream().map(Object::toString).collect(Collectors.joining(", ")));
            }
        } else if (type instanceof EnumDeclaration e) {
            out.append("enum ").append(e.getNameAsString());
            if (!e.getImplementedTypes().isEmpty()) {
                out.append(" implements ").append(e.getImplementedTypes().stream().map(Object::toString).collect(Collectors.joining(", ")));
            }
        } else if (type instanceof AnnotationDeclaration a) {
            out.append("@interface ").append(a.getNameAsString());
        } else {
            out.append(type.getNameAsString());
        }
        return out.toString();
    }

    /**
     * A REST resource as a screen's script needs it: the class's path and, for each method, its HTTP and path
     * annotations with its signature ("@POST @Path(\"/validation\") public Response validate(BeneficiaryRequest request)").
     */
    static String rest(String content) {
        if (content == null) {
            return "";
        }
        ParseResult<CompilationUnit> result = new JavaParser(new ParserConfiguration()
                .setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21)).parse(content);
        if (!result.isSuccessful() || result.getResult().isEmpty()) {
            return content.lines().filter(l -> l.contains("@Path") || l.contains("Mapping") || l.matches("\\s*@(GET|POST|PUT|DELETE).*"))
                    .map(String::strip).collect(Collectors.joining("\n"));
        }
        StringBuilder out = new StringBuilder();
        for (TypeDeclaration<?> type : result.getResult().get().getTypes()) {
            out.append(restAnnotations(type.getAnnotations())).append(header(type)).append('\n');
            for (com.github.javaparser.ast.body.MethodDeclaration m : type.getMethods()) {
                String web = restAnnotations(m.getAnnotations());
                if (!web.isEmpty()) {
                    out.append("    ").append(web).append(m.getDeclarationAsString(true, false, true)).append('\n');
                }
            }
        }
        return out.toString();
    }

    /** The annotations that say how a class or method is called over HTTP (JAX-RS and Spring), with their values. */
    private static String restAnnotations(com.github.javaparser.ast.NodeList<com.github.javaparser.ast.expr.AnnotationExpr> annotations) {
        return annotations.stream().filter(a -> a.getNameAsString().matches("(?:.*\\.)?(Path|GET|POST|PUT|DELETE|PATCH|Produces|Consumes|"
                + "RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RestController)"))
                .map(a -> a.toString() + " ").collect(Collectors.joining());
    }

    private static Node withoutComment(Node node) {
        Node copy = node.clone();
        copy.getAllContainedComments().forEach(com.github.javaparser.ast.comments.Comment::remove);
        copy.removeComment();
        return copy;
    }
}
