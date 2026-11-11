import SwiftUI

/// A look on the photo-real mannequin (or the dog or cat model). Shows a saved
/// result instantly; otherwise lays the real product photos out as a flat lay,
/// dresses the model after a short pause, and fades the result in. Hats, shoes
/// and bags are worn too: each is dressed once and then layered on instantly.
struct PhotoMannequin: View {
    let garments: [Garment]
    /// Who wears it; defaults to the pieces' owner.
    var kind: WearerKind? = nil
    /// Their shape or age picks the mannequin; defaults to the pieces' owner.
    var wearer: Wearer? = nil
    var height: CGFloat = 380
    /// Start dressing on its own (e.g. only for the focused card).
    var autoDress = true
    /// Wait this long first, so fast shuffling doesn't start a try-on per tap.
    var delay: Duration = .milliseconds(500)
    /// Replace the instant combination with the full AI dressing (saved looks).
    var refine = false
    /// With `autoDress` off: offer a button that dresses this outfit on request,
    /// so try-ons are only spent when someone asks to see it on.
    var dressOnTap = false

    @State private var dressed: UIImage?
    /// `dressed` with the hat, shoes and bag placed on it.
    @State private var styled: UIImage?
    @State private var working = false
    @State private var shimmer = false
    /// Someone tapped "See it on".
    @State private var requested = false
    private var dresses: Bool { autoDress || requested }

    static func canShow(_ kind: WearerKind) -> Bool { TryOnConfig.isReady }

    private var who: WearerKind { kind ?? garments.first?.wearer?.kind ?? .woman }
    private var owner: Wearer? { wearer ?? garments.first?.wearer }
    private var base: TryOnService.Base { .photo(for: owner, kind: kind) }
    private var wearable: [Garment] {
        garments.filter { who.isPet ? TryOnService.isPetWear($0.category) : TryOnService.supports($0.category) }
    }
    private var extras: [Garment] { garments.filter { g in !wearable.contains { $0.id == g.id } } }

    /// One hat, one pair of shoes and one bag are worn by the mannequin.
    private var placed: [Garment] {
        guard !who.isPet else { return [] }
        return [GarmentCategory.hat, .shoes, .bag].compactMap { c in extras.first { $0.category == c } }
    }
    /// Anything else (a second bag, say) still sits beside it.
    private var unplaced: [Garment] { extras.filter { g in !placed.contains { $0.id == g.id } } }
    private var accessoryKey: String { placed.map { "\($0.id.uuidString)-\($0.thumbnailData?.count ?? 0)" }.joined(separator: ",") }
    private var key: String {
        // Thumbnail size only: reading the full photo here would hit the disk on every redraw.
        wearable.map { "\($0.id.uuidString)-\($0.thumbnailData?.count ?? 0)" }.sorted().joined(separator: ",")
    }
    private var width: CGFloat { height * 2 / 3 }

