import SwiftData
import SwiftUI
import UIKit

/// Tap (or shake) for a new outfit from what you own. Lock the pieces you want
/// to keep; love or skip to teach the app your taste. Add a friend or pet and
/// they're dressed to match.
struct ShuffleView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]
    @Query(sort: \Garment.createdAt, order: .reverse) private var garments: [Garment]
    @Query private var profiles: [UserProfile]

    @State private var ownerID: UUID?
    @State private var partnerID: UUID?
    @State private var outfit: Outfit?
    @State private var partnerOutfit: Outfit?
    @State private var locked: Set<UUID> = []
    @State private var spins = 0
    @State private var loves = 0
    @State private var toast: String?
    @State private var diceAngle = 0.0
    @State private var addingCompanion = false
    @State private var addingClothes = false

    private var profile: UserProfile? { profiles.first }
    private var owner: Wearer? { wearers.first { $0.id == ownerID } ?? wearers.first(where: \.isSelf) ?? wearers.first }
    private var partner: Wearer? { wearers.first { $0.id == partnerID && $0.id != owner?.id } }
    private func closet(_ w: Wearer?) -> [Garment] { garments.filter { $0.ownerID == w?.id } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    pickers
                    stage
                    controls
                    if let outfit { board(outfit) }
                }
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .top) {
                if let toast {
                    Label(toast, systemImage: "heart.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                        .shadow(color: .black.opacity(0.1), radius: 10, y: 4)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, 8)
                }
            }
            .onAppear { if outfit == nil { shuffle() } }
            .onChange(of: ownerID) { locked = []; shuffle() }
            .onChange(of: partnerID) { shuffle(keepOwner: true) }
            .onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in shuffle() }
            .sensoryFeedback(.impact(weight: .medium), trigger: spins)
            .sensoryFeedback(.success, trigger: loves)
        }
    }

    // MARK: Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow("Shuffle · shake for a new look")
            Text("Dress me.")
                .font(Theme.display(40))
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    @ViewBuilder
    private var pickers: some View {
        if wearers.count > 1 {
            familyPickers
        } else {
            Button { addingCompanion = true } label: {
                Label("Match with a friend or pet", systemImage: "person.badge.plus")
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Theme.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.hairline))
            }
            .foregroundStyle(Theme.ink)
            .buttonStyle(PressableStyle())
            .padding(.horizontal, 20)
            .sheet(isPresented: $addingCompanion) { WearerEditor() }
        }
    }

    private var familyPickers: some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(wearers) { w in
                        WearerFilterButton(title: w.name, wearer: w, isOn: w.id == owner?.id) {
                            withAnimation(.smooth) { ownerID = w.id }
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    Text("Match with").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.muted)
                    Chip(title: "No one", isOn: partner == nil) { partnerID = nil }
                    ForEach(wearers.filter { $0.id != owner?.id }) { w in
                        Chip(title: w.name, isOn: partnerID == w.id) { partnerID = w.id }
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    @ViewBuilder
    private var stage: some View {
        if let owner, let outfit {
            VStack(spacing: 12) {
                HStack(alignment: .bottom, spacing: -10) {
                    if partner == nil, PhotoMannequin.canShow(owner.kind) {
                        PhotoMannequin(garments: outfit.garments, height: 330)
                    } else {
                        StandingFigure(kind: owner.kind, layers: outfit.layers, height: 320, solo: partner == nil, fit: owner.fit)
                    }
                    if let partner, let partnerOutfit {
                        StandingFigure(kind: partner.kind, layers: partnerOutfit.layers, height: 320, solo: false, fit: partner.fit)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 336, alignment: .bottom)

                VStack(spacing: 8) {
                    Text(outfit.suggestedName)
                        .font(Theme.display(26))
                        .contentTransition(.opacity)
                        .id("name-\(outfit.id)")
                    HStack(spacing: 8) {
                        PaletteRow(hexes: allPalette, size: 14)
                        HarmonyBadge(score: ColorScience.harmony(allPalette))
                    }
                    Label(outfit.score.reason, systemImage: "sparkles")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                        .id("why-\(outfit.id)")
                        .transition(.opacity)
                }
                .padding(.horizontal, 20)
            }
            .animation(.spring(duration: 0.55, bounce: 0.2), value: partnerOutfit?.id)
        } else {
            VStack(spacing: 14) {
                StandingFigure(kind: owner?.kind ?? .woman, layers: [], height: 260).opacity(0.6)
                Text(emptyMessage)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                if owner != nil {
                    Button { addingClothes = true } label: { PrimaryButtonLabel(title: "Add clothes", systemImage: "camera") }
                        .buttonStyle(PressableStyle())
                }
            }
            .frame(maxWidth: .infinity)
            .padding(30)
            .sheet(isPresented: $addingClothes, onDismiss: { shuffle() }) { AddGarmentView(preselectedOwner: owner?.id) }
        }
    }

    private var emptyMessage: String {
        guard let owner else { return "Add someone to your closet to start shuffling." }
        return owner.kind.isPet
            ? "Add a sweater, collar or bandana to \(owner.name)'s wardrobe to start shuffling."
            : "Add a top and trousers or a skirt, or a dress, to \(owner.isSelf ? "your" : owner.name + "'s") closet to start shuffling."
    }

    private var allPalette: [String] {
        ((outfit?.palette ?? []) + (partnerOutfit?.palette ?? [])).uniqued()
    }

    private func board(_ outfit: Outfit) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow("The pieces · tap to lock")
                Spacer()
                if !locked.isEmpty {
                    Button("Unlock all") { withAnimation(.smooth) { locked = [] } }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                }
            }
            .padding(.horizontal, 20)
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(outfit.garments.sorted { $0.category.layer < $1.category.layer }) { g in
                        PieceTile(garment: g, isLocked: locked.contains(g.id)) {
                            withAnimation(.spring(duration: 0.3)) {
                                if locked.contains(g.id) { locked.remove(g.id) } else { locked.insert(g.id) }
                            }
                        }
                        .transition(.asymmetric(insertion: .scale(scale: 0.8).combined(with: .opacity), removal: .opacity))
                    }
                    if let partnerOutfit {
                        Divider().frame(height: 120)
                        ForEach(partnerOutfit.garments) { g in
                            PieceTile(garment: g, isLocked: false, lockable: false) {}
                        }
                    }
                }
                .padding(.horizontal, 20)
                .animation(.spring(duration: 0.45, bounce: 0.25), value: outfit.id)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var controls: some View {
        HStack(spacing: 26) {
            RoundControl(symbol: "xmark", size: 56, label: "Not for me") { skip() }
            VStack(spacing: 6) {
                Button { shuffle() } label: {
                    Image(systemName: "dice")
                        .font(.system(size: 28, weight: .semibold))
                        .rotationEffect(.degrees(diceAngle))
                        .frame(width: 76, height: 76)
                        .foregroundStyle(.white)
                        .background(Theme.ink, in: Circle())
                        .shadow(color: .black.opacity(0.25), radius: 14, y: 8)
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel("Shuffle")
                Text("Shuffle").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
            }
            RoundControl(symbol: "heart.fill", size: 56, label: "Save look") { love() }
        }
        .disabled(outfit == nil)
        .opacity(outfit == nil ? 0.4 : 1)
        .frame(maxWidth: .infinity)
    }

    // MARK: Actions

    private func shuffle(keepOwner: Bool = false) {
        guard let owner else { return }
        let ownerCloset = closet(owner)
        let lockedPieces = ownerCloset.filter { locked.contains($0.id) }
        let next = keepOwner ? outfit : OutfitGenerator.shuffle(closet: ownerCloset, kind: owner.kind, locked: lockedPieces,
                                                                profile: profile, body: owner.bodyShape)
        var nextPartner: Outfit?
        if let partner, let palette = next?.palette {
            nextPartner = OutfitGenerator.shuffle(closet: closet(partner), kind: partner.kind, profile: profile,
                                                  body: partner.bodyShape, echo: palette)
        }
        withAnimation(.spring(duration: 0.55, bounce: 0.2)) {
            outfit = next
            partnerOutfit = nextPartner
            diceAngle += 180
        }
        if let next, !keepOwner {
            Personalizer.noteShown(next.signature, in: context)
            spins += 1
        }
    }

    private func skip() {
        guard let outfit else { return }
        Personalizer.record(.skipped, garments: outfit.garments, in: context)
        shuffle()
    }

    private func love() {
        guard let owner, let outfit else { return }
        let name = outfit.suggestedName
        let look = Look(name: name, owner: owner)
        context.insert(look)
        look.wearer = owner
        look.garments = outfit.garments
        var all = outfit.garments
        if let partner, let partnerOutfit {
            let partnerLook = Look(name: name, owner: partner)
            context.insert(partnerLook)
            partnerLook.wearer = partner
            partnerLook.garments = partnerOutfit.garments
            let set = MatchSet(name: name)
            context.insert(set)
            set.looks = [look, partnerLook]
            all += partnerOutfit.garments
        }
        let feature: AppGoal = partner == nil ? .discover : (partner!.kind.isPet ? .dressPets : .matchFriends)
        Personalizer.record(.loved, garments: all, feature: feature, in: context)
        loves += 1
        withAnimation(.spring(duration: 0.4)) { toast = "\(name) saved to Looks" }
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            withAnimation(.smooth) { toast = nil }
        }
        shuffle()
    }
}

