# OBDX mobile apps (Swift and Kotlin)

The starter of the native target pack: two apps that call the bank's OBDX REST services, built from the same approved
screens.

| Folder | App | Build and test |
|---|---|---|
| `android/` | Kotlin, Jetpack Compose, Material 3 (min SDK 26) | `cd android && ./gradlew test` (Robolectric with the Compose test rule), `./gradlew assembleDebug`; open in Android Studio |
| `ios/` + `Package.swift` | Swift 6, SwiftUI (iOS 17) as a Swift package | `xcodebuild test -scheme ObdxApp -destination 'platform=iOS Simulator,name=iPhone 16'` (XCTest with ViewInspector); the app target in `ios/App` (see `ObdxApp.swift`) |
| `shared/i18n/en.json` | The texts of both apps | Gradle puts it on the Android classpath; the Swift package bundles it |

Each screen is written twice with the same fields, actions, texts and rules: `<Screen>Screen.kt` and `<Screen>View.swift`.
The components have the same names and props on both platforms (`BxTextField`, `BxAmountField`, `BxSelectField` ...
with testTag or testID, label, value, error, options, required, readOnly, maxLength, helpText, placeholder), so a
screen reads alike in both.

- **Services**: `api/ApiClient.kt` and `Api/ApiClient.swift` call OBDX over https only, keep the session cookie in
  memory (never written to the device) and send a fresh nonce with every call that changes something. Set the bank's
  address in `android/gradle.properties` (`obdx.baseUrl`) and the iOS app's Info.plist (`ObdxBaseUrl`).
- **Forms**: `FormModel` on both platforms: values, rules (required, maxLength, check) and messages.
- **Theme and motion**: `Theme.kt` / `Theme.swift` carry the bank tokens (from `target-packs/components/tokens`), light
  and dark; `Motion.kt` / `Motion.swift` the motion spec (`target-packs/components/motion.json`): sections rise in, a
  field shakes once when its error appears, a chosen option springs. Nothing moves when the device turns animations
  off or asks for reduced motion.
- **Privacy**: the Android window is secure (no screenshots or recent-apps preview of balances); the iOS app blurs
  when it leaves the foreground. Nothing secret is kept on the device.
