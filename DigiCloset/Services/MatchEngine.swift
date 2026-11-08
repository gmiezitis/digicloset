import Foundation

/// Colour matching between wearers. Colours are compared in Lab space, which
/// follows how people see colour much better than raw RGB.
@MainActor
enum MatchEngine {
    struct Lab: Sendable { let l, a, b: Double }

    nonisolated static func lab(_ hex: String) -> Lab {
        var value: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&value)
        return lab(r: UInt8((value >> 16) & 0xFF), g: UInt8((value >> 8) & 0xFF), b: UInt8(value & 0xFF))
    }

    nonisolated static func lab(r red: UInt8, g green: UInt8, b blue: UInt8) -> Lab {
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

    nonisolated static func distance(_ a: String, _ b: String) -> Double {
        let p = lab(a), q = lab(b)
        return sqrt(pow(p.l - q.l, 2) + pow(p.a - q.a, 2) + pow(p.b - q.b, 2))
    }

    /// 0–100: how well a set of colours sits together. Close, tonal palettes
    /// score high; clashing ones score low.
    nonisolated static func harmony(_ palette: [String]) -> Int {
        guard palette.count > 1 else { return 100 }
        var total = 0.0, pairs = 0.0
        for i in palette.indices {
            for j in palette.indices where j > i {
                total += distance(palette[i], palette[j])
                pairs += 1
            }
        }
        let average = total / pairs
        return Int(max(40, min(100, 112 - average * 0.9)))
    }

    /// Picks pieces from another wearer's closet that echo a palette — the
    /// heart of "match my dog to my outfit".
    static func suggest(palette: [String], from garments: [Garment], kind: WearerKind) -> [Garment] {
        guard !palette.isEmpty else { return [] }

        func score(_ g: Garment) -> Double { palette.map { distance($0, g.colorHex) }.min() ?? .infinity }
        func best(_ categories: Set<GarmentCategory>) -> (Garment, Double)? {
            garments.filter { categories.contains($0.category) }
                .map { ($0, score($0)) }
                .min { $0.1 < $1.1 }
        }

        let threshold = 45.0
        var picks: [Garment] = []
        if kind.isPet {
            for slot: Set<GarmentCategory> in [[.sweater], [.collar, .bandana]] {
                if let (g, s) = best(slot), s < threshold { picks.append(g) }
            }
            return picks
        }

        let dress = best([.dress])
        let top = best([.top])
        let bottom = best([.bottom, .skirt])
        let separatesScore = [top?.1, bottom?.1].compactMap { $0 }.max() ?? .infinity
        if let dress, dress.1 < threshold, dress.1 <= separatesScore {
            picks.append(dress.0)
        } else {
            if let top, top.1 < threshold { picks.append(top.0) }
            if let bottom, bottom.1 < threshold { picks.append(bottom.0) }
        }
        for slot: Set<GarmentCategory> in [[.outerwear], [.shoes]] {
            if let (g, s) = best(slot), s < threshold { picks.append(g) }
        }
        return picks
    }
}
