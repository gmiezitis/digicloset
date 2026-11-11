import SwiftData
import SwiftUI

/// The start screen. Answers "what do I wear today?" first (today's planned
/// look, or a suggestion picked for the weather), then shows the week and
/// your saved looks. Everything else is one tap away.
struct TodayView: View {
    var openTab: (AppTab) -> Void

    @Environment(\.modelContext) private var context
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]
    @Query(sort: \Garment.createdAt, order: .reverse) private var garments: [Garment]
    @Query(sort: \Look.createdAt, order: .reverse) private var looks: [Look]
    @Query(sort: \PlanEntry.day) private var entries: [PlanEntry]
    @Query private var profiles: [UserProfile]

    @State private var weather = WeatherService.shared
    @State private var suggestion: Outfit?
    @State private var openLook: Look?
    @State private var planDay: Date?
    @State private var showAdd = false
    @State private var showBuilder = false
    @State private var showStyle = false
    @State private var showAllLooks = false
    @State private var showFamilyLook = false
    @State private var paywall: PaywallReason?
    @AppStorage("today.woreKey") private var woreKey = ""

    private let calendar = Calendar.current
    private var today: Date { calendar.startOfDay(for: .now) }
    private var me: Wearer? { wearers.first(where: \.isSelf) ?? wearers.first }
    private var myCloset: [Garment] { garments.filter { $0.ownerID == me?.id } }
    private var profile: UserProfile? { profiles.first }

    /// A look planned for today for you.
    private var plannedToday: Look? {
        entries.filter { calendar.isDate($0.day, inSameDayAs: today) }
            .flatMap(\.looks)
            .first { $0.wearer?.id == me?.id }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    header
                    hero
                    week
                    if !looks.isEmpty { savedLooks }
                    companions
                }
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $openLook) { LookDetailView(look: $0) }
            .sheet(item: Binding(get: { planDay.map(DayID.init) }, set: { planDay = $0?.day })) { PlanPicker(day: $0.day) }
            .sheet(isPresented: $showAdd) { AddGarmentView(preselectedOwner: me?.id) }
            .sheet(isPresented: $showBuilder) { LookBuilderView() }
            .sheet(isPresented: $showFamilyLook) { FamilyLookView() }
            .sheet(item: $paywall) { PaywallView(reason: $0) }
            .sheet(isPresented: $showStyle) { if let profile { StyleProfileView(profile: profile) } }
            .fullScreenCover(isPresented: $showAllLooks) { RunwayView(onClose: { showAllLooks = false }) }
            .onAppear {
                weather.refresh(metric: profile?.usesMetric ?? true)
                if suggestion == nil { suggest() }
            }
            .onChange(of: weather.now) { if plannedToday == nil { suggest() } }
            .onChange(of: myCloset.count) { if suggestion == nil { suggest() } }
        }
    }

    // MARK: Header

    private var greeting: String {
        let hour = calendar.component(.hour, from: .now)
        let part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        let name = profile?.name ?? ""
        return name.isEmpty ? part : "\(part), \(name)"
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Eyebrow(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                Spacer()
                weatherChip
            }
            HStack(alignment: .center) {
                Text(greeting)
                    .font(Theme.display(32))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 8)
                Button { showStyle = true } label: {
                    Group {
                        if let me { WearerAvatar(wearer: me, size: 42) } else { Image(systemName: "person.crop.circle").font(.system(size: 26)) }
                    }
                }
                .buttonStyle(PressableStyle())
                .foregroundStyle(Theme.ink)
                .accessibilityLabel("Your style")
                Menu {
                    Button("Add clothes", systemImage: "camera") { showAdd = true }
                    Button("Create a look", systemImage: "sparkles") { showBuilder = true }
                    if wearers.count > 1 {
                        Button("Family photo look", systemImage: "person.3") {
                            if case .paywall(let reason) = FeatureGate.canBuildFamilyPhotoLook(wearerCount: 2, plan: Entitlements.shared.plan) {
                                paywall = reason
                            } else {
                                showFamilyLook = true
                            }
                        }
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 42, height: 42)
                        .foregroundStyle(.white)
                        .background(Theme.ink, in: Circle())
                }
                .accessibilityLabel("Add")
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    @ViewBuilder
    private var weatherChip: some View {
        if let now = weather.now {
            Label {
                Text("\(now.temperature)°" + (now.city.isEmpty ? "" : " · \(now.city)"))
            } icon: {
                Image(systemName: now.symbol)
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.muted)
        } else if weather.canAsk {
            Button { weather.requestPermission() } label: {
                Label("Show weather", systemImage: "cloud.sun")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Theme.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.hairline))
            }
            .foregroundStyle(Theme.ink)
        }
    }

    // MARK: Today's look

    private var heroGarments: [Garment] { plannedToday?.items ?? suggestion?.garments ?? [] }
    private var wornToday: Bool { woreKey == todayKey }
    private var todayKey: String { today.formatted(.iso8601.year().month().day()) }

    private var reason: String {
        if plannedToday != nil { return wornToday ? "You're wearing this today" : "Planned for today" }
        guard let now = weather.now else { return "Picked from what you love" }
        if now.highCelsius < 12 { return "A warm layer for \(now.high)°" + (now.isWet ? " and rain" : "") }
        if now.highCelsius > 22 { return "Light and easy for \(now.high)°" }
        return "Just right for \(now.high)°"
    }

    @ViewBuilder
    private var hero: some View {
        if myCloset.isEmpty {
            VStack(spacing: 14) {
                PhotoMannequin(garments: [], kind: me?.kind, wearer: me, height: 300)
                Text("Add a few clothes and you'll get a look for every day.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Button { showAdd = true } label: { PrimaryButtonLabel(title: "Add clothes", systemImage: "camera") }
                    .buttonStyle(PressableStyle())
                    .padding(.horizontal, 40)
            }
            .frame(maxWidth: .infinity)
        } else if heroGarments.isEmpty {
            VStack(spacing: 10) {
                Text("Add a top and trousers, a skirt or a dress to get today's look.")
                    .font(.system(size: 14)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                Button { showAdd = true } label: { PrimaryButtonLabel(title: "Add clothes", systemImage: "camera", filled: false) }
                    .buttonStyle(PressableStyle())
                    .padding(.horizontal, 40)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 30)
        } else {
            VStack(spacing: 14) {
                Button {
                    if let plannedToday { openLook = plannedToday }
                } label: {
                    PhotoMannequin(garments: heroGarments, kind: me?.kind, height: 380, refine: plannedToday != nil)
                        .id(heroGarments.map(\.id))
                        .transition(.opacity)
                }
                .buttonStyle(PressableStyle())

                VStack(spacing: 4) {
                    Eyebrow("Today's look")
                    Text(plannedToday?.name ?? suggestion?.suggestedName ?? "")
                        .font(Theme.display(26))
                        .contentTransition(.opacity)
                    Label(reason, systemImage: plannedToday != nil ? "calendar" : "sparkles")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.muted)
                }

                HStack(spacing: 12) {
                    Button(action: wearThis) {
                        PrimaryButtonLabel(title: wornToday ? "Wearing today" : "Wear this", systemImage: wornToday ? "checkmark" : "sun.max")
                    }
                    .disabled(wornToday)
                    Button {
                        if plannedToday != nil { openTab(.shuffle) } else { withAnimation(.smooth) { suggest() } }
                    } label: {
                        PrimaryButtonLabel(title: plannedToday != nil ? "Shuffle" : "Another", systemImage: "shuffle", filled: false)
                    }
                }
                .buttonStyle(PressableStyle())
                .padding(.horizontal, 20)
                .sensoryFeedback(.success, trigger: wornToday)
            }
            .frame(maxWidth: .infinity)
            .animation(.smooth, value: heroGarments.map(\.id))
        }
    }

    // MARK: This week

    private var week: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow("This week")
                Spacer()
                Button("Planner") { openTab(.planner) }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            .padding(.horizontal, 20)
            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { offset in
                    let day = calendar.date(byAdding: .day, value: offset, to: today)!
                    dayTile(day, isToday: offset == 0)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func dayTile(_ day: Date, isToday: Bool) -> some View {
        let planned = entries.filter { calendar.isDate($0.day, inSameDayAs: day) }.flatMap(\.looks)
        return Button {
            if let first = planned.first { openLook = first } else { planDay = day }
        } label: {
            VStack(spacing: 5) {
                Text(day.formatted(.dateTime.weekday(.narrow)))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isToday ? Color.white.opacity(0.7) : Theme.muted)
                Text(day.formatted(.dateTime.day()))
                    .font(Theme.display(17))
                if planned.isEmpty {
                    Image(systemName: "plus").font(.system(size: 9, weight: .bold)).opacity(0.5)
                } else {
                    HStack(spacing: -3) {
                        ForEach(planned.flatMap(\.palette).uniqued().prefix(3), id: \.self) { Swatch(hex: $0, size: 9) }
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 74)
            .foregroundStyle(isToday ? Color.white : Theme.ink)
            .background(isToday ? Theme.ink : Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.hairline, style: StrokeStyle(lineWidth: 1, dash: planned.isEmpty && !isToday ? [3, 3] : []))
            }
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(planned.isEmpty ? "Plan \(day.formatted(.dateTime.weekday(.wide)))" : "Planned look")
    }

    // MARK: Your looks

    /// One card per look, and one per matching set rather than one per person in it.
    private var recentLooks: [Look] {
        var seenSets = Set<UUID>()
        return looks.filter { look in
            guard let set = look.matchSet else { return true }
            return seenSets.insert(set.id).inserted
        }
    }

    private var savedLooks: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow("Your looks")
                Spacer()
                Button("See all") { showAllLooks = true }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            .padding(.horizontal, 20)
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(recentLooks.prefix(10)) { look in
                        Button { openLook = look } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                LookFigure(looks: look.matchSet?.orderedLooks ?? [look], height: 170)
                                    .frame(height: 170)
                                Text(look.name.isEmpty ? "Untitled look" : look.name)
                                    .font(.system(size: 13, weight: .semibold))
                                    .lineLimit(1)
                                    .frame(maxWidth: 150, alignment: .leading)
                            }
                        }
                        .buttonStyle(PressableStyle())
                        .foregroundStyle(Theme.ink)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    // MARK: Friends and pets

    @ViewBuilder
    private var companions: some View {
        let others = wearers.filter { $0.id != me?.id }.sorted { $0.kind.isPet && !$1.kind.isPet }
        if let other = others.first, !heroGarments.isEmpty {
            Button {
                UserDefaults.standard.set(other.id.uuidString, forKey: "shuffle.pendingPartner")
                openTab(.shuffle)
            } label: {
                HStack(spacing: 12) {
                    WearerAvatar(wearer: other, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Match \(other.name) with today's look").font(.system(size: 15, weight: .semibold))
                        Text(other.kind.isPet ? "Colours that go with yours" : "Coordinated outfits for both of you")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Image(systemName: "arrow.right").font(.system(size: 14, weight: .semibold))
                }
                .padding(14)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.hairline))
            }
            .buttonStyle(PressableStyle())
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 20)
        }
    }

    // MARK: Actions

    /// A suggestion that suits the weather: a coat when it's cold, none when it's warm.
    private func suggest() {
        guard let me else { return }
        var closet = myCloset
        var locked: [Garment] = []
        if let now = weather.now {
            if now.highCelsius < 12, let coat = closet.filter({ $0.category == .outerwear }).randomElement() {
                locked = [coat]
            } else if now.highCelsius > 22 {
                closet.removeAll { $0.category == .outerwear }
            }
        }
        suggestion = OutfitGenerator.shuffle(closet: closet, kind: me.kind, locked: locked, profile: profile, body: me.bodyShape)
    }

    private func wearThis() {
        guard !wornToday, let me else { return }
        var look = plannedToday
        if look == nil, let suggestion {
            let new = Look(name: suggestion.suggestedName, owner: me)
            context.insert(new)
            new.wearer = me
            new.garments = suggestion.garments
            let entry = PlanEntry(day: today)
            context.insert(entry)
            entry.look = new
            look = new
        }
        guard let look else { return }
        look.items.forEach { $0.wearCount += 1 }
        Personalizer.record(.wore, garments: look.items, in: context)
        withAnimation(.smooth) { woreKey = todayKey }
    }
}

/// Lets a plain date drive `.sheet(item:)`.
private struct DayID: Identifiable {
    let day: Date
    var id: Date { day }
}
