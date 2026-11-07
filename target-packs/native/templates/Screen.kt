/*
 * {{title}}: screen built from the approved Screen Model "{{modelName}}" by the OBDX Development Factory.
 * Every field and action keeps its Screen Model id as its test tag. The iOS view is {{Screen}}View.swift.
 */
package com.bank.obdx.screens.{{modulePackage}}

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.bank.obdx.api.ApiError
import com.bank.obdx.components.*
import com.bank.obdx.forms.FieldRule
import com.bank.obdx.forms.FormModel
import com.bank.obdx.i18n.t
import kotlinx.coroutines.launch

@Composable
fun {{Screen}}Screen(onAction: (String) -> Unit = {}, onDone: () -> Unit = {}) {
{{optionLists}}    val form = remember {
        FormModel(
            mapOf(
{{initialValues}}            ),
            mapOf(
{{rules}}            ),
        )
    }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (!form.validate()) return
        scope.launch {
            busy = true
            failure = null
            try {
                // Send form.snapshot() with the module's API file (api/{{module}}Api.kt).
                onDone()
            } catch (e: ApiError) {
                failure = e.message
            } finally {
                busy = false
            }
        }
    }

    BxScreen(
        title = t("{{screenKey}}.title"),
        failure = failure,
        actions = {
{{actions}}        },
    ) {
{{sections}}    }
}
