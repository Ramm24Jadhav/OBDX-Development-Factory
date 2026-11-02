package com.obdx.factory.requirements;

/** Lets tests of other packages read a document's structure (the class itself stays package-private). */
public final class DocumentStructureAccess {

    private DocumentStructureAccess() {
    }

    /** The messages read from a document's tables, by code. */
    public static java.util.List<RequirementSpec.Message> read(String text) {
        return DocumentStructure.read(text).messages();
    }

    /** The open questions once each, as a draft merges them (SpecMerger.questions). */
    public static java.util.List<RequirementSpec.OpenQuestion> questions(java.util.List<RequirementSpec.OpenQuestion> all) {
        return SpecMerger.questions(all);
    }
}
