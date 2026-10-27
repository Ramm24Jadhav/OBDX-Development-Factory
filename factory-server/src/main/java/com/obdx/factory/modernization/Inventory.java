package com.obdx.factory.modernization;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * The migration map of a bank's OBDX application, scanned from its code: every screen with what it shows, calls and
 * opens; the backend REST services; the services the UI calls; roles; and the user flows between screens.
 */
public record Inventory(Long revision, OffsetDateTime scannedAt, Summary summary, List<Module> modules, List<Screen> screens,
                        List<Endpoint> endpoints, List<ServiceCall> calls, List<Role> roles, List<Flow> flows, List<String> notes) {

    /** complexity: number of screens per size (S, M, L). */
    public record Summary(int screens, int modules, int fields, int endpoints, int calledServices, int callsWithoutBackend,
                          int roles, int flows, Map<String, Integer> complexity) {
    }

    public record Module(String name, int screens, int fields, Map<String, Integer> complexity) {
    }

    /**
     * One screen of the UI.
     *
     * @param id         unique within the inventory: the path of its view without extension
     * @param kind       view (views/ and viewModels/), component (folder with x.html and x.js), composite (JET composite
     *                   component) or vdom (JET VDOM component)
     * @param files      the view, view model, model and resource bundle found for it
     * @param calls      services it calls, as "METHOD path" (METHOD is ? when the code does not say)
     * @param opens      ids of screens it navigates to
     * @param score      the number behind the complexity: fields + 2 x actions + 3 x services + 2 x screens opened + lines / 50
     * @param complexity S, M or L
     */
    public record Screen(String id, String name, String module, String kind, List<String> files, int lines, List<Field> fields,
                         int actions, List<String> calls, List<String> opens, int score, String complexity) {
    }

    /** A field of a screen: Screen Model type, label (often a resource bundle binding) and the bound value. */
    public record Field(String type, String label, String binding) {
    }

    /**
     * A REST service in the backend code.
     *
     * @param product true for Oracle product code (com.ofss)
     * @param usedBy  ids of screens that call it
     */
    public record Endpoint(String method, String path, String javaClass, String javaMethod, String file, boolean product,
                           List<String> usedBy) {
    }

    /**
     * A service the UI calls.
     *
     * @param endpoint the backend endpoint it matches ("METHOD path"), or null when it is not in this codebase (usually an
     *                 Oracle OBDX product service)
     */
    public record ServiceCall(String method, String path, List<String> screens, String endpoint) {
    }

    /** A role or user segment, with where it was found. */
    public record Role(String name, String source, List<String> evidence) {
    }

    /** Screens connected by navigation, in the order they are reached, with the navigation steps. */
    public record Flow(String name, List<String> screens, List<String> steps) {
    }
}
