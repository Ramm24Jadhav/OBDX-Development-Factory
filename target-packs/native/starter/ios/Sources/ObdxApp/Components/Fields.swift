import SwiftUI

/*
 * The form fields every generated screen uses. They take the same props as the other packs, in this order: testID (the
 * Screen Model id, as the accessibility identifier), label, value (a binding), error, options, required, readOnly,
 * maxLength, helpText, placeholder. Errors are announced, and every control is at least 48 points tall.
 */

/// The label, the control and the message under it.
struct FieldShell<Control: View>: View {
    let testID: String
    let label: String
    let required: Bool
    let error: String?
    let helpText: String?
    @ViewBuilder let control: () -> Control
    @Environment(\.accessibilityReduceMotion) private var reduced

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(required ? "\(label) *" : label).font(.subheadline.weight(.semibold)).foregroundStyle(BxTheme.text)
                .accessibilityHidden(true)
            control().bxShake(on: error, reduced: reduced)
            if let error {
                Text(error).font(.footnote).foregroundStyle(BxTheme.dangerText)
                    .onAppear { UIAccessibility.post(notification: .announcement, argument: error) }
            } else if let helpText {
                Text(helpText).font(.footnote).foregroundStyle(BxTheme.textMuted)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(testID)
    }
}

private struct Box: ViewModifier {
    let error: String?
    func body(content: Content) -> some View {
        content.padding(.horizontal, 12).frame(minHeight: BxTheme.minTouch)
            .overlay(RoundedRectangle(cornerRadius: BxTheme.radius).stroke(error == nil ? BxTheme.border : BxTheme.dangerText, lineWidth: error == nil ? 1 : 1.5))
    }
}

public struct BxTextField: View {
    let testID: String, label: String
    @Binding var value: String
    let error: String?, required: Bool, readOnly: Bool, maxLength: Int?, helpText: String?, placeholder: String?
    var keyboard: UIKeyboardType = .default
    var multiline = false

    public init(testID: String, label: String, value: Binding<String>, error: String? = nil, required: Bool = false, readOnly: Bool = false,
                maxLength: Int? = nil, helpText: String? = nil, placeholder: String? = nil) {
        self.testID = testID
        self.label = label
        _value = value
        self.error = error
        self.required = required
        self.readOnly = readOnly
        self.maxLength = maxLength
        self.helpText = helpText
        self.placeholder = placeholder
    }

    public var body: some View {
        FieldShell(testID: testID, label: label, required: required, error: error, helpText: helpText) {
            TextField(placeholder ?? "", text: $value, axis: multiline ? .vertical : .horizontal)
                .lineLimit(multiline ? 3...6 : 1...1)
                .keyboardType(keyboard)
                .disabled(readOnly)
                .accessibilityLabel(label)
                .accessibilityIdentifier("\(testID)-input")
                .onChange(of: value) { _, now in
                    if let maxLength, now.count > maxLength { value = String(now.prefix(maxLength)) }
                }
                .modifier(Box(error: error))
        }
    }
}

public struct BxTextArea: View {
    private let field: BxTextField

    public init(testID: String, label: String, value: Binding<String>, error: String? = nil, required: Bool = false, readOnly: Bool = false,
                maxLength: Int? = nil, helpText: String? = nil, placeholder: String? = nil) {
        var field = BxTextField(testID: testID, label: label, value: value, error: error, required: required, readOnly: readOnly, maxLength: maxLength,
                                helpText: helpText ?? maxLength.map { "\(value.wrappedValue.count)/\($0)" }, placeholder: placeholder)
        field.multiline = true
        self.field = field
    }

    public var body: some View { field }
}

/// A number (nil when empty), on the number pad; amounts take the currency's decimals (two unless set).
public struct BxNumberField: View {
    let testID: String, label: String
    @Binding var value: Double?
    let error: String?, required: Bool, readOnly: Bool, helpText: String?, placeholder: String?
    var decimals = 0

    public init(testID: String, label: String, value: Binding<Double?>, error: String? = nil, required: Bool = false, readOnly: Bool = false,
                helpText: String? = nil, placeholder: String? = nil) {
        self.testID = testID
        self.label = label
        _value = value
        self.error = error
        self.required = required
        self.readOnly = readOnly
        self.helpText = helpText
        self.placeholder = placeholder
    }

    public var body: some View {
        let text = Binding<String>(
            get: { value.map { decimals == 0 ? String(Int($0)) : String(format: "%.\(decimals)f", $0) } ?? "" },
            set: { typed in value = Double(typed.filter { $0.isNumber || (decimals > 0 && $0 == ".") }) })
        var field = BxTextField(testID: testID, label: label, value: text, error: error, required: required, readOnly: readOnly, helpText: helpText,
                                placeholder: placeholder)
        field.keyboard = decimals > 0 ? .decimalPad : .numberPad
        return field
    }
}

public struct BxAmountField: View {
    private var field: BxNumberField

    public init(testID: String, label: String, value: Binding<Double?>, error: String? = nil, required: Bool = false, readOnly: Bool = false,
                helpText: String? = nil, placeholder: String? = nil) {
        field = BxNumberField(testID: testID, label: label, value: value, error: error, required: required, readOnly: readOnly, helpText: helpText,
                              placeholder: placeholder)
        field.decimals = 2
    }

    public var body: some View { field }
}

/// A date as YYYY-MM-DD (a calendar picker can replace the text with the same props).
public struct BxDateField: View {
    private let field: BxTextField

