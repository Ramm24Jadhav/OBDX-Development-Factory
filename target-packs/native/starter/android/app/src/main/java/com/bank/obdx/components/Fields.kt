package com.bank.obdx.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/*
 * The form fields every generated screen uses. They take the same props as the other packs: testTag (the Screen Model
 * id), label, value, onValueChange, error, required, readOnly, maxLength, helpText, placeholder (and options). Errors
 * are announced (a live region), and every control is at least 48 dp tall.
 */

@Composable
private fun Message(error: String?, helpText: String?) {
    val bx = LocalBx.current
    when {
        error != null -> Text(error, color = bx.dangerText, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
        helpText != null -> Text(helpText, color = bx.textMuted)
    }
}

private fun labelOf(label: String, required: Boolean) = if (required) "$label *" else label

@Composable
fun BxTextField(
    testTag: String, label: String, value: String, onValueChange: (String) -> Unit = {}, error: String? = null, required: Boolean = false,
    readOnly: Boolean = false, maxLength: Int? = null, helpText: String? = null, placeholder: String? = null, singleLine: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Column(Modifier.fillMaxWidth().testTag(testTag).bxShake(error)) {
        OutlinedTextField(
            value = value,
            onValueChange = { if (maxLength == null || it.length <= maxLength) onValueChange(it) },
            label = { Text(labelOf(label, required)) },
            placeholder = placeholder?.let { { Text(it) } },
            readOnly = readOnly,
            isError = error != null,
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 3,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth().heightIn(min = BxSizes.minTouch).testTag("$testTag-input"),
        )
        Message(error, helpText)
    }
}

@Composable
fun BxTextArea(
    testTag: String, label: String, value: String, onValueChange: (String) -> Unit = {}, error: String? = null, required: Boolean = false,
    readOnly: Boolean = false, maxLength: Int? = null, helpText: String? = null, placeholder: String? = null,
) = BxTextField(testTag, label, value, onValueChange, error, required, readOnly, maxLength, helpText ?: maxLength?.let { "${value.length}/$it" },
    placeholder, singleLine = false)

/** A number (null when empty), on the number pad. */
@Composable
fun BxNumberField(
    testTag: String, label: String, value: Double?, onValueChange: (Double?) -> Unit = {}, error: String? = null, required: Boolean = false,
    readOnly: Boolean = false, helpText: String? = null, placeholder: String? = null, decimals: Int = 0,
) {
    var text by remember { mutableStateOf(value?.let { if (decimals == 0) it.toLong().toString() else it.toString() } ?: "") }
    BxTextField(testTag, label, text, { typed ->
        val clean = typed.filter { it.isDigit() || (decimals > 0 && it == '.') }
        text = clean
        onValueChange(clean.toDoubleOrNull())
    }, error, required, readOnly, null, helpText, placeholder, keyboardType = if (decimals > 0) KeyboardType.Decimal else KeyboardType.Number)
}

/** A money amount: the currency's decimals (two unless set), on the decimal pad. */
@Composable
fun BxAmountField(
    testTag: String, label: String, value: Double?, onValueChange: (Double?) -> Unit = {}, error: String? = null, required: Boolean = false,
    readOnly: Boolean = false, helpText: String? = null, placeholder: String? = null, decimals: Int = 2,
) = BxNumberField(testTag, label, value, onValueChange, error, required, readOnly, helpText, placeholder, decimals)

/** A date as YYYY-MM-DD (a calendar sheet can replace the text field with the same props). */
@Composable
fun BxDateField(
    testTag: String, label: String, value: String, onValueChange: (String) -> Unit = {}, error: String? = null, required: Boolean = false,
    readOnly: Boolean = false, @Suppress("UNUSED_PARAMETER") maxLength: Int? = null, helpText: String? = null, placeholder: String? = "YYYY-MM-DD",
) = BxTextField(testTag, label, value, { onValueChange(it.filter { c -> c.isDigit() || c == '-' }.take(10)) }, error, required, readOnly, 10, helpText,
    placeholder, keyboardType = KeyboardType.Number)

/** Choose one option from a list (the customer's accounts show masked numbers). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BxSelectField(
    testTag: String, label: String, value: String, onValueChange: (String) -> Unit = {}, error: String? = null, options: List<String>,
    required: Boolean = false, readOnly: Boolean = false, @Suppress("UNUSED_PARAMETER") maxLength: Int? = null, helpText: String? = null,
    placeholder: String? = null,
) {
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().testTag(testTag).bxShake(error)) {
        ExposedDropdownMenuBox(expanded = open, onExpandedChange = { if (!readOnly) open = it }) {
            OutlinedTextField(
                value = value, onValueChange = {}, readOnly = true, isError = error != null, label = { Text(labelOf(label, required)) },
                placeholder = { Text(placeholder ?: "Select") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable).testTag("$testTag-input"),
            )
            ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { option ->
                    DropdownMenuItem(text = { Text(option) }, onClick = { onValueChange(option); open = false }, modifier = Modifier.testTag("$testTag-option-$option"))
                }
            }
        }
        Message(error, helpText)
    }
}

/** Choose one of a few options, all visible. */
@Composable
fun BxRadioGroup(
    testTag: String, label: String, value: String, onValueChange: (String) -> Unit = {}, error: String? = null, options: List<String>,
    required: Boolean = false, readOnly: Boolean = false, @Suppress("UNUSED_PARAMETER") maxLength: Int? = null, helpText: String? = null,
    @Suppress("UNUSED_PARAMETER") placeholder: String? = null,
) {
    Column(Modifier.testTag(testTag).bxShake(error)) {
        Text(labelOf(label, required))
        options.forEach { option ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = BxSizes.minTouch).testTag("$testTag-option-$option")
                    .selectable(selected = value == option, enabled = !readOnly, role = Role.RadioButton) { onValueChange(option) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                RadioButton(selected = value == option, onClick = null)
                Text(option)
            }
        }
        Message(error, helpText)
    }
}

