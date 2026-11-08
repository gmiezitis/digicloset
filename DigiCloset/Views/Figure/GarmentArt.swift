import SwiftUI

/// A clean flat-lay silhouette for pieces added without a photo.
struct GarmentArt: View {
    let category: GarmentCategory
    let colorHex: String

    var body: some View {
        let color = Color(hex: colorHex)
        GarmentShape(category: category)
            .fill(
                LinearGradient(colors: [color.mix(with: .white, by: 0.22), color, color.mix(with: .black, by: 0.12)],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                style: FillStyle(eoFill: true)
            )
            .overlay(GarmentShape(category: category).stroke(Color.black.opacity(0.1), lineWidth: 0.8))
            .shadow(color: .black.opacity(0.14), radius: 10, y: 8)
            .aspectRatio(1, contentMode: .fit)
    }
}

struct GarmentShape: Shape {
    let category: GarmentCategory

    func path(in rect: CGRect) -> Path {
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * rect.width, y: rect.minY + y * rect.height) }
        func polygon(_ points: [(CGFloat, CGFloat)]) -> Path {
            var path = Path()
            path.addLines(points.map { p($0.0, $0.1) })
            path.closeSubpath()
            return path
        }

        switch category {
        case .top, .sweater:
            var path = Path()
            path.move(to: p(0.36, 0.1))
            path.addQuadCurve(to: p(0.64, 0.1), control: p(0.5, 0.22))
            for pt in [p(0.88, 0.2), p(1.0, 0.44), p(0.83, 0.52), p(0.77, 0.4), p(0.77, 0.92), p(0.23, 0.92), p(0.23, 0.4), p(0.17, 0.52), p(0.0, 0.44), p(0.12, 0.2)] { path.addLine(to: pt) }
            path.closeSubpath()
            return path
        case .outerwear:
            var path = polygon([(0.38, 0.05), (0.5, 0.32), (0.62, 0.05), (0.86, 0.13), (0.98, 0.82), (0.86, 0.84), (0.79, 0.36), (0.79, 0.97), (0.21, 0.97), (0.21, 0.36), (0.14, 0.84), (0.02, 0.82), (0.14, 0.13)])
            path.move(to: p(0.5, 0.32))
            path.addLine(to: p(0.5, 0.97))
            return path
        case .dress:
            var path = Path()
            path.move(to: p(0.36, 0.04))
            path.addLine(to: p(0.41, 0.04))
            path.addQuadCurve(to: p(0.59, 0.04), control: p(0.5, 0.16))
            for pt in [p(0.64, 0.04), p(0.67, 0.34), p(0.62, 0.42), p(0.88, 0.96), p(0.12, 0.96), p(0.38, 0.42), p(0.33, 0.34)] { path.addLine(to: pt) }
            path.closeSubpath()
            return path
        case .bottom:
            return polygon([(0.26, 0.04), (0.74, 0.04), (0.83, 0.96), (0.58, 0.96), (0.5, 0.34), (0.42, 0.96), (0.17, 0.96)])
        case .skirt:
            var path = polygon([(0.3, 0.14), (0.7, 0.14), (0.9, 0.84), (0.1, 0.84)])
            path.addRect(CGRect(x: rect.minX + rect.width * 0.3, y: rect.minY + rect.height * 0.1, width: rect.width * 0.4, height: rect.height * 0.04))
            return path
        case .shoes:
            var path = Path()
            path.move(to: p(0.06, 0.42))
            path.addQuadCurve(to: p(0.44, 0.44), control: p(0.24, 0.36))
            path.addQuadCurve(to: p(0.92, 0.62), control: p(0.66, 0.6))
            path.addQuadCurve(to: p(0.94, 0.78), control: p(1.0, 0.68))
            path.addLine(to: p(0.06, 0.78))
            path.closeSubpath()
            return path
        case .hat:
            var path = Path(ellipseIn: CGRect(x: rect.minX + rect.width * 0.03, y: rect.minY + rect.height * 0.52, width: rect.width * 0.94, height: rect.height * 0.22))
            path.addRoundedRect(in: CGRect(x: rect.minX + rect.width * 0.3, y: rect.minY + rect.height * 0.28, width: rect.width * 0.4, height: rect.height * 0.34), cornerSize: CGSize(width: rect.width * 0.12, height: rect.width * 0.12))
            return path
        case .bag:
            var path = Path(roundedRect: CGRect(x: rect.minX + rect.width * 0.14, y: rect.minY + rect.height * 0.38, width: rect.width * 0.72, height: rect.height * 0.52), cornerRadius: rect.width * 0.08)
            path.addPath(Path(ellipseIn: CGRect(x: rect.minX + rect.width * 0.3, y: rect.minY + rect.height * 0.12, width: rect.width * 0.4, height: rect.height * 0.46))
                .strokedPath(StrokeStyle(lineWidth: rect.width * 0.05)))
            return path
        case .collar:
            var path = Path(ellipseIn: rect.insetBy(dx: rect.width * 0.12, dy: rect.height * 0.3))
            path.addPath(Path(ellipseIn: rect.insetBy(dx: rect.width * 0.2, dy: rect.height * 0.37)))
            path.addEllipse(in: CGRect(x: rect.midX - rect.width * 0.06, y: rect.minY + rect.height * 0.66, width: rect.width * 0.12, height: rect.width * 0.12))
            return path
        case .bandana:
            var path = Path()
            path.move(to: p(0.06, 0.22))
            path.addLine(to: p(0.94, 0.22))
            path.addQuadCurve(to: p(0.5, 0.86), control: p(0.8, 0.6))
            path.addQuadCurve(to: p(0.06, 0.22), control: p(0.2, 0.6))
            return path
        }
    }
}