    public init(testID: String, label: String, value: Binding<String>, error: String? = nil, required: Bool = false, readOnly: Bool = false,
                maxLength: Int? = nil, helpText: String? = nil, placeholder: String? = "YYYY-MM-DD") {
        field = BxTextField(testID: testID, label: label, value: value, error: error, required: required, readOnly: readOnly, maxLength: 10,
                            helpText: helpText, placeholder: placeholder)
    }

    public var body: some View { field }
}

/// Choose one option from a list (the customer's accounts show masked numbers).
public struct BxSelectField: View {
    let testID: String, label: String
    @Binding var value: String
    let error: String?, options: [String], required: Bool, readOnly: Bool, helpText: String?, placeholder: String?

    public init(testID: String, label: String, value: Binding<String>, error: String? = nil, options: [String], required: Bool = false,
                readOnly: Bool = false, maxLength: Int? = nil, helpText: String? = nil, placeholder: String? = nil) {
        self.testID = testID
        self.label = label
        _value = value
        self.error = error
        self.options = options
        self.required = required
        self.readOnly = readOnly
        self.helpText = helpText
        self.placeholder = placeholder
    }

    public var body: some View {
        FieldShell(testID: testID, label: label, required: required, error: error, helpText: helpText) {
            Picker(label, selection: $value) {
                Text(placeholder ?? "Select").tag("")
                ForEach(options, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
            .disabled(readOnly)
            .accessibilityIdentifier("\(testID)-input")
            .frame(maxWidth: .infinity, alignment: .leading)
            .modifier(Box(error: error))
        }
    }
}

/// Choose one of a few options, all visible; the chosen mark springs in.
public struct BxRadioGroup: View {
    let testID: String, label: String
    @Binding var value: String
    let error: String?, options: [String], required: Bool, readOnly: Bool, helpText: String?
    @Environment(\.accessibilityReduceMotion) private var reduced

    public init(testID: String, label: String, value: Binding<String>, error: String? = nil, options: [String], required: Bool = false,
                readOnly: Bool = false, maxLength: Int? = nil, helpText: String? = nil, placeholder: String? = nil) {
        self.testID = testID
        self.label = label
        _value = value
        self.error = error
        self.options = options
        self.required = required
        self.readOnly = readOnly
        self.helpText = helpText
    }

    public var body: some View {
        FieldShell(testID: testID, label: label, required: required, error: error, helpText: helpText) {
            ForEach(options, id: \.self) { option in
                Button { withAnimation(reduced ? nil : .spring(duration: BxMotion.slow)) { value = option } } label: {
                    HStack {
                        Image(systemName: value == option ? "largecircle.fill.circle" : "circle").foregroundStyle(BxTheme.primary)
                        Text(option).foregroundStyle(BxTheme.text)
                    }
                    .frame(maxWidth: .infinity, minHeight: BxTheme.minTouch, alignment: .leading)
                }
                .disabled(readOnly)
                .accessibilityAddTraits(value == option ? .isSelected : [])
                .accessibilityIdentifier("\(testID)-option-\(option)")
            }
        }
    }
}

/// Choose any number of options.
public struct BxCheckboxGroup: View {
    let testID: String, label: String
    @Binding var value: [String]
    let error: String?, options: [String], required: Bool, readOnly: Bool, helpText: String?

    public init(testID: String, label: String, value: Binding<[String]>, error: String? = nil, options: [String], required: Bool = false,
                readOnly: Bool = false, helpText: String? = nil, placeholder: String? = nil) {
        self.testID = testID
        self.label = label
        _value = value
        self.error = error
        self.options = options
        self.required = required
        self.readOnly = readOnly
        self.helpText = helpText
    }

    public var body: some View {
        FieldShell(testID: testID, label: label, required: required, error: error, helpText: helpText) {
            ForEach(options, id: \.self) { option in
                Toggle(option, isOn: Binding(get: { value.contains(option) },
                                             set: { on in value = on ? value + [option] : value.filter { $0 != option } }))
                    .toggleStyle(.button)
                    .frame(maxWidth: .infinity, minHeight: BxTheme.minTouch, alignment: .leading)
                    .disabled(readOnly)
                    .accessibilityIdentifier("\(testID)-option-\(option)")
            }
        }
    }
}

/// On or off.
public struct BxSwitchField: View {
    let testID: String, label: String
    @Binding var value: Bool
    let readOnly: Bool, helpText: String?

    public init(testID: String, label: String, value: Binding<Bool>, error: String? = nil, required: Bool = false, readOnly: Bool = false,
                helpText: String? = nil, placeholder: String? = nil) {
        self.testID = testID
        self.label = label
        _value = value
        self.readOnly = readOnly
        self.helpText = helpText
    }

    public var body: some View {
        VStack(alignment: .leading) {
            Toggle(label, isOn: $value).frame(minHeight: BxTheme.minTouch).disabled(readOnly).accessibilityIdentifier("\(testID)-input")
            if let helpText { Text(helpText).font(.footnote).foregroundStyle(BxTheme.textMuted) }
        }
        .accessibilityIdentifier(testID)
    }
}

/// A value to show, not to edit.
public struct BxReadOnlyField: View {
    let testID: String, label: String, value: String, helpText: String?

    public init(testID: String, label: String, value: String, helpText: String? = nil) {
        self.testID = testID
        self.label = label
        self.value = value
        self.helpText = helpText
    }

    public var body: some View {
        FieldShell(testID: testID, label: label, required: false, error: nil, helpText: helpText) {
            Text(value.isEmpty ? "-" : value).foregroundStyle(BxTheme.text).accessibilityLabel("\(label): \(value.isEmpty ? "none" : value)")
                .accessibilityIdentifier("\(testID)-value")
        }
    }
}
