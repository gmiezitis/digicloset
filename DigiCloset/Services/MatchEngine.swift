import Foundation

/// Colour matching between wearers. Colours are compared in Lab space, which
/// follows how people see colour much better than raw RGB.
@MainActor
enum MatchEngine {
    typealias Lab = ColorScience.Lab

    nonisolated static func lab(_ hex: String) -> Lab { ColorScience.lab(hex) }
    nonisolated static func lab(r: UInt8, g: UInt8, b: UInt8) -> Lab { ColorScience.lab(r: r, g: g, b: b) }
    nonisolated static func distance(_ a: String, _ b: String) -> Double { ColorScience.distance(a, b) }
    nonisolated static func harmony(_ palette: [String]) -> Int { ColorScience.harmony(palette) }

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
