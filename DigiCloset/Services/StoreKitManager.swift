import StoreKit

/// Subscriptions through Apple's StoreKit 2. Loads the four products, buys and
/// restores, and keeps `Entitlements` in step with verified transactions
/// (including Family Sharing and renewals that happen while the app is closed).
@MainActor @Observable
final class StoreKitManager {
    static let shared = StoreKitManager()

    static let productIDs = [
        "premium_individual_monthly", "premium_individual_yearly",
        "premium_family_monthly", "premium_family_yearly",
    ]

    private(set) var products: [String: Product] = [:]
    private(set) var loadFailed = false
    private var updates: Task<Void, Never>?

    private init() {}

    /// Call once at launch: loads products, reads current entitlements and listens for changes.
    func start() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let transaction) = update { await transaction.finish() }
                await self?.refresh()
            }
        }
        Task {
            await loadProducts()
            await refresh()
        }
    }

    func loadProducts() async {
        do {
            let loaded = try await Product.products(for: Self.productIDs)
            products = Dictionary(uniqueKeysWithValues: loaded.map { ($0.id, $0) })
            loadFailed = loaded.isEmpty
        } catch {
            loadFailed = true
        }
    }

    func product(_ plan: Plan, yearly: Bool) -> Product? {
        guard plan != .free else { return nil }
        return products["premium_\(plan.rawValue)_\(yearly ? "yearly" : "monthly")"]
    }

    /// Returns true when the purchase went through (not cancelled or pending).
    func purchase(_ product: Product) async throws -> Bool {
        switch try await product.purchase() {
        case .success(.verified(let transaction)):
            await transaction.finish()
            await refresh()
            return true
        case .success(.unverified):
            return false
        case .userCancelled, .pending:
            return false
        @unknown default:
            return false
        }
    }

    func restore() async {
        try? await AppStore.sync()
        await refresh()
    }

    /// The best plan among the user's current, verified, unrevoked subscriptions.
    func refresh() async {
        var best = Plan.free
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, transaction.revocationDate == nil,
                  let plan = Self.plan(for: transaction.productID) else { continue }
            if plan == .family || best == .free { best = plan }
        }
        Entitlements.shared.storePlan = best
    }

    nonisolated static func plan(for productID: String) -> Plan? {
        if productID.hasPrefix("premium_family") { return .family }
        if productID.hasPrefix("premium_individual") { return .individual }
        return nil
    }
}
