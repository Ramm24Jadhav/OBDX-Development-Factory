package com.bank.obdx.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

enum class BxVariant { Primary, Secondary, Link }

/** A screen action: primary (the main one), secondary or link. A busy button shows progress and cannot be pressed twice. */
@Composable
fun BxButton(testTag: String, label: String, variant: BxVariant = BxVariant.Secondary, busy: Boolean = false, onClick: () -> Unit) {
    val modifier = Modifier.heightIn(min = BxSizes.minTouch).testTag(testTag)
    val content: @Composable RowScope.() -> Unit = {
        if (busy) CircularProgressIndicator(Modifier.padding(end = 8.dp).heightIn(max = 18.dp), strokeWidth = 2.dp)
        Text(label)
    }
    when (variant) {
        BxVariant.Primary -> Button(onClick = onClick, enabled = !busy, modifier = modifier, content = content)
        BxVariant.Secondary -> OutlinedButton(onClick = onClick, enabled = !busy, modifier = modifier, content = content)
        BxVariant.Link -> TextButton(onClick = onClick, enabled = !busy, modifier = modifier, content = content)
    }
}

/** A titled group of fields; on a phone the columns stack. It rises in when it first shows. */
@Composable
fun BxSection(title: String? = null, columns: Int = 1, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(bottom = 16.dp).bxEnter(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (title != null) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        }
        content()
    }
}

/** The frame of a screen: its title, the content, the failure line and the actions at the bottom. */
@Composable
fun BxScreen(title: String, failure: String? = null, actions: @Composable RowScope.() -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    val bx = LocalBx.current
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(BxSizes.space)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(bottom = 16.dp).semantics { heading() })
        content()
        if (failure != null) {
            Text(failure, color = bx.dangerText, modifier = Modifier.padding(vertical = 8.dp).semantics { liveRegion = LiveRegionMode.Assertive })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), content = actions)
    }
}