private struct PieceTile: View {
    let garment: Garment
    var isLocked: Bool
    var lockable = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                GarmentImage(garment: garment)
                    .padding(12)
                    .frame(width: 104, height: 118)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(isLocked ? Theme.ink : Theme.hairline, lineWidth: isLocked ? 2 : 1))
                    .overlay(alignment: .topTrailing) {
                        if lockable {
                            Image(systemName: isLocked ? "lock.fill" : "lock.open")
                                .font(.system(size: 10, weight: .bold))
                                .frame(width: 24, height: 24)
                                .foregroundStyle(isLocked ? Color.white : Theme.muted)
                                .background(isLocked ? Theme.ink : Theme.studio, in: Circle())
                                .padding(6)
                        }
                    }
                Text(garment.name).font(.system(size: 11, weight: .medium)).lineLimit(1).frame(width: 104, alignment: .leading)
            }
        }
        .buttonStyle(PressableStyle())
        .foregroundStyle(Theme.ink)
        .disabled(!lockable)
        .sensoryFeedback(.selection, trigger: isLocked)
    }
}

private struct RoundControl: View {
    let symbol: String
    let size: CGFloat
    let label: String
    var action: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            Button(action: action) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: size, height: size)
                    .foregroundStyle(Theme.ink)
                    .background(Theme.card, in: Circle())
                    .overlay(Circle().strokeBorder(Theme.hairline))
                    .shadow(color: .black.opacity(0.1), radius: 10, y: 5)
            }
            .buttonStyle(PressableStyle())
            .frame(height: 76)
            .accessibilityLabel(label)
            Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
        }
    }
}

// MARK: - Shake to shuffle

extension Notification.Name {
    static let deviceDidShake = Notification.Name("DigiCloset.deviceDidShake")
}

extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake { NotificationCenter.default.post(name: .deviceDidShake, object: nil) }
        super.motionEnded(motion, with: event)
    }
}
