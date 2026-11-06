plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.bank.obdx"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.bank.obdx"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "OBDX_BASE_URL", "\"${providers.gradleProperty("obdx.baseUrl").get()}\"")
        // Certificate pinning (api/CertificatePins.kt): the bank's key pins and the day they stop being enforced
        buildConfigField("String", "OBDX_PINS", "\"${providers.gradleProperty("obdx.pins").orElse("").get()}\"")
        buildConfigField("String", "OBDX_PINS_EXPIRE", "\"${providers.gradleProperty("obdx.pinsExpire").orElse("").get()}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // The texts are shared with the iOS app; on the classpath, so the app and its unit tests read the same file
    sourceSets["main"].resources.srcDirs("../../shared")

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    val compose = platform("androidx.compose:compose-bom:2025.10.00")
    implementation(compose)
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.navigation:navigation-compose:2.9.5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    testImplementation(compose)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("junit:junit:4.13.2")
    // android.jar only stubs org.json; plain JVM tests (FormModelTest) need the real one
    testImplementation("org.json:json:20250517")
    testImplementation("org.robolectric:robolectric:4.16")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
