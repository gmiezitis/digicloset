import SwiftUI
import PhotosUI

/// Photo-real try-on of one piece or a whole look, on the mannequin or the user's own photo.
/// On the mannequin it starts by itself, so there's nothing to tap.
struct TryOnView: View {
    let garments: [Garment]
    var title = "Try it on"
    @Environment(\.dismiss) private var dismiss

    @AppStorage("tryOnBase") private var baseRaw = TryOnService.Base.mannequin.rawValue
    @State private var pieces: [TryOnService.Piece] = []
    @State private var person: UIImage?
    @State private var result: UIImage?
    @State private var pickerItem: PhotosPickerItem?
    @State private var working = false
    @State private var step = (0, 0)
    @State private var error: String?

    init(garment: Garment) { garments = [garment] }
    init(look: Look) {
        garments = look.items.filter { TryOnService.supports($0.category) }
        title = look.name
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Picker("Wearer", selection: $baseRaw) {
                    ForEach(TryOnService.Base.allCases) { Text($0.title).tag($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .disabled(working)

                stage
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
        .task {
            let sources = garments.compactMap { g in (g.imageData ?? g.thumbnailData).map { ($0, g.category) } }
            pieces = await Task.detached(priority: .userInitiated) {
                sources.compactMap { TryOnService.piece($0.0, category: $0.1) }
            }.value
            reload(autoStart: true)
        }
        .onChange(of: baseRaw) { _, _ in error = nil; reload(autoStart: true) }
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
                .blur(radius: working && result == nil ? 6 : 0)
                .overlay(alignment: result == nil ? .center : .bottom) {
                    if working {
                        VStack(spacing: 12) {
                            ProgressView().controlSize(.large)
                            Text(base == .mannequin ? "Dressing the mannequin…" : "Dressing you…").font(Theme.display(18))
                            Text(step.1 > 1 ? "Piece \(step.0) of \(step.1) · about 10 s each" : "About 10 seconds")
                                .font(.footnote).foregroundStyle(Theme.muted)
                        }
                        .padding(22)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .padding(.bottom, result == nil ? 0 : 16)
                        .transition(.opacity.combined(with: .scale(scale: 0.95)))
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
            if person != nil, result == nil, !working {
                Button { Task { await run() } } label: {
                    Label(garments.count > 1 ? "Try on the look" : "Try it on", systemImage: "sparkles")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.ink, in: Capsule())
                        .foregroundStyle(.white)
                }
            }
            if base == .me {
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
    }

    private var base: TryOnService.Base { TryOnService.Base(rawValue: baseRaw) ?? .mannequin }

    private func reload(autoStart: Bool) {
        person = TryOnService.image(for: base)
        result = TryOnService.cached(pieces, on: base)
        if autoStart, result == nil, person != nil, base == .mannequin, !pieces.isEmpty {
            Task { await run() }
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
            reload(autoStart: false)
        } catch {
            self.error = error.localizedDescription
        }
        pickerItem = nil
    }

    private func run() async {
        guard !working else { return }
        guard !pieces.isEmpty else {
            error = garments.isEmpty ? "This look has nothing try-on can show yet." : "This piece has no photo yet."
            return
        }
        error = nil
        working = true
        defer { working = false }
        let wanted = base
        do {
            let image = try await TryOnService.dress(pieces, on: wanted,
                                                     progress: { done, total in step = (done, total) },
                                                     partial: { if wanted == base { result = $0 } })
            if wanted == base { result = image }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
