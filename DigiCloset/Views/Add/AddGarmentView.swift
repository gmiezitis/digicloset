import PhotosUI
import SwiftData
import SwiftUI
import UIKit

/// Snap or pick a photo → the background is removed on the device → name it.
struct AddGarmentView: View {
    var preselectedOwner: UUID?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]

    @State private var pickerItem: PhotosPickerItem?
    @State private var original: UIImage?
    @State private var output: CutoutService.Output?
    @State private var cutoutImage: UIImage?
    @State private var processing = false
    @State private var showCamera = false
    @State private var failed = false

    @State private var name = ""
    @State private var brand = ""
    @State private var ownerID: UUID?
    @State private var category: GarmentCategory = .top
    @State private var colorHex = "D9D4CC"

    private var owner: Wearer? { wearers.first { $0.id == ownerID } ?? wearers.first }
    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    stage
                    sourceButtons
                    details
                }
                .padding(20)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .navigationTitle("New piece")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || processing || owner == nil)
                }
            }
            .onAppear {
                ownerID = preselectedOwner ?? wearers.first?.id
                category = owner?.kind.categories.first ?? .top
            }
            .onChange(of: ownerID) {
                if let kind = owner?.kind, !kind.categories.contains(category) { category = kind.categories[0] }
            }
            .onChange(of: pickerItem) {
                guard let item = pickerItem else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) { await process(data) }
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { data in Task { await process(data) } }
                    .ignoresSafeArea()
            }
            .sensoryFeedback(.success, trigger: cutoutImage != nil)
        }
    }

    // MARK: Sections

    private var stage: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(LinearGradient(colors: [Theme.card, Theme.studio], startPoint: .top, endPoint: .bottom))
            if let cutoutImage {
                Image(uiImage: cutoutImage)
                    .resizable()
                    .scaledToFit()
                    .padding(28)
                    .shadow(color: .black.opacity(0.18), radius: 16, y: 12)
                    .transition(.scale(scale: 0.85).combined(with: .opacity))
            } else if let original {
                Image(uiImage: original)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(28)
                    .overlay { if processing { ScanningOverlay() } }
                    .transition(.opacity)
            } else {
                VStack(spacing: 14) {
                    GarmentArt(category: category, colorHex: colorHex)
                        .frame(width: 150)
                    Text("Add a photo, or just pick a colour below")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .frame(height: 340)
        .overlay(alignment: .bottom) {
            if processing {
                Label("Removing background…", systemImage: "wand.and.stars")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(14)
            } else if failed {
                Text("Couldn't read that photo. Try another one.")
                    .font(.system(size: 12, weight: .medium))
                    .padding(14)
            } else if let output {
                Label(output.didRemoveBackground ? "Background removed" : "Kept the full photo. Try a plainer background",
                      systemImage: output.didRemoveBackground ? "checkmark.circle.fill" : "info.circle")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(14)
                    .transition(.opacity)
            }
        }
        .animation(.spring(duration: 0.6, bounce: 0.25), value: cutoutImage)
    }

    private var sourceButtons: some View {
        HStack(spacing: 12) {
            if cameraAvailable {
                Button { showCamera = true } label: { PrimaryButtonLabel(title: "Camera", systemImage: "camera") }
                    .buttonStyle(PressableStyle())
            }
            PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                PrimaryButtonLabel(title: "Photos", systemImage: "photo.on.rectangle", filled: !cameraAvailable)
            }
            .buttonStyle(PressableStyle())
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow("Name")
                TextField("e.g. Linen shirt", text: $name)
                    .font(Theme.display(24))
                    .padding(14)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                TextField("Brand (optional)", text: $brand)
                    .padding(14)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow("Whose closet")
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        ForEach(wearers) { w in
                            WearerFilterButton(title: w.name, wearer: w, isOn: w.id == owner?.id) { ownerID = w.id }
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow("Category")
                FlowChips(options: owner?.kind.categories ?? GarmentCategory.humanCases, selection: $category)
            }

            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(output == nil ? "Colour" : "Colour · detected")
                HStack(spacing: 12) {
                    ForEach(["EFE6D2", "B88A5A", "D9A3A0", "A9B79A", "2E3B55", "2A2C30"], id: \.self) { hex in
                        Button { colorHex = hex } label: {
                            Swatch(hex: hex, size: 30)
                                .overlay(Circle().strokeBorder(Theme.ink, lineWidth: colorHex == hex ? 2 : 0).padding(-4))
                        }
                    }
                    Spacer()
                    ColorPicker("Custom colour", selection: Binding(get: { Color(hex: colorHex) }, set: { colorHex = $0.hexString }), supportsOpacity: false)
                        .labelsHidden()
                }
            }
        }
    }

    // MARK: Actions

    private func process(_ data: Data) async {
        failed = false
        cutoutImage = nil
        output = nil
        withAnimation { original = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: 900, height: 900)) }
        processing = true
        defer { processing = false }
        do {
            let result = try await CutoutService.process(data)
            output = result
            colorHex = result.dominantHex
            cutoutImage = UIImage(data: result.cutout)
        } catch {
            failed = true
        }
    }

    private func save() {
        guard let owner else { return }
        let garment = Garment(name: name.trimmingCharacters(in: .whitespaces), brand: brand, category: category, colorHex: colorHex, owner: owner)
        garment.imageData = output?.cutout
        garment.thumbnailData = output?.thumbnail
        context.insert(garment)
        garment.wearer = owner
        dismiss()
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
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
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
