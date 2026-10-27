package com.obdx.factory.profile;

import java.util.List;

/**
 * Finds facts about one area of an OBDX codebase. Each detector always returns all of its fact keys,
 * using {@link ProfileFact#notFound} for what it could not detect, so the profile works as a complete checklist.
 */
public interface ProfileDetector {

    List<ProfileFact> detect(SourceTree tree);
}
