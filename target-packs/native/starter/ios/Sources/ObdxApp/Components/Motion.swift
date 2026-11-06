import SwiftUI

/// The motion layer (target-packs/components/motion.json) with the bank's duration and easing tokens. When the device
/// asks for reduced motion (Settings › Accessibility › Motion), every effect shows its end state.
public enum BxMotion {
    public static let fast = 0.12
    public static let base = 0.2
    public static let slow = 0.32
    public static let standard = Animation.timingCurve(0.2, 0, 0, 1, duration: slow)
}

/// A section rises in when it first shows.
struct BxEnter: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduced ? 1 : 0)
            .offset(y: shown || reduced ? 0 : 12)
            .onAppear { withAnimation(reduced ? nil : BxMotion.standard) { shown = true } }
    }
}

/// A field shakes once when its error appears.
struct BxShake: ViewModifier, Animatable {
    var shakes: CGFloat
    var animatableData: CGFloat {
        get { shakes }
        set { shakes = newValue }
    }

    func body(content: Content) -> some View {
        content.offset(x: sin(shakes * .pi * 3) * 6 * (1 - shakes.truncatingRemainder(dividingBy: 1)))
    }
}

extension View {
    func bxEnter() -> some View { modifier(BxEnter()) }

    /// Shakes the view once each time an error message arrives (not under reduced motion).
    func bxShake(on error: String?, reduced: Bool) -> some View {
        modifier(BxShake(shakes: error == nil || reduced ? 0 : 1))
            .animation(reduced ? nil : .linear(duration: BxMotion.slow), value: error)
    }
}
