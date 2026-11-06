package com.bank.obdx.screens.{{modulePackage}}

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.bank.obdx.components.BxTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// From the approved Screen Model "{{modelName}}": every field and action keeps its id as its test tag.
private val ids = listOf({{componentIds}})

@RunWith(RobolectricTestRunner::class)
class {{Screen}}ScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun showsEveryFieldAndActionOfTheApprovedDesign() {
        compose.setContent { BxTheme { {{Screen}}Screen() } }
        ids.forEach { compose.onNodeWithTag(it, useUnmergedTree = true).assertExists(it) }
    }
{{requiredTest:
    @Test
    fun asksForTheRequiredFields() {
        compose.setContent { BxTheme { {{Screen}}Screen() } }
        compose.onNodeWithTag("{{primaryAction}}").performClick()
        compose.onAllNodesWithText("Enter ", substring = true, useUnmergedTree = true).assertCountEquals({{requiredCount}})
    }
}}
}
