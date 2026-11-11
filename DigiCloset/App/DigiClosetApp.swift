import SwiftUI
import SwiftData

@main
struct DigiClosetApp: App {
    /// One shared store for the whole app. Data lives on the device; images are
    /// kept outside the database file (external storage) so queries stay fast.
    private let container: ModelContainer = {
        let schema = Schema([Wearer.self, Garment.self, Look.self, MatchSet.self, PlanEntry.self, UserProfile.self])
        do {
            return try ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema))
        } catch {
            fatalError("Could not open the closet store: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .task { StoreKitManager.shared.start() }
        }
        .modelContainer(container)
    }
}

/// Onboarding until it's done, then the paywall (hard paywall), then the app.
struct RootView: View {
    @Query private var profiles: [UserProfile]
    @State private var entitlements = Entitlements.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if let profile = profiles.first, profile.onboardedAt != nil {
                if Plan.hardPaywall && !entitlements.checked {
                    // A moment while StoreKit reads the user's subscriptions.
                    StudioBackground().ignoresSafeArea()
                } else if entitlements.mustSubscribe {
                    PaywallView(hard: true)
                        .transition(.opacity)
                } else {
                    MainTabs(start: AppTab.start(for: profile.primaryGoal))
                        .transition(.opacity.combined(with: .scale(scale: 1.02)))
                }
            } else {
                OnboardingView()
                    .transition(.opacity)
            }
        }
        .animation(.smooth(duration: 0.6), value: profiles.first?.onboardedAt)
        .animation(.smooth(duration: 0.6), value: entitlements.mustSubscribe)
        // Catch a trial or subscription that ended while the app was in the background.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await StoreKitManager.shared.refresh() } }
        }
    }
}

enum AppTab: Hashable {
    case today, shuffle, closet, planner

    /// Everyone starts on Today: it answers "what do I wear?" and leads to the rest.
    static func start(for goal: AppGoal) -> AppTab { .today }
}

struct MainTabs: View {
    @Environment(\.modelContext) private var context
    @State private var tab: AppTab

    init(start: AppTab) { _tab = State(initialValue: start) }

    var body: some View {
        TabView(selection: $tab) {
            Tab("Today", systemImage: "sun.max", value: AppTab.today) { TodayView(openTab: { tab = $0 }) }
            Tab("Shuffle", systemImage: "shuffle", value: AppTab.shuffle) { ShuffleView() }
            Tab("Closet", systemImage: "hanger", value: AppTab.closet) { ClosetView() }
            Tab("Planner", systemImage: "calendar", value: AppTab.planner) { PlannerView() }
        }
        .tint(Theme.ink)
        // Pieces without a photo (examples, hand-added) get a studio shot.
        .task {
            SampleData.stockEmptyPets(in: context)
            await GarmentStudio.fillMissing(in: context)
        }
    }
}
