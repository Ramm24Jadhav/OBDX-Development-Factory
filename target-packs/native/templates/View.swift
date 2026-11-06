/*
 * {{title}}: screen built from the approved Screen Model "{{modelName}}" by the OBDX Development Factory.
 * Every field and action keeps its Screen Model id as its accessibility identifier. The Android screen is {{Screen}}Screen.kt.
 */
import SwiftUI

public struct {{Screen}}View: View {
    /// Called with the id of a secondary or link action, for navigation.
    private let onAction: (String) -> Void
    /// Called when the main action has succeeded.
    private let onDone: () -> Void

{{optionLists}}    @StateObject private var form = FormModel([
{{initialValues}}    ], rules: [
{{rules}}    ])
    @State private var busy = false
    @State private var failure: String?

    public init(onAction: @escaping (String) -> Void = { _ in }, onDone: @escaping () -> Void = {}) {
        self.onAction = onAction
        self.onDone = onDone
    }

    private func submit() {
        guard form.validate() else { return }
        busy = true
        failure = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                // Send form.snapshot() with the module's API file (Api/{{module}}Api.swift): try await ...
                onDone()
            } catch let error as ApiError {
                failure = error.message
            } catch {
                failure = t("common.failed")
            }
        }
    }

    public var body: some View {
        BxScreen(title: t("{{screenKey}}.title"), failure: failure) {
{{sections}}        } actions: {
{{actions}}        }
    }
}
