import SwiftUI
import ViewInspector
import XCTest
@testable import ObdxApp

// From the approved Screen Model "{{modelName}}": every field and action keeps its id as its accessibility identifier.
private let ids = [{{componentIds}}]

final class {{Screen}}ViewTests: XCTestCase {
    @MainActor
    func testShowsEveryFieldAndActionOfTheApprovedDesign() throws {
        let view = {{Screen}}View()
        for id in ids {
            XCTAssertNoThrow(try view.inspect().find(viewWithAccessibilityIdentifier: id), id)
        }
    }
}
