import SwiftUI

/// What to check for one field before the form is sent.
public struct FieldRule {
    public let label: String
    public var required = false
    public var maxLength: Int?
    /// Further checks from the spec; return a message when the value is not valid.
    public var check: ((Any?) -> String?)?

    public init(label: String, required: Bool = false, maxLength: Int? = nil, check: ((Any?) -> String?)? = nil) {
        self.label = label
        self.required = required
        self.maxLength = maxLength
        self.check = check
    }
}

/// The values, messages and validation of one screen. Values are String, Double?, Bool or [String]; changing a field
/// clears its message. Views bind to them with text(_:), number(_:), flag(_:) and list(_:).
@MainActor
public final class FormModel: ObservableObject {
    @Published private var values: [String: Any?]
    @Published private var errors: [String: String] = [:]
    private let rules: [String: FieldRule]

    public init(_ initial: [String: Any?], rules: [String: FieldRule]) {
        values = initial
        self.rules = rules
    }

    private func binding<T>(_ name: String, empty: T) -> Binding<T> {
        Binding(get: { (self.values[name] ?? nil) as? T ?? empty }, set: { self.set(name, $0) })
    }

    public func text(_ name: String) -> Binding<String> { binding(name, empty: "") }
    public func number(_ name: String) -> Binding<Double?> {
        Binding(get: { (self.values[name] ?? nil) as? Double }, set: { self.set(name, $0) })
    }
    public func flag(_ name: String) -> Binding<Bool> { binding(name, empty: false) }
    public func list(_ name: String) -> Binding<[String]> { binding(name, empty: []) }
    /// A value to show as it is (read-only fields).
    public func display(_ name: String) -> String { (values[name] ?? nil).map { "\($0)" } ?? "" }
    public func error(_ name: String) -> String? { errors[name] }

    public func set(_ name: String, _ value: Any?) {
        values[name] = value
        errors[name] = nil
    }

    /// The values to send.
    public func snapshot() -> [String: Any?] { values }

    /// Checks every field; shows the messages and returns true when all are valid.
    public func validate() -> Bool {
        var found: [String: String] = [:]
        for (name, rule) in rules {
            let value = values[name] ?? nil
            let empty = value == nil || (value as? String) == "" || ((value as? [String])?.isEmpty ?? false)
            if rule.required && empty {
                found[name] = t("common.required", ["label": rule.label])
            } else if let max = rule.maxLength, let text = value as? String, text.count > max {
                found[name] = t("common.tooLong", ["label": rule.label, "max": "\(max)"])
            } else if let check = rule.check, !empty, let message = check(value) {
                found[name] = message
            }
        }
        errors = found
        return found.isEmpty
    }
}
