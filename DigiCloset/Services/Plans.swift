import Foundation
import Observation

/// What each subscription allows, from PROPOSAL-premium-family-rename.md.
/// The single source of truth for limits: views ask `FeatureGate`, never
/// check a plan or a flag themselves.
enum Plan: String, CaseIterable, Codable, Sendable {
    case free, individual, family

    /// People besides you (partner, kids, friends). nil = no limit.
    var maxExtraHumans: Int? {
        switch self {
        case .free, .individual: 1
        case .family: 5 // six people in all
        }
    }

    /// nil = no limit.
    var maxPets: Int? { self == .free ? 1 : nil }

    /// Free gets a few try-ons ever, to taste it; paid plans get a monthly allowance
    /// (Family's is shared by the household).
    var tryOnsLifetime: Int? { self == .free ? 3 : nil }
    var tryOnsPerMonth: Int? {
        switch self {
        case .free: nil
        case .individual: 30
        case .family: 50
        }
    }

    /// Most wearers in one coordinated "family photo look", you included. 0 = not available.
    var maxFamilyLookWearers: Int {
        switch self {
        case .free: 0
        case .individual: 2
        case .family: .max // the whole household, pets included
        }
    }

    var cleanExports: Bool { self != .free }
}

/// Why a paywall is shown, so it can lead with the right plan.
enum PaywallReason: String, Identifiable, Sendable {
    case familySeats, morePets, tryOns, familyPhotoLook
    var id: String { rawValue }
}

enum Gate: Equatable, Sendable {
    case allowed
    case paywall(PaywallReason)
}

/// Pure rules: given a plan and what the user already has, may they do this?
enum FeatureGate {
    /// `existing` is everyone already in the household except you.
    static func canAddWearer(_ kind: WearerKind, existing: [WearerKind], plan: Plan) -> Gate {
        if kind.isPet {
            let pets = existing.filter(\.isPet).count
            if let max = plan.maxPets, pets >= max { return .paywall(.morePets) }
        } else {
            let humans = existing.filter { !$0.isPet }.count
            if let max = plan.maxExtraHumans, humans >= max { return .paywall(.familySeats) }
        }
        return .allowed
    }

    /// `needed` is how many try-ons the action will use (one per new piece).
    static func canStartTryOn(usedLifetime: Int, usedThisMonth: Int, needed: Int = 1, plan: Plan) -> Gate {
        if let max = plan.tryOnsLifetime, usedLifetime + needed > max { return .paywall(.tryOns) }
        if let max = plan.tryOnsPerMonth, usedThisMonth + needed > max { return .paywall(.tryOns) }
        return .allowed
    }

    /// `wearerCount` includes you.
    static func canBuildFamilyPhotoLook(wearerCount: Int, plan: Plan) -> Gate {
        wearerCount <= plan.maxFamilyLookWearers ? .allowed : .paywall(.familyPhotoLook)
    }

    static func canExportClean(plan: Plan) -> Bool { plan.cleanExports }
}

/// The user's current plan. Starts as Free; only StoreKitManager raises it, from
/// verified App Store transactions. Never set it from a saved flag.
@MainActor @Observable
final class Entitlements {
    static let shared = Entitlements()

    /// From the App Store (StoreKitManager).
    var storePlan: Plan = .free

    #if DEBUG
    /// Simulator testing only: launch with `-plan individual` or `-plan family`.
    private let override = UserDefaults.standard.string(forKey: "plan").flatMap(Plan.init(rawValue:))
    var plan: Plan { override ?? storePlan }
    #else
    var plan: Plan { storePlan }
    #endif

    private init() {}
}
