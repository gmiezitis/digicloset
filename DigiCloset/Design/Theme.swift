import SwiftUI
import UIKit

/// Warm studio palette: off-white canvas, soft stone, near-black ink.
enum Theme {
    static let canvas = Color(hex: "F4F1EC")
    static let studio = Color(hex: "E8E3DC")
    static let card = Color(hex: "FBFAF8")
    static let ink = Color(hex: "1A1A1A")
    static let muted = Color(hex: "8C877F")
    static let hairline = Color.black.opacity(0.08)

    static let accents = ["C9A27E", "D8A7A0", "A9B79A", "9AA7B8", "B8946A", "2B2A29"]

    static func display(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }

    static let eyebrow = Font.system(size: 11, weight: .semibold).width(.expanded)
}

extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&value)
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }

    var hexString: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a)
        func byte(_ v: CGFloat) -> Int { Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "%02X%02X%02X", byte(r), byte(g), byte(b))
    }
}

// MARK: - Background

struct StudioBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.canvas, Theme.studio], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [.white.opacity(0.7), .clear], center: .init(x: 0.5, y: 0.35), startRadius: 10, endRadius: 420)
        }
        .ignoresSafeArea()
    }
}

/// Soft contact shadow under a standing figure.
struct FloorShadow: View {
    var body: some View {
        Ellipse()
            .fill(RadialGradient(colors: [.black.opacity(0.22), .clear], center: .center, startRadius: 0, endRadius: 90))
            .frame(height: 18)
    }
}

// MARK: - Controls

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(duration: 0.25, bounce: 0.4), value: configuration.isPressed)
    }
}

struct Chip: View {
    let title: String
    var isOn: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundStyle(isOn ? Color.white : Theme.ink)
                .background(isOn ? Theme.ink : Theme.card, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.hairline))
        }
        .buttonStyle(PressableStyle())
        .sensoryFeedback(.selection, trigger: isOn)
    }
}

struct PrimaryButtonLabel: View {
    let title: String
    var systemImage: String?
    var filled = true

    var body: some View {
        HStack(spacing: 8) {
            if let systemImage { Image(systemName: systemImage) }
            Text(title)
        }
        .font(.system(size: 15, weight: .semibold))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .foregroundStyle(filled ? Color.white : Theme.ink)
        .background(filled ? Theme.ink : Theme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(filled ? .clear : Theme.hairline))
    }
}

struct Swatch: View {
    let hex: String
    var size: CGFloat = 14

    var body: some View {
        Circle()
            .fill(Color(hex: hex))
            .frame(width: size, height: size)
            .overlay(Circle().strokeBorder(Color.black.opacity(0.12), lineWidth: 0.5))
    }
}

struct PaletteRow: View {
    let hexes: [String]
    var size: CGFloat = 14

    var body: some View {
        HStack(spacing: -size * 0.3) {
            ForEach(Array(hexes.enumerated()), id: \.offset) { _, hex in
                Swatch(hex: hex, size: size)
                    .overlay(Circle().strokeBorder(Theme.card, lineWidth: 1.5))
            }
        }
    }
}

struct Eyebrow: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(Theme.eyebrow)
            .tracking(1.6)
            .foregroundStyle(Theme.muted)
    }
}
