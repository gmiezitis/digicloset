import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import SwiftData
import UIKit
import UniformTypeIdentifiers

/// Renders a studio product shot for pieces that have no photo (the example
/// closet, or anything added by hand): a tailored silhouette in real-looking
/// fabric with seams, folds and soft light. Drawn on the device, so it adds
/// nothing to the app's size, and stored like an uploaded photo so figures
/// wear the fabric too.
enum GarmentStudio {
    struct Rendered: Sendable {
        let image: Data
        let thumbnail: Data
    }

    enum Material: Sendable { case cotton, linen, knit, cable, denim, wool, satin, leather, canvas, straw, velvet }

    enum Style: Sendable {
        case tee, shirt, knit, coat, jacket, slipDress, trousers, jeans, skirt
        case sneakers, loafers, flats, boater, tote, petSweater, collar, bandana
    }

    // MARK: Filling in missing photos

    /// Gives every piece without a photo a rendered one, a few at a time in the
    /// background. Safe to call often: pieces that already have one are skipped.
    @MainActor
    static func fillMissing(in context: ModelContext) async {
        guard !isFilling else { return }
        isFilling = true
        defer { isFilling = false }
        let all = (try? context.fetch(FetchDescriptor<Garment>())) ?? []
        for garment in all where garment.thumbnailData == nil {
            let (name, category, hex) = (garment.name, garment.category, garment.colorHex)
            guard let rendered = await render(name: name, category: category, colorHex: hex) else { continue }
            guard garment.thumbnailData == nil else { continue }
            garment.imageData = rendered.image
            garment.thumbnailData = rendered.thumbnail
        }
        try? context.save()
    }

    @MainActor private static var isFilling = false

    static func render(name: String, category: GarmentCategory, colorHex: String) async -> Rendered? {
        await Task.detached(priority: .utility) {
            draw(style: style(for: category, name: name), material: material(for: category, name: name), hex: colorHex)
        }.value
    }

    // MARK: Reading a name

    static func style(for category: GarmentCategory, name: String) -> Style {
        let n = name.lowercased()
        func has(_ words: String...) -> Bool { words.contains { n.contains($0) } }
        switch category {
        case .top: return has("shirt", "blouse") ? .shirt : has("knit", "sweater", "jumper", "cardigan") ? .knit : .tee
        case .outerwear: return has("jacket", "denim", "blazer") ? .jacket : .coat
        case .dress: return .slipDress
        case .bottom: return has("jean", "denim") ? .jeans : .trousers
        case .skirt: return .skirt
        case .shoes: return has("loafer", "oxford", "boot") ? .loafers : has("flat", "ballet", "mule") ? .flats : .sneakers
        case .hat: return .boater
        case .bag: return .tote
        case .sweater: return .petSweater
        case .collar: return .collar
        case .bandana: return .bandana
        }
    }

    static func material(for category: GarmentCategory, name: String) -> Material {
        let n = name.lowercased()
        func has(_ words: String...) -> Bool { words.contains { n.contains($0) } }
        if has("cable") { return .cable }
        if has("linen") { return .linen }
        if has("knit", "sweater", "jumper", "cardigan", "cashmere") { return .knit }
        if has("jean", "denim") { return .denim }
        if has("silk", "satin", "slip", "rain") { return .satin }
        if has("velvet") { return .velvet }
        if has("leather", "loafer", "boot") { return .leather }
        if has("straw", "woven", "raffia") { return .straw }
        if has("wool", "coat", "tweed") { return .wool }
        if has("sneaker", "canvas", "tote") { return .canvas }
        switch category {
        case .sweater: return .knit
        case .shoes, .collar, .bag: return .leather
        case .hat: return .wool
        case .bottom: return .canvas
        default: return .cotton
        }
    }

    // MARK: Drawing

    private static let size = 900
    /// Works directly on sRGB values (no linear conversion), so the garment's
    /// colour comes out exactly as picked and the shading reads like a photo edit.
    private static let context = CIContext(options: [.cacheIntermediates: false, .workingColorSpace: NSNull()])

    /// A garment drawn in unit coordinates (0…1, y down).
    private struct Art {
        var body = CGMutablePath()
        var extras: [CGPath] = []         // merged into the body with a true union, so overlaps never cut holes
        var metal: [CGPath] = []          // buckles and rings
        var evenOdd = false
        var seams = CGMutablePath()      // crisp seam lines
        var stitches = CGMutablePath()   // dashed top-stitching
        var folds: [(CGMutablePath, Bool)] = [] // soft creases; true = shadow, false = highlight
        var bands = CGMutablePath()      // rib bands (cuffs, hems)
        var buttons: [CGPoint] = []
        var trims: [(CGPath, Double)] = [] // areas shaded darker (soles, ribbons), with amount
        var dots = false
    }

