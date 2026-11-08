import SwiftUI
import SwiftData

@main
struct DigiClosetApp: App {
    /// One shared store for the whole app. Data lives on the device; images are
    /// kept outside the database file (external storage) so queries stay fast.
    private let container: ModelContainer = {
        let schema = Schema([Wearer.self, Garment.self, Look.self, MatchSet.self, PlanEntry.self])
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

struct RootView: View {
    @Environment(\.modelContext) private var context

    var body: some View {
        TabView {
            Tab("Runway", systemImage: "sparkles") { RunwayView() }
            Tab("Closet", systemImage: "hanger") { ClosetView() }
            Tab("Planner", systemImage: "calendar") { PlannerView() }
        }
        .tint(Theme.ink)
        .task { SampleData.seedIfNeeded(context) }
    }
}
