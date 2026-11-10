import SwiftData
import SwiftUI

/// Style a look piece by piece on a live figure, then optionally match it
/// with a friend or a pet: their closet is searched for pieces in the same palette.
struct LookBuilderView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]
    @Query(sort: \Garment.createdAt, order: .reverse) private var garments: [Garment]

    @State private var ownerID: UUID?
    @State private var picks: [GarmentCategory: UUID] = [:]
    @State private var partnerID: UUID?
    @State private var name = ""

    private var owner: Wearer? { wearers.first { $0.id == ownerID } ?? wearers.first }
    private var partner: Wearer? { wearers.first { $0.id == partnerID } }
    private var ownerGarments: [Garment] { garments.filter { $0.ownerID == owner?.id } }
    private var picked: [Garment] {
        picks.values.compactMap { id in ownerGarments.first { $0.id == id } }
            .sorted { $0.category.layer < $1.category.layer }
    }
    private var suggestion: [Garment] {
        guard let partner else { return [] }
        return MatchEngine.suggest(palette: picked.map(\.colorHex), from: garments.filter { $0.ownerID == partner.id }, kind: partner.kind)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    preview
                    nameField
                    ownerPicker
                    if let owner { slots(for: owner) }
                    matchSection
                }
                .padding(.vertical, 16)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .navigationTitle("New look")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).fontWeight(.semibold).disabled(picked.isEmpty)
                }
            }
            .interactiveDismissDisabled(!picked.isEmpty)
            .safeAreaInset(edge: .bottom) {
                if !picked.isEmpty {
                    Button(action: save) { PrimaryButtonLabel(title: "Save look", systemImage: "checkmark") }
                        .buttonStyle(PressableStyle())
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.smooth, value: picked.isEmpty)
            .onAppear { ownerID = ownerID ?? wearers.first?.id }
            .onChange(of: ownerID) {
                picks = [:]
                if partnerID == ownerID { partnerID = nil }
            }
        }
    }

    // MARK: Sections

    private var preview: some View {
        VStack(spacing: 12) {
            HStack(alignment: .bottom, spacing: 0) {
                if let owner, partner == nil, PhotoMannequin.canShow(owner.kind) {
                    // Real photos at once, then the dressed mannequin once picking pauses.
                    PhotoMannequin(garments: picked, height: 310, delay: .milliseconds(700))
                } else if let owner {
                    StandingFigure(kind: owner.kind, layers: picked.map(\.layer), height: 300, solo: partner == nil, fit: owner.fit)
                }
                if let partner {
                    StandingFigure(kind: partner.kind, layers: suggestion.map(\.layer), height: 300, solo: false, fit: partner.fit)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 320, alignment: .bottom)
            .animation(.spring(duration: 0.5, bounce: 0.2), value: partnerID)

            if !picked.isEmpty {
                HStack(spacing: 10) {
                    PaletteRow(hexes: (picked + suggestion).map(\.colorHex).uniqued(), size: 16)
                    HarmonyBadge(score: MatchEngine.harmony((picked + suggestion).map(\.colorHex).uniqued()))
                }
                .transition(.opacity)
            }
        }
        .animation(.smooth, value: picked.count)
    }

    private var nameField: some View {
        TextField("Name this look", text: $name)
            .font(Theme.display(26))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 20)
    }

    private var ownerPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow("Who's wearing it").padding(.horizontal, 20)
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(wearers) { w in
                        WearerFilterButton(title: w.name, wearer: w, isOn: w.id == owner?.id) { ownerID = w.id }
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    @ViewBuilder
    private func slots(for owner: Wearer) -> some View {
        let available = owner.kind.categories.filter { c in ownerGarments.contains { $0.category == c } }
        if available.isEmpty {
            Text("\(owner.name)'s closet is empty. Add pieces in the Closet tab first.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 20)
        }
        ForEach(available) { category in
            VStack(alignment: .leading, spacing: 10) {
                Eyebrow(category.title).padding(.horizontal, 20)
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(ownerGarments.filter { $0.category == category }) { garment in
                            let isOn = picks[category] == garment.id
                            Button { toggle(garment) } label: {
                                VStack(spacing: 6) {
                                    GarmentImage(garment: garment)
                                        .padding(12)
                                        .frame(width: 92, height: 104)
                                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                                            .strokeBorder(isOn ? Theme.ink : Theme.hairline, lineWidth: isOn ? 2 : 1))
                                    Text(garment.name).font(.system(size: 11)).lineLimit(1).frame(width: 92)
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
    }

    private var matchSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow("Match with").padding(.horizontal, 20)
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    Chip(title: "No one", isOn: partnerID == nil) { partnerID = nil }
                    ForEach(wearers.filter { $0.id != owner?.id }) { w in
                        WearerFilterButton(title: w.name, wearer: w, isOn: partnerID == w.id) { partnerID = w.id }
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)

            if let partner {
                Group {
                    if picked.isEmpty {
                        Text("Pick a few pieces first, then \(partner.name)'s closet is matched to them.")
                    } else if suggestion.isEmpty {
                        Text("Nothing in \(partner.name)'s closet matches this palette yet.")
                    } else {
                        Text("\(partner.name) wears: \(suggestion.map(\.name).joined(separator: ", "))")
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: Actions

    private func toggle(_ garment: Garment) {
        let category = garment.category
        withAnimation(.smooth) {
            if picks[category] == garment.id {
                picks[category] = nil
            } else {
                category.conflicts.forEach { picks[$0] = nil }
                picks[category] = garment.id
            }
        }
    }

    private func save() {
        guard let owner else { return }
        let title = name.trimmingCharacters(in: .whitespaces).isEmpty ? "Untitled look" : name
        let look = Look(name: title, owner: owner)
        context.insert(look)
        look.wearer = owner
        look.garments = picked

        if let partner, !suggestion.isEmpty {
            let partnerLook = Look(name: title, owner: partner)
            context.insert(partnerLook)
            partnerLook.wearer = partner
            partnerLook.garments = suggestion
            let set = MatchSet(name: title)
            context.insert(set)
            set.looks = [look, partnerLook]
            Personalizer.record(.matched, garments: picked + suggestion,
                                feature: partner.kind.isPet ? .dressPets : .matchFriends, in: context)
        } else {
            Personalizer.record(.saved, garments: picked, in: context)
        }
        dismiss()
    }
}
