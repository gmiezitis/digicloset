import CoreGraphics
import CoreImage
import Foundation

/// Combines single-piece try-on results into one outfit on the device.
/// Each image shows the same base (mannequin or person) wearing one piece;
/// the piece is found as "what changed from the base", made solid, and
/// layered over the outfit so far. Instant, and needs no network.
enum TryOnCompositor {
    private static let context = CIContext(options: [.workingColorSpace: NSNull()])

    /// `human`: a top over a bottom gets a clean hem line. Pets: each piece is
    /// kept as its single biggest shape (sweater, collar, bandana).
    static func compose(base: CGImage, layers: [CGImage], human: Bool = true) -> CGImage? {
        let w = min(base.width, 864), h = Int((Double(w) * Double(base.height) / Double(base.width)).rounded())
        let rect = CGRect(x: 0, y: 0, width: w, height: h)
        func scaled(_ image: CGImage) -> CIImage {
            CIImage(cgImage: image).transformed(by: .init(scaleX: CGFloat(w) / CGFloat(image.width), y: CGFloat(h) / CGFloat(image.height)))
        }
        let baseCI = scaled(base)
        guard let baseSmall = pixels(base, mw, mh(w, h)) else { return nil }
        var current = baseCI
        for (index, layer) in layers.enumerated() {
            guard let small = pixels(layer, mw, mh(w, h)),
                  let mask = mask(baseSmall, small, mw, mh(w, h), upper: human && index > 0, single: !human) else { continue }
            let maskCI = CIImage(cgImage: mask)
                .transformed(by: .init(scaleX: CGFloat(w) / CGFloat(mw), y: CGFloat(h) / CGFloat(mh(w, h))))
                .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 2]).cropped(to: rect)
            current = scaled(layer).applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: current, kCIInputMaskImageKey: maskCI])
        }
        return context.createCGImage(current, from: rect)
    }

    /// Lays one accessory over a finished outfit. `layer` is the bare base
    /// wearing only the accessory; just the part inside `region` (fractions,
    /// measured from the top-left) that differs from the bare base is used.
    /// `skipBareSkin`: leave out the mannequin's own white body (a bag's
    /// carrying hand shouldn't cover the outfit's sleeve).
    static func overlay(base: CGImage, outfit: CGImage, layer: CGImage, region: CGRect, skipBareSkin: Bool = false) -> CGImage? {
        let w = outfit.width, h = outfit.height
        let rect = CGRect(x: 0, y: 0, width: w, height: h)
        let sh = mh(base.width, base.height)
        guard let a = pixels(base, mw, sh), let b = pixels(layer, mw, sh),
              let mask = mask(a, b, mw, sh, upper: false, single: true, region: region, skipWhite: skipBareSkin) else { return outfit }
        let maskCI = CIImage(cgImage: mask)
            .transformed(by: .init(scaleX: CGFloat(w) / CGFloat(mw), y: CGFloat(h) / CGFloat(sh)))
            .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.5]).cropped(to: rect)
        let layerCI = CIImage(cgImage: layer)
            .transformed(by: .init(scaleX: CGFloat(w) / CGFloat(layer.width), y: CGFloat(h) / CGFloat(layer.height)))
        let out = layerCI.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: CIImage(cgImage: outfit), kCIInputMaskImageKey: maskCI])
        return context.createCGImage(out, from: rect)
    }

    private static let mw = 216
    private static func mh(_ w: Int, _ h: Int) -> Int { mw * h / w }

    private static func pixels(_ image: CGImage, _ w: Int, _ h: Int) -> [UInt8]? {
        var px = [UInt8](repeating: 0, count: w * h * 4)
        guard let c = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        c.interpolationQuality = .medium
        c.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return px
    }

    /// Changed pixels, widened a little, with every enclosed hole filled:
    /// a cream sweater over a white vest barely "changes" in the middle, but
    /// its outline against the backdrop does, so the inside is filled in.
    private static func mask(_ a: [UInt8], _ b: [UInt8], _ w: Int, _ h: Int, upper: Bool,
                             single: Bool = false, region: CGRect? = nil, skipWhite: Bool = false) -> CGImage? {
        var on = [Bool](repeating: false, count: w * h)
        for i in 0..<(w * h) {
            let d = max(abs(Int(a[i * 4]) - Int(b[i * 4])), abs(Int(a[i * 4 + 1]) - Int(b[i * 4 + 1])), abs(Int(a[i * 4 + 2]) - Int(b[i * 4 + 2])))
            on[i] = d > 26
        }
        if let region {
            // Rows are stored top-down, matching the region's top-left origin.
            let x0 = Int(region.minX * Double(w)), x1 = Int(region.maxX * Double(w))
            let y0 = Int(region.minY * Double(h)), y1 = Int(region.maxY * Double(h))
            for y in 0..<h { for x in 0..<w where x < x0 || x >= x1 || y < y0 || y >= y1 { on[y * w + x] = false } }
        }
        on = spread(on, w, h, grow: true, times: 2)
        // Flood the outside from the borders; whatever isn't reached is the piece.
        var outside = [Bool](repeating: false, count: w * h)
        var stack: [Int] = []
        for x in 0..<w { stack.append(x); stack.append((h - 1) * w + x) }
        for y in 0..<h { stack.append(y * w); stack.append(y * w + w - 1) }
        while let i = stack.popLast() {
            if outside[i] || on[i] { continue }
            outside[i] = true
            let x = i % w, y = i / w
            if x > 0 { stack.append(i - 1) }
            if x < w - 1 { stack.append(i + 1) }
            if y > 0 { stack.append(i - w) }
            if y < h - 1 { stack.append(i + w) }
        }
        var solid = outside.map { !$0 }
        if upper { solid = columnSolid(largest(solid, w, h), w, h) } else if single { solid = largest(solid, w, h) }
        if skipWhite {
            for i in 0..<(w * h) where solid[i] {
                let r = Int(b[i * 4]), g = Int(b[i * 4 + 1]), bl = Int(b[i * 4 + 2])
                if min(r, g, bl) > 196 && max(r, g, bl) - min(r, g, bl) < 18 { solid[i] = false }
            }
        }
        solid = spread(solid, w, h, grow: false, times: 2)
        var gray = solid.map { $0 ? UInt8(255) : 0 }
        guard let c = CGContext(data: &gray, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        return c.makeImage()
    }

    /// Keeps only the biggest connected blob, dropping stray changes elsewhere.
    private static func largest(_ m: [Bool], _ w: Int, _ h: Int) -> [Bool] {
        var label = [Int](repeating: 0, count: w * h), best = 0, bestSize = 0, next = 0
        for start in 0..<(w * h) where m[start] && label[start] == 0 {
            next += 1
            var size = 0, stack = [start]
            label[start] = next
            while let i = stack.popLast() {
                size += 1
                let x = i % w, y = i / w
                for j in [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
                where j >= 0 && m[j] && label[j] == 0 { label[j] = next; stack.append(j) }
            }
            if size > bestSize { bestSize = size; best = next }
        }
        return label.map { $0 == best && best != 0 }
    }

    /// Fills each column from the piece's top edge to its hem, and evens the
    /// hem out across neighbouring columns, so a pale hem over pale leggings
    /// (which barely registers as a change) still ends in a clean line.
    private static func columnSolid(_ m: [Bool], _ w: Int, _ h: Int) -> [Bool] {
        var top = [Int](repeating: -1, count: w), bottom = [Int](repeating: -1, count: w)
        for x in 0..<w { for y in 0..<h where m[y * w + x] { if top[x] < 0 { top[x] = y }; bottom[x] = y } }
        var out = m
        let reach = 8
        for x in 0..<w where top[x] >= 0 {
            // Only trust neighbours whose piece starts at a similar height (same body part).
            var hems: [Int] = []
            for n in max(0, x - reach)...min(w - 1, x + reach) where top[n] >= 0 && abs(top[n] - top[x]) < 12 { hems.append(bottom[n]) }
            hems.sort()
            let hem = max(top[x], hems[hems.count / 2])
            for y in top[x]..<h { out[y * w + x] = y <= hem }
        }
        return out
    }

    private static func spread(_ m: [Bool], _ w: Int, _ h: Int, grow: Bool, times: Int) -> [Bool] {
        var cur = m
        for _ in 0..<times {
            var next = cur
            for y in 0..<h { for x in 0..<w {
                let i = y * w + x
                if cur[i] == grow { continue }
                if (x > 0 && cur[i - 1] == grow) || (x < w - 1 && cur[i + 1] == grow) || (y > 0 && cur[i - w] == grow) || (y < h - 1 && cur[i + w] == grow) { next[i] = grow }
            } }
            cur = next
        }
        return cur
    }
}
