package com.bank.obdx.forms

import androidx.compose.runtime.mutableStateMapOf
import com.bank.obdx.i18n.t

/** What to check for one field before the form is sent. */
data class FieldRule(
    val label: String,
    val required: Boolean = false,
    val maxLength: Int? = null,
    /** Further checks from the spec; return a message when the value is not valid. */
    val check: ((Any?) -> String?)? = null,
)

/**
 * The values, messages and validation of one screen. Values are String, Double?, Boolean or List<String>; changing a
 * field clears its message. Compose redraws the screen when they change.
 */
class FormModel(initial: Map<String, Any?>, private val rules: Map<String, FieldRule>) {
    private val values = mutableStateMapOf<String, Any?>().apply { putAll(initial) }
    private val errors = mutableStateMapOf<String, String>()

    fun text(name: String): String = values[name] as? String ?: ""
    fun number(name: String): Double? = values[name] as? Double
    fun flag(name: String): Boolean = values[name] as? Boolean ?: false
    @Suppress("UNCHECKED_CAST")
    fun list(name: String): List<String> = values[name] as? List<String> ?: emptyList()
    /** A value to show as it is (read-only fields). */
    fun display(name: String): String = values[name]?.toString() ?: ""
    fun error(name: String): String? = errors[name]

    fun set(name: String, value: Any?) {
        values[name] = value
        errors.remove(name)
    }

    /** The values to send. */
    fun snapshot(): Map<String, Any?> = values.toMap()

    /** Checks every field; shows the messages and returns true when all are valid. */
    fun validate(): Boolean {
        errors.clear()
        for ((name, rule) in rules) {
            val value = values[name]
            val empty = value == null || value == "" || (value is List<*> && value.isEmpty())
            val message = when {
                rule.required && empty -> t("common.required", "label" to rule.label)
                rule.maxLength != null && value is String && value.length > rule.maxLength ->
                    t("common.tooLong", "label" to rule.label, "max" to rule.maxLength)
                rule.check != null && !empty -> rule.check.invoke(value)
                else -> null
            }
            if (message != null) errors[name] = message
        }
        return errors.isEmpty()
    }
}
