import SwiftData
import SwiftUI

/// One coordinated look for several people and pets at once: pick who's in the
/// photo, the app dresses everyone from their own closet in colours that echo
/// the lead outfit, swap anyone you don't like, then save it as a matching set.
///
/// Shuffling here never starts a paid AI try-on: each card shows a look already
/// dressed before, or the real product photos as a flat lay. The saved set is
/// dressed once when it's opened in Looks.
struct FamilyLookView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]
    @Query private var garments: [Garment]
    @Query private var profiles: [UserProfile]

    @State private var included: [UUID] = []
    @State private var outfits: [UUID: Outfit] = [:]
    @State private var name = ""
    @State private var nameEdited = false
    @State private var paywall: PaywallReason?
    @State private var spins = 0
    @State private var saved = 0

    private var plan: Plan { Entitlements.shared.plan }
    private var people: [Wearer] { included.compactMap { id in wearers.first { $0.id == id } } }
    /// Whose outfit sets the colours: you if you're in it, otherwise the first person.
    private var lead: Wearer? { people.first(where: \.isSelf) ?? people.first { !$0.kind.isPet } ?? people.first }
    private var dressed: [(Wearer, Outfit)] { people.compactMap { w in outfits[w.id].map { (w, $0) } } }
    private var palette: [String] { dressed.flatMap { $0.1.palette }.uniqued() }
    private var canSave: Bool { dressed.count >= 2 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        Eyebrow("Family photo look")
                        Text("Everyone, matching.")
                            .font(Theme.display(34))
                    }
                    .padding(.horizontal, 20)

                    whoPicker
                    stage
                    summary
                }
                .padding(.vertical, 12)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(!canSave).fontWeight(.semibold)
                }
            }
            .sheet(item: $paywall) { PaywallView(reason: $0) }
            .onAppear(perform: start)
            .sensoryFeedback(.impact(weight: .medium), trigger: spins)
            .sensoryFeedback(.success, trigger: saved)
        }
    }

    // MARK: Sections

    private var whoPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Who's in the photo")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 20)
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(wearers) { w in
                        WearerFilterButton(title: w.name, wearer: w, isOn: included.contains(w.id)) { toggle(w) }
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var stage: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .bottom, spacing: 14) {
                ForEach(people) { w in
                    card(for: w)
                        .transition(.scale(scale: 0.9).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 20)
            .animation(.spring(duration: 0.45, bounce: 0.2), value: included)
        }
        .scrollIndicators(.hidden)
    }

    private func card(for w: Wearer) -> some View {
        let height: CGFloat = w.kind.isPet ? 210 : (w.kind == .child ? 240 : 280)
        return VStack(spacing: 10) {
            if let outfit = outfits[w.id] {
                Group {
                    if PhotoMannequin.canShow(w.kind) {
                        PhotoMannequin(garments: outfit.garments, kind: w.kind, wearer: w, height: height, autoDress: false)
                    } else {
                        StandingFigure(kind: w.kind, layers: outfit.layers, height: height, solo: false, fit: w.fit)
                    }
                }
                .id(outfit.id)
                .transition(.opacity)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "hanger").font(.system(size: 24))
                    Text("No clothes yet").font(.system(size: 13, weight: .semibold))
                    Text("Left out of this look").font(.system(size: 11))
                }
                .foregroundStyle(Theme.muted)
                .frame(width: height * 2 / 3, height: height)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.hairline))
            }
            HStack(spacing: 6) {
                Text(w.name).font(.system(size: 14, weight: .semibold))
                if w.id == lead?.id {
                    Text("Sets the colours").font(.system(size: 10, weight: .medium)).foregroundStyle(Theme.muted)
                }
            }
            Button { reshuffle(w) } label: {
                Label("Swap", systemImage: "dice")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Theme.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.hairline))
            }
            .buttonStyle(PressableStyle())
            .foregroundStyle(Theme.ink)
            .disabled(closet(w).isEmpty)
            .opacity(closet(w).isEmpty ? 0.4 : 1)
            .accessibilityLabel("Swap \(w.name)'s outfit")
        }
        .animation(.spring(duration: 0.45, bounce: 0.2), value: outfits[w.id]?.id)
    }

    private var summary: some View {
        VStack(spacing: 14) {
            TextField("Look name", text: Binding(get: { name }, set: { name = $0; nameEdited = true }))
                .font(Theme.display(26))
                .multilineTextAlignment(.center)
            if !palette.isEmpty {
                HStack(spacing: 8) {
                    PaletteRow(hexes: Array(palette.prefix(8)), size: 14)
                    HarmonyBadge(score: ColorScience.harmony(palette))
                }
            }
            Button(action: shuffleAll) {
                PrimaryButtonLabel(title: "Shuffle everyone", systemImage: "dice", filled: false)
            }
            .buttonStyle(PressableStyle())
            Button(action: save) {
                PrimaryButtonLabel(title: "Save family look", systemImage: "heart.fill")
            }
            .buttonStyle(PressableStyle())
            .disabled(!canSave)
            .opacity(canSave ? 1 : 0.45)
            if !canSave {
                Text("Add at least two people or pets with clothes.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 20)
    }

    // MARK: Actions

    private func closet(_ w: Wearer) -> [Garment] { garments.filter { $0.ownerID == w.id } }

    /// Starts with as many of the household as the plan allows, you first.
    private func start() {
        guard included.isEmpty else { return }
        let ordered = wearers.filter(\.isSelf) + wearers.filter { !$0.isSelf }
        let limit = max(2, min(ordered.count, plan.maxFamilyLookWearers))
        included = ordered.prefix(limit).map(\.id)
        shuffleAll()
    }

    private func toggle(_ w: Wearer) {
        if let index = included.firstIndex(of: w.id) {
            included.remove(at: index)
            outfits[w.id] = nil
            if w.id == lead?.id || outfits.isEmpty { shuffleAll() }
            refreshName()
            return
        }
        if case .paywall(let reason) = FeatureGate.canBuildFamilyPhotoLook(wearerCount: included.count + 1, plan: plan) {
            paywall = reason
            return
        }
        included.append(w.id)
        if let lead, w.id == lead.id { shuffleAll() } else { dress(w, echo: outfits[lead?.id ?? w.id]?.palette ?? []) }
        refreshName()
    }

    private func shuffleAll() {
        guard let lead else { outfits = [:]; return }
        withAnimation(.spring(duration: 0.5, bounce: 0.2)) {
            dress(lead, echo: [])
            let echo = outfits[lead.id]?.palette ?? []
            for w in people where w.id != lead.id { dress(w, echo: echo) }
        }
        spins += 1
        refreshName()
    }

    private func reshuffle(_ w: Wearer) {
        if w.id == lead?.id { shuffleAll(); return }
        withAnimation(.spring(duration: 0.5, bounce: 0.2)) {
            dress(w, echo: outfits[lead?.id ?? w.id]?.palette ?? [])
        }
        spins += 1
        refreshName()
    }

    private func dress(_ w: Wearer, echo: [String]) {
        outfits[w.id] = OutfitGenerator.shuffle(closet: closet(w), kind: w.kind, profile: profiles.first,
                                                body: w.bodyShape, echo: echo)
    }

    private func refreshName() {
        guard !nameEdited else { return }
        let names = palette.prefix(3).map { ColorScience.name($0) }.uniqued().prefix(2)
        name = names.isEmpty ? "Family look" : names.joined(separator: " & ")
    }

    private func save() {
        guard canSave else { return }
        // The plan may have changed (or the household grown) since the screen opened.
        if case .paywall(let reason) = FeatureGate.canBuildFamilyPhotoLook(wearerCount: dressed.count, plan: plan) {
            paywall = reason
            return
        }
        let title = name.trimmingCharacters(in: .whitespaces).isEmpty ? "Family look" : name
        let set = MatchSet(name: title)
        context.insert(set)
        var looks: [Look] = []
        var all: [Garment] = []
        for (w, outfit) in dressed {
            let look = Look(name: title, owner: w)
            context.insert(look)
            look.wearer = w
            look.garments = outfit.garments
            looks.append(look)
            all += outfit.garments
        }
        set.looks = looks
        let feature: AppGoal = dressed.contains { $0.0.kind.isPet } ? .dressPets : .matchFriends
        Personalizer.record(.matched, garments: all, feature: feature, in: context)
        saved += 1
        dismiss()
    }
}