    private var corner: CGFloat { min(26, height * 0.08) }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ZStack {
                if let dressed {
                    Image(uiImage: styled ?? dressed)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                } else if garments.isEmpty, let bare = TryOnService.image(for: base) {
                    Image(uiImage: bare).resizable().scaledToFill()
                } else {
                    FlatLay(garments: garments, height: height)
                        .overlay(alignment: .bottom) {
                            if working {
                                Label(who.isPet ? "Dressing up" : "Dressing the mannequin", systemImage: "sparkles")
                                    .font(.system(size: 11, weight: .semibold))
                                    .padding(.horizontal, 12).padding(.vertical, 7)
                                    .background(.ultraThinMaterial, in: Capsule())
                                    .padding(.bottom, 12)
                                    .transition(.opacity)
                            } else if dressOnTap, !dresses, !wearable.isEmpty {
                                Button { requested = true } label: {
                                    Label("See it on", systemImage: "sparkles")
                                        .font(.system(size: 13, weight: .semibold))
                                        .padding(.horizontal, 16).padding(.vertical, 10)
                                        .background(.ultraThinMaterial, in: Capsule())
                                }
                                .buttonStyle(PressableStyle())
                                .foregroundStyle(Theme.ink)
                                .padding(.bottom, 14)
                                .transition(.opacity.combined(with: .scale(scale: 0.95)))
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

            if dressed != nil, !(styled != nil ? unplaced : extras).isEmpty, height >= 300 {
                VStack(spacing: 6) {
                    ForEach(styled != nil ? unplaced : extras) { g in
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
        .task(id: "\(key)|\(dresses)|\(base.rawValue)") { await load() }
        // A new outfit waits for its own tap.
        .onChange(of: key) { requested = false }
        .task(id: "\(dressed?.hash ?? 0)|\(accessoryKey)|\(base.rawValue)|\(dresses)") { await accessorize() }
    }

    private func load() async {
        let pieces = await TryOnService.pieces(for: wearable)
        guard !pieces.isEmpty, !Task.isCancelled else { if pieces.isEmpty { dressed = nil }; return }
        // 1. The full AI dressing, if this exact outfit was made before.
        if let exact = await TryOnService.cached(pieces, on: base) { dressed = exact; return }
        // 2. Pieces seen before combine on the phone, instantly.
        let combinable = TryOnService.canCombine(pieces)
        if combinable, let quick = await TryOnService.quickCached(pieces, on: base) {
            dressed = quick
            if !refine { return }
        } else {
            dressed = nil
        }
        guard dresses, PhotoMannequin.canShowAny, !Task.isCancelled else { return }
        if !requested { try? await Task.sleep(for: delay) }
        guard !Task.isCancelled else { return }
        working = true
        defer { working = false }
        // 3. New pieces are dressed once each, together, then combined.
        if dressed == nil, combinable, let quick = try? await TryOnService.quickDress(pieces, on: base), !Task.isCancelled {
            dressed = quick
        }
        // 4. Coats and layered outfits, and saved looks, get the full AI dressing.
        if (!combinable || refine), pieces.count > 1, !Task.isCancelled,
           let exact = try? await TryOnService.dress(pieces, on: base), !Task.isCancelled {
            dressed = exact
        }
    }

    /// Puts the hat, shoes and bag on the dressed mannequin. Each accessory is
    /// dressed on the bare mannequin once (or comes ready-made for the
    /// examples), then layered onto any outfit instantly.
    private func accessorize() async {
        guard let dressed, !placed.isEmpty else { styled = nil; return }
        let pieces = await TryOnService.pieces(for: placed)
        let categories = placed.map(\.category)
        var layers: [(Data, GarmentCategory)] = []
        for (piece, category) in zip(pieces, categories) {
            if let hit = TryOnService.accessoryCached(piece, on: base) {
                layers.append((hit, category))
            } else if dresses, let made = try? await TryOnService.accessoryLayer(piece, on: base) {
                layers.append((made, category))
            }
            guard !Task.isCancelled else { return }
        }
        guard !layers.isEmpty else { styled = nil; return }
        let ready = layers, target = base
        let image = await Task.detached(priority: .userInitiated) { TryOnService.accessorize(dressed, with: ready, on: target) }.value
        guard !Task.isCancelled else { return }
        styled = image
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

/// Saved looks (and matching sets) on their photo models, at the same quality
/// as Today's look: each look is fully dressed and saved after the first time.
/// A matching set fans out, one photo per person or pet.
struct LookFigure: View {
    let looks: [Look]
    let height: CGFloat
    /// Off for small previews: show saved dressings only, never start a new one.
    var autoDress = true

    private var shown: [Look] { looks.filter { PhotoMannequin.canShow($0.kind) } }

    var body: some View {
        if shown.isEmpty {
            GroupFigure(looks: looks, height: height)
        } else if shown.count == 1, let look = shown.first {
            PhotoMannequin(garments: look.items, kind: look.kind, height: height, autoDress: autoDress, refine: true)
        } else {
            // Up to three fan out large; a bigger family (up to six) shrinks to fit
            // in about the same width. Big sets use the cheaper per-piece dressing
            // (each piece dressed once, then combined) rather than a full AI
            // dressing per person, so one family look can't eat a month's try-ons.
            let count = min(shown.count, 6)
            let big = count > 3
            let card = big ? height * 0.87 / (2.0 / 3.0 + CGFloat(count - 1) * 0.26) : height * 0.9
            let step = card * (big ? 0.26 : 0.32)
            ZStack(alignment: .bottomLeading) {
                ForEach(Array(shown.prefix(count).enumerated()), id: \.element.id) { index, look in
                    PhotoMannequin(garments: look.items, kind: look.kind, wearer: look.wearer, height: card, autoDress: autoDress, refine: !big)
                        .shadow(color: .black.opacity(0.14), radius: 8, x: -2, y: 3)
                        .offset(x: CGFloat(index) * step, y: index.isMultiple(of: 2) ? 0 : -card * 0.05)
                        .zIndex(Double(-index))
                }
            }
            .frame(width: card * 2 / 3 + CGFloat(count - 1) * step, height: height, alignment: .bottomLeading)
        }
    }
}

/// A bundled mannequin photo, bare or wearing example pieces' ready-made
/// pictures. Several looks cross-fade in turn. No network, no try-ons used.
struct MannequinPhoto: View {
    let base: TryOnService.Base
    /// Example slugs (e.g. "wool-coat"); any without a picture on this base are skipped.
    var looks: [String] = []
    var height: CGFloat = 300
    var every: Duration = .seconds(2.2)

    @State private var index = 0

    private var images: [UIImage] {
        let dressed = looks.compactMap { TryOnService.presetImage($0, on: base) }
        if !dressed.isEmpty { return dressed }
        return TryOnService.image(for: base).map { [$0] } ?? []
    }
    private var corner: CGFloat { min(26, height * 0.08) }

    var body: some View {
        let shown = images
        ZStack {
            if !shown.isEmpty {
                Image(uiImage: shown[index % shown.count])
                    .resizable()
                    .scaledToFill()
                    .id(index % shown.count)
                    .transition(.opacity)
            }
        }
        .frame(width: height * 2 / 3, height: height)
        .background(Theme.studio)
        .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
        .animation(.easeInOut(duration: 0.4), value: base)
        .task(id: "\(base.rawValue)|\(looks.joined(separator: ","))") {
            index = 0
            guard shown.count > 1 else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: every)
                withAnimation(.smooth(duration: 0.8)) { index += 1 }
            }
        }
    }
}
