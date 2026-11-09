import PhotosUI
import SwiftData
import SwiftUI
import UIKit

/// Add clothes fast: pick one photo or a whole batch. Each photo is cut out,
/// recognised, coloured and named on the device while you watch.
struct AddGarmentView: View {
    var preselectedOwner: UUID?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]

    @State private var queue = ImportQueue()
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var ownerID: UUID?
    @State private var brand = ""
    @State private var manualName = ""
    @State private var manualCategory: GarmentCategory = .top
    @State private var manualColor = "D9D4CC"
    @State private var editing: EditTarget?

    private struct EditTarget: Identifiable {
        let id: UUID
        let source: CutoutService.Source
    }

    private var owner: Wearer? { wearers.first { $0.id == ownerID } ?? wearers.first }
    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }
    private var single: ImportQueue.Item? { queue.items.count == 1 ? queue.items.first : nil }

    private var canSave: Bool {
        guard owner != nil, !queue.isBusy else { return false }
        if queue.items.isEmpty { return !manualName.trimmingCharacters(in: .whitespaces).isEmpty }
        return queue.readyCount > 0
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ownerStrip
                    if queue.items.count > 1 {
                        batchHeader
                        batchGrid
                    } else {
                        stage
                        sourceButtons
                        details
                    }
                }
                .padding(.vertical, 16)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(StudioBackground())
            .navigationTitle(queue.items.count > 1 ? "\(queue.items.count) new pieces" : "New piece")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(queue.readyCount > 1 ? "Add \(queue.readyCount)" : "Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
            }
            .onAppear {
                ownerID = preselectedOwner ?? wearers.first(where: \.isSelf)?.id ?? wearers.first?.id
                if let kind = owner?.kind {
                    queue.adapt(to: kind)
                    manualCategory = kind.categories[0]
                }
            }
            .onChange(of: ownerID) {
                guard let kind = owner?.kind else { return }
                queue.adapt(to: kind)
                if !kind.categories.contains(manualCategory) { manualCategory = kind.categories[0] }
            }
            .onChange(of: pickerItems) { load(pickerItems) }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { data in queue.add(data) }
                    .ignoresSafeArea()
            }
            .fullScreenCover(item: $editing) { target in
                CutoutEditorView(source: target.source, forPet: owner?.kind.isPet ?? false) { output in
                    queue.replace(target.id, with: output, cutout: UIImage(data: output.cutout))
                }
            }
            .sensoryFeedback(.success, trigger: queue.readyCount)
            .interactiveDismissDisabled(!queue.items.isEmpty)
        }
    }

    // MARK: Owner

    private var ownerStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow("Whose closet").padding(.horizontal, 20)
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

    // MARK: Single piece

    private var stage: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(LinearGradient(colors: [Theme.card, Theme.studio], startPoint: .top, endPoint: .bottom))
            if let item = single {
                if let cutout = item.cutout {
                    HStack(spacing: 6) {
                        if item.state == .ready, let owner {
                            OnYouPreview(kind: owner.kind, fit: owner.fit,
                                         layer: FigureLayer(id: item.id, category: item.category, colorHex: item.colorHex,
                                                            photo: item.output?.thumbnail))
                                .transition(.opacity.combined(with: .move(edge: .leading)))
                        }
                        LiftReveal(image: cutout)
                            .id(item.output?.cutout.count)
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.top, 58).padding(.bottom, 56).padding(.horizontal, 18)
                    .transition(.scale(scale: 0.85).combined(with: .opacity))
                } else if let preview = item.preview {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .padding(28)
                        .overlay { if item.state != .failed { ScanningOverlay().padding(28) } }
                        .transition(.opacity)
                } else {
                    ProgressView()
                }
            } else {
                VStack(spacing: 14) {
                    GarmentArt(category: manualCategory, colorHex: manualColor)
                        .frame(width: 150)
                    Text("Snap or pick photos. Choose several at once\nand each one is sorted for you.")
                        .font(.system(size: 13))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .frame(height: 360)
        .overlay(alignment: .bottom) {
            if let item = single { StatusBadge(item: item).padding(14) }
        }
        .overlay(alignment: .topTrailing) {
            if let item = single, item.state == .ready, let source = item.output?.source {
                Button { editing = EditTarget(id: item.id, source: source) } label: {
                    Label("Clean up", systemImage: "wand.and.rays")
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .foregroundStyle(Theme.ink)
                .padding(14)
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.spring(duration: 0.6, bounce: 0.25), value: single?.cutout)
        .padding(.horizontal, 20)
    }

    private var sourceButtons: some View {
        let title = queue.items.isEmpty ? "Photos" : "Add more"
        let filled = !cameraAvailable
        return HStack(spacing: 12) {
            if cameraAvailable {
                Button { showCamera = true } label: { PrimaryButtonLabel(title: "Camera", systemImage: "camera") }
                    .buttonStyle(PressableStyle())
            }
            PhotosPicker(selection: $pickerItems, maxSelectionCount: 30, matching: .images, photoLibrary: .shared()) {
                PrimaryButtonLabel(title: title, systemImage: "photo.on.rectangle.angled", filled: filled)
            }
            .buttonStyle(PressableStyle())
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private var details: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow("Name")
                TextField("e.g. Linen shirt", text: nameBinding)
                    .font(Theme.display(24))
                    .padding(14)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                TextField("Brand (optional)", text: $brand)
                    .padding(14)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(single?.state == .ready ? "Category · detected" : "Category")
                FlowChips(options: owner?.kind.categories ?? GarmentCategory.humanCases, selection: categoryBinding)
            }

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(single?.output == nil ? "Colour" : "Colour · detected")
                HStack(spacing: 12) {
                    ForEach(colorChoices, id: \.self) { hex in
                        Button { colorBinding.wrappedValue = hex } label: {
                            Swatch(hex: hex, size: 30)
                                .overlay(Circle().strokeBorder(Theme.ink, lineWidth: colorBinding.wrappedValue == hex ? 2 : 0).padding(-4))
                        }
                    }
                    Spacer()
                    ColorPicker("Custom colour", selection: Binding(get: { Color(hex: colorBinding.wrappedValue) },
                                                                    set: { colorBinding.wrappedValue = $0.hexString }),
                                supportsOpacity: false)
                        .labelsHidden()
                }
            }
        }
        .padding(.horizontal, 20)
    }

    /// Detected colours first, then a few classics.
    private var colorChoices: [String] {
        let detected = single?.output?.recognition.palette ?? []
        return Array((detected + ["EFE6D2", "B88A5A", "D9A3A0", "A9B79A", "2E3B55", "2A2C30"]).uniqued().prefix(6))
    }

    private var nameBinding: Binding<String> {
        guard let item = single else { return $manualName }
        return Binding(get: { item.name }, set: { value in queue.update(item.id) { $0.name = value; $0.nameEdited = true } })
    }

    private var categoryBinding: Binding<GarmentCategory> {
        guard let item = single else { return $manualCategory }
        return Binding(get: { item.category }, set: { value in queue.update(item.id) { $0.category = value; $0.categoryEdited = true } })
    }

    private var colorBinding: Binding<String> {
        guard let item = single else { return $manualColor }
        return Binding(get: { item.colorHex }, set: { value in queue.update(item.id) { $0.colorHex = value } })
    }

    // MARK: Batch

    private var batchHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(queue.isBusy ? "Sorting your pieces…" : "All sorted. Check and add.")
                    .font(Theme.display(22))
                    .contentTransition(.opacity)
                Spacer()
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 30, matching: .images, photoLibrary: .shared()) {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 36, height: 36)
                        .background(Theme.card, in: Circle())
                        .overlay(Circle().strokeBorder(Theme.hairline))
                }
                .foregroundStyle(Theme.ink)
            }
            ProgressView(value: queue.progress)
                .tint(Theme.ink)
                .animation(.smooth, value: queue.progress)
        }
        .padding(.horizontal, 20)
    }

    private var batchGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
            ForEach(queue.items) { item in
                BatchCard(item: item, categories: owner?.kind.categories ?? GarmentCategory.humanCases,
                          onName: { value in queue.update(item.id) { $0.name = value; $0.nameEdited = true } },
                          onCategory: { value in queue.update(item.id) { $0.category = value; $0.categoryEdited = true } },
                          onRemove: { withAnimation(.smooth) { queue.remove(item.id) } },
                          onEdit: { if let source = item.output?.source { editing = EditTarget(id: item.id, source: source) } })
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 20)
        .animation(.spring(duration: 0.45, bounce: 0.2), value: queue.items.map(\.state))
    }

    // MARK: Actions

    private func load(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        // Reserve every card now so the grid appears instantly in the picked order.
        let slots = items.map { ($0, queue.reserve()) }
        pickerItems = []
        for (item, id) in slots {
            Task { queue.fill(id, with: try? await item.loadTransferable(type: Data.self)) }
        }
    }

    private func save() {
        guard let owner else { return }
        var added: [Garment] = []
        func insert(name: String, category: GarmentCategory, colorHex: String, output: CutoutService.Output?) {
            let clean = name.trimmingCharacters(in: .whitespaces)
            let garment = Garment(name: clean.isEmpty ? category.noun.capitalized : clean, brand: brand,
                                  category: category, colorHex: colorHex, owner: owner)
            garment.imageData = output?.cutout
            garment.thumbnailData = output?.thumbnail
            garment.paletteHexes = Array(output?.recognition.palette.dropFirst() ?? [])
            context.insert(garment)
            garment.wearer = owner
            added.append(garment)
        }
        if queue.items.isEmpty {
            insert(name: manualName, category: manualCategory, colorHex: manualColor, output: nil)
        } else {
            for item in queue.items where item.state == .ready {
                insert(name: item.name, category: item.category, colorHex: item.colorHex, output: item.output)
            }
        }
        Personalizer.record(.added, garments: added, in: context)
        dismiss()
    }
}

