import Foundation

/// Colour maths shared by recognition, matching and personalization. Colours
/// are compared in CIE Lab, which follows how people see colour far better than RGB.
enum ColorScience {
    struct Lab: Sendable, Hashable { var l, a, b: Double }

    static func lab(_ hex: String) -> Lab {
        let rgb = rgb(hex)
        return lab(r: rgb.r, g: rgb.g, b: rgb.b)
    }

    static func rgb(_ hex: String) -> (r: UInt8, g: UInt8, b: UInt8) {
        var value: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)).scanHexInt64(&value)
        return (UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF))
    }

    static func lab(r red: UInt8, g green: UInt8, b blue: UInt8) -> Lab {
        func linear(_ v: UInt8) -> Double {
            let c = Double(v) / 255
            return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let r = linear(red), g = linear(green), b = linear(blue)
        let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
        let y = (r * 0.2126 + g * 0.7152 + b * 0.0722)
        let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
        func f(_ t: Double) -> Double { t > 0.008856 ? cbrt(t) : (7.787 * t + 16.0 / 116.0) }
        return Lab(l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)))
    }

    static func distance(_ p: Lab, _ q: Lab) -> Double {
        let dl = p.l - q.l, da = p.a - q.a, db = p.b - q.b
        return (dl * dl + da * da + db * db).squareRoot()
    }

    static func distance(_ a: String, _ b: String) -> Double { distance(lab(a), lab(b)) }

    static func hex(r: Double, g: Double, b: Double) -> String {
        func byte(_ v: Double) -> Int { Int(min(255, max(0, v.rounded()))) }
        return String(format: "%02X%02X%02X", byte(r), byte(g), byte(b))
    }

    /// 0–100: how well a set of colours sits together. Close, tonal palettes
    /// score high; clashing ones score low.
    static func harmony(_ palette: [String]) -> Int {
        guard palette.count > 1 else { return 100 }
        let labs = palette.map(lab)
        var total = 0.0, pairs = 0.0
        for i in labs.indices {
            for j in labs.indices where j > i {
                // Neutrals go with everything, so they count for less.
                let weight = labs[i].isNeutral || labs[j].isNeutral ? 0.55 : 1
                total += distance(labs[i], labs[j]) * weight
                pairs += 1
            }
        }
        return Int(max(40, min(100, 112 - (total / pairs) * 0.9)))
    }

    // MARK: Names

    static func nearest(_ hex: String) -> NamedColor {
        let target = lab(hex)
        return NamedColor.all.min { distance($0.lab, target) < distance($1.lab, target) } ?? NamedColor.all[0]
    }

    static func name(_ hex: String) -> String { nearest(hex).name }
    static func family(_ hex: String) -> ColorFamily { nearest(hex).family }
}

extension ColorScience.Lab {
    /// Low-chroma colours (white, black, grey, beige) that pair with anything.
    var isNeutral: Bool { (a * a + b * b).squareRoot() < 14 }
}

enum ColorFamily: String, CaseIterable, Codable, Sendable {
    case light, dark, grey, earth, pink, red, orange, yellow, green, blue, purple

    var title: String {
        switch self {
        case .light: "Light neutrals"
        case .dark: "Black & charcoal"
        case .grey: "Greys"
        case .earth: "Earth tones"
        case .pink: "Pinks"
        case .red: "Reds"
        case .orange: "Oranges"
        case .yellow: "Yellows"
        case .green: "Greens"
        case .blue: "Blues"
        case .purple: "Purples"
        }
    }

    var swatch: String {
        switch self {
        case .light: "EFE6D2"
        case .dark: "1C1C1E"
        case .grey: "9A9A9A"
        case .earth: "B88A5A"
        case .pink: "D9A3A0"
        case .red: "B0302E"
        case .orange: "D2733F"
        case .yellow: "D1A23B"
        case .green: "8FA382"
        case .blue: "4F6D96"
        case .purple: "9C83B8"
        }
    }

    var isNeutral: Bool { [.light, .dark, .grey, .earth].contains(self) }
}

struct NamedColor: Sendable {
    let name: String
    let hex: String
    let family: ColorFamily
    let lab: ColorScience.Lab

    init(_ name: String, _ hex: String, _ family: ColorFamily) {
        self.name = name
        self.hex = hex
        self.family = family
        self.lab = ColorScience.lab(hex)
    }

    /// A fashion vocabulary rather than a technical one.
    static let all: [NamedColor] = [
        .init("White", "F5F5F2", .light), .init("Ivory", "EFE6D2", .light), .init("Cream", "EDE3C8", .light),
        .init("Beige", "D9C9AE", .light), .init("Sand", "D8C08E", .earth), .init("Camel", "B88A5A", .earth),
        .init("Tan", "C8A27A", .earth), .init("Taupe", "8B7D6F", .earth), .init("Brown", "7A5236", .earth),
        .init("Chocolate", "5A3A28", .earth), .init("Espresso", "3A2A22", .earth), .init("Khaki", "9C9467", .earth),
        .init("Rust", "A0482A", .orange), .init("Terracotta", "C26A4A", .orange), .init("Orange", "E07B39", .orange),
        .init("Peach", "F0B796", .orange), .init("Mustard", "D1A23B", .yellow), .init("Lemon", "F0DC6E", .yellow),
        .init("Butter", "F3E3A0", .yellow), .init("Olive", "6F6B3A", .green), .init("Sage", "A9B79A", .green),
        .init("Mint", "BFE0CC", .green), .init("Emerald", "2E7D5B", .green), .init("Forest", "2F4A35", .green),
        .init("Navy", "2E3B55", .blue), .init("Denim", "6E86A3", .blue), .init("Sky", "A9C6E3", .blue),
        .init("Cobalt", "2F55A4", .blue), .init("Teal", "2E7272", .blue), .init("Lilac", "C3B1D9", .purple),
        .init("Lavender", "D9CCE8", .purple), .init("Plum", "5E3553", .purple), .init("Burgundy", "6E2433", .red),
        .init("Red", "C2302E", .red), .init("Cherry", "9E1B2C", .red), .init("Blush", "E8C3BC", .pink),
        .init("Rose", "D9A3A0", .pink), .init("Dusty pink", "C98C8A", .pink), .init("Fuchsia", "C8407E", .pink),
        .init("Black", "1C1C1E", .dark), .init("Charcoal", "3A3B3E", .dark), .init("Grey", "9A9A9A", .grey),
        .init("Light grey", "C9C9C7", .grey), .init("Silver", "B8BBBF", .grey), .init("Stone", "A39E94", .grey),
    ]
}
