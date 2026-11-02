package com.obdx.factory.requirements;

/** Lets tests of other packages read a document's structure (the class itself stays package-private). */
public final class DocumentStructureAccess {

    private DocumentStructureAccess() {
    }

    /** The messages read from a document's tables, by code. */
    public static java.util.List<RequirementSpec.Message> read(String text) {
        return DocumentStructure.read(text).messages();
    }

    /** The open questions of a drafted spec after the document's own are applied (DocumentStructure.read and apply). */
    public static java.util.List<RequirementSpec.OpenQuestion> questionsWith(String documentText,
                                                                             java.util.List<RequirementSpec.OpenQuestion> drafted) {
        RequirementSpec spec = new RequirementSpec("x", null, java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(),
                java.util.List.of(), java.util.List.of(), drafted, java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(),
                java.util.List.of(), java.util.List.of(), java.util.List.of());
        return DocumentStructure.apply(spec, DocumentStructure.read(documentText)).openQuestions();
    }

    /** The open questions once each, as a draft merges them (SpecMerger.questions). */
    public static java.util.List<RequirementSpec.OpenQuestion> questions(java.util.List<RequirementSpec.OpenQuestion> all) {
        return SpecMerger.questions(all);
    }
}
