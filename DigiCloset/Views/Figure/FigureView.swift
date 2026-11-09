import SwiftUI
import UIKit

/// Where each kind of garment sits on each mannequin, in 0–1 coordinates of
/// the cutout image. Measured from the mannequin artwork.
enum FigureZones {
    static func zones(for category: GarmentCategory, kind: WearerKind) -> [CGRect] {
        switch kind {
        case .dog: dog(category)
        case .cat: cat(category)
        default: human(category)
        }
    }

    static func pin(for category: GarmentCategory, kind: WearerKind) -> CGPoint {
        switch (kind, category) {
        case (.dog, .sweater): CGPoint(x: 0.56, y: 0.4)
        case (.dog, .collar): CGPoint(x: 0.22, y: 0.24)
        case (.dog, _): CGPoint(x: 0.25, y: 0.32)
        case (.cat, .sweater): CGPoint(x: 0.5, y: 0.52)
        case (.cat, .collar): CGPoint(x: 0.26, y: 0.315)
        case (.cat, _): CGPoint(x: 0.26, y: 0.38)
        case (_, .top): CGPoint(x: 0.58, y: 0.29)
        case (_, .outerwear): CGPoint(x: 0.3, y: 0.37)
        case (_, .dress): CGPoint(x: 0.5, y: 0.4)
        case (_, .bottom): CGPoint(x: 0.4, y: 0.67)
        case (_, .skirt): CGPoint(x: 0.5, y: 0.57)
        case (_, .shoes): CGPoint(x: 0.36, y: 0.965)
        case (_, .hat): CGPoint(x: 0.5, y: 0.035)
        default: CGPoint(x: 0.9, y: 0.55)
        }
    }

    private static func human(_ c: GarmentCategory) -> [CGRect] {
        switch c {
        case .top: [CGRect(x: 0, y: 0.165, width: 1, height: 0.335)]
        case .outerwear: [CGRect(x: 0, y: 0.158, width: 1, height: 0.43)]
        case .dress: [CGRect(x: 0.19, y: 0.19, width: 0.6, height: 0.3)] // sleeveless bodice; the skirt is a drape
        case .bottom: [CGRect(x: 0.14, y: 0.44, width: 0.72, height: 0.495)]
        case .skirt: []
        case .shoes: [CGRect(x: 0, y: 0.935, width: 1, height: 0.065)]
        case .hat: []
        default: []
        }
    }

    private static func dog(_ c: GarmentCategory) -> [CGRect] {
        switch c {
        case .sweater: [CGRect(x: 0.15, y: 0.2, width: 0.76, height: 0.42)]
        case .collar: [CGRect(x: 0.13, y: 0.205, width: 0.19, height: 0.065)]
        case .bandana: [CGRect(x: 0.14, y: 0.22, width: 0.2, height: 0.17)]
        default: []
        }
    }

    private static func cat(_ c: GarmentCategory) -> [CGRect] {
        switch c {
        case .sweater: [CGRect(x: 0, y: 0.34, width: 1, height: 0.36)]
        case .collar: [CGRect(x: 0.02, y: 0.295, width: 0.5, height: 0.045)]
        case .bandana: [CGRect(x: 0.02, y: 0.3, width: 0.5, height: 0.15)]
        default: []
        }
    }
}

/// A mannequin "wearing" a look: each garment's colour is multiplied onto the
/// figure so the sculpted shading shows through like real fabric.
struct FigureView: View {
    let kind: WearerKind
    let layers: [FigureLayer]
    var showsPins = false
    var selectedPin: UUID?
    var onPin: ((UUID) -> Void)?

