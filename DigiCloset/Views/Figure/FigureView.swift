import SwiftUI

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
        case .dress: [CGRect(x: 0, y: 0.165, width: 1, height: 0.32), CGRect(x: 0.14, y: 0.46, width: 0.72, height: 0.27)]
        case .bottom: [CGRect(x: 0.14, y: 0.44, width: 0.72, height: 0.495)]
        case .skirt: [CGRect(x: 0.14, y: 0.44, width: 0.72, height: 0.25)]
        case .shoes: [CGRect(x: 0, y: 0.935, width: 1, height: 0.065)]
        case .hat: [CGRect(x: 0, y: 0, width: 1, height: 0.062)]
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
                                let fade = min(0.5, 4 / max(height, 1))
                                // Soft top/bottom edges so pieces blend like fabric seams.
                                LinearGradient(stops: [
                                    .init(color: Color(hex: layer.colorHex).opacity(0), location: 0),
                                    .init(color: Color(hex: layer.colorHex), location: fade),
                                    .init(color: Color(hex: layer.colorHex), location: 1 - fade),
                                    .init(color: Color(hex: layer.colorHex).opacity(0), location: 1),
                                ], startPoint: .top, endPoint: .bottom)
                                .frame(width: zone.width * geo.size.width, height: height)
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

    var body: some View {
        let h = height * (solo ? kind.soloHeight : kind.relativeHeight)
        ZStack(alignment: .bottom) {
            FloorShadow()
                .frame(width: max(h * kind.aspect * 0.95, 60))
                .offset(y: 8)
            FigureView(kind: kind, layers: layers)
                .frame(height: h)
        }
    }
}

/// Several looks standing together, people first and pets in front.
struct GroupFigure: View {
    let looks: [Look]
    let height: CGFloat

    var body: some View {
        HStack(alignment: .bottom, spacing: -height * 0.04) {
            ForEach(looks) { look in
                StandingFigure(kind: look.kind, layers: look.layers, height: height, solo: false)
            }
        }
    }
}
