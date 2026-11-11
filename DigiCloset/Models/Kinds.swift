import CoreGraphics
import Foundation

// MARK: - Kinds and categories

enum WearerKind: String, CaseIterable, Identifiable, Sendable {
    case woman, man, child, dog, cat

    var id: String { rawValue }

    var title: String {
        switch self {
        case .woman: "Woman"
        case .man: "Man"
        case .child: "Kid"
        case .dog: "Dog"
        case .cat: "Cat"
        }
    }

    var mannequin: String { "mannequin_\(rawValue)" }
    var isPet: Bool { self == .dog || self == .cat }

    /// Width ÷ height of the mannequin cutout.
    var aspect: CGFloat {
        switch self {
        case .woman: 254.0 / 864.0
        case .man: 288.0 / 944.0
        case .child: 238.0 / 886.0
        case .dog: 700.0 / 684.0
        case .cat: 434.0 / 724.0
        }
    }

    /// Height next to an adult, used when figures stand side by side.
    var relativeHeight: CGFloat {
        switch self {
        case .woman: 1
        case .man: 1.04
        case .child: 0.78
        case .dog: 0.44
        case .cat: 0.36
        }
    }

    /// Height when a figure is shown on its own (pets get a little bigger).
    var soloHeight: CGFloat {
        switch self {
        case .dog: 0.52
        case .cat: 0.5
        default: relativeHeight
        }
    }

    var categories: [GarmentCategory] { isPet ? GarmentCategory.petCases : GarmentCategory.humanCases }
}

enum GarmentCategory: String, CaseIterable, Identifiable, Sendable {
    case top, outerwear, dress, bottom, skirt, shoes, hat, bag, sweater, collar, bandana

    var id: String { rawValue }

    var title: String {
        switch self {
        case .top: "Tops"
        case .outerwear: "Outerwear"
        case .dress: "Dresses"
        case .bottom: "Trousers"
        case .skirt: "Skirts"
        case .shoes: "Shoes"
        case .hat: "Hats"
        case .bag: "Bags"
        case .sweater: "Sweaters"
        case .collar: "Collars"
        case .bandana: "Bandanas"
        }
    }

    static let humanCases: [GarmentCategory] = [.top, .outerwear, .dress, .bottom, .skirt, .shoes, .hat, .bag]
    static let petCases: [GarmentCategory] = [.sweater, .collar, .bandana]

    /// Draw order on the figure; higher sits on top.
    var layer: Int {
        switch self {
        case .bottom, .skirt: 0
        case .dress: 1
        case .top, .sweater: 2
        case .shoes: 3
        case .outerwear: 4
        case .bandana: 5
        case .collar: 6
        case .hat: 7
        case .bag: 8
        }
    }

    /// Pieces that can't be worn together (a dress replaces top + bottom).
    var conflicts: Set<GarmentCategory> {
        switch self {
        case .dress: [.top, .bottom, .skirt]
        case .top: [.dress]
        case .bottom: [.dress, .skirt]
        case .skirt: [.dress, .bottom]
        default: []
        }
    }
}


extension GarmentCategory {
    /// Singular word used when naming a piece ("Rose skirt").
    var noun: String {
        switch self {
        case .top: "top"
        case .outerwear: "jacket"
        case .dress: "dress"
        case .bottom: "trousers"
        case .skirt: "skirt"
        case .shoes: "shoes"
        case .hat: "hat"
        case .bag: "bag"
        case .sweater: "sweater"
        case .collar: "collar"
        case .bandana: "bandana"
        }
    }
}

// MARK: - Profile choices

enum BodyShape: String, CaseIterable, Identifiable, Codable, Sendable {
    case hourglass, pear, apple, rectangle, invertedTriangle

    var id: String { rawValue }

    var title: String {
        switch self {
        case .hourglass: "Hourglass"
        case .pear: "Pear"
        case .apple: "Round"
        case .rectangle: "Straight"
        case .invertedTriangle: "Athletic"
        }
    }

    var detail: String {
        switch self {
        case .hourglass: "Shoulders and hips balanced, defined waist"
        case .pear: "Hips wider than shoulders"
        case .apple: "Fuller middle, slimmer legs"
        case .rectangle: "Shoulders, waist and hips similar"
        case .invertedTriangle: "Shoulders wider than hips"
        }
    }

