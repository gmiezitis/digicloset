import SwiftUI
import UIKit

/// Clean up a cutout by hand: tap objects in the photo to keep or drop them,
/// or paint with your finger to erase stray bits and bring back missed edges.
struct CutoutEditorView: View {
    let source: CutoutService.Source
    let forPet: Bool
    var onDone: (CutoutService.Output) -> Void

    @Environment(\.dismiss) private var dismiss

    enum Tool: String, CaseIterable, Identifiable {
        case pick, erase, restore
        var id: String { rawValue }
        var title: String {
            switch self {
            case .pick: "Pick"
            case .erase: "Erase"
            case .restore: "Restore"
            }
        }
        var symbol: String {
            switch self {
            case .pick: "hand.tap"
            case .erase: "eraser"
            case .restore: "paintbrush.pointed"
            }
        }
        var hint: String {
            switch self {
            case .pick: "Tap anything in the photo to keep or remove it"
            case .erase: "Paint over anything that isn't the garment"
            case .restore: "Paint to bring back parts of the garment"
            }
        }
    }

    @State private var tool: Tool = .pick
    @State private var photo: UIImage?
    @State private var canvas: MaskCanvas?
    @State private var maskImage: UIImage?
    @State private var objectsImage: UIImage?
    @State private var chosen: [Int] = []
    @State private var stroke: [CGPoint] = []
    @State private var brush: CGFloat = 30
    @State private var working = false
    @State private var note: String?
    @State private var revision = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                stage
                controls
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Clean up")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.black, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.tint(.white) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: finish).fontWeight(.semibold).tint(.white).disabled(working || canvas == nil)
                }
            }
        }
        // Dark only inside the editor; preferredColorScheme would leak to the screen underneath.
        .environment(\.colorScheme, .dark)
        .task { await load() }
        .sensoryFeedback(.selection, trigger: tool)
        .sensoryFeedback(.impact(weight: .light), trigger: revision)
    }

    // MARK: Stage

    private var stage: some View {
        GeometryReader { geo in
            if let photo {
                let rect = fitted(photo.size, in: CGRect(origin: .zero, size: geo.size).insetBy(dx: 16, dy: 16))
                ZStack {
                    Image(uiImage: photo).resizable().opacity(0.22)
                    if let maskImage {
                        Image(uiImage: photo).resizable()
                            .mask { Image(uiImage: maskImage).resizable().luminanceToAlpha() }
                            .shadow(color: .white.opacity(0.35), radius: 6)
                    }
                    if tool == .pick, let objectsImage {
                        Image(uiImage: objectsImage).resizable().interpolation(.medium).allowsHitTesting(false)
                    }
                    Canvas { ctx, _ in
                        guard !stroke.isEmpty else { return }
                        var path = Path()
                        path.addLines(stroke.map { CGPoint(x: $0.x - rect.minX, y: $0.y - rect.minY) })
                        if stroke.count == 1 { path.addEllipse(in: CGRect(x: stroke[0].x - rect.minX - 0.5, y: stroke[0].y - rect.minY - 0.5, width: 1, height: 1)) }
                        let color: Color = tool == .erase ? Color(hex: "FF5A5F").opacity(0.55) : Color.white.opacity(0.55)
                        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: brush, lineCap: .round, lineJoin: .round))
                    }
                    .allowsHitTesting(false)
                }
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .overlay { if working { ProgressView().tint(.white).controlSize(.large) } }
                .contentShape(Rectangle())
                .gesture(drag(in: rect))
                .animation(.smooth(duration: 0.25), value: revision)
            } else {
                ProgressView().tint(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private var controls: some View {
        VStack(spacing: 14) {
            Text(note ?? tool.hint)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.7))
                .contentTransition(.opacity)
                .animation(.smooth, value: note)
            if tool != .pick {
                HStack(spacing: 12) {
                    Circle().fill(.white.opacity(0.8)).frame(width: 8, height: 8)
                    Slider(value: $brush, in: 10...80).tint(.white)
                    Circle().fill(.white.opacity(0.8)).frame(width: 22, height: 22)
                }
                .padding(.horizontal, 28)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            HStack(spacing: 10) {
                ForEach(tools) { t in
                    Button { withAnimation(.smooth(duration: 0.25)) { tool = t; note = nil } } label: {
                        VStack(spacing: 5) {
                            Image(systemName: t.symbol).font(.system(size: 18, weight: .medium))
                            Text(t.title).font(.system(size: 11, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(tool == t ? Color.white : Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(tool == t ? Color.black : Color.white)
                    }
                    .buttonStyle(PressableStyle())
                }
                Button(action: undo) {
                    VStack(spacing: 5) {
                        Image(systemName: "arrow.uturn.backward").font(.system(size: 18, weight: .medium))
                        Text("Undo").font(.system(size: 11, weight: .semibold))
                    }
                    .frame(width: 64)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(.white.opacity(canvas?.canUndo == true ? 1 : 0.35))
                }
                .buttonStyle(PressableStyle())
                .disabled(canvas?.canUndo != true)
            }
            .padding(.horizontal, 16)
        }
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    private var tools: [Tool] { source.objects == nil ? [.erase, .restore] : Tool.allCases }

    // MARK: Gestures

    private func drag(in rect: CGRect) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard tool != .pick, !working else { return }
                stroke.append(value.location)
            }
            .onEnded { value in
                guard !working else { return }
                if tool == .pick {
                    if hypot(value.translation.width, value.translation.height) < 12 { pick(at: value.location, in: rect) }
                } else {
                    commitStroke(in: rect)
                }
            }
    }

    private func imagePoint(_ p: CGPoint, in rect: CGRect, canvas: MaskCanvas) -> CGPoint {
        CGPoint(x: (p.x - rect.minX) / rect.width * CGFloat(canvas.width),
                y: (p.y - rect.minY) / rect.height * CGFloat(canvas.height))
    }

    private func commitStroke(in rect: CGRect) {
        defer { stroke = [] }
        guard let canvas, !stroke.isEmpty else { return }
        let points = stroke.map { imagePoint($0, in: rect, canvas: canvas) }
        canvas.paint(points, width: brush * CGFloat(canvas.width) / rect.width, keep: tool == .restore)
        refreshMask()
    }

    private func pick(at point: CGPoint, in rect: CGRect) {
        guard let map = source.objects, rect.contains(point) else { return }
        let object = map.object(atX: (point.x - rect.minX) / rect.width, y: (point.y - rect.minY) / rect.height)
        guard object != 0 else {
            note = "Nothing to pick there. Try Erase or Restore."
            return
        }
        var next = chosen
        if let i = next.firstIndex(of: object) { next.remove(at: i) } else { next.append(object) }
        guard !next.isEmpty else {
            note = "Keep at least one thing. Tap another object first."
            return
        }
        note = nil
        chosen = next.sorted()
        objectsImage = Self.objectsOverlay(map, chosen: chosen)
        working = true
        let keep = chosen
        Task {
            let data = await CutoutService.mask(for: source, keeping: keep)
            let mask = data.flatMap { UIImage(data: $0)?.cgImage } ?? Self.labelMask(map, chosen: keep)
            if let mask { canvas?.replace(with: mask) }
            refreshMask()
            working = false
        }
    }

    private func undo() {
        guard let canvas, canvas.undo() else { return }
        refreshMask()
    }

    private func refreshMask() {
        maskImage = canvas?.image().map(UIImage.init(cgImage:))
        revision += 1
    }

    // MARK: Load and finish

    private func load() async {
        guard let image = UIImage(data: source.photo), let cg = image.cgImage else { return }
        photo = image
        chosen = source.chosen
        let mask = source.mask.flatMap { UIImage(data: $0)?.cgImage }
        canvas = MaskCanvas(mask: mask, width: cg.width, height: cg.height)
        if let map = source.objects { objectsImage = Self.objectsOverlay(map, chosen: chosen) } else { tool = .erase }
        refreshMask()
    }

    private func finish() {
        guard let canvas, let mask = canvas.png() else { return }
        working = true
        let edited = CutoutService.Source(photo: source.photo, mask: mask, objects: source.objects, chosen: chosen)
        Task {
            if let output = try? await CutoutService.finish(edited, mask: mask, forPet: forPet) {
                onDone(output)
                dismiss()
            } else {
                note = "Nothing left to keep. Restore some of the garment."
            }
            working = false
        }
    }

    // MARK: Helpers

    private func fitted(_ size: CGSize, in box: CGRect) -> CGRect {
        let scale = min(box.width / size.width, box.height / size.height)
        let w = size.width * scale, h = size.height * scale
        return CGRect(x: box.midX - w / 2, y: box.midY - h / 2, width: w, height: h)
    }

    /// Objects you could add, tinted so they read as tappable.
    private static func objectsOverlay(_ map: CutoutService.ObjectMap, chosen: [Int]) -> UIImage? {
        var px = [UInt8](repeating: 0, count: map.width * map.height * 4)
        let keep = Set(chosen.map { UInt8($0) })
        for i in 0..<map.labels.count where map.labels[i] != 0 && !keep.contains(map.labels[i]) {
            // Premultiplied soft gold.
            px[i * 4] = 92; px[i * 4 + 1] = 76; px[i * 4 + 2] = 52; px[i * 4 + 3] = 115
        }
        return rgbaImage(px, width: map.width, height: map.height)
    }

    /// Rough mask from the object map, used when Vision can't re-run (simulator).
    private static func labelMask(_ map: CutoutService.ObjectMap, chosen: [Int]) -> CGImage? {
        let keep = Set(chosen.map { UInt8($0) })
        let bytes = map.labels.map { keep.contains($0) ? UInt8(255) : 0 }
        guard let provider = CGDataProvider(data: Data(bytes) as CFData) else { return nil }
        return CGImage(width: map.width, height: map.height, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: map.width,
                       space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }

    private static func rgbaImage(_ px: [UInt8], width: Int, height: Int) -> UIImage? {
        guard let provider = CGDataProvider(data: Data(px) as CFData),
              let cg = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                               space: CGColorSpace(name: CGColorSpace.sRGB)!,
                               bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                               provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// The editable mask: white keeps a pixel, black removes it. Keeps a short
/// history so every brush stroke or pick can be undone.
@MainActor
final class MaskCanvas {
    let width: Int
    let height: Int
    private var pixels: [UInt8]
    private var history: [[UInt8]] = []

    var canUndo: Bool { !history.isEmpty }

    init(mask: CGImage?, width: Int, height: Int) {
        self.width = width
        self.height = height
        pixels = [UInt8](repeating: mask == nil ? 255 : 0, count: width * height)
        if let mask { draw(mask) }
    }

    func replace(with mask: CGImage) {
        remember()
        draw(mask)
    }

    /// Paints a stroke given in image pixels (top-left origin).
    func paint(_ points: [CGPoint], width lineWidth: CGFloat, keep: Bool) {
        guard !points.isEmpty else { return }
        remember()
        let h = CGFloat(height)
        withContext { ctx in
            ctx.setStrokeColor(gray: keep ? 1 : 0, alpha: 1)
            ctx.setFillColor(gray: keep ? 1 : 0, alpha: 1)
            ctx.setLineWidth(lineWidth)
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            let flipped = points.map { CGPoint(x: $0.x, y: h - $0.y) }
            if flipped.count == 1 {
                let p = flipped[0]
                ctx.fillEllipse(in: CGRect(x: p.x - lineWidth / 2, y: p.y - lineWidth / 2, width: lineWidth, height: lineWidth))
            } else {
                ctx.addLines(between: flipped)
                ctx.strokePath()
            }
        }
    }

    func undo() -> Bool {
        guard let last = history.popLast() else { return false }
        pixels = last
        return true
    }

    func image() -> CGImage? {
        var image: CGImage?
        withContext { image = $0.makeImage() }
        return image
    }

    func png() -> Data? {
        guard let image = image() else { return nil }
        return UIImage(cgImage: image).pngData()
    }

    private func remember() {
        history.append(pixels)
        if history.count > 15 { history.removeFirst() }
    }

    private func draw(_ mask: CGImage) {
        withContext { ctx in
            ctx.interpolationQuality = .high
            ctx.setFillColor(gray: 0, alpha: 1)
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
            ctx.draw(mask, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    private func withContext(_ body: (CGContext) -> Void) {
        let (w, h) = (width, height)
        pixels.withUnsafeMutableBytes { raw in
            guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return }
            body(ctx)
        }
    }
}
