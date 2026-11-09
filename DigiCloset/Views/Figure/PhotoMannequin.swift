import SwiftUI

/// A look on the photo-real mannequin. Shows a saved result instantly;
/// otherwise lays the real product photos out as a flat lay, dresses the
/// mannequin after a short pause, and fades the result in. Shoes, hats and
/// bags (which try-on can't put on) sit beside it as small photos.
struct PhotoMannequin: View {
    let garments: [Garment]
    var height: CGFloat = 380
    /// Start dressing on its own (e.g. only for the focused card).
    var autoDress = true
    /// Wait this long first, so fast shuffling doesn't start a try-on per tap.
    var delay: Duration = .milliseconds(500)
    /// Replace the instant combination with the full AI dressing (saved looks).
    var refine = false

    @State private var dressed: UIImage?
    @State private var working = false
    @State private var shimmer = false

    static func canShow(_ kind: WearerKind) -> Bool { !kind.isPet && TryOnConfig.isReady }

    private var wearable: [Garment] { garments.filter { TryOnService.supports($0.category) } }
    private var extras: [Garment] { garments.filter { !TryOnService.supports($0.category) } }
    private var key: String {
        // Thumbnail size only: reading the full photo here would hit the disk on every redraw.
        wearable.map { "\($0.id.uuidString)-\($0.thumbnailData?.count ?? 0)" }.sorted().joined(separator: ",")
    }
    private var width: CGFloat { height * 2 / 3 }
    private static let bare = TryOnService.image(for: .mannequin)
    private var corner: CGFloat { min(26, height * 0.08) }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ZStack {
                if let dressed {
                    Image(uiImage: dressed)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                } else if garments.isEmpty, let bare = Self.bare {
                    Image(uiImage: bare).resizable().scaledToFill()
                } else {
                    FlatLay(garments: garments, height: height)
                        .overlay(alignment: .bottom) {
                            if working {
                                Label("Dressing the mannequin", systemImage: "sparkles")
                                    .font(.system(size: 11, weight: .semibold))
                                    .padding(.horizontal, 12).padding(.vertical, 7)
                                    .background(.ultraThinMaterial, in: Capsule())
                                    .padding(.bottom, 12)
                                    .transition(.opacity)
                            }
                        }
                }
            }
            .frame(width: width, height: height)
            .background(Theme.studio)
            .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
            .overlay {
                if working && dressed == nil {
                    LinearGradient(colors: [.clear, .white.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: width * 0.5)
                        .offset(x: shimmer ? width : -width)
                        .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
                        .allowsHitTesting(false)
                }
            }

            if dressed != nil, working, height >= 300 {
                Label("Perfecting the fit", systemImage: "sparkles")
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(12)
                    .transition(.opacity)
            }

            if dressed != nil, !extras.isEmpty, height >= 300 {
                VStack(spacing: 6) {
                    ForEach(extras) { g in
                        GarmentImage(garment: g)
                            .padding(6)
                            .frame(width: 46, height: 46)
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
                .padding(10)
                .transition(.opacity)
            }
        }
        .frame(width: width, height: height)
        .animation(.easeInOut(duration: 0.6), value: dressed)
        .animation(.easeInOut(duration: 0.3), value: working)
        // The shimmer only runs while dressing, so idle cards cost nothing to draw.
        .onChange(of: working) { _, isWorking in
            if isWorking {
                shimmer = false
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { shimmer = true }
            } else {
                withAnimation(.linear(duration: 0)) { shimmer = false }
            }
        }
        .task(id: "\(key)|\(autoDress)") { await load() }
    }

    private func load() async {
        let pieces = await TryOnService.pieces(for: wearable)
        guard !pieces.isEmpty, !Task.isCancelled else { if pieces.isEmpty { dressed = nil }; return }
        // 1. The full AI dressing, if this exact outfit was made before.
        if let exact = await TryOnService.cached(pieces, on: .mannequin) { dressed = exact; return }
        // 2. Pieces seen before combine on the phone, instantly.
        let combinable = TryOnService.canCombine(pieces)
        if combinable, let quick = await TryOnService.quickCached(pieces, on: .mannequin) {
            dressed = quick
            if !refine { return }
        } else {
            dressed = nil
        }
        guard autoDress, PhotoMannequin.canShowAny, !Task.isCancelled else { return }
        try? await Task.sleep(for: delay)
        guard !Task.isCancelled else { return }
        working = true
        defer { working = false }
        // 3. New pieces are dressed once each, together, then combined.
        if dressed == nil, combinable, let quick = try? await TryOnService.quickDress(pieces, on: .mannequin), !Task.isCancelled {
            dressed = quick
        }
        // 4. Coats and layered outfits, and saved looks, get the full AI dressing.
        if (!combinable || refine), pieces.count > 1, !Task.isCancelled,
           let exact = try? await TryOnService.dress(pieces, on: .mannequin), !Task.isCancelled {
            dressed = exact
        }
    }

    private static var canShowAny: Bool { TryOnConfig.isReady }
}

/// The outfit's real product photos arranged like a styled flat lay.
struct FlatLay: View {
    let garments: [Garment]
    let height: CGFloat

    private func pick(_ categories: Set<GarmentCategory>) -> [Garment] {
        garments.filter { categories.contains($0.category) }
    }

    var body: some View {
        let hats = pick([.hat]), tops = pick([.outerwear, .top, .sweater, .dress])
        let bottoms = pick([.bottom, .skirt]), shoes = pick([.shoes]), bags = pick([.bag])
        VStack(spacing: height * 0.015) {
            if let hat = hats.first {
                GarmentImage(garment: hat).frame(height: height * 0.1)
            }
            HStack(spacing: -height * 0.06) {
                ForEach(tops) { g in GarmentImage(garment: g).frame(height: height * (bottoms.isEmpty ? 0.46 : 0.27)) }
            }
            ForEach(bottoms) { g in GarmentImage(garment: g).frame(height: height * 0.27) }
            HStack(spacing: height * 0.04) {
                ForEach(shoes) { g in GarmentImage(garment: g).frame(height: height * 0.09) }
                ForEach(bags) { g in GarmentImage(garment: g).frame(height: height * 0.1) }
            }
        }
        .padding(.horizontal, height * 0.04)
        .padding(.top, height * 0.04)
        .padding(.bottom, height * 0.14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// One look as a photo mannequin (saved result or flat lay, never starting a
/// new try-on); pets and matching sets keep the drawn figures.
struct LookFigure: View {
    let looks: [Look]
    let height: CGFloat

    var body: some View {
        if looks.count == 1, let look = looks.first, PhotoMannequin.canShow(look.kind) {
            PhotoMannequin(garments: look.items, height: height, autoDress: false)
        } else {
            GroupFigure(looks: looks, height: height)
        }
    }
}