    var body: some View {
        let base = Image(kind.mannequin).resizable().interpolation(.high).antialiased(true).aspectRatio(kind.aspect, contentMode: .fit)
        base
            .overlay {
                GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        ForEach(layers.sorted { $0.category.layer < $1.category.layer }) { layer in
                            ForEach(Array(FigureZones.zones(for: layer.category, kind: kind).enumerated()), id: \.offset) { _, zone in
                                let height = zone.height * geo.size.height
                                ZoneFill(layer: layer, figureWidth: geo.size.width)
                                    .frame(width: zone.width * geo.size.width, height: height)
                                    .mask(EdgeFade(height: height))
                                    .mask(SideFade(zone: zone, width: zone.width * geo.size.width))
                                .offset(x: zone.minX * geo.size.width, y: zone.minY * geo.size.height)
                            }
                        }
                    }
                    .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
                }
                .mask(base)
                .drawingGroup()
                .blendMode(.multiply)
                .allowsHitTesting(false)
            }
            .compositingGroup()
            .overlay {
                // Skirts and hat brims stand away from the body, so they're drawn over it.
                if !kind.isPet {
                    GeometryReader { geo in
                        let coatHem: CGFloat? = layers.contains { $0.category == .outerwear } ? 0.588 : nil
                        ForEach(layers.filter { FigureDrape.hangs($0.category) }.sorted { $0.category.layer < $1.category.layer }) { layer in
                            DrapeView(layer: layer, shape: FigureDrape(category: layer.category, kind: kind, startY: coatHem))
                                .frame(width: geo.size.width, height: geo.size.height)
                        }
                    }
                    .allowsHitTesting(false)
                }
            }
            .overlay {
                // Bags hang from the hand as the real photo.
                if !kind.isPet, let bag = layers.last(where: { $0.category == .bag && $0.photo != nil }) {
                    GeometryReader { geo in
                        HeldPhoto(layer: bag)
                            .frame(width: geo.size.height * 0.15, height: geo.size.height * 0.15)
                            .position(x: geo.size.width * 0.93, y: geo.size.height * 0.63)
                    }
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }
            }
            .overlay {
                if showsPins {
                    GeometryReader { geo in
                        ForEach(layers) { layer in
                            let point = FigureZones.pin(for: layer.category, kind: kind)
                            PinDot(isSelected: selectedPin == layer.id)
                                .position(x: point.x * geo.size.width, y: point.y * geo.size.height)
                                .onTapGesture { onPin?(layer.id) }
                        }
                    }
                }
            }
            .animation(.smooth(duration: 0.45), value: layers)
    }
}

/// The outline of a garment that hangs away from the body, fitted to the
/// mannequin artwork (measured from it): an A-line skirt from the waist, a
/// dress skirt, or a hat's crown and brim.
struct FigureDrape: Shape {
    let category: GarmentCategory
    let kind: WearerKind
    /// Where a coat ends; skirts start below it so the coat stays on top.
    var startY: CGFloat?

    static func hangs(_ category: GarmentCategory) -> Bool { [.skirt, .dress, .hat].contains(category) }

    func path(in rect: CGRect) -> Path {
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * rect.width, y: rect.minY + y * rect.height) }
        let child = kind == .child
        var path = Path()
        switch category {
        case .skirt, .dress:
            let dress = category == .dress
            let top: CGFloat = child ? (dress ? 0.53 : 0.52) : (dress ? 0.46 : 0.43)
            let hem: CGFloat = child ? (dress ? 0.8 : 0.76) : (dress ? 0.75 : 0.71)
            let (l, r): (CGFloat, CGFloat) = child ? (0.22, 0.79) : (0.215, 0.778)
            let (hl, hr): (CGFloat, CGFloat) = dress ? (0.0, 0.99) : (0.03, 0.96)
            let mid = top + (hem - top) * 0.38
            path.move(to: p(l, top))
            path.addQuadCurve(to: p(r, top), control: p(0.5, top + 0.012))
            path.addQuadCurve(to: p(hr, hem), control: p(r + 0.08, mid))
            path.addQuadCurve(to: p(hl, hem), control: p(0.5, hem + 0.02))
            path.addQuadCurve(to: p(l, top), control: p(l - 0.085, mid))
            path.closeSubpath()
            if let startY, startY > top {
                path = path.intersection(Path(CGRect(x: rect.minX, y: rect.minY + startY * rect.height,
                                                     width: rect.width, height: rect.height)))
            }
        case .hat:
            let (cl, cr): (CGFloat, CGFloat) = switch kind {
            case .man: (0.37, 0.63)
            case .child: (0.29, 0.71)
            default: (0.33, 0.65)
            }
            let spread = (cr - cl) * 0.62
            path.addRoundedRect(in: CGRect(x: rect.minX + cl * rect.width, y: rect.minY + 0.004 * rect.height,
                                           width: (cr - cl) * rect.width, height: 0.07 * rect.height),
                                cornerSize: CGSize(width: rect.width * 0.06, height: rect.width * 0.06))
            path = path.union(Path(ellipseIn: CGRect(x: rect.minX + (cl - spread) * rect.width, y: rect.minY + 0.056 * rect.height,
                                                     width: (cr - cl + 2 * spread) * rect.width, height: 0.034 * rect.height)))
        default:
            break
        }
        return path
    }
}

