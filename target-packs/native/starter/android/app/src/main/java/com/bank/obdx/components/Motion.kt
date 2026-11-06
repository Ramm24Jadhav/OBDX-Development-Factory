package com.bank.obdx.components

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext

/**
 * The motion layer (target-packs/components/motion.json) with the bank's duration and easing tokens. When the device
 * turns animations off (the system's animator scale is 0), every effect shows its end state.
 */
object BxMotion {
    const val FAST = 120
    const val BASE = 200
    const val SLOW = 320
    val standard = CubicBezierEasing(0.2f, 0f, 0f, 1f)
}

@Composable
fun reducedMotion(): Boolean {
    val context = LocalContext.current
    return remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/** A section rises in when it first shows. */
@Composable
fun Modifier.bxEnter(): Modifier {
    val reduced = reducedMotion()
    val v = remember { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduced) v.animateTo(1f, tween(BxMotion.SLOW, easing = BxMotion.standard)) }
    return graphicsLayer { alpha = v.value; translationY = (1f - v.value) * 24f }
}

/** A field shakes once when its error appears. */
@Composable
fun Modifier.bxShake(error: String?): Modifier {
    val reduced = reducedMotion()
    val x = remember { Animatable(0f) }
    LaunchedEffect(error) {
        if (error != null && !reduced) {
            for (to in listOf(-12f, 10f, -6f, 0f)) x.animateTo(to, tween(BxMotion.SLOW / 4, easing = BxMotion.standard))
        }
    }
    return graphicsLayer { translationX = x.value }
}
