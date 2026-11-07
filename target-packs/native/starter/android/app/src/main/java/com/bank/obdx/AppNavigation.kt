package com.bank.obdx

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.bank.obdx.screens.home.HomeScreen

/**
 * Every screen and its route. Generated screens are added here (one destination each), named like the Screen Model;
 * their onAction and onDone become navigation. The iOS app has the same list in AppNavigation.swift.
 */
@Composable
fun AppNavigation() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = "home") {
        composable("home") { HomeScreen() }
    }
}
