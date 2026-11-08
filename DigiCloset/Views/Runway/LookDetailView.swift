import SwiftData
import SwiftUI

/// One look, full height, with a pin on every piece. Tap a pin to see it.
struct LookDetailView: View {
    @Bindable var look: Look
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var selected: UUID?
    @State private var showPlanner = false
    @State private var planDate = Date.now
    @State private var woreToday = false
    @State private var confirmDelete = false

    private var selectedGarment: Garment? { look.items.first { $0.id == selected } }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                ZStack(alignment: .bottom) {
                    FloorShadow()
                        .frame(width: 520 * look.kind.soloHeight * look.kind.aspect * 1.1)
                        .offset(y: 8)
                    FigureView(kind: look.kind, layers: look.layers, showsPins: true, selectedPin: selected) { id in
                        withAnimation(.spring(duration: 0.4, bounce: 0.25)) { selected = selected == id ? nil : id }
                    }
                    .frame(height: 520 * look.kind.soloHeight)
                }
                .frame(height: 540, alignment: .bottom)
                .padding(.top, 10)
                .sensoryFeedback(.impact(weight: .light), trigger: selected)

                VStack(spacing: 6) {
                    Eyebrow(look.wearer?.name ?? "")
                    TextField("Look name", text: $look.name)
                        .font(Theme.display(32))
                        .multilineTextAlignment(.center)
                    if let set = look.matchSet {
                        Label("Part of \(set.name)", systemImage: "link")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.muted)
                    }
                }

                if let garment = selectedGarment {
                    SelectedPieceCard(garment: garment)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Eyebrow("Pieces")
                        Spacer()
                        PaletteRow(hexes: look.palette, size: 14)
                    }
                    ForEach(look.items) { garment in
                        Button {
                            withAnimation(.spring(duration: 0.4, bounce: 0.25)) { selected = garment.id }
                        } label: {
                            PieceRow(garment: garment, isSelected: selected == garment.id)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
                .padding(.horizontal, 20)

                HStack(spacing: 12) {
                    Button(action: wearToday) {
                        PrimaryButtonLabel(title: woreToday ? "Logged" : "Wore it today", systemImage: woreToday ? "checkmark" : "sun.max")
                    }
                    Button { showPlanner = true } label: {
                        PrimaryButtonLabel(title: "Plan", systemImage: "calendar", filled: false)
                    }
                }
                .buttonStyle(PressableStyle())
                .padding(.horizontal, 20)
                .sensoryFeedback(.success, trigger: woreToday)
            }
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .background(StudioBackground())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Delete look", systemImage: "trash", role: .destructive) { confirmDelete = true }
                } label: { Image(systemName: "ellipsis") }
            }
        }
        .confirmationDialog("Delete this look?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                context.delete(look)
                dismiss()
            }
        }
        .sheet(isPresented: $showPlanner) {
            NavigationStack {
                DatePicker("Day", selection: $planDate, in: Date.now..., displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding()
                    .navigationTitle("Plan \(look.name)")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showPlanner = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Plan") {
                                let entry = PlanEntry(day: planDate)
                                context.insert(entry)
                                entry.look = look
                                showPlanner = false
                            }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func wearToday() {
        guard !woreToday else { return }
        look.items.forEach { $0.wearCount += 1 }
        woreToday = true
    }
}

struct SelectedPieceCard: View {
    let garment: Garment

    var body: some View {
        HStack(spacing: 16) {
            GarmentImage(garment: garment, large: true)
                .padding(10)
                .frame(width: 96, height: 110)
                .background(Theme.studio, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(garment.brand.isEmpty ? garment.category.title : garment.brand)
                Text(garment.name).font(Theme.display(22))
                HStack(spacing: 8) {
                    Swatch(hex: garment.colorHex, size: 16)
                    Text("#\(garment.colorHex)").font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.muted)
                }
                Text(garment.wearCount == 0 ? "Not worn yet" : "Worn \(garment.wearCount)×")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 18, y: 10)
        .padding(.horizontal, 20)
    }
}

struct PieceRow: View {
    let garment: Garment
    var isSelected = false

    var body: some View {
        HStack(spacing: 14) {
            GarmentImage(garment: garment)
                .padding(6)
                .frame(width: 52, height: 52)
                .background(Theme.studio, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(garment.name).font(.system(size: 15, weight: .semibold))
                Text([garment.brand, garment.category.title].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Swatch(hex: garment.colorHex, size: 18)
        }
        .padding(10)
        .foregroundStyle(Theme.ink)
        .background(isSelected ? Theme.card : Theme.card.opacity(0.6), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(isSelected ? Theme.ink : Theme.hairline, lineWidth: isSelected ? 1.2 : 1))
    }
}
