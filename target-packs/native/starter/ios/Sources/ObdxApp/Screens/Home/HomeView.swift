import SwiftUI

public struct HomeView: View {
    public init() {}

    public var body: some View {
        BxScreen(title: t("home.title")) {
            Text(t("home.welcome")).foregroundStyle(BxTheme.text)
        }
    }
}
