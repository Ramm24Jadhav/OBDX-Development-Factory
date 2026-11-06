package com.bank.obdx.screens.home

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.bank.obdx.components.BxScreen
import com.bank.obdx.i18n.t

@Composable
fun HomeScreen() {
    BxScreen(title = t("home.title")) {
        Text(t("home.welcome"))
    }
}
