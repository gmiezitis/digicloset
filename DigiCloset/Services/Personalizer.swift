import Foundation
import SwiftData

/// Learns what the user likes from what they do (love, skip, wear, plan, save)
/// and uses it, with their onboarding answers, to rank outfits.
@MainActor
enum Personalizer {
    enum Signal {
        case loved, saved, wore, planned, favorited, added, matched, skipped

        var weight: Double {
            switch self {
            case .loved: 1
            case .saved: 0.8
            case .favorited: 0.7
            case .wore: 0.6
            case .matched: 0.6
            case .planned: 0.4
            case .added: 0.25
            case .skipped: -0.4
            }
        }

        var feature: AppGoal {
            switch self {
            case .loved, .skipped, .saved: .discover
            case .wore, .added, .favorited: .organize
            case .planned: .plan
            case .matched: .matchFriends
            }
        }
    }

    static func profile(in context: ModelContext) -> UserProfile {
        if let existing = try? context.fetch(FetchDescriptor<UserProfile>()).first { return existing }
        let profile = UserProfile()
        context.insert(profile)
        return profile
    }

    static func me(in context: ModelContext) -> Wearer? {
        let wearers = (try? context.fetch(FetchDescriptor<Wearer>(sortBy: [SortDescriptor(\.sortIndex)]))) ?? []
        return wearers.first(where: \.isSelf) ?? wearers.first { !$0.kind.isPet }
    }

    /// Nudges the learned taste towards (or away from) these pieces.
    static func record(_ signal: Signal, garments: [Garment], feature: AppGoal? = nil, in context: ModelContext) {
        let profile = profile(in: context)
        var taste = profile.taste
        let decay = 0.985
        taste.families = taste.families.mapValues { $0 * decay }
        taste.categories = taste.categories.mapValues { $0 * decay }
        taste.pairs = taste.pairs.mapValues { $0 * decay }

        let w = signal.weight
        let families = Array(Set(garments.map { ColorScience.family($0.colorHex) }))
        let spread = Double(max(families.count, 1)).squareRoot()
        for family in families {
            taste.families[family.rawValue] = clamp((taste.families[family.rawValue] ?? 0) + w / spread)
        }
        for category in Set(garments.map(\.categoryRaw)) {
            taste.categories[category] = clamp((taste.categories[category] ?? 0) + w * 0.6)
        }
        for i in families.indices {
            for j in families.indices where j > i {
                let key = Taste.pairKey(families[i], families[j])
                taste.pairs[key] = clamp((taste.pairs[key] ?? 0) + w * 0.8)
            }
        }
        taste.features[(feature ?? signal.feature).rawValue, default: 0] += 1
        taste.events += 1
        profile.taste = taste
    }

    static func toggleFavorite(_ garment: Garment, in context: ModelContext) {
        garment.isFavorite.toggle()
        if garment.isFavorite { record(.favorited, garments: [garment], in: context) }
    }

    static func noteShown(_ signature: String, in context: ModelContext) {
        let profile = profile(in: context)
        var taste = profile.taste
        taste.recent = Array((taste.recent + [signature]).suffix(30))
        profile.taste = taste
    }

    /// Starting weights from onboarding, so suggestions feel personal from day one.
    static func seed(_ profile: UserProfile) {
        var taste = profile.taste
        for hex in profile.favoriteColors {
            taste.families[ColorScience.family(hex).rawValue, default: 0] += 1
        }
        for vibe in profile.vibes {
            for hex in vibe.palette { taste.families[ColorScience.family(hex).rawValue, default: 0] += 0.35 }
        }
        taste.families = taste.families.mapValues(clamp)
        profile.taste = taste
    }

    private static func clamp(_ v: Double) -> Double { min(3, max(-3, v)) }

    // MARK: Scoring

    struct Score {
        var value: Double
        var reason: String
    }

    static func score(_ garments: [Garment], profile: UserProfile?, body: BodyShape?, echo: [String] = []) -> Score {
        guard !garments.isEmpty else { return Score(value: 0, reason: "") }
        let palette = garments.map(\.colorHex).uniqued()
        let harmony = Double(ColorScience.harmony(palette)) / 100
        let taste = profile?.taste ?? Taste()
        let families = palette.map(ColorScience.family)

        func soft(_ v: Double) -> Double { tanh(v / 2) }
        let familyScore = families.map { soft(taste.families[$0.rawValue] ?? 0) }.reduce(0, +) / Double(families.count)
        var pairScore = 0.0, pairCount = 0.0
        for i in families.indices {
            for j in families.indices where j > i && families[i] != families[j] {
                pairScore += soft(taste.pairs[Taste.pairKey(families[i], families[j])] ?? 0)
                pairCount += 1
            }
        }
        if pairCount > 0 { pairScore /= pairCount }

        func closeness(_ targets: [String]) -> Double {
            guard !targets.isEmpty else { return 0 }
            let values = palette.map { hex in targets.map { ColorScience.distance($0, hex) }.min() ?? 100 }
            return values.map { max(0, 1 - $0 / 45) }.reduce(0, +) / Double(values.count)
        }
        let vibes = profile?.vibes ?? []
        let vibeScore = closeness(vibes.flatMap(\.palette))
        let favouriteScore = closeness(profile?.favoriteColors ?? [])
        let echoScore = closeness(echo)
        let bodyScore = body.map { b in Double(garments.filter { b.favours.contains($0.category) }.count) / Double(garments.count) } ?? 0
        let novelty = garments.map { 1 / (1 + Double($0.wearCount)) }.reduce(0, +) / Double(garments.count)

        let parts: [(Double, String)] = [
            (0.42 * harmony, "Harmony \(Int(harmony * 100)): the colours sit well together"),
            (0.2 * familyScore, families.max { (taste.families[$0.rawValue] ?? 0) < (taste.families[$1.rawValue] ?? 0) }
                .map { "You keep choosing \($0.title.lowercased())" } ?? ""),
            (0.1 * pairScore, "A pairing you've loved before"),
            (0.1 * vibeScore, vibes.first.map { "Fits your \($0.title.lowercased()) style" } ?? ""),
            (0.08 * favouriteScore, "Built around colours you love"),
            (echo.isEmpty ? 0 : 0.35 * echoScore, "Echoes the other look's palette"),
            (0.05 * bodyScore, body.map { _ in "Flattering for your shape" } ?? ""),
            (0.04 * novelty, "Pieces you haven't worn much yet"),
        ]
        let value = parts.map(\.0).reduce(0, +)
        // Explain with the strongest signal other than plain harmony, if it's meaningful.
        let personal = parts.dropFirst().filter { !$0.1.isEmpty }.max { $0.0 < $1.0 }
        let reason = (personal.map { $0.0 > 0.04 } ?? false) ? personal!.1 : parts[0].1
        return Score(value: value, reason: reason)
    }
}

