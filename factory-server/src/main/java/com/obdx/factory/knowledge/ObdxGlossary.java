package com.obdx.factory.knowledge;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The words people use for what the OBDX manuals name differently: a customer is a party or user, onboarding a user is
 * creating it in User Management (or the customer's self registration), a beneficiary is a payee, and a developer
 * adding a field to a screen extends a UI component. A question is also
 * searched in these words, which needs no model and works however small the configured one is.
 */
final class ObdxGlossary {

    private static final Map<String, String> TERMS = Map.ofEntries(
            Map.entry("onboard", "user management create registration"),
            Map.entry("onboarding", "user management create registration"),
            Map.entry("customer", "party user"),
            Map.entry("customers", "party user"),
            Map.entry("client", "party user"),
            Map.entry("unlock", "lock status user management"),
            Map.entry("locked", "lock status user management"),
            Map.entry("beneficiary", "payee"),
            Map.entry("beneficiaries", "payee"),
            Map.entry("register", "self registration"),
            Map.entry("signup", "self registration"),
            Map.entry("enrol", "self registration"),
            Map.entry("enroll", "self registration"),
            Map.entry("login", "login authentication"),
            Map.entry("otp", "two factor authentication otp"),
            Map.entry("2fa", "two factor authentication"),
            Map.entry("mfa", "two factor authentication"),
            Map.entry("permission", "application role transaction mapping"),
            Map.entry("permissions", "application role transaction mapping"),
            Map.entry("entitlement", "application role transaction mapping"),
            Map.entry("entitlements", "application role transaction mapping"),
            Map.entry("maker", "approval rules workflow"),
            Map.entry("checker", "approval rules workflow"),
            Map.entry("branding", "manage brand"),
            Map.entry("theme", "manage brand"),
            Map.entry("logo", "manage brand"),
            Map.entry("notification", "alerts"),
            Map.entry("notifications", "alerts"),
            Map.entry("fd", "term deposit"),
            // A developer adding a field or changing a screen extends a UI component
            Map.entry("field", "field ui component extensibility"),
            Map.entry("fields", "field ui component extensibility"),
            Map.entry("screen", "screen ui component extension"),
            Map.entry("screens", "screen ui component extension"),
            Map.entry("extend", "extensibility extension"),
            Map.entry("customise", "extensibility"),
            Map.entry("customize", "extensibility"),
            Map.entry("customisation", "extensibility"),
            Map.entry("customization", "extensibility"),
            Map.entry("cbs", "host integration"),
            Map.entry("flexcube", "host integration fcubs"));

    /**
     * Things the manuals do not do to a subject under the name people use: a user is not deleted or deactivated in OBDX,
     * it is locked (User Management, change user status) or its channel access is revoked.
     */
    private static final Map<String, Map<Set<String>, String>> ACTIONS = Map.of(
            "user", Map.of(Set.of("delete", "deleting", "deletion", "remove", "removing", "deactivate", "disable", "block", "terminate", "suspend"),
                    "user status lock channel access revoke"));

    private ObdxGlossary() {
    }

    /**
     * The question in the manuals' words, or null when none of its words has another name there. The words without one
     * are kept, so "onboarding a retail customer" becomes "user management create registration retail party user".
     */
    static String inManualWords(String question) {
        Set<String> words = new LinkedHashSet<>();
        boolean changed = false;
        List<String> asked = List.of((question == null ? "" : question).toLowerCase(Locale.ROOT).split("[^a-z0-9]+"));
        for (String word : asked) {
            String manual = TERMS.get(word);
            if (manual != null) {
                changed = true;
                words.add(manual);
            } else if (!word.isEmpty()) {
                words.add(word);
            }
        }
        for (Map.Entry<String, Map<Set<String>, String>> subject : ACTIONS.entrySet()) {
            if (asked.contains(subject.getKey()) || asked.contains(subject.getKey() + "s")) {
                for (Map.Entry<Set<String>, String> action : subject.getValue().entrySet()) {
                    if (asked.stream().anyMatch(action.getKey()::contains)) {
                        // in the manuals' words instead of the action asked, which would find it done to other things
                        changed = true;
                        words.removeAll(action.getKey());
                        words.add(action.getValue());
                    }
                }
            }
        }
        return changed ? String.join(" ", words) : null;
    }
}
