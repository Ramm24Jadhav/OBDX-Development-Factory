import SwiftUI

public enum BxVariant { case primary, secondary, link }

/// A screen action: primary (the main one), secondary or link. A busy button shows progress and cannot be pressed twice.
public struct BxButton: View {
    let testID: String, label: String, variant: BxVariant, busy: Bool, action: () -> Void

    public init(testID: String, label: String, variant: BxVariant = .secondary, busy: Bool = false, action: @escaping () -> Void) {
        self.testID = testID
        self.label = label
        self.variant = variant
        self.busy = busy
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView() }
                Text(label).fontWeight(.semibold)
            }
            .frame(minHeight: BxTheme.minTouch)
            .padding(.horizontal, variant == .link ? 4 : 18)
            .foregroundStyle(variant == .primary ? BxTheme.onPrimary : BxTheme.primary)
            .background(variant == .primary ? BxTheme.primary : .clear, in: RoundedRectangle(cornerRadius: BxTheme.radius))
            .overlay(RoundedRectangle(cornerRadius: BxTheme.radius).stroke(variant == .secondary ? BxTheme.primary : .clear))
        }
        .disabled(busy)
        .accessibilityIdentifier(testID)
    }
}

/// A titled group of fields; on a phone the columns stack. It rises in when it first shows.
public struct BxSection<Content: View>: View {
    let title: String?
    let columns: Int
    @ViewBuilder let content: () -> Content

    public init(title: String? = nil, columns: Int = 1, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.columns = columns
        self.content = content
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title { Text(title).font(.headline).foregroundStyle(BxTheme.text).accessibilityAddTraits(.isHeader) }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, BxTheme.space)
        .bxEnter()
    }
}

/// The frame of a screen: its title, the content, the failure line and the actions at the bottom.
public struct BxScreen<Content: View, Actions: View>: View {
    let title: String
    let failure: String?
    @ViewBuilder let content: () -> Content
    @ViewBuilder let actions: () -> Actions

    public init(title: String, failure: String? = nil, @ViewBuilder content: @escaping () -> Content,
                @ViewBuilder actions: @escaping () -> Actions = { EmptyView() }) {
        self.title = title
        self.failure = failure
        self.content = content
        self.actions = actions
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.title2.bold()).foregroundStyle(BxTheme.text).padding(.bottom, BxTheme.space).accessibilityAddTraits(.isHeader)
                content()
                if let failure {
                    Text(failure).foregroundStyle(BxTheme.dangerText).padding(.vertical, 8)
                        .onAppear { UIAccessibility.post(notification: .announcement, argument: failure) }
                }
                HStack(spacing: 8) { actions() }
            }
            .padding(BxTheme.space)
        }
        .background(BxTheme.surface)
    }
}
