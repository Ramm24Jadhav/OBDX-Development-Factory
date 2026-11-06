import SwiftUI

/// Every screen and its route. Generated views are added here (one case and one destination each), named like the
/// Screen Model; their onAction and onDone become navigation. The Android app has the same list in AppNavigation.kt.
public enum Route: Hashable {
    case home
}

public struct AppNavigation: View {
    @State private var path: [Route] = []

    public init() {}

    public var body: some View {
        NavigationStack(path: $path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .home: HomeView()
                    }
                }
        }
    }
}
