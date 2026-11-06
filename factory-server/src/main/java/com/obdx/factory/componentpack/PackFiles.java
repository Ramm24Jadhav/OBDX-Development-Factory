package com.obdx.factory.componentpack;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

/**
 * The premium JET pack's own files, as the factory ships them. A change that installs or upgrades the pack writes them
 * into the bank's code exactly as they are (no model writes them): any planned file whose path ends in /bx/ and one of
 * these names gets the shipped content.
 */
public final class PackFiles {

    /** The files of the premium JET pack (target-packs/components/jet-premium/bx). */
    public static final List<String> JET_PREMIUM = List.of("bx.js", "bx-core.js", "bx-fields.js", "bx-elements.js", "bx-forms.js", "bx-motion.js", "bx-g1.js", "bx.css");

    private static final String BASE = "/target-packs/components/jet-premium/bx/";

    private PackFiles() {
    }

    /** The shipped content for a path of the bank's code, when it is one of the pack's files under a bx folder. */
    public static Optional<String> forPath(String path) {
        if (path == null) {
            return Optional.empty();
        }
        String normalized = path.replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        String name = normalized.substring(slash + 1);
        String folder = slash < 0 ? "" : normalized.substring(0, slash);
        if (!JET_PREMIUM.contains(name) || !(folder.equals("bx") || folder.endsWith("/bx"))) {
            return Optional.empty();
        }
        return Optional.of(read(name));
    }

    static String read(String name) {
        try (InputStream in = PackFiles.class.getResourceAsStream(BASE + name)) {
            if (in == null) {
                throw new IllegalStateException("The premium JET pack file " + name + " is missing from the factory");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
