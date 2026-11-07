// The app target's entry point. The Xcode project is generated from project.yml (cd ios/App && xcodegen generate).
import ObdxApp
import SwiftUI

@main
struct ObdxMobileApp: App {
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            AppNavigation()
                // Balances and account numbers stay out of the app switcher's snapshot
                .blur(radius: phase == .active ? 0 : 20)
        }
    }
}
