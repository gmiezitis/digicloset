import SwiftData
import SwiftUI

struct ClosetView: View {
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]

    @State private var selectedID: UUID?
    @State private var category: GarmentCategory?
    @State private var search = ""
    @State private var showAdd = false
    @State private var showNewWearer = false
    @State private var editing: Wearer?

    private var current: Wearer? { wearers.first { $0.id == selectedID } ?? wearers.first }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Eyebrow((current?.garments?.count ?? 0) == 1 ? "1 piece" : "\(current?.garments?.count ?? 0) pieces")
                        Text(current.map { $0.kind.isPet ? "\($0.name)'s wardrobe" : ($0.isSelf ? "My closet" : "\($0.name)'s closet") } ?? "Closet")
                            .font(Theme.display(36))
                            .contentTransition(.opacity)
                    }
                    .padding(.horizontal, 20)

                    wearerStrip
                    categoryStrip

                    if let current {
                        GarmentGrid(ownerID: current.id, category: category?.rawValue ?? "", search: search) { showAdd = true }
                            .padding(.horizontal, 20)
                    }
                }
                .padding(.vertical, 12)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .searchable(text: $search, prompt: "Search pieces")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add a piece")
                }
                if let current {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button(current.isSelf ? "Edit my profile" : "Edit \(current.name)", systemImage: "pencil") { editing = current }
                            Button("Add a person or pet", systemImage: "person.badge.plus") { showNewWearer = true }
                        } label: { Image(systemName: "ellipsis") }
                        .accessibilityLabel("More")
                    }
                }
            }
            .navigationDestination(for: Garment.self) { GarmentDetailView(garment: $0) }
            .sheet(isPresented: $showAdd) { AddGarmentView(preselectedOwner: current?.id) }
            .sheet(isPresented: $showNewWearer) { WearerEditor() }
            .sheet(item: $editing) { WearerEditor(wearer: $0) }
            .onChange(of: selectedID) { category = nil }
        }
    }

    private var wearerStrip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 16) {
                ForEach(wearers) { w in
                    let isOn = w.id == current?.id
                    Button {
                        withAnimation(.smooth) { selectedID = w.id }
                    } label: {
                        VStack(spacing: 6) {
                            WearerAvatar(wearer: w, size: 60)
                                .overlay(Circle().strokeBorder(Theme.ink, lineWidth: isOn ? 2 : 0).padding(-4))
                                .scaleEffect(isOn ? 1 : 0.92)
                            Text(w.name)
                                .font(.system(size: 12, weight: isOn ? .semibold : .regular))
                                .foregroundStyle(isOn ? Theme.ink : Theme.muted)
                        }
                    }
                    .buttonStyle(PressableStyle())
                    .contextMenu {
                        Button("Edit", systemImage: "pencil") { editing = w }
                    }
                }
                Button { showNewWearer = true } label: {
                    VStack(spacing: 6) {
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .medium))
                            .frame(width: 60, height: 60)
                            .background(Theme.card, in: Circle())
                            .overlay(Circle().strokeBorder(Theme.hairline))
                        Text("Add").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                }
                .buttonStyle(PressableStyle())
                .foregroundStyle(Theme.ink)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: selectedID)
    }

    private var categoryStrip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Chip(title: "All", isOn: category == nil) { withAnimation(.smooth) { category = nil } }
                ForEach(current?.kind.categories ?? []) { c in
                    Chip(title: c.title, isOn: category == c) { withAnimation(.smooth) { category = category == c ? nil : c } }
                }
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
    }
}

/// The grid queries the store directly with an indexed filter, so it stays
/// fast with thousands of pieces.
struct GarmentGrid: View {
    @Query private var garments: [Garment]
    @Environment(\.modelContext) private var context
    @State private var pendingDelete: Garment?
    private let isFiltered: Bool
    private let onAdd: () -> Void