/// A hanging garment: the real fabric (or colour), shaded so it reads as cloth
/// with volume and soft folds, and a light shadow onto the figure.
private struct DrapeView: View {
    let layer: FigureLayer
    let shape: FigureDrape

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ZoneFill(layer: layer, figureWidth: geo.size.width)
                // Rounded volume: darker where the cloth turns away at the sides.
                LinearGradient(stops: [
                    .init(color: .black.opacity(0.28), location: 0.12),
                    .init(color: .clear, location: 0.34),
                    .init(color: .white.opacity(0.1), location: 0.46),
                    .init(color: .clear, location: 0.6),
                    .init(color: .black.opacity(0.3), location: 0.88),
                ], startPoint: .leading, endPoint: .trailing)
                if shape.category != .hat {
                    // Soft folds falling from the waist.
                    LinearGradient(stops: [
                        .init(color: .clear, location: 0.2), .init(color: .black.opacity(0.12), location: 0.3),
                        .init(color: .clear, location: 0.4), .init(color: .black.opacity(0.1), location: 0.52),
                        .init(color: .clear, location: 0.62), .init(color: .black.opacity(0.12), location: 0.72),
                        .init(color: .clear, location: 0.82),
                    ], startPoint: .leading, endPoint: .trailing)
                    .blendMode(.multiply)
                    // Shadow under the waistband, light catching the hem.
                    LinearGradient(stops: [
                        .init(color: .black.opacity(0.22), location: shape.category == .dress ? 0.46 : 0.43),
                        .init(color: .clear, location: shape.category == .dress ? 0.5 : 0.47),
                    ], startPoint: .top, endPoint: .bottom)
                } else {
                    // Ribbon band at the base of the crown.
                    Rectangle().fill(.black.opacity(0.32))
                        .frame(height: geo.size.height * 0.014)
                        .position(x: geo.size.width / 2, y: geo.size.height * 0.062)
                }
            }
            .clipShape(shape)
            .overlay(shape.stroke(.black.opacity(0.12), lineWidth: 0.6))
            .shadow(color: .black.opacity(0.2), radius: 3, y: 2)
        }
    }
}

/// What fills one zone of the figure: the garment's real fabric when it has a
/// photo (tiled at the right scale so prints read true), otherwise its colour.
private struct ZoneFill: View {
    let layer: FigureLayer
    let figureWidth: CGFloat
    @State private var fabric: ImagePipeline.Fabric?
    private static let usesPhotoFabric = false

    private var key: String { "\(layer.id.uuidString)-F\(layer.photo?.count ?? 0)-\(layer.colorHex)" }

    var body: some View {
        ZStack {
            Color(hex: layer.colorHex)
            if let fabric {
                // The tile is two swatches wide; a swatch covers `ratio` of the garment.
                let points = max(6, figureWidth * fabric.ratio * 2)
                Image(uiImage: UIImage(cgImage: fabric.tile, scale: CGFloat(fabric.tile.width) / points, orientation: .up))
                    .resizable(resizingMode: .tile)
                    .transition(.opacity)
            }
        }
        .task(id: key) {
            // Product photos (folds, buttons, shadows) tile into streaks, so drawn
            // figures wear the clean colour; the photo mannequin shows the real piece.
            guard Self.usesPhotoFabric, let photo = layer.photo else { fabric = nil; return }
            if let hit = ImagePipeline.shared.cachedFabric(key) { fabric = hit; return }
            let loaded = await ImagePipeline.shared.fabric(for: key, data: photo, colorHex: layer.colorHex)
            withAnimation(.smooth(duration: 0.35)) { fabric = loaded }
        }
    }
}