    private nonisolated static func draw(style: Style, material: Material, hex: String) -> Rendered? {
        let art = makeArt(style)
        let W = CGFloat(size), H = CGFloat(size)
        let toCanvas = CGAffineTransform(a: W, b: 0, c: 0, d: -H, tx: 0, ty: H)
        func canvas(_ p: CGPath) -> CGPath { p.copy(using: [toCanvas]) ?? p }
        var unit: CGPath = art.body
        for extra in art.extras { unit = unit.isEmpty ? extra : unit.union(extra) }
        let body = canvas(unit)

        // Shape mask, used for soft volume shading.
        guard let maskCtx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        maskCtx.addPath(body)
        maskCtx.setFillColor(gray: 1, alpha: 1)
        maskCtx.fillPath(using: art.evenOdd ? .evenOdd : .winding)
        guard let maskImage = maskCtx.makeImage() else { return nil }

        // Folds, drawn soft on mid-grey and blended in as light and shadow.
        guard let foldCtx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        foldCtx.setFillColor(gray: 0.5, alpha: 1)
        foldCtx.fill(CGRect(x: 0, y: 0, width: W, height: H))
        foldCtx.setLineCap(.round)
        for (path, shadow) in art.folds {
            foldCtx.addPath(canvas(path))
            foldCtx.setStrokeColor(gray: shadow ? 0.33 : 0.72, alpha: 1)
            foldCtx.setLineWidth(W * 0.022)
            foldCtx.strokePath()
        }
        guard let foldImage = foldCtx.makeImage() else { return nil }

        let c8 = ColorScience.rgb(hex)
        let rgb = (r: Double(c8.r) / 255, g: Double(c8.g) / 255, b: Double(c8.b) / 255)
        guard let fabric = fabricImage(r: rgb.r, g: rgb.g, b: rgb.b, material: material,
                                       mask: CIImage(cgImage: maskImage), folds: CIImage(cgImage: foldImage)) else { return nil }

        // Compose: fabric clipped to the silhouette, then trims, bands and seams on top.
        guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.saveGState()
        ctx.addPath(body)
        if art.evenOdd { ctx.clip(using: .evenOdd) } else { ctx.clip() }
        ctx.draw(fabric, in: CGRect(x: 0, y: 0, width: W, height: H))

        for (trim, amount) in art.trims {
            ctx.addPath(canvas(trim))
            ctx.setFillColor(gray: amount > 0 ? 0 : 1, alpha: abs(amount))
            ctx.fillPath()
        }
        if !art.bands.isEmpty {
            // Ribbing: fine vertical lines inside cuffs and hems.
            ctx.saveGState()
            ctx.addPath(canvas(art.bands))
            ctx.clip()
            ctx.setStrokeColor(gray: 0, alpha: 0.16)
            ctx.setLineWidth(2)
            for x in stride(from: CGFloat(0), to: W, by: 7) {
                ctx.move(to: CGPoint(x: x, y: 0)); ctx.addLine(to: CGPoint(x: x, y: H))
            }
            ctx.strokePath()
            ctx.restoreGState()
            ctx.addPath(canvas(art.bands))
            ctx.setStrokeColor(gray: 0, alpha: 0.18)
            ctx.setLineWidth(2)
            ctx.strokePath()
        }
        if art.dots {
            ctx.setFillColor(gray: 1, alpha: 0.75)
            for y in stride(from: CGFloat(30), to: H, by: 58) {
                for x in stride(from: CGFloat(Int(y / 58) % 2 == 0 ? 30 : 59), to: W, by: 58) {
                    ctx.fillEllipse(in: CGRect(x: x - 7, y: y - 7, width: 14, height: 14))
                }
            }
        }
        // Seams: a dark line with a faint highlight just below, like a real stitched edge.
        let seams = canvas(art.seams)
        ctx.addPath(seams.copy(using: [CGAffineTransform(translationX: 0, y: -1.6)]) ?? seams)
        ctx.setStrokeColor(gray: 1, alpha: 0.16)
        ctx.setLineWidth(2.2)
        ctx.strokePath()
        ctx.addPath(seams)
        ctx.setStrokeColor(gray: 0, alpha: 0.26)
        ctx.setLineWidth(2.2)
        ctx.setLineCap(.round)
        ctx.strokePath()
        if !art.stitches.isEmpty {
            ctx.addPath(canvas(art.stitches))
            if material == .denim {
                ctx.setStrokeColor(red: 0.86, green: 0.66, blue: 0.36, alpha: 0.9)
            } else {
                ctx.setStrokeColor(gray: 0, alpha: 0.22)
            }
            ctx.setLineWidth(1.8)
            ctx.setLineDash(phase: 0, lengths: [7, 5])
            ctx.strokePath()
            ctx.setLineDash(phase: 0, lengths: [])
        }
        for b in art.buttons {
            let c = CGPoint(x: b.x * W, y: H - b.y * H)
            let r = W * 0.014
            ctx.setFillColor(red: rgb.r * 0.62, green: rgb.g * 0.62, blue: rgb.b * 0.62, alpha: 1)
            ctx.fillEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
            ctx.setFillColor(gray: 1, alpha: 0.35)
            ctx.fillEllipse(in: CGRect(x: c.x - r * 0.55, y: c.y, width: r * 0.7, height: r * 0.55))
        }
        // A whisper of an outline keeps light pieces crisp against light backgrounds.
        ctx.addPath(body)
        ctx.setStrokeColor(gray: 0, alpha: 0.12)
        ctx.setLineWidth(3)
        ctx.strokePath()
        ctx.restoreGState()
        for piece in art.metal {
            let path = canvas(piece)
            ctx.saveGState()
            ctx.addPath(path)
            ctx.clip(using: .evenOdd)
            let box = path.boundingBoxOfPath
            let steel = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                                   colors: [CGColor(gray: 0.92, alpha: 1), CGColor(gray: 0.62, alpha: 1), CGColor(gray: 0.82, alpha: 1)] as CFArray,
                                   locations: [0, 0.55, 1])!
            ctx.drawLinearGradient(steel, start: CGPoint(x: box.minX, y: box.maxY), end: CGPoint(x: box.maxX, y: box.minY), options: [])
            ctx.restoreGState()
            ctx.addPath(path)
            ctx.setStrokeColor(gray: 0.35, alpha: 0.6)
            ctx.setLineWidth(1.5)
            ctx.strokePath()
        }