/// What happened to a photo, shown on the single-piece stage.
private struct StatusBadge: View {
    let item: ImportQueue.Item

    var body: some View {
        Group {
            switch item.state {
            case .loading, .processing:
                Label("Cutting out and recognising…", systemImage: "wand.and.stars")
            case .failed:
                Label("Couldn't read that photo. Try another one.", systemImage: "exclamationmark.triangle")
            case .ready:
                if let output = item.output, !output.didRemoveBackground {
                    Label("Kept the full photo. A plainer background helps", systemImage: "info.circle")
                } else {
                    Label("Looks like \(item.category.noun) · \(Int(item.confidence * 100))% sure", systemImage: "checkmark.circle.fill")
                }
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background(.ultraThinMaterial, in: Capsule())
        .transition(.opacity)
    }
}

/// One photo in a batch: the cutout appears as soon as it's ready, with its
/// detected name and category ready to tweak.
private struct BatchCard: View {
    let item: ImportQueue.Item
    let categories: [GarmentCategory]
    var onName: (String) -> Void
    var onCategory: (GarmentCategory) -> Void
    var onRemove: () -> Void
    var onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.card, Theme.studio], startPoint: .top, endPoint: .bottom))
                if let cutout = item.cutout {
                    Image(uiImage: cutout).resizable().scaledToFit().padding(14)
                        .shadow(color: .black.opacity(0.15), radius: 10, y: 8)
                        .transition(.scale(scale: 0.8).combined(with: .opacity))
                } else if let preview = item.preview {
                    Image(uiImage: preview).resizable().scaledToFill()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                        .overlay { if item.state != .failed { ScanningOverlay() } }
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .opacity(item.state == .failed ? 0.4 : 1)
                } else {
                    ProgressView()
                }
                if item.state == .failed {
                    Label("Couldn't read", systemImage: "exclamationmark.triangle").font(.system(size: 11, weight: .semibold))
                }
            }
            .frame(height: 170)
            .contentShape(Rectangle())
            .onTapGesture { if item.state == .ready { onEdit() } }
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
                        .frame(width: 24, height: 24)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .foregroundStyle(Theme.ink)
                .padding(8)
            }
            .overlay(alignment: .bottomLeading) {
                if item.state == .ready, item.confidence < 0.5 {
                    Text("Check type")
                        .font(.system(size: 10, weight: .semibold))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color(hex: "F3E3A0"), in: Capsule())
                        .padding(8)
                }
            }
            .animation(.spring(duration: 0.5, bounce: 0.25), value: item.cutout)

            if item.state == .ready {
                TextField("Name", text: Binding(get: { item.name }, set: { onName($0) }))
                    .font(.system(size: 14, weight: .semibold))
                HStack(spacing: 8) {
                    Swatch(hex: item.colorHex, size: 14)
                    Menu {
                        ForEach(categories) { c in
                            Button(c.title) { onCategory(c) }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(item.category.title)
                            Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                        }
                        .font(.system(size: 12, weight: .medium))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Theme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(Theme.hairline))
                    }
                    .foregroundStyle(Theme.ink)
                }
            } else {
                RoundedRectangle(cornerRadius: 4).fill(Theme.hairline).frame(height: 12).padding(.trailing, 40)
                RoundedRectangle(cornerRadius: 4).fill(Theme.hairline).frame(width: 70, height: 12)
            }
        }
    }
}

