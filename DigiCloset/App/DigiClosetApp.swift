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
        }
        .modelContainer(container)
    }
}

/// Onboarding until it's done, then the app.
struct RootView: View {
    @Query private var profiles: [UserProfile]

    var body: some View {
        Group {
            if let profile = profiles.first, profile.onboardedAt != nil {
                MainTabs(start: AppTab.start(for: profile.primaryGoal))
                    .transition(.opacity.combined(with: .scale(scale: 1.02)))
            } else {
                OnboardingView()
                    .transition(.opacity)
            }
        }
        .animation(.smooth(duration: 0.6), value: profiles.first?.onboardedAt)
    }
}

enum AppTab: Hashable {
    case runway, shuffle, closet, planner

    /// Open where the user spends their time.
    static func start(for goal: AppGoal) -> AppTab {
        switch goal {
        case .discover: .shuffle
        case .plan: .planner
        case .organize: .closet
        case .matchFriends, .dressPets: .runway
        }
    }
}

struct MainTabs: View {
    @State private var tab: AppTab

    init(start: AppTab) { _tab = State(initialValue: start) }

    var body: some View {
        TabView(selection: $tab) {
            Tab("Runway", systemImage: "sparkles", value: AppTab.runway) { RunwayView() }
            Tab("Shuffle", systemImage: "shuffle", value: AppTab.shuffle) { ShuffleView() }
            Tab("Closet", systemImage: "hanger", value: AppTab.closet) { ClosetView() }
            Tab("Planner", systemImage: "calendar", value: AppTab.planner) { PlannerView() }
        }
        .tint(Theme.ink)
    }
}
