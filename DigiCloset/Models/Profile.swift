import Foundation
import SwiftData

/// The person using the app: what they told us in onboarding, plus what the
/// app has learned from what they actually do.
@Model
final class UserProfile {
    var name: String = ""
    var goalsRaw: [String] = []
    var vibesRaw: [String] = []
    var favoriteColors: [String] = []
    var usesMetric: Bool = true
    var onboardedAt: Date?
    var tasteData: Data?
    var createdAt: Date = Date.now

    init() {}

    var goals: [AppGoal] {
        get { goalsRaw.compactMap(AppGoal.init) }
        set { goalsRaw = newValue.map(\.rawValue) }
    }

    var vibes: [StyleVibe] {
        get { vibesRaw.compactMap(StyleVibe.init) }
        set { vibesRaw = newValue.map(\.rawValue) }
    }

    var taste: Taste {
        get { tasteData.flatMap { try? JSONDecoder().decode(Taste.self, from: $0) } ?? Taste() }
        set { tasteData = try? JSONEncoder().encode(newValue) }
    }

    /// The goal that should shape the home screen: the first one picked, or
    /// whichever feature they've used most once there's enough history.
    var primaryGoal: AppGoal {
        let taste = taste
        if taste.events >= 12, let top = taste.features.max(by: { $0.value < $1.value }), let goal = AppGoal(rawValue: top.key) {
            return goal
        }
        return goals.first ?? .discover
    }
}

/// Learned preferences. Every signal nudges a weight; old signals fade so the
/// app follows the user's taste as it changes.
struct Taste: Codable, Sendable {
    /// Colour family → affinity (roughly −3…3).
    var families: [String: Double] = [:]
    var categories: [String: Double] = [:]
    /// "familyA|familyB" → how much they like these colours together.
    var pairs: [String: Double] = [:]
    /// AppGoal raw value → times used.
    var features: [String: Int] = [:]
    /// Recently shown shuffles, so the same outfit doesn't come back too soon.
    var recent: [String] = []
    var events: Int = 0

    static func pairKey(_ a: ColorFamily, _ b: ColorFamily) -> String {
        [a.rawValue, b.rawValue].sorted().joined(separator: "|")
    }
}
