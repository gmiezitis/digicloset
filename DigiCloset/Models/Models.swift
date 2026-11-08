import Foundation
import SwiftData

// MARK: - Stored models

@Model
final class Wearer {
    var id: UUID = UUID()
    var name: String = ""
    var kindRaw: String = WearerKind.woman.rawValue
    var accentHex: String = "C9A27E"
    var sortIndex: Int = 0
    var createdAt: Date = Date.now
    /// The app's owner, as opposed to friends and pets.
    var isSelf: Bool = false
    var bodyShapeRaw: String = ""
    var heightCm: Double = 0
    var weightKg: Double = 0

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

    var bodyShape: BodyShape? {
        get { BodyShape(rawValue: bodyShapeRaw) }
        set { bodyShapeRaw = newValue?.rawValue ?? "" }
    }

    /// How this person's figure is drawn: a little wider or taller than the
    /// standard mannequin, from their height and weight.
    var fit: BodyFit { BodyFit.make(kind: kind, heightCm: heightCm, weightKg: weightKg) }
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
    /// Secondary colours found in the photo (stripes, prints, trims).
    var paletteHexes: [String] = []
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
    var fit: BodyFit { wearer?.fit ?? .standard }
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
