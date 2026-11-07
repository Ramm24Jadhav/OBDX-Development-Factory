import SwiftUI
import ViewInspector
import XCTest
@testable import ObdxApp

final class HomeViewTests: XCTestCase {
    @MainActor
    func testShowsTheTitleAndWelcomeFromTheSharedTexts() throws {
        let view = HomeView()
        // The bundled en.json is read (a missing text would show its key)
        XCTAssertEqual(t("home.title"), "Home")
        XCTAssertNoThrow(try view.inspect().find(text: "Home"))
        XCTAssertNoThrow(try view.inspect().find(text: "Welcome"))
    }

    @MainActor
    func testTheAppOpensOnTheHomeScreen() throws {
        XCTAssertNoThrow(try AppNavigation().inspect().find(HomeView.self))
    }
}