/** Choose any number of options. */
@Composable
fun BxCheckboxGroup(
    testTag: String, label: String, value: List<String>, onValueChange: (List<String>) -> Unit = {}, error: String? = null, options: List<String>,
    required: Boolean = false, readOnly: Boolean = false, helpText: String? = null, @Suppress("UNUSED_PARAMETER") placeholder: String? = null,
) {
    Column(Modifier.testTag(testTag).bxShake(error)) {
        Text(labelOf(label, required))
        options.forEach { option ->
            val on = option in value
            Row(
                Modifier.fillMaxWidth().heightIn(min = BxSizes.minTouch).testTag("$testTag-option-$option")
                    .toggleable(value = on, enabled = !readOnly, role = Role.Checkbox) { onValueChange(if (on) value - option else value + option) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Checkbox(checked = on, onCheckedChange = null)
                Text(option)
            }
        }
        Message(error, helpText)
    }
}

/** On or off. */
@Composable
fun BxSwitchField(
    testTag: String, label: String, value: Boolean, onValueChange: (Boolean) -> Unit = {}, error: String? = null, required: Boolean = false,
    readOnly: Boolean = false, helpText: String? = null, @Suppress("UNUSED_PARAMETER") placeholder: String? = null,
) {
    Column(Modifier.testTag(testTag)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = BxSizes.minTouch).toggleable(value = value, enabled = !readOnly, role = Role.Switch) { onValueChange(it) },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(labelOf(label, required))
            Switch(checked = value, onCheckedChange = null, modifier = Modifier.testTag("$testTag-input"))
        }
        Message(error, helpText)
    }
}

/** A value to show, not to edit. */
@Composable
fun BxReadOnlyField(testTag: String, label: String, value: String, helpText: String? = null) {
    val bx = LocalBx.current
    Column(Modifier.fillMaxWidth().testTag(testTag)) {
        Text(label, color = bx.textMuted)
        Text(value.ifEmpty { "-" }, color = bx.text, modifier = Modifier.testTag("$testTag-value"))
        Message(null, helpText)
    }
}