    /// Relative widths of shoulders, waist and hips, used to draw the icon.
    var proportions: (shoulders: CGFloat, waist: CGFloat, hips: CGFloat) {
        switch self {
        case .hourglass: (0.9, 0.55, 0.9)
        case .pear: (0.7, 0.6, 1)
        case .apple: (0.85, 0.95, 0.8)
        case .rectangle: (0.8, 0.72, 0.8)
        case .invertedTriangle: (1, 0.66, 0.7)
        }
    }

    /// A positive styling idea for each shape.
    var tip: String {
        switch self {
        case .hourglass: "Wrap dresses and belted coats follow your waist beautifully."
        case .pear: "Statement tops and A-line skirts balance your silhouette."
        case .apple: "Flowing tops and straight trousers give an easy, long line."
        case .rectangle: "Layers, belts and soft volume add shape and movement."
        case .invertedTriangle: "Wide-leg trousers and full skirts pair well with your shoulders."
        }
    }

    /// Categories that tend to suit this shape, given a small boost in suggestions.
    var favours: Set<GarmentCategory> {
        switch self {
        case .hourglass: [.dress, .outerwear]
        case .pear: [.top, .skirt]
        case .apple: [.top, .bottom]
        case .rectangle: [.outerwear, .skirt]
        case .invertedTriangle: [.bottom, .skirt]
        }
    }
}

enum AppGoal: String, CaseIterable, Identifiable, Codable, Sendable {
    case discover, plan, matchFriends, dressPets, organize

    var id: String { rawValue }

    var title: String {
        switch self {
        case .discover: "Find new outfits"
        case .plan: "Plan what I wear"
        case .matchFriends: "Match with friends"
        case .dressPets: "Dress my pets"
        case .organize: "Organize my closet"
        }
    }

    var detail: String {
        switch self {
        case .discover: "Shuffle fresh combinations from what you own"
        case .plan: "A calendar of looks for the week ahead"
        case .matchFriends: "Coordinate colours for events and photos"
        case .dressPets: "Twin with your dog or cat"
        case .organize: "Every piece photographed and searchable"
        }
    }

    var symbol: String {
        switch self {
        case .discover: "shuffle"
        case .plan: "calendar"
        case .matchFriends: "person.2"
        case .dressPets: "pawprint"
        case .organize: "square.grid.2x2"
        }
    }
}

enum StyleVibe: String, CaseIterable, Identifiable, Codable, Sendable {
    case minimal, classic, romantic, street, boho, sporty

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    /// Colours that define the vibe; outfits near them score higher.
    var palette: [String] {
        switch self {
        case .minimal: ["F5F5F2", "1C1C1E", "9A9A9A", "D9C9AE"]
        case .classic: ["2E3B55", "EFE6D2", "B88A5A", "6E2433"]
        case .romantic: ["E8C3BC", "D9A3A0", "EDE3C8", "C3B1D9"]
        case .street: ["1C1C1E", "6E86A3", "6F6B3A", "C2302E"]
        case .boho: ["C26A4A", "D1A23B", "A9B79A", "7A5236"]
        case .sporty: ["F5F5F2", "2F55A4", "E07B39", "3A3B3E"]
        }
    }
}

/// Scale applied to a mannequin so it reflects the wearer's build.
struct BodyFit: Hashable, Sendable {
    var width: Double
    var height: Double
    static let standard = BodyFit(width: 1, height: 1)

    static func make(kind: WearerKind, heightCm: Double, weightKg: Double) -> BodyFit {
        guard !kind.isPet else { return .standard }
        var width = 1.0
        if heightCm > 0, weightKg > 0 {
            let bmi = weightKg / pow(heightCm / 100, 2)
            width = min(1.22, max(0.9, 1 + (bmi - 21.5) * 0.02))
        }
        let base: Double = switch kind { case .man: 178; case .child: 130; default: 166 }
        let height = heightCm > 0 ? min(1.15, max(0.85, heightCm / base)) : 1
        return BodyFit(width: width, height: height)
    }
}
