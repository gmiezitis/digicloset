import SwiftUI

/// Swap pieces of today's look by hand: pick a slot, then a piece from your closet.
struct OutfitComposer: View {
    let closet: [Garment]
    @Binding var outfit: [Garment]

    @State private var open: Slot?

    enum Slot: String, CaseIterable, Identifiable {
        case top, bottom, dress, layer, shoes, hat, bag
        var id: String { rawValue }

        var title: String {
            switch self {
            case .top: "Top"
            case .bottom: "Bottom"
            case .dress: "Dress"
            case .layer: "Layer"
            case .shoes: "Shoes"
            case .hat: "Hat"
            case .bag: "Bag"
            }
        }

        var categories: Set<GarmentCategory> {
            switch self {
            case .top: [.top, .sweater]
            case .bottom: [.bottom, .skirt]
            case .dress: [.dress]
            case .layer: [.outerwear]
            case .shoes: [.shoes]
            case .hat: [.hat]
            case .bag: [.bag]
            }
        }
    }

    private var slots: [Slot] { Slot.allCases.filter { slot in closet.contains { slot.categories.contains($0.category) } } }
    private func current(_ slot: Slot) -> Garment? { outfit.first { slot.categories.contains($0.category) } }
    private func options(_ slot: Slot) -> [Garment] { closet.filter { slot.categories.contains($0.category) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow("Put it together").padding(.horizontal, 20)
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(slots) { slot in slotChip(slot) }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)

            if let open {
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        noneTile(open)
                        ForEach(options(open)) { garment in pieceTile(garment, in: open) }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)
                .id(open)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.spring(duration: 0.35, bounce: 0.15), value: open)
        .sensoryFeedback(.selection, trigger: outfit.map(\.id))
    }

    private func slotChip(_ slot: Slot) -> some View {
        let isOpen = open == slot
        let piece = current(slot)
        return Button { open = isOpen ? nil : slot } label: {
            HStack(spacing: 6) {
                if let piece {
                    GarmentImage(garment: piece).frame(width: 24, height: 24)
                } else {
                    Image(systemName: "plus").font(.system(size: 10, weight: .bold)).frame(width: 24, height: 24)
                }
                Text(slot.title).font(.system(size: 13, weight: .semibold))
            }
            .padding(.leading, 6).padding(.trailing, 12).padding(.vertical, 6)
            .foregroundStyle(isOpen ? Color.white : Theme.ink)
            .background(isOpen ? Theme.ink : Theme.card, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.hairline))
            .opacity(piece == nil && !isOpen ? 0.65 : 1)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(piece.map { "\(slot.title): \($0.name)" } ?? "Add \(slot.title.lowercased())")
    }

    private func pieceTile(_ garment: Garment, in slot: Slot) -> some View {
        let isOn = outfit.contains { $0.id == garment.id }
        return Button { choose(garment, for: slot) } label: {
            GarmentImage(garment: garment)
                .padding(8)
                .frame(width: 78, height: 96)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(isOn ? Theme.ink : Theme.hairline, lineWidth: isOn ? 2 : 1))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(garment.name)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private func noneTile(_ slot: Slot) -> some View {
        let isOn = current(slot) == nil
        return Button { choose(nil, for: slot) } label: {
            VStack(spacing: 6) {
                Image(systemName: "xmark").font(.system(size: 14, weight: .semibold))
                Text("None").font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(Theme.muted)
            .frame(width: 60, height: 96)
            .background(Theme.card.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(isOn ? Theme.ink : Theme.hairline, style: StrokeStyle(lineWidth: isOn ? 2 : 1, dash: isOn ? [] : [3, 3])))
        }
        .buttonStyle(PressableStyle())
    }

    /// One piece per slot. A dress replaces the top and bottom, and the other way round.
    private func choose(_ garment: Garment?, for slot: Slot) {
        var next = outfit.filter { !slot.categories.contains($0.category) }
        if let garment {
            next.append(garment)
            switch slot {
            case .dress: next.removeAll { Slot.top.categories.contains($0.category) || Slot.bottom.categories.contains($0.category) }
            case .top, .bottom: next.removeAll { $0.category == .dress }
            default: break
            }
        }
        withAnimation(.smooth(duration: 0.4)) { outfit = next }
    }
}
