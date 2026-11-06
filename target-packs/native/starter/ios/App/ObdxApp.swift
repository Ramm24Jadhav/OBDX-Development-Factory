// The app target's entry point. Create the iOS app in Xcode (File › New › Project › App, named ObdxApp, in ios/App),
// add this folder's Swift package as a local dependency, and replace the generated App file with this one.
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