// MARK: - Shuffle

struct Outfit: Identifiable {
    let garments: [Garment]
    let score: Personalizer.Score
    var id: String { signature }
    var signature: String { garments.map(\.id.uuidString).sorted().joined(separator: ",") }
    var palette: [String] { garments.map(\.colorHex).uniqued() }
    var layers: [FigureLayer] { garments.sorted { $0.category.layer < $1.category.layer }.map(\.layer) }

    /// A short name from the two main colours, like "Rose & Camel".
    var suggestedName: String {
        let names = palette.prefix(3).map { ColorScience.name($0) }.uniqued().prefix(2)
        return names.joined(separator: " & ")
    }
}

@MainActor
enum OutfitGenerator {
    /// Builds many random but valid outfits, scores each with the user's taste,
    /// and picks among the best few so results stay surprising.
    static func shuffle(closet: [Garment], kind: WearerKind, locked: [Garment] = [], profile: UserProfile?,
                        body: BodyShape?, echo: [String] = [], attempts: Int = 60) -> Outfit? {
        var byCategory: [GarmentCategory: [Garment]] = [:]
        for g in closet { byCategory[g.category, default: []].append(g) }
        let lockedByCategory = Dictionary(locked.map { ($0.category, $0) }, uniquingKeysWith: { a, _ in a })
        let recent = Set(profile?.taste.recent ?? [])

        func pick(_ categories: [GarmentCategory]) -> Garment? {
            if let hit = categories.lazy.compactMap({ lockedByCategory[$0] }).first { return hit }
            return categories.flatMap { byCategory[$0] ?? [] }.randomElement()
        }
        func optional(_ category: GarmentCategory, _ chance: Double) -> Garment? {
            if let hit = lockedByCategory[category] { return hit }
            return Double.random(in: 0..<1) < chance ? byCategory[category]?.randomElement() : nil
        }

        var seen = Set<String>()
        var candidates: [Outfit] = []
        for _ in 0..<attempts {
            var pieces: [Garment] = []
            if kind.isPet {
                if let sweater = optional(.sweater, 0.85) { pieces.append(sweater) }
                if let neck = lockedByCategory[.collar] ?? lockedByCategory[.bandana]
                    ?? (Double.random(in: 0..<1) < 0.8 ? pick([.collar, .bandana]) : nil) { pieces.append(neck) }
            } else {
                let hasDress = !(byCategory[.dress] ?? []).isEmpty
                let canSeparates = !(byCategory[.top] ?? []).isEmpty && !((byCategory[.bottom] ?? []) + (byCategory[.skirt] ?? [])).isEmpty
                let lockedDress = lockedByCategory[.dress] != nil
                let lockedSeparates = [.top, .bottom, .skirt].contains { lockedByCategory[$0] != nil }
                let useDress = lockedDress || (!lockedSeparates && hasDress && (!canSeparates || Double.random(in: 0..<1) < 0.3))
                if useDress {
                    if let dress = pick([.dress]) { pieces.append(dress) }
                } else {
                    if let top = pick([.top]) { pieces.append(top) }
                    if let bottom = pick([.bottom, .skirt]) { pieces.append(bottom) }
                }
                if let shoes = optional(.shoes, 0.9) { pieces.append(shoes) }
                if let coat = optional(.outerwear, 0.35) { pieces.append(coat) }
                if let bag = optional(.bag, 0.4) { pieces.append(bag) }
                if let hat = optional(.hat, 0.2) { pieces.append(hat) }
            }
            guard !pieces.isEmpty else { continue }
            let outfit = Outfit(garments: pieces, score: Personalizer.score(pieces, profile: profile, body: body, echo: echo))
            guard seen.insert(outfit.signature).inserted else { continue }
            candidates.append(outfit)
        }
        guard !candidates.isEmpty else { return nil }

        // Prefer outfits not shown lately, then sample among the top few by score.
        let fresh = candidates.filter { !recent.contains($0.signature) }
        let pool = (fresh.isEmpty ? candidates : fresh).sorted { $0.score.value > $1.score.value }.prefix(4)
        let weights = pool.map { exp($0.score.value * 10) }
        var roll = Double.random(in: 0..<weights.reduce(0, +))
        for (outfit, weight) in zip(pool, weights) {
            roll -= weight
            if roll <= 0 { return outfit }
        }
        return pool.first
    }
}