/// A soft light sweep over the photo while Vision works.
struct ScanningOverlay: View {
    @State private var sweep = false

    var body: some View {
        GeometryReader { geo in
            LinearGradient(colors: [.clear, .white.opacity(0.75), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 90)
                .offset(y: sweep ? geo.size.height - 45 : -45)
                .blendMode(.screen)
        }
        .clipped()
        .onAppear {
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { sweep = true }
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    var onCapture: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        // A framing guide on top of the live camera, so photos start out clean.
        let guide = UIHostingController(rootView: CameraGuide())
        guide.view.backgroundColor = .clear
        guide.view.isUserInteractionEnabled = false
        guide.view.frame = UIScreen.main.bounds
        guide.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        picker.cameraOverlayView = guide.view
        context.coordinator.guide = guide
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        var guide: UIViewController?
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.92) {
                parent.onCapture(data)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// Corner brackets and a tip over the camera: lay it flat, fill the frame.
private struct CameraGuide: View {
    @State private var breathe = false

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width * 0.78
            let height = min(width * 1.25, geo.size.height * 0.5)
            VStack(spacing: 16) {
                Label("Lay it flat on a plain surface", systemImage: "sparkles")
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                    .environment(\.colorScheme, .dark)
                CornerBrackets()
                    .stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                    .frame(width: width, height: height)
                    .scaleEffect(breathe ? 1.0 : 0.97)
                    .shadow(color: .black.opacity(0.35), radius: 4)
                Text("Fill the frame with one piece")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.5), radius: 3)
            }
            .frame(width: geo.size.width)
            .position(x: geo.size.width / 2, y: geo.size.height * 0.43)
        }
        .onAppear { withAnimation(.easeInOut(duration: 1.4).repeatForever()) { breathe = true } }
    }
}

