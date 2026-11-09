import SwiftUI
import PhotosUI

/// Photo-real try-on of one garment on the user's own full-body photo.
struct TryOnView: View {
    let garment: Garment
    @Environment(\.dismiss) private var dismiss

    @State private var person: UIImage?
    @State private var result: UIImage?
    @State private var pickerItem: PhotosPickerItem?
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                stage
                    .frame(maxWidth: .infinity)
                    .frame(maxHeight: .infinity)
                    .background(LinearGradient(colors: [Theme.card, Theme.studio], startPoint: .top, endPoint: .bottom),
                                in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))

                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                }
                controls
            }
            .padding(20)
            .background(StudioBackground())
            .navigationTitle("Try it on")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
        .task {
            person = TryOnService.savedPerson()
            result = TryOnService.cached(garmentID: garment.id)
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await usePhoto(item) }
        }
    }

    @ViewBuilder private var stage: some View {
        if let shown = result ?? person {
            Image(uiImage: shown)
                .resizable()
                .scaledToFit()
                .overlay {
                    if working {
                        ZStack {
                            Rectangle().fill(.ultraThinMaterial)
                            VStack(spacing: 12) {
                                ProgressView().controlSize(.large)
                                Text("Dressing you…").font(Theme.display(18))
                                Text("Takes about 15–30 seconds").font(.footnote).foregroundStyle(Theme.muted)
                            }
                        }
                        .transition(.opacity)
                    }
                }
                .animation(.easeInOut(duration: 0.35), value: working)
                .animation(.easeInOut(duration: 0.5), value: result)
        } else {
            VStack(spacing: 12) {
                Image(systemName: "figure.stand").font(.system(size: 54, weight: .light)).foregroundStyle(Theme.muted)
                Text("Add a full-body photo").font(Theme.display(22))
                Text("Stand straight, facing the camera, in fitted clothes against a plain wall. Your photo stays on this phone and is only sent for try-on.")
                    .font(.footnote).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
            }
        }
    }

    @ViewBuilder private var controls: some View {
        VStack(spacing: 10) {
            if person != nil {
                Button {
                    Task { await run() }
                } label: {
                    Label(result == nil ? "Try on \(garment.name)" : "Try again", systemImage: "sparkles")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.ink, in: Capsule())
                        .foregroundStyle(.white)
                }
                .disabled(working)
            }
            PhotosPicker(selection: $pickerItem, matching: .images, photoLibrary: .shared()) {
                Text(person == nil ? "Choose photo" : "Change my photo")
                    .font(person == nil ? .headline : .subheadline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, person == nil ? 16 : 8)
                    .background(person == nil ? AnyShapeStyle(Theme.ink) : AnyShapeStyle(.clear), in: Capsule())
                    .foregroundStyle(person == nil ? .white : Theme.ink)
            }
            .disabled(working)
        }
    }

    private func usePhoto(_ item: PhotosPickerItem) async {
        error = nil
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            error = "Couldn't load that photo."
            return
        }
        do {
            try TryOnService.savePerson(data)
            person = TryOnService.savedPerson()
            result = TryOnService.cached(garmentID: garment.id)
        } catch {
            self.error = error.localizedDescription
        }
        pickerItem = nil
    }

    private func run() async {
        guard let data = garment.imageData ?? garment.thumbnailData else {
            error = "This piece has no photo yet."
            return
        }
        error = nil
        working = true
        defer { working = false }
        do {
            result = try await TryOnService.tryOn(garmentID: garment.id, garmentImage: data, category: garment.category)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
