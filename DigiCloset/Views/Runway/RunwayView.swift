import SwiftData
import SwiftUI

struct RunwayView: View {
    enum Mode: String, CaseIterable { case looks = "Looks", sets = "Matching sets" }

    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]
    @Query(sort: \Look.createdAt, order: .reverse) private var looks: [Look]
    @Query(sort: \MatchSet.createdAt, order: .reverse) private var sets: [MatchSet]
    @Query private var profiles: [UserProfile]
    @Namespace private var zoom
    @State private var showStyle = false
    @State private var didPickMode = false

    @State private var mode: Mode = .looks
    @State private var filter: UUID?
    @State private var focusedLook: UUID?
    @State private var focusedSet: UUID?
    @State private var openLook: Look?
    @State private var openGarment: Garment?
    @State private var showBuilder = false
    @State private var showAdd = false
    @Query private var garments: [Garment]

    private var visibleLooks: [Look] {
        guard let filter else { return looks }
        return looks.filter { $0.ownerID == filter }
    }

    private var visibleSets: [MatchSet] {
        guard let filter else { return sets }
        return sets.filter { $0.looks?.contains { $0.ownerID == filter } ?? false }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    controls
                    switch mode {
                    case .looks: looksSection
                    case .sets: setsSection
                    }
                }
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $openLook) { look in
                LookDetailView(look: look).navigationTransition(.zoom(sourceID: look.id, in: zoom))
            }
            .sheet(isPresented: $showStyle) {
                if let profile = profiles.first { StyleProfileView(profile: profile) }
            }
            .onAppear {
                // Friends- and pet-focused users land on matching sets.
                guard !didPickMode else { return }
                didPickMode = true
                if let goal = profiles.first?.primaryGoal, [.matchFriends, .dressPets].contains(goal), !sets.isEmpty { mode = .sets }
            }
            .sheet(item: $openGarment) { GarmentDetailView(garment: $0).presentationDetents([.medium, .large]) }
            .sheet(isPresented: $showBuilder) { LookBuilderView() }
            .sheet(isPresented: $showAdd) { AddGarmentView(preselectedOwner: nil) }
        }
    }

    // MARK: Header

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        let name = profiles.first?.name ?? ""
        return name.isEmpty ? part : "\(part), \(name)"
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(greeting)
                Text("Try the Look.")
                    .font(Theme.display(40))
                    .foregroundStyle(Theme.ink)
            }
            Spacer()
            Button { showStyle = true } label: {
                Group {
                    if let me = wearers.first(where: \.isSelf) {
                        WearerAvatar(wearer: me, size: 46)
                    } else {
                        Image(systemName: "person.crop.circle").font(.system(size: 28))
                    }
                }
                .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
            }
            .buttonStyle(PressableStyle())
            .foregroundStyle(Theme.ink)
            .accessibilityLabel("Your style")
            Menu {
                Button("Add clothes", systemImage: "camera") { showAdd = true }
                Button("Create a look", systemImage: "sparkles") { showBuilder = true }
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 46, height: 46)
                    .foregroundStyle(.white)
                    .background(Theme.ink, in: Circle())
                    .shadow(color: .black.opacity(0.2), radius: 10, y: 6)
            }
            .accessibilityLabel("Add")
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    /// True once there's someone besides you (or a set already exists).
    private var hasFamily: Bool { wearers.count > 1 || !sets.isEmpty }

    @ViewBuilder
    private var controls: some View {
        if hasFamily { familyControls }
    }

    private var familyControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ForEach(Mode.allCases, id: \.self) { m in
                    Chip(title: m.rawValue, isOn: mode == m) {
                        withAnimation(.smooth) { mode = m }
                    }
                }
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    WearerFilterButton(title: "Everyone", wearer: nil, isOn: filter == nil) {
                        withAnimation(.smooth) { filter = nil }
                    }
                    ForEach(wearers) { w in
                        WearerFilterButton(title: w.name, wearer: w, isOn: filter == w.id) {
                            withAnimation(.smooth) { filter = filter == w.id ? nil : w.id }
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    // MARK: Looks

    @ViewBuilder
    private var looksSection: some View {
        if visibleLooks.isEmpty, garments.isEmpty {
            EmptyRunway(kind: wearers.first(where: \.isSelf)?.kind ?? .woman,
                        message: "Start by adding a few clothes. Snap them or pick photos, and they're cut out for you.",
                        buttonTitle: "Add clothes", buttonIcon: "camera") { showAdd = true }
        } else if visibleLooks.isEmpty {
            EmptyRunway(kind: wearers.first(where: \.isSelf)?.kind ?? .woman) { showBuilder = true }
        } else {
            Carousel(items: visibleLooks, focused: $focusedLook, widthRatio: 0.56) { look, isFocused in
                LookCard(look: look, isFocused: isFocused)
                    // Without a background and shape the zoom animates the card over
                    // black, which shows as a dark frame around the mannequin.
                    .matchedTransitionSource(id: look.id, in: zoom) { source in
                        source.background(Theme.canvas).clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                    }
            } onTapFocused: { openLook = $0 }

            if let look = visibleLooks.first(where: { $0.id == focusedLook }) ?? visibleLooks.first {
                LookSummary(look: look, onGarment: { openGarment = $0 }, onOpen: { openLook = look })
                    .id(look.id)
                    .transition(.opacity.combined(with: .offset(y: 12)))
            }
        }
    }

    // MARK: Sets

    @ViewBuilder
    private var setsSection: some View {
        if visibleSets.isEmpty {
            EmptyRunway(kind: wearers.first(where: \.isSelf)?.kind ?? .woman, message: "Match an outfit with a friend or your pet to create a set.") { showBuilder = true }
        } else {
            Carousel(items: visibleSets, focused: $focusedSet, widthRatio: 0.78) { set, isFocused in
                SetCard(set: set, isFocused: isFocused)
            } onTapFocused: { set in
                if let first = set.orderedLooks.first { openLook = first }
            }

            if let set = visibleSets.first(where: { $0.id == focusedSet }) ?? visibleSets.first {
                SetSummary(set: set, onLook: { openLook = $0 })
                    .id(set.id)
                    .transition(.opacity.combined(with: .offset(y: 12)))
            }
        }
    }
}

// MARK: - 3D carousel

/// Cover-flow style runway: the centred card faces you, neighbours turn away
/// in 3D, shrink and fade. Snaps card by card.
struct Carousel<Item: Identifiable, Card: View>: View where Item.ID == UUID {
    let items: [Item]
    @Binding var focused: UUID?
    var widthRatio: CGFloat
    @ViewBuilder var card: (Item, Bool) -> Card
    var onTapFocused: (Item) -> Void

    var body: some View {
        GeometryReader { geo in
            let cardWidth = geo.size.width * widthRatio
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(items) { item in
                        let isFocused = (focused ?? items.first?.id) == item.id
                        card(item, isFocused)
                            .frame(width: cardWidth)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if isFocused { onTapFocused(item) } else { withAnimation(.smooth) { focused = item.id } }
                            }
                            .scrollTransition(.interactive, axis: .horizontal) { content, phase in
                                content
                                    .rotation3DEffect(.degrees(phase.value * -38), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
                                    .scaleEffect(1 - abs(phase.value) * 0.2)
                                    .offset(y: abs(phase.value) * 18)
                                    .opacity(1 - abs(phase.value) * 0.45)
                            }
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, (geo.size.width - cardWidth) / 2, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $focused, anchor: .center)
            .scrollIndicators(.hidden)
            .sensoryFeedback(.selection, trigger: focused)
        }
        .frame(height: 480)
    }
}

struct LookCard: View {
    let look: Look
    var isFocused: Bool

    var body: some View {
        VStack(spacing: 14) {
            Group {
                if PhotoMannequin.canShow(look.kind) {
                    PhotoMannequin(garments: look.items, height: 380, autoDress: isFocused, refine: true)
                } else {
                    StandingFigure(kind: look.kind, layers: look.layers, height: 380, fit: look.fit)
                }
            }
            .frame(height: 400, alignment: .bottom)
            VStack(spacing: 4) {
                Text(look.name)
                    .font(Theme.display(21))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text("\(look.wearer?.name ?? "") · \(look.items.count == 1 ? "1 piece" : "\(look.items.count) pieces")")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            .opacity(isFocused ? 1 : 0.4)
        }
    }
}

struct SetCard: View {
    let set: MatchSet
    var isFocused: Bool

    var body: some View {
        VStack(spacing: 14) {
            GroupFigure(looks: set.orderedLooks, height: 360)
                .frame(height: 400, alignment: .bottom)
            VStack(spacing: 6) {
                Text(set.name)
                    .font(Theme.display(21))
                    .foregroundStyle(Theme.ink)
                HStack(spacing: 8) {
                    PaletteRow(hexes: Array(set.palette.prefix(6)), size: 12)
                    Text(set.orderedLooks.compactMap { $0.wearer?.name }.joined(separator: " · "))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            .opacity(isFocused ? 1 : 0.4)
        }
    }
}

// MARK: - Summaries under the carousel

struct LookSummary: View {
    let look: Look
    var onGarment: (Garment) -> Void
    var onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Eyebrow("In this look")
                Spacer()
                HarmonyBadge(score: MatchEngine.harmony(look.palette))
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(look.items) { garment in
                        Button { onGarment(garment) } label: { PieceChip(garment: garment) }
                            .buttonStyle(PressableStyle())
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)

            Button(action: onOpen) { PrimaryButtonLabel(title: "View the look", systemImage: "arrow.up.right") }
                .buttonStyle(PressableStyle())
                .padding(.horizontal, 20)
        }
    }
}

struct SetSummary: View {
    let set: MatchSet
    var onLook: (Look) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Eyebrow("Who's matching")
                Spacer()
                HarmonyBadge(score: MatchEngine.harmony(set.palette))
            }
            ForEach(set.orderedLooks) { look in
                Button { onLook(look) } label: {
                    HStack(spacing: 14) {
                        if let w = look.wearer { WearerAvatar(wearer: w, size: 44) }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(look.wearer?.name ?? "").font(.system(size: 15, weight: .semibold))
                            Text(look.items.map(\.name).joined(separator: ", "))
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                        Spacer()
                        PaletteRow(hexes: look.palette, size: 14)
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.muted)
                    }
                    .padding(12)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.hairline))
                }
                .buttonStyle(PressableStyle())
                .foregroundStyle(Theme.ink)
            }
        }
        .padding(.horizontal, 20)
    }
}

struct PieceChip: View {
    let garment: Garment

    var body: some View {
        HStack(spacing: 10) {
            GarmentImage(garment: garment)
                .padding(6)
                .frame(width: 48, height: 48)
                .background(Theme.studio, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(garment.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text(garment.brand.isEmpty ? garment.category.title : garment.brand)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: 120, alignment: .leading)
        }
        .padding(8)
        .padding(.trailing, 6)
        .foregroundStyle(Theme.ink)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.hairline))
    }
}

struct HarmonyBadge: View {
    let score: Int

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "sparkle")
            Text("Harmony \(score)")
        }
        .font(.system(size: 11, weight: .semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(Theme.ink)
        .background(Theme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.hairline))
    }
}

struct EmptyRunway: View {
    var kind: WearerKind = .woman
    var message = "Style your first look and it will walk the runway here."
    var buttonTitle = "Create a look"
    var buttonIcon = "plus"
    var action: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            StandingFigure(kind: kind, layers: [], height: 260)
                .opacity(0.7)
            Text(message)
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            Button(action: action) { PrimaryButtonLabel(title: buttonTitle, systemImage: buttonIcon) }
                .buttonStyle(PressableStyle())
        }
        .padding(30)
        .frame(maxWidth: .infinity)
    }
}