    init(ownerID: UUID, category: String, search: String, onAdd: @escaping () -> Void) {
        self.onAdd = onAdd
        isFiltered = !category.isEmpty || !search.isEmpty
        _garments = Query(
            filter: #Predicate<Garment> { g in
                g.ownerID == ownerID
                    && (category == "" || g.categoryRaw == category)
                    && (search == "" || g.name.localizedStandardContains(search))
            },
            sort: [SortDescriptor(\Garment.createdAt, order: .reverse)],
            animation: .smooth
        )
    }

    var body: some View {
        if garments.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: "hanger").font(.system(size: 30)).foregroundStyle(Theme.muted)
                Text(isFiltered ? "No matches" : "Nothing here yet").font(Theme.display(20))
                Text(isFiltered ? "Try another category or search."
                                : "Photograph a piece or pick photos. The background is removed automatically.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                if !isFiltered {
                    Button(action: onAdd) { PrimaryButtonLabel(title: "Add clothes", systemImage: "camera") }
                        .buttonStyle(PressableStyle())
                        .padding(.horizontal, 50)
                        .padding(.top, 6)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 60)
        } else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 18) {
                ForEach(garments) { garment in
                    NavigationLink(value: garment) { GarmentTile(garment: garment) }
                        .buttonStyle(PressableStyle())
                        .contextMenu {
                            Button(garment.isFavorite ? "Unfavourite" : "Favourite", systemImage: garment.isFavorite ? "heart.slash" : "heart") {
                                Personalizer.toggleFavorite(garment, in: context)
                            }
                            Button("Delete", systemImage: "trash", role: .destructive) { pendingDelete = garment }
                        }
                }
            }
            .confirmationDialog("Delete \(pendingDelete?.name ?? "this piece")?",
                                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let garment = pendingDelete { context.delete(garment) }
                    pendingDelete = nil
                }
            } message: {
                Text("It's also removed from any looks it's in.")
            }
        }
    }
}

struct GarmentTile: View {
    let garment: Garment

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.card, Theme.studio], startPoint: .top, endPoint: .bottom))
                GarmentImage(garment: garment)
                    .padding(22)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if garment.isFavorite {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink)
                        .padding(12)
                }
            }
            .aspectRatio(0.84, contentMode: .fit)
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.hairline))

            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(garment.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text(garment.brand.isEmpty ? garment.category.title : garment.brand)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                Swatch(hex: garment.colorHex, size: 14).padding(.top, 2)
            }
            .padding(.horizontal, 4)
        }
        .foregroundStyle(Theme.ink)
    }
}

struct GarmentDetailView: View {
    @Bindable var garment: Garment
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false
    @State private var tryingOn = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                GarmentImage(garment: garment, large: true)
                    .padding(36)
                    .frame(maxWidth: .infinity)
                    .frame(height: 340)
                    .background(LinearGradient(colors: [Theme.card, Theme.studio], startPoint: .top, endPoint: .bottom),
                                in: RoundedRectangle(cornerRadius: 30, style: .continuous))

                if TryOnConfig.isReady, TryOnService.supports(garment.category) {
                    Button { tryingOn = true } label: {
                        Label("Try it on", systemImage: "sparkles")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Theme.ink, in: Capsule())
                            .foregroundStyle(.white)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    TextField("Brand", text: $garment.brand).font(Theme.eyebrow).textInputAutocapitalization(.characters)
                    TextField("Name", text: $garment.name).font(Theme.display(30))
                }

                HStack(spacing: 12) {
                    StatTile(title: "Worn", value: "\(garment.wearCount)×")
                    StatTile(title: "In looks", value: "\(garment.looks?.count ?? 0)")
                    StatTile(title: "Added", value: garment.createdAt.formatted(.dateTime.month(.abbreviated).day()))
                }

                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow("Colour")
                    HStack {
                        Swatch(hex: garment.colorHex, size: 30)
                        Text("#\(garment.colorHex)").font(.system(size: 14, design: .monospaced))
                        Spacer()
                        ColorPicker("Colour", selection: Binding(
                            get: { Color(hex: garment.colorHex) },
                            set: { garment.colorHex = $0.hexString }
                        ), supportsOpacity: false)
                        .labelsHidden()
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow("Category")
                    FlowChips(options: garment.wearer?.kind.categories ?? GarmentCategory.humanCases, selection: Binding(
                        get: { garment.category }, set: { garment.category = $0 }
                    ))
                }

                Button(role: .destructive) { confirmDelete = true } label: {
                    Text("Delete piece").frame(maxWidth: .infinity)
                }
                .padding(.top, 8)
            }
            .padding(20)
        }
        .background(StudioBackground())
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { Personalizer.toggleFavorite(garment, in: context) } label: {
                    Image(systemName: garment.isFavorite ? "heart.fill" : "heart")
                }
                .sensoryFeedback(.impact(weight: .light), trigger: garment.isFavorite)
            }
        }
        .fullScreenCover(isPresented: $tryingOn) { TryOnView(garment: garment) }
        .confirmationDialog("Delete this piece?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                context.delete(garment)
                dismiss()
            }
        }
    }
}

struct StatTile: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(title)
            Text(value).font(Theme.display(22))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.hairline))
    }
}

struct FlowChips: View {
    let options: [GarmentCategory]
    @Binding var selection: GarmentCategory

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(options) { option in
                    Chip(title: option.title, isOn: selection == option) { selection = option }
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}
