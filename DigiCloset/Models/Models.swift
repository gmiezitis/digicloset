import Foundation
import SwiftData

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

// MARK: - Stored models

@Model
final class Wearer {
    var id: UUID = UUID()
    var name: String = ""
    var kindRaw: String = WearerKind.woman.rawValue
    var accentHex: String = "C9A27E"
    var sortIndex: Int = 0
    var createdAt: Date = Date.now

    @Relationship(deleteRule: .cascade, inverse: \Garment.wearer) var garments: [Garment]? = []
    @Relationship(deleteRule: .cascade, inverse: \Look.wearer) var looks: [Look]? = []

    init(name: String, kind: WearerKind, accentHex: String, sortIndex: Int) {
        self.name = name
        self.kindRaw = kind.rawValue
        self.accentHex = accentHex
        self.sortIndex = sortIndex
    }

    var kind: WearerKind {
        get { WearerKind(rawValue: kindRaw) ?? .woman }
        set { kindRaw = newValue.rawValue }
    }
}

@Model
final class Garment {
    #Index<Garment>([\.ownerID, \.createdAt], [\.ownerID, \.categoryRaw])

    var id: UUID = UUID()
    /// Copy of the wearer's id so closet queries can use an index instead of a join.
    var ownerID: UUID = UUID()
    var name: String = ""
    var brand: String = ""
    var categoryRaw: String = GarmentCategory.top.rawValue
    var colorHex: String = "D9D4CC"
    @Attribute(.externalStorage) var imageData: Data?
    var thumbnailData: Data?
    var wearCount: Int = 0
    var isFavorite: Bool = false
    var createdAt: Date = Date.now

    var wearer: Wearer?
    var looks: [Look]? = []

    init(name: String, brand: String = "", category: GarmentCategory, colorHex: String, owner: Wearer) {
        self.name = name
        self.brand = brand
        self.categoryRaw = category.rawValue
        self.colorHex = colorHex
        self.ownerID = owner.id
    }

    var category: GarmentCategory {
        get { GarmentCategory(rawValue: categoryRaw) ?? .top }
        set { categoryRaw = newValue.rawValue }
    }

    var hasPhoto: Bool { thumbnailData != nil }
    var layer: FigureLayer { FigureLayer(id: id, category: category, colorHex: colorHex) }
}

@Model
final class Look {
    #Index<Look>([\.ownerID, \.createdAt])

    var id: UUID = UUID()
    var ownerID: UUID = UUID()
    var name: String = ""
    var createdAt: Date = Date.now

    var wearer: Wearer?
    @Relationship(inverse: \Garment.looks) var garments: [Garment]? = []
    var matchSet: MatchSet?
    @Relationship(deleteRule: .cascade, inverse: \PlanEntry.look) var plans: [PlanEntry]? = []

    init(name: String, owner: Wearer) {
        self.name = name
        self.ownerID = owner.id
    }

    var kind: WearerKind { wearer?.kind ?? .woman }
    var items: [Garment] { (garments ?? []).sorted { $0.category.layer < $1.category.layer } }
    var layers: [FigureLayer] { items.map(\.layer) }
    var palette: [String] { items.map(\.colorHex).uniqued() }
}

@Model
final class MatchSet {
    var id: UUID = UUID()
    var name: String = ""
    var createdAt: Date = Date.now

    @Relationship(deleteRule: .nullify, inverse: \Look.matchSet) var looks: [Look]? = []
    @Relationship(deleteRule: .cascade, inverse: \PlanEntry.matchSet) var plans: [PlanEntry]? = []

    init(name: String) { self.name = name }

    /// People first (tallest to shortest), pets last.
    var orderedLooks: [Look] {
        (looks ?? []).sorted { $0.kind.relativeHeight > $1.kind.relativeHeight }
    }
    var palette: [String] { orderedLooks.flatMap(\.palette).uniqued() }
}

@Model
final class PlanEntry {
    #Index<PlanEntry>([\.day])

    var id: UUID = UUID()
    var day: Date = Date.now
    var look: Look?
    var matchSet: MatchSet?

    init(day: Date) { self.day = Calendar.current.startOfDay(for: day) }

    var looks: [Look] {
        if let matchSet { return matchSet.orderedLooks }
        return look.map { [$0] } ?? []
    }
    var title: String { matchSet?.name ?? look?.name ?? "Look" }
}

// MARK: - Helpers

/// A plain value describing one coloured piece on a figure, so figures can be
/// drawn for unsaved suggestions as well as saved looks.
struct FigureLayer: Identifiable, Hashable, Sendable {
    let id: UUID
    let category: GarmentCategory
    let colorHex: String
}

extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
