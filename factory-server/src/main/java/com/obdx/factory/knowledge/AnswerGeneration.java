package com.obdx.factory.knowledge;

import java.util.Locale;

/**
 * How an answer is written: the rules every answer follows (from the sources only, cited, in Markdown, without filler),
 * how much detail the user asked for, and a layout that fits the kind of question (steps for a procedure, a table for a
 * comparison, causes and fixes for an error). Sections the sources do not support are left out, so the layout is a
 * guide, not a template to fill.
 */
final class AnswerGeneration {

    /** How much detail the user wants. */
    enum Style {
        CONCISE, DETAILED, DEEP_DIVE;

        static Style of(String value) {
            if (value == null || value.isBlank()) {
                return DETAILED;
            }
            try {
                return valueOf(value.strip().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_'));
            } catch (IllegalArgumentException e) {
                return DETAILED;
            }
        }
    }

    static final String FORMAT = """
            Write the answer in Markdown. Start with the direct answer to the question, in one or two sentences: no \
            opening line about the sources ("Based on the provided sources...") and no closing summary, offer of further \
            help or question back. Use "## " for section headings (never "# "), and headings only when the answer has \
            more than one part. Use a numbered list for steps done in order, bullets for points in no order, a table for \
            a comparison, and fenced code blocks with their language for code, JSON, XML and configuration, copied \
            exactly from the sources. Bold only the names of menus, screens, fields and buttons. Say each thing once. \
            Copy technical identifiers (class names, services, APIs, configuration keys, error codes, menu paths) exactly \
            as the sources write them, and never write one the sources do not have. Keep what the sources state apart \
            from your own reading of them, which starts with "This suggests" or "In practice". Leave out a section the \
            sources do not support, and end with a short "What the manuals do not cover" line only when part of the \
            question is not covered.""";

    private AnswerGeneration() {
    }

    /** The whole instruction for the model: the knowledge rules, the format, the detail, the layout. */
    static String system(String rules, Style style, QueryUnderstanding.Type type) {
        return rules + "\n\n" + FORMAT + "\n\n" + detail(style) + "\n\n" + layout(type);
    }

    static String detail(Style style) {
        return switch (style) {
            case CONCISE -> "Detail: concise. At most about 120 words: the direct answer and the essential steps or facts with their "
                    + "citations, without headings.";
            case DETAILED -> "Detail: detailed. The direct answer, then the explanation with the components, screens or settings "
                    + "involved and the context the sources give.";
            case DEEP_DIVE -> "Detail: technical deep dive, for a developer. The execution sequence, configuration, APIs, classes, "
                    + "dependencies and code examples, each only as far as the sources give them; say where the sources stop.";
        };
    }

    static String layout(QueryUnderstanding.Type type) {
        return "Layout for this kind of question (" + type.name().toLowerCase(Locale.ROOT) + "), using only the parts the sources support: "
                + switch (type) {
                    case CONCEPT -> "the direct answer; the explanation; the OBDX components involved.";
                    case ARCHITECTURE -> "an overview; the components and what each is responsible for; how they relate and the order "
                            + "in which they act.";
                    case PROCEDURE -> "who does it and where (the menu path); the numbered steps; what happens after; the rules or "
                            + "limits the sources give.";
                    case IMPLEMENTATION -> "the objective; prerequisites; the implementation steps; the classes, files and "
                            + "configuration involved; how to check it works.";
                    case CONFIGURATION -> "where it is configured; the property or setting names with their values and meaning; "
                            + "prerequisites; the expected behaviour.";
                    case API -> "the purpose; the endpoint and method; the request; the response; authentication; errors.";
                    case TROUBLESHOOTING -> "the problem; its documented causes; how to diagnose it; the resolution.";
                    case COMPARISON -> "a comparison table of the things compared; the key differences; what they mean in practice.";
                    case INTEGRATION -> "the systems involved; how they connect (adapters, services, configuration); the flow between "
                            + "them; what to configure.";
                    case SECURITY -> "what it protects against; how OBDX does it; what to configure; the recommendations the sources "
                            + "make.";
                    case PERFORMANCE -> "what affects it; the settings or practices the sources recommend; how to check it.";
                };
    }
}
