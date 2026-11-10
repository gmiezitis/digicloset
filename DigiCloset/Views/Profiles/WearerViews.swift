import SwiftData
import SwiftUI

/// Round portrait: head-and-shoulders crop for people, the whole animal for pets.
struct WearerAvatar: View {
    let wearer: Wearer
    var size: CGFloat = 52

    var body: some View {
        ZStack {
            Circle().fill(Color(hex: wearer.accentHex).opacity(0.35))
            if wearer.kind.isPet {
                Image(wearer.kind.mannequin).resizable().scaledToFit().padding(size * 0.14)
            } else {
                Image(wearer.kind.mannequin)
                    .resizable()
                    .aspectRatio(wearer.kind.aspect, contentMode: .fit)
                    .frame(height: size * 2.9)
                    .offset(y: size * 1.05)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.white.opacity(0.9), lineWidth: 2))
    }
}

struct WearerFilterButton: View {
    let title: String
    let wearer: Wearer?
    var isOn: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let wearer {
                    WearerAvatar(wearer: wearer, size: 26)
                } else {
                    Image(systemName: "person.2.fill").font(.system(size: 11)).frame(width: 26, height: 26)
                }
                Text(title).font(.system(size: 13, weight: .medium))
            }
            .padding(.leading, 5)
            .padding(.trailing, 13)
            .padding(.vertical, 5)
            .foregroundStyle(isOn ? Color.white : Theme.ink)
            .background(isOn ? Theme.ink : Theme.card, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.hairline))
        }
        .buttonStyle(PressableStyle())
        .sensoryFeedback(.selection, trigger: isOn)
    }
}

/// Add or edit a person or pet.
struct WearerEditor: View {
    var wearer: Wearer?
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]

    @State private var name = ""
    @State private var kind: WearerKind = .woman
    @State private var accent = Theme.accents[0]
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    HStack {
                        Spacer()
                        StandingFigure(kind: kind, layers: [FigureLayer(id: UUID(), category: kind.isPet ? .sweater : .top, colorHex: accent)], height: 230)
                            .frame(height: 240, alignment: .bottom)
                            .animation(.spring(duration: 0.5), value: kind)
                        Spacer()
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Eyebrow("Name")
                        TextField(kind.isPet ? "Biscuit" : "Sofia", text: $name)
                            .font(Theme.display(26))
                            .padding(14)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Eyebrow("Who is it")
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 5), spacing: 10) {
                            ForEach(WearerKind.allCases) { k in
                                Button { kind = k } label: {
                                    VStack(spacing: 6) {
                                        Image(k.mannequin).resizable().scaledToFit().frame(height: 54)
                                        Text(k.title).font(.system(size: 11, weight: .medium))
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                    .background(kind == k ? Theme.card : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(kind == k ? Theme.ink : Theme.hairline))
                                }
                                .buttonStyle(PressableStyle())
                                .foregroundStyle(Theme.ink)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Eyebrow("Signature colour")
                        HStack(spacing: 12) {
                            ForEach(Theme.accents, id: \.self) { hex in
                                Button { accent = hex } label: {
                                    Swatch(hex: hex, size: 34)
                                        .overlay(Circle().strokeBorder(Theme.ink, lineWidth: accent == hex ? 2 : 0).padding(-4))
                                }
                            }
                        }
                    }

                    if wearer != nil {
                        Button("Remove \(name)", role: .destructive) { confirmDelete = true }
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(20)
            }
            .background(StudioBackground())
            .navigationTitle(wearer == nil ? "New closet" : "Edit closet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("Remove this closet and everything in it?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Remove", role: .destructive) {
                    if let wearer { context.delete(wearer) }
                    dismiss()
                }
            }
            .onAppear {
                guard let wearer else { return }
                name = wearer.name
                kind = wearer.kind
                accent = wearer.accentHex
            }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let wearer {
            wearer.name = trimmed
            wearer.kind = kind
            wearer.accentHex = accent
        } else {
            let added = Wearer(name: trimmed, kind: kind, accentHex: accent, sortIndex: (wearers.map(\.sortIndex).max() ?? 0) + 1)
            context.insert(added)
            if kind.isPet { SampleData.starterWardrobe(for: added, in: context) }
        }
        dismiss()
    }
}