private struct CornerBrackets: Shape {
    func path(in rect: CGRect) -> Path {
        let l = min(rect.width, rect.height) * 0.16
        let r: CGFloat = 14
        var p = Path()
        // Top-left
        p.move(to: CGPoint(x: rect.minX, y: rect.minY + l))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addQuadCurve(to: CGPoint(x: rect.minX + r, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.minX + l, y: rect.minY))
        // Top-right
        p.move(to: CGPoint(x: rect.maxX - l, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + r), control: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + l))
        // Bottom-right
        p.move(to: CGPoint(x: rect.maxX, y: rect.maxY - l))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - r, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.maxX - l, y: rect.maxY))
        // Bottom-left
        p.move(to: CGPoint(x: rect.minX + l, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - r), control: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - l))
        return p
    }
}

/// A cutout appearing the way iOS lifts a subject: a light sweep across the
/// garment and a soft glow that fades as it settles.
struct LiftReveal: View {
    let image: UIImage
    @State private var sweep: CGFloat = -1
    @State private var glow = 1.0

    var body: some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .overlay {
                GeometryReader { geo in
                    LinearGradient(colors: [.clear, .white.opacity(0.85), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: geo.size.width * 0.5)
                        .rotationEffect(.degrees(18))
                        .offset(x: sweep * geo.size.width * 1.2 + geo.size.width * 0.25)
                }
                .mask(Image(uiImage: image).resizable().scaledToFit())
                .blendMode(.plusLighter)
                .allowsHitTesting(false)
            }
            .shadow(color: .white.opacity(0.95 * glow), radius: 12)
            .shadow(color: .black.opacity(0.18), radius: 16, y: 12)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).delay(0.1)) { sweep = 1 }
                withAnimation(.easeOut(duration: 1.4).delay(0.4)) { glow = 0 }
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: sweep)
    }
}

/// The new piece already on your figure, so you see how it reads worn.
private struct OnYouPreview: View {
    let kind: WearerKind
    let fit: BodyFit
    let layer: FigureLayer

    var body: some View {
        VStack(spacing: 6) {
            Spacer(minLength: 0)
            StandingFigure(kind: kind, layers: [layer], height: kind.isPet ? 110 : 190, fit: fit)
                .frame(height: kind.isPet ? 120 : 196, alignment: .bottom)
            Text(kind.isPet ? "On them" : "On you")
                .font(.system(size: 10, weight: .semibold))
                .tracking(1)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)
        }
        .frame(width: kind.isPet ? 120 : 86)
    }
}
