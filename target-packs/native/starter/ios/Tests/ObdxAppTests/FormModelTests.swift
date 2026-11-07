import XCTest
@testable import ObdxApp

final class FormModelTests: XCTestCase {
    @MainActor
    func testChecksRequiredAndLengthRulesAndClearsAMessageWhenTheFieldChanges() {
        let form = FormModel(["payee": "", "remarks": String(repeating: "x", count: 20), "amount": Double?.none], rules: [
            "payee": FieldRule(label: "Payee", required: true),
            "remarks": FieldRule(label: "Remarks", maxLength: 10),
            "amount": FieldRule(label: "Amount", required: true),
        ])
        XCTAssertFalse(form.validate())
        XCTAssertEqual(form.error("payee"), "Enter Payee.")
        XCTAssertEqual(form.error("remarks"), "Remarks can have at most 10 characters.")
        form.set("payee", "A. Rao")
        XCTAssertNil(form.error("payee"))
        form.set("remarks", "Rent")
        form.number("amount").wrappedValue = 1250
        XCTAssertTrue(form.validate())
    }
}