/// Soft top and bottom edges so pieces blend like fabric seams.
private struct EdgeFade: View {
    let height: CGFloat

    var body: some View {
        let fade = min(0.5, 4 / max(height, 1))
        LinearGradient(stops: [
            .init(color: .clear, location: 0),
            .init(color: .black, location: fade),
            .init(color: .black, location: 1 - fade),
            .init(color: .clear, location: 1),
        ], startPoint: .top, endPoint: .bottom)
    }
}

/// A real garment photo carried by the figure (bags).
private struct HeldPhoto: View {
    let layer: FigureLayer
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
                    .shadow(color: .black.opacity(0.2), radius: 3, y: 2)
            }
        }
        .task(id: layer.id) {
            let key = "\(layer.id.uuidString)-S"
            if let hit = ImagePipeline.shared.cached(key) { image = hit; return }
            guard let photo = layer.photo else { return }
            image = await ImagePipeline.shared.image(for: key, data: photo, maxPixel: 480)
        }
    }
}

/// Fades a zone's left/right edges when it stops partway across the figure,
/// so pet sweaters and collars don't look like boxes.
private struct SideFade: View {
    let zone: CGRect
    let width: CGFloat

    var body: some View {
        let fade = min(0.35, 18 / max(width, 1))
        LinearGradient(stops: [
            .init(color: zone.minX > 0.01 ? .clear : .black, location: 0),
            .init(color: .black, location: zone.minX > 0.01 ? fade : 0),
            .init(color: .black, location: zone.maxX < 0.99 ? 1 - fade : 1),
            .init(color: zone.maxX < 0.99 ? .clear : .black, location: 1),
        ], startPoint: .leading, endPoint: .trailing)
    }
}

struct PinDot: View {
    var isSelected: Bool
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.8), lineWidth: 1.5)
                .frame(width: 34, height: 34)
                .scaleEffect(pulse ? 1.25 : 0.7)
                .opacity(pulse ? 0 : 0.9)
            Circle()
                .fill(isSelected ? Theme.ink : Color.white)
                .frame(width: 22, height: 22)
                .shadow(color: .black.opacity(0.25), radius: 6, y: 2)
            Image(systemName: "plus")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(isSelected ? Color.white : Theme.ink)
                .rotationEffect(.degrees(isSelected ? 45 : 0))
        }
        .frame(width: 44, height: 44)
        .contentShape(Circle())
        .animation(.spring(duration: 0.3), value: isSelected)
        .onAppear {
            withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { pulse = true }
        }
    }
}

/// One figure standing on the studio floor, sized relative to an adult.
struct StandingFigure: View {
    let kind: WearerKind
    let layers: [FigureLayer]
    let height: CGFloat
    var solo = true
    var fit: BodyFit = .standard

    var body: some View {
        let h = height * (solo ? kind.soloHeight : kind.relativeHeight * fit.height)
        ZStack(alignment: .bottom) {
            FloorShadow()
                .frame(width: max(h * kind.aspect * 0.95 * fit.width, 60))
                .offset(y: 8)
            FigureView(kind: kind, layers: layers)
                .frame(height: h)
                .scaleEffect(x: fit.width, y: 1, anchor: .bottom)
                .frame(width: h * kind.aspect * fit.width)
        }
        .animation(.smooth, value: fit)
    }
}

/// Several looks standing together, people first and pets in front.
struct GroupFigure: View {
    let looks: [Look]
    let height: CGFloat

    var body: some View {
        HStack(alignment: .bottom, spacing: -height * 0.04) {
            ForEach(looks) { look in
                StandingFigure(kind: look.kind, layers: look.layers, height: height, solo: false, fit: look.fit)
            }
        }
    }
}
