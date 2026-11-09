import CoreGraphics
import CoreImage
import Foundation

/// Combines single-piece try-on results into one outfit on the device.
/// Each image shows the same base (mannequin or person) wearing one piece;
/// the piece is found as "what changed from the base", made solid, and
/// layered over the outfit so far. Instant, and needs no network.
enum TryOnCompositor {
    private static let context = CIContext(options: [.workingColorSpace: NSNull()])

    static func compose(base: CGImage, layers: [CGImage]) -> CGImage? {
        let w = min(base.width, 864), h = Int((Double(w) * Double(base.height) / Double(base.width)).rounded())
        let rect = CGRect(x: 0, y: 0, width: w, height: h)
        func scaled(_ image: CGImage) -> CIImage {
            CIImage(cgImage: image).transformed(by: .init(scaleX: CGFloat(w) / CGFloat(image.width), y: CGFloat(h) / CGFloat(image.height)))
        }
        let baseCI = scaled(base)
        guard let baseSmall = pixels(base, mw, mh(w, h)) else { return nil }
        var current = baseCI
        for (index, layer) in layers.enumerated() {
            guard let small = pixels(layer, mw, mh(w, h)), let mask = mask(baseSmall, small, mw, mh(w, h), upper: index > 0) else { continue }
            let maskCI = CIImage(cgImage: mask)
                .transformed(by: .init(scaleX: CGFloat(w) / CGFloat(mw), y: CGFloat(h) / CGFloat(mh(w, h))))
                .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 2]).cropped(to: rect)
            current = scaled(layer).applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: current, kCIInputMaskImageKey: maskCI])
        }
        return context.createCGImage(current, from: rect)
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
    private static func mask(_ a: [UInt8], _ b: [UInt8], _ w: Int, _ h: Int, upper: Bool) -> CGImage? {
        var on = [Bool](repeating: false, count: w * h)
        for i in 0..<(w * h) {
            let d = max(abs(Int(a[i * 4]) - Int(b[i * 4])), abs(Int(a[i * 4 + 1]) - Int(b[i * 4 + 1])), abs(Int(a[i * 4 + 2]) - Int(b[i * 4 + 2])))
            on[i] = d > 26
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
        if upper { solid = columnSolid(largest(solid, w, h), w, h) }
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