        guard let full = ctx.makeImage() else { return nil }
        let box = art.metal.reduce(body.boundingBoxOfPath) { $0.union(canvas($1).boundingBoxOfPath) }.insetBy(dx: -10, dy: -10).intersection(CGRect(x: 0, y: 0, width: W, height: H))
        let crop = CGRect(x: box.minX, y: H - box.maxY, width: box.width, height: box.height).integral
        guard let cropped = full.cropping(to: crop), let image = png(cropped),
              let thumb = png(scaled(cropped, maxPixel: 480) ?? cropped) else { return nil }
        return Rendered(image: image, thumbnail: thumb)
    }

    // MARK: Fabric

    /// Base colour with a woven/knitted surface, soft studio light from the top
    /// left, rounded volume towards the edges and the garment's folds.
    private nonisolated static func fabricImage(r: Double, g: Double, b: Double, material: Material,
                                                mask: CIImage, folds: CIImage) -> CGImage? {
        let extent = CGRect(x: 0, y: 0, width: size, height: size)
        let base = CIImage(color: CIColor(red: r, green: g, blue: b)).cropped(to: extent)
        var image = texture(material, extent: extent).applyingFilter("CISoftLightBlendMode", parameters: [kCIInputBackgroundImageKey: base])

        let softFolds = folds.clampedToExtent().applyingGaussianBlur(sigma: 14).cropped(to: extent)
        image = softFolds.applyingFilter("CISoftLightBlendMode", parameters: [kCIInputBackgroundImageKey: image])

        let light = CIFilter.linearGradient()
        light.point0 = CGPoint(x: 0, y: extent.height)
        light.point1 = CGPoint(x: extent.width, y: 0)
        light.color0 = CIColor(red: 1, green: 1, blue: 1)
        light.color1 = CIColor(red: 0.92, green: 0.92, blue: 0.92)
        if let gradient = light.outputImage?.cropped(to: extent) {
            image = gradient.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: image])
        }

        // Edges turn away from the light: darken where the blurred mask falls off.
        let volume = mask.clampedToExtent().applyingGaussianBlur(sigma: 26).cropped(to: extent)
            .applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 0.16, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: 0.16, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 0.16, w: 0),
                "inputBiasVector": CIVector(x: 0.86, y: 0.86, z: 0.86, w: 0),
            ])
        image = volume.applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: image])

        // Smooth materials catch a broad highlight.
        let sheen: Double = switch material {
        case .satin: 0.3
        case .leather: 0.22
        case .velvet: 0.16
        default: 0
        }
        if sheen > 0 {
            let glow = CIFilter.radialGradient()
            glow.center = CGPoint(x: extent.width * 0.4, y: extent.height * 0.6)
            glow.radius0 = 0
            glow.radius1 = Float(extent.width * 0.38)
            glow.color0 = CIColor(red: sheen, green: sheen, blue: sheen)
            glow.color1 = CIColor(red: 0, green: 0, blue: 0)
            if let highlight = glow.outputImage?
                .transformed(by: CGAffineTransform(translationX: -extent.width * 0.4, y: -extent.height * 0.6)
                    .concatenating(CGAffineTransform(scaleX: 0.55, y: 1.5))
                    .concatenating(CGAffineTransform(rotationAngle: -0.5))
                    .concatenating(CGAffineTransform(translationX: extent.width * 0.42, y: extent.height * 0.58)))
                .cropped(to: extent) {
                image = highlight.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: image])
            }
        }
        return context.createCGImage(image, from: extent, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
    }

    /// A grey surface centred on 50%, soft-light blended onto the colour.
    private nonisolated static func texture(_ material: Material, extent: CGRect) -> CIImage {
        // Random noise has random alpha; flatten it onto black so values stay in 0…1,
        // then stretch it back to an even 0…1 spread around 50%.
        let noise = CIFilter.randomGenerator().outputImage!
            .composited(over: CIImage(color: CIColor(red: 0, green: 0, blue: 0)))
            .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0])
            .applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 2, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: 2, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 2, w: 0),
            ])
            .applyingFilter("CIColorClamp")
        func amp(_ image: CIImage, _ k: Double) -> CIImage {
            image.applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: k, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: k, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: k, w: 0),
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0),
                "inputBiasVector": CIVector(x: 0.5 - 0.5 * k, y: 0.5 - 0.5 * k, z: 0.5 - 0.5 * k, w: 1),
            ]).cropped(to: extent)
        }
        func streaks(x: CGFloat, y: CGFloat) -> CIImage { noise.transformed(by: CGAffineTransform(scaleX: x, y: y)) }
        func stripes(width: Double, angle: CGFloat, sharp: Double = 0.4) -> CIImage {
            let f = CIFilter.stripesGenerator()
            f.width = Float(width)
            f.sharpness = Float(sharp)
            f.color0 = CIColor(red: 0, green: 0, blue: 0)
            f.color1 = CIColor(red: 1, green: 1, blue: 1)
            return f.outputImage!.transformed(by: CGAffineTransform(rotationAngle: angle))
        }
        func mix(_ a: CIImage, _ b: CIImage) -> CIImage {
            let half = { (i: CIImage) in i.applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 0.5, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 0.5, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 0.5, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1)]) }
            return half(a).applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: half(b)]).cropped(to: extent)
        }
        let fine = amp(noise.applyingGaussianBlur(sigma: 0.6), 0.12)
        switch material {
        case .cotton:
            return mix(fine, amp(noise.applyingGaussianBlur(sigma: 2), 0.25))
        case .linen:
            return mix(amp(streaks(x: 16, y: 1).applyingGaussianBlur(sigma: 0.7), 0.42),
                       amp(streaks(x: 1, y: 16).applyingGaussianBlur(sigma: 0.7), 0.34))
        case .knit:
            return mix(amp(stripes(width: 3.5, angle: 0, sharp: 0.2).applyingGaussianBlur(sigma: 1.1), 0.2), fine)
        case .cable:
            return mix(amp(stripes(width: 7, angle: 0, sharp: 0.15).applyingGaussianBlur(sigma: 2), 0.32),
                       amp(stripes(width: 9, angle: .pi / 4, sharp: 0.1).applyingGaussianBlur(sigma: 3), 0.18))
        case .denim:
            return mix(amp(stripes(width: 2, angle: .pi / 4.5, sharp: 0.5).applyingGaussianBlur(sigma: 0.5), 0.2),
                       amp(streaks(x: 1, y: 30).applyingGaussianBlur(sigma: 1.2), 0.55))
        case .wool:
            return mix(amp(noise.applyingGaussianBlur(sigma: 1.6), 0.55), fine)
        case .satin:
            return amp(noise.applyingGaussianBlur(sigma: 1), 0.05)
        case .leather:
            return mix(amp(noise.applyingGaussianBlur(sigma: 1.1), 0.4), amp(noise.applyingGaussianBlur(sigma: 4), 0.3))
        case .canvas:
            return mix(amp(stripes(width: 1.5, angle: 0).applyingGaussianBlur(sigma: 0.5), 0.16),
                       amp(stripes(width: 1.5, angle: .pi / 2).applyingGaussianBlur(sigma: 0.5), 0.16))
        case .straw:
            let weave = CIFilter.checkerboardGenerator()
            weave.width = 11
            weave.color0 = CIColor(red: 0.3, green: 0.3, blue: 0.3)
            weave.color1 = CIColor(red: 0.7, green: 0.7, blue: 0.7)
            return mix(amp(weave.outputImage!.transformed(by: CGAffineTransform(rotationAngle: .pi / 4)).applyingGaussianBlur(sigma: 1.6), 0.9),
                       amp(streaks(x: 12, y: 1), 0.3))
        case .velvet:
            return amp(noise.applyingGaussianBlur(sigma: 3), 0.35)
        }
    }

    // MARK: Shapes

    private nonisolated static func makeArt(_ style: Style) -> Art {
        var a = Art()
        func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: y) }
        func line(_ path: CGMutablePath, _ pts: [(CGFloat, CGFloat)]) {
            path.move(to: P(pts[0].0, pts[0].1))
            for p in pts.dropFirst() { path.addLine(to: P(p.0, p.1)) }
        }
        func curve(_ path: CGMutablePath, _ from: (CGFloat, CGFloat), _ ctrl: (CGFloat, CGFloat), _ to: (CGFloat, CGFloat)) {
            path.move(to: P(from.0, from.1))
            path.addQuadCurve(to: P(to.0, to.1), control: P(ctrl.0, ctrl.1))
        }
        func fold(_ from: (CGFloat, CGFloat), _ ctrl: (CGFloat, CGFloat), _ to: (CGFloat, CGFloat), shadow: Bool = true) {
            let p = CGMutablePath()
            curve(p, from, ctrl, to)
            a.folds.append((p, shadow))
        }
        func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x, y: y, width: w, height: h) }

        switch style {
        case .tee:
            let b = a.body
            b.move(to: P(0.38, 0.12))
            b.addQuadCurve(to: P(0.62, 0.12), control: P(0.5, 0.22))
            for p in [P(0.80, 0.16), P(0.97, 0.34), P(0.86, 0.44), P(0.76, 0.35), P(0.77, 0.9)] { b.addLine(to: p) }
            b.addQuadCurve(to: P(0.23, 0.9), control: P(0.5, 0.915))
            for p in [P(0.24, 0.35), P(0.14, 0.44), P(0.03, 0.34), P(0.2, 0.16)] { b.addLine(to: p) }
            b.closeSubpath()
            curve(a.seams, (0.4, 0.135), (0.5, 0.245), (0.6, 0.135))
            line(a.seams, [(0.8, 0.165), (0.76, 0.35)])
            line(a.seams, [(0.2, 0.165), (0.24, 0.35)])
            curve(a.stitches, (0.235, 0.865), (0.5, 0.885), (0.765, 0.865))
            line(a.stitches, [(0.88, 0.415), (0.95, 0.345)])
            line(a.stitches, [(0.12, 0.415), (0.05, 0.345)])
            fold((0.3, 0.42), (0.36, 0.6), (0.33, 0.82))
            fold((0.68, 0.45), (0.62, 0.62), (0.66, 0.8))
            fold((0.45, 0.3), (0.5, 0.5), (0.55, 0.75), shadow: false)
        case .shirt, .knit:
            let b = a.body
            if style == .shirt {
                b.move(to: P(0.39, 0.1)); b.addLine(to: P(0.5, 0.2)); b.addLine(to: P(0.61, 0.1))
            } else {
                b.move(to: P(0.38, 0.1))
                b.addQuadCurve(to: P(0.62, 0.1), control: P(0.5, 0.2))
            }
            for p in [P(0.8, 0.14), P(0.93, 0.3), P(0.99, 0.8), P(0.88, 0.82), P(0.81, 0.4), P(0.78, 0.92)] { b.addLine(to: p) }
            b.addQuadCurve(to: P(0.22, 0.92), control: P(0.5, 0.94))
            for p in [P(0.19, 0.4), P(0.12, 0.82), P(0.01, 0.8), P(0.07, 0.3), P(0.2, 0.14)] { b.addLine(to: p) }
            b.closeSubpath()
            line(a.seams, [(0.8, 0.145), (0.81, 0.4)])
            line(a.seams, [(0.2, 0.145), (0.19, 0.4)])
            if style == .shirt {
                // Collar points and button placket.
                let collar = CGMutablePath()
                line(collar, [(0.39, 0.1), (0.36, 0.18), (0.47, 0.25), (0.5, 0.2), (0.53, 0.25), (0.64, 0.18), (0.61, 0.1)])
                a.seams.addPath(collar)
                a.trims.append((collar, 0.06))
                line(a.seams, [(0.5, 0.25), (0.5, 0.93)])
                line(a.stitches, [(0.53, 0.25), (0.53, 0.92)])
                a.buttons = [P(0.515, 0.33), P(0.515, 0.45), P(0.515, 0.57), P(0.515, 0.69), P(0.515, 0.81)]
                line(a.seams, [(0.885, 0.73), (0.98, 0.715)])
                line(a.seams, [(0.115, 0.73), (0.02, 0.715)])
            } else {
                curve(a.seams, (0.4, 0.12), (0.5, 0.235), (0.6, 0.12))
                let bands = a.bands
                bands.addPath(CGPath(rect: rect(0.22, 0.85, 0.56, 0.08), transform: nil))
                line(bands, [(0.885, 0.73), (0.985, 0.715), (0.99, 0.8), (0.88, 0.82)])
                bands.closeSubpath()
                line(bands, [(0.115, 0.73), (0.015, 0.715), (0.01, 0.8), (0.12, 0.82)])
                bands.closeSubpath()
            }
            fold((0.86, 0.42), (0.9, 0.58), (0.93, 0.7))
            fold((0.14, 0.42), (0.1, 0.58), (0.07, 0.7))
            fold((0.32, 0.45), (0.37, 0.65), (0.33, 0.85))
            fold((0.67, 0.45), (0.62, 0.65), (0.66, 0.85))
            fold((0.42, 0.3), (0.45, 0.6), (0.4, 0.85), shadow: false)
        case .coat, .jacket:
            let hem: CGFloat = style == .coat ? 0.97 : 0.76
            let cuff: CGFloat = style == .coat ? 0.8 : 0.74
            let b = a.body
            for (i, p) in [P(0.4, 0.06), P(0.5, 0.3), P(0.6, 0.06), P(0.82, 0.11), P(0.94, 0.28), P(0.99, cuff),
                           P(0.88, cuff + 0.02), P(0.82, 0.38), P(0.83, hem), P(0.17, hem), P(0.18, 0.38),
                           P(0.12, cuff + 0.02), P(0.01, cuff), P(0.06, 0.28), P(0.18, 0.11)].enumerated() {
                if i == 0 { b.move(to: p) } else { b.addLine(to: p) }
            }
            b.closeSubpath()
            let lapels = CGMutablePath()
            line(lapels, [(0.4, 0.06), (0.34, 0.2), (0.5, 0.4)])
            line(lapels, [(0.6, 0.06), (0.66, 0.2), (0.5, 0.4)])
            a.seams.addPath(lapels)
            let lapelArea = CGMutablePath()
            line(lapelArea, [(0.4, 0.06), (0.34, 0.2), (0.5, 0.4), (0.66, 0.2), (0.6, 0.06), (0.5, 0.3)])
            lapelArea.closeSubpath()
            a.trims.append((lapelArea, -0.06))
            line(a.seams, [(0.5, 0.4), (0.5, hem)])
            line(a.seams, [(0.82, 0.115), (0.82, 0.38)])
            line(a.seams, [(0.18, 0.115), (0.18, 0.38)])
            line(a.seams, [(0.89, cuff - 0.06), (0.985, cuff - 0.075)])
            line(a.seams, [(0.11, cuff - 0.06), (0.015, cuff - 0.075)])
            if style == .coat {
                a.buttons = [P(0.44, 0.47), P(0.56, 0.47), P(0.44, 0.6), P(0.56, 0.6)]
                line(a.seams, [(0.24, 0.66), (0.4, 0.66)])
                line(a.seams, [(0.6, 0.66), (0.76, 0.66)])
            } else {
                a.buttons = [P(0.53, 0.46), P(0.53, 0.56), P(0.53, 0.66)]
                a.seams.addPath(CGPath(rect: rect(0.27, 0.3, 0.14, 0.1), transform: nil))
                a.seams.addPath(CGPath(rect: rect(0.59, 0.3, 0.14, 0.1), transform: nil))
                line(a.stitches, [(0.18, 0.7), (0.82, 0.7)])
                line(a.stitches, [(0.47, 0.42), (0.47, hem - 0.01)])
            }
            fold((0.3, 0.45), (0.34, 0.7), (0.3, hem - 0.04))
            fold((0.7, 0.45), (0.66, 0.7), (0.7, hem - 0.04))
            fold((0.9, 0.35), (0.93, 0.5), (0.95, cuff - 0.1))
            fold((0.1, 0.35), (0.07, 0.5), (0.05, cuff - 0.1))
        case .slipDress:
            let b = a.body
            b.move(to: P(0.36, 0.16))
            b.addQuadCurve(to: P(0.64, 0.16), control: P(0.5, 0.25))
            b.addLine(to: P(0.67, 0.4))
            b.addQuadCurve(to: P(0.9, 0.96), control: P(0.74, 0.7))
            b.addQuadCurve(to: P(0.1, 0.96), control: P(0.5, 0.99))
            b.addQuadCurve(to: P(0.33, 0.4), control: P(0.26, 0.7))
            b.closeSubpath()
            // Straps.
            for x in [CGFloat(0.375), 0.615] { a.extras.append(CGPath(rect: rect(x, 0.03, 0.012, 0.14), transform: nil)) }
            curve(a.seams, (0.37, 0.175), (0.5, 0.26), (0.63, 0.175))
            curve(a.stitches, (0.12, 0.94), (0.5, 0.97), (0.88, 0.94))
            fold((0.42, 0.42), (0.36, 0.7), (0.24, 0.94))
            fold((0.58, 0.42), (0.64, 0.7), (0.76, 0.94))
            fold((0.5, 0.45), (0.5, 0.7), (0.48, 0.95), shadow: false)
            fold((0.38, 0.5), (0.3, 0.75), (0.16, 0.92), shadow: false)
            fold((0.62, 0.5), (0.7, 0.75), (0.84, 0.92), shadow: false)
        case .trousers, .jeans:
            let jeans = style == .jeans
            let b = a.body
            line(b, jeans ? [(0.28, 0.04), (0.72, 0.04), (0.77, 0.97), (0.55, 0.97), (0.5, 0.32), (0.45, 0.97), (0.23, 0.97)]
                          : [(0.27, 0.04), (0.73, 0.04), (0.86, 0.97), (0.56, 0.97), (0.5, 0.33), (0.44, 0.97), (0.14, 0.97)])
            b.closeSubpath()
            line(a.seams, [(0.27, 0.1), (0.73, 0.1)])
            curve(a.seams, (0.5, 0.1), (0.5, 0.26), (0.46, 0.28))
            if jeans {
                curve(a.seams, (0.3, 0.1), (0.36, 0.2), (0.42, 0.1))
                curve(a.seams, (0.7, 0.1), (0.64, 0.2), (0.58, 0.1))
                for x in [CGFloat(0.31), 0.45, 0.55, 0.69] { a.seams.addPath(CGPath(rect: rect(x - 0.008, 0.04, 0.016, 0.065), transform: nil)) }
                line(a.stitches, [(0.28, 0.105), (0.72, 0.105)])
                line(a.stitches, [(0.285, 0.12), (0.235, 0.95)])
                line(a.stitches, [(0.715, 0.12), (0.765, 0.95)])
                line(a.stitches, [(0.235, 0.94), (0.445, 0.94)])
                line(a.stitches, [(0.555, 0.94), (0.765, 0.94)])
                curve(a.stitches, (0.52, 0.1), (0.52, 0.25), (0.47, 0.27))
            } else {
                line(a.seams, [(0.31, 0.1), (0.36, 0.22)])
                line(a.seams, [(0.69, 0.1), (0.64, 0.22)])
                fold((0.38, 0.12), (0.34, 0.55), (0.29, 0.95), shadow: false)
                fold((0.62, 0.12), (0.66, 0.55), (0.71, 0.95), shadow: false)
            }
            fold((0.45, 0.35), (0.46, 0.5), (0.42, 0.62))
            fold((0.55, 0.35), (0.54, 0.5), (0.58, 0.62))
            fold((0.3, 0.6), (0.32, 0.65), (0.4, 0.66))
            fold((0.7, 0.6), (0.68, 0.65), (0.6, 0.66))
        case .skirt:
            let b = a.body
            line(b, [(0.31, 0.08), (0.69, 0.08), (0.7, 0.14), (0.92, 0.93)])
            b.addQuadCurve(to: P(0.08, 0.93), control: P(0.5, 0.97))
            b.addLine(to: P(0.3, 0.14))
            b.closeSubpath()
            line(a.seams, [(0.3, 0.14), (0.7, 0.14)])
            curve(a.stitches, (0.1, 0.9), (0.5, 0.94), (0.9, 0.9))
            for (x0, x1, s) in [(0.4, 0.28, true), (0.5, 0.5, false), (0.6, 0.72, true), (0.36, 0.18, false), (0.64, 0.82, false)] {
                fold((x0, 0.16), ((x0 + x1) / 2, 0.55), (x1, 0.92), shadow: s)
            }
        case .sneakers, .loafers, .flats:
            // A pair from above, as shoes are usually photographed, toes slightly apart.
            for (cx, angle, mirror) in [(CGFloat(0.31), CGFloat(-0.12), true), (CGFloat(0.69), CGFloat(0.12), false)] {
                var t = CGAffineTransform(translationX: cx, y: 0.5).rotated(by: angle)
                if mirror { t = t.scaledBy(x: -1, y: 1) }
                let shoe = CGMutablePath()
                shoe.move(to: P(0, 0.41))
                shoe.addQuadCurve(to: P(0.105, 0.25), control: P(0.105, 0.41))
                shoe.addQuadCurve(to: P(0.135, -0.16), control: P(0.125, 0.05))
                shoe.addQuadCurve(to: P(0, -0.41), control: P(0.14, -0.41))
                shoe.addQuadCurve(to: P(-0.125, -0.16), control: P(-0.125, -0.41))
                shoe.addQuadCurve(to: P(-0.095, 0.25), control: P(-0.115, 0.05))
                shoe.addQuadCurve(to: P(0, 0.41), control: P(-0.095, 0.41))
                shoe.closeSubpath()
                a.extras.append(shoe.copy(using: [t]) ?? shoe)

                let openTop: CGFloat = style == .flats ? -0.06 : style == .loafers ? 0.08 : 0.12
                let opening = CGPath(ellipseIn: CGRect(x: -0.075, y: openTop, width: 0.15, height: 0.36 - openTop), transform: nil)
                let inside = CGMutablePath(); inside.addPath(opening, transform: t)
                a.trims.append((inside, 0.42))
                a.seams.addPath(opening, transform: t)
                let detail = CGMutablePath()
                switch style {
                case .sneakers:
                    for y in [CGFloat(-0.12), -0.04, 0.04] { detail.move(to: P(-0.05, y)); detail.addLine(to: P(0.05, y + 0.012)) }
                    a.seams.addPath(detail, transform: t)
                    let toe = CGMutablePath(); toe.move(to: P(-0.11, -0.22)); toe.addQuadCurve(to: P(0.115, -0.22), control: P(0, -0.3))
                    a.stitches.addPath(toe, transform: t)
                    let rim = CGMutablePath(); rim.addPath(shoe); a.stitches.addPath(rim, transform: t.scaledBy(x: 0.9, y: 0.95))
                case .loafers:
                    detail.move(to: P(-0.085, 0.02)); detail.addQuadCurve(to: P(0.085, 0.02), control: P(0, -0.36))
                    a.stitches.addPath(detail, transform: t)
                    let strap = CGMutablePath(); strap.addRect(CGRect(x: -0.09, y: 0.01, width: 0.18, height: 0.045))
                    a.trims.append((strap.copy(using: [t]) ?? strap, 0.12))
                    a.seams.addPath(strap, transform: t)
                default:
                    detail.addEllipse(in: CGRect(x: -0.035, y: -0.1, width: 0.07, height: 0.035))
                    a.seams.addPath(detail, transform: t)
                    a.trims.append((detail.copy(using: [t]) ?? detail, 0.2))
                }
            }
        case .boater:
            a.extras = [CGPath(ellipseIn: rect(0.03, 0.56, 0.94, 0.22), transform: nil),
                        CGPath(roundedRect: rect(0.27, 0.24, 0.46, 0.42), cornerWidth: 0.1, cornerHeight: 0.1, transform: nil)]
            let ribbon = CGMutablePath()
            ribbon.addRect(rect(0.27, 0.53, 0.46, 0.08))
            a.trims.append((ribbon, 0.45))
            line(a.seams, [(0.27, 0.53), (0.73, 0.53)])
            line(a.seams, [(0.27, 0.61), (0.73, 0.61)])
            curve(a.seams, (0.06, 0.67), (0.5, 0.74), (0.94, 0.67))
        case .tote:
            let b = a.body
            line(b, [(0.14, 0.38), (0.86, 0.38), (0.81, 0.94), (0.19, 0.94)])
            b.closeSubpath()
            for x in [CGFloat(0.26), 0.56] {
                let handle = CGMutablePath()
                handle.move(to: P(x, 0.39))
                handle.addQuadCurve(to: P(x + 0.18, 0.39), control: P(x + 0.09, 0.02))
                a.extras.append(handle.copy(strokingWithWidth: 0.035, lineCap: .round, lineJoin: .round, miterLimit: 4))
            }
            line(a.seams, [(0.14, 0.44), (0.86, 0.44)])
            line(a.stitches, [(0.15, 0.465), (0.85, 0.465)])
            fold((0.32, 0.5), (0.3, 0.7), (0.34, 0.9))
            fold((0.68, 0.5), (0.7, 0.7), (0.66, 0.9))
        case .petSweater:
            a.body.addPath(CGPath(roundedRect: rect(0.16, 0.08, 0.68, 0.86), cornerWidth: 0.26, cornerHeight: 0.3, transform: nil))
            a.bands.addPath(CGPath(roundedRect: rect(0.24, 0.08, 0.52, 0.12), cornerWidth: 0.06, cornerHeight: 0.06, transform: nil))
            line(a.seams, [(0.5, 0.2), (0.5, 0.92)])
            fold((0.3, 0.3), (0.26, 0.6), (0.3, 0.88))
            fold((0.7, 0.3), (0.74, 0.6), (0.7, 0.88))
        case .collar:
            a.evenOdd = true
            a.body.addEllipse(in: rect(0.06, 0.26, 0.88, 0.46))
            a.body.addEllipse(in: rect(0.17, 0.37, 0.66, 0.24))
            a.stitches.addEllipse(in: rect(0.095, 0.3, 0.81, 0.38))
            a.stitches.addEllipse(in: rect(0.14, 0.34, 0.72, 0.3))
            let buckle = CGMutablePath()
            buckle.addPath(CGPath(roundedRect: rect(0.78, 0.4, 0.14, 0.18), cornerWidth: 0.025, cornerHeight: 0.025, transform: nil))
            buckle.addPath(CGPath(roundedRect: rect(0.805, 0.43, 0.09, 0.12), cornerWidth: 0.015, cornerHeight: 0.015, transform: nil))
            let ring = CGMutablePath()
            ring.addEllipse(in: rect(0.44, 0.68, 0.12, 0.12))
            ring.addEllipse(in: rect(0.465, 0.705, 0.07, 0.07))
            a.metal = [buckle, ring]
        case .bandana:
            let b = a.body
            b.move(to: P(0.04, 0.2))
            b.addLine(to: P(0.96, 0.2))
            b.addQuadCurve(to: P(0.5, 0.92), control: P(0.8, 0.62))
            b.addQuadCurve(to: P(0.04, 0.2), control: P(0.2, 0.62))
            b.closeSubpath()
            line(a.seams, [(0.06, 0.26), (0.94, 0.26)])
            curve(a.stitches, (0.08, 0.25), (0.5, 0.25), (0.92, 0.25))
            fold((0.3, 0.3), (0.38, 0.55), (0.48, 0.84))
            fold((0.7, 0.3), (0.62, 0.55), (0.52, 0.84), shadow: false)
            a.dots = true
        }
        return a
    }

    // MARK: Encoding

    private nonisolated static func scaled(_ image: CGImage, maxPixel: Int) -> CGImage? {
        let scale = min(1, Double(maxPixel) / Double(max(image.width, image.height)))
        let w = max(1, Int(Double(image.width) * scale)), h = max(1, Int(Double(image.height) * scale))
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage()
    }

    private nonisolated static func png(_ image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, nil)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }
}
