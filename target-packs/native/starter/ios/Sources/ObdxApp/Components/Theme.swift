import SwiftUI

/// The bank tokens (target-packs/components/tokens/tokens.json): change them there and copy the values here.
public enum BxTheme {
    public static let primary = Color(light: 0x0B5FA5, dark: 0x3B8FD6)
    public static let onPrimary = Color(light: 0xFFFFFF, dark: 0x0B1724)
    public static let text = Color(light: 0x1F2933, dark: 0xE8EDF2)
    public static let textMuted = Color(light: 0x5F6B7A, dark: 0x9AA8B7)
    public static let border = Color(light: 0xAAB4BF, dark: 0x5C6F86)
    public static let surface = Color(light: 0xFFFFFF, dark: 0x141E2B)
    public static let surface2 = Color(light: 0xF4F6F8, dark: 0x1A2635)
    public static let dangerText = Color(light: 0xB42318, dark: 0xF48A88)
    /// Controls are at least this tall, so they are easy to touch (the platform asks 44).
    public static let minTouch: CGFloat = 48
    public static let space: CGFloat = 16
    public static let radius: CGFloat = 10
}

extension Color {
    /// A colour that follows the device's light or dark appearance.
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}
