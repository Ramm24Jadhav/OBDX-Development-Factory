package com.bank.obdx.components

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** The bank tokens (target-packs/components/tokens/tokens.json): change them there and copy the values here. */
@Immutable
data class BxColors(
    val primary: Color, val onPrimary: Color, val text: Color, val textMuted: Color, val border: Color,
    val surface: Color, val surface2: Color, val danger: Color, val dangerText: Color, val success: Color,
)

val LightBx = BxColors(
    primary = Color(0xFF0B5FA5), onPrimary = Color(0xFFFFFFFF), text = Color(0xFF1F2933), textMuted = Color(0xFF5F6B7A),
    border = Color(0xFFAAB4BF), surface = Color(0xFFFFFFFF), surface2 = Color(0xFFF4F6F8), danger = Color(0xFFC62828),
    dangerText = Color(0xFFB42318), success = Color(0xFF12805C),
)

val DarkBx = BxColors(
    primary = Color(0xFF3B8FD6), onPrimary = Color(0xFF0B1724), text = Color(0xFFE8EDF2), textMuted = Color(0xFF9AA8B7),
    border = Color(0xFF5C6F86), surface = Color(0xFF141E2B), surface2 = Color(0xFF1A2635), danger = Color(0xFFEF5350),
    dangerText = Color(0xFFF48A88), success = Color(0xFF34C08F),
)

/** Sizes: controls are at least 48 dp tall so they are easy to touch. */
object BxSizes {
    val minTouch = 48.dp
    val space = 16.dp
    val radius = 10.dp
}

val LocalBx = staticCompositionLocalOf { LightBx }

/** The bank's theme: Material 3 coloured from the tokens, light or dark as the device is. */
@Composable
fun BxTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val bx = if (dark) DarkBx else LightBx
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = bx.primary, onPrimary = bx.onPrimary, surface = bx.surface, onSurface = bx.text, error = bx.danger, outline = bx.border,
    )
    androidx.compose.runtime.CompositionLocalProvider(LocalBx provides bx) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
