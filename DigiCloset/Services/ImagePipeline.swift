import ImageIO
import SwiftUI
import UIKit

/// Decodes images off the main thread at the size they're shown, and keeps
/// them in memory so scrolling a big closet never stutters.
final class ImagePipeline: @unchecked Sendable {
    static let shared = ImagePipeline()

    private let cache = NSCache<NSString, UIImage>()

    private init() {
        cache.countLimit = 500
        cache.totalCostLimit = 120 * 1024 * 1024
    }

    func cached(_ key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func image(for key: String, data: Data, maxPixel: CGFloat) async -> UIImage? {
        if let hit = cached(key) { return hit }
        let image = await Task.detached(priority: .userInitiated) {
            Self.decode(data, maxPixel: maxPixel)
        }.value
        if let image {
            let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
            cache.setObject(image, forKey: key as NSString, cost: cost)
        }
        return image
    }

    // MARK: Fabric

    /// A seamless swatch of a garment's fabric, cut from the middle of its
    /// photo, plus how big that swatch is compared with the whole garment.
    final class Fabric: @unchecked Sendable {
        let tile: CGImage
        let ratio: CGFloat
        init(tile: CGImage, ratio: CGFloat) { self.tile = tile; self.ratio = ratio }
    }

    private let fabrics = NSCache<NSString, Fabric>()

    func cachedFabric(_ key: String) -> Fabric? { fabrics.object(forKey: key as NSString) }

    func fabric(for key: String, data: Data) async -> Fabric? {
        if let hit = cachedFabric(key) { return hit }
        let fabric = await Task.detached(priority: .userInitiated) { Self.makeFabric(data) }.value
        if let fabric { fabrics.setObject(fabric, forKey: key as NSString) }
        return fabric
    }

    /// Finds the largest fully-opaque square near the garment's centre, then
    /// mirrors it 2×2 so it tiles without visible seams.
    private static func makeFabric(_ data: Data) -> Fabric? {
        guard let image = decode(data, maxPixel: 320)?.cgImage else { return nil }
        let w = image.width, h = image.height
        var px = [UInt8](repeating: 0, count: w * h * 4)
        let drawn: Bool = px.withUnsafeMutableBytes { raw in
            guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drawn else { return nil }
        func alpha(_ x: Int, _ y: Int) -> UInt8 { px[(y * w + x) * 4 + 3] }

        var minX = w, minY = h, maxX = -1, maxY = -1, sx = 0, sy = 0, n = 0
        for y in 0..<h {
            for x in 0..<w where alpha(x, y) > 128 {
                minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
                sx += x; sy += y; n += 1
            }
        }
        guard n > 100 else { return nil }
        let bw = maxX - minX + 1, bh = maxY - minY + 1
        let cx = sx / n, cy = sy / n

        func opaque(_ x0: Int, _ y0: Int, _ side: Int) -> Bool {
            guard x0 >= 0, y0 >= 0, x0 + side < w, y0 + side < h else { return false }
            let steps = 8
            for i in 0...steps {
                for j in 0...steps where alpha(x0 + side * i / steps, y0 + side * j / steps) < 235 { return false }
            }
            return true
        }

        var side = Int(Double(min(bw, bh)) * 0.55)
        let smallest = max(12, Int(Double(min(bw, bh)) * 0.1))
        var found: (Int, Int, Int)?
        search: while side >= smallest {
            for oy in [0, -1, 1, -2, 2] {
                for ox in [0, -1, 1, -2, 2] {
                    let x0 = cx - side / 2 + ox * bw / 10
                    let y0 = cy - side / 2 + oy * bh / 10
                    if opaque(x0, y0, side) { found = (x0, y0, side); break search }
                }
            }
            side = side * 85 / 100
        }
        guard let (x0, y0, s) = found, let crop = image.cropping(to: CGRect(x: x0, y: y0, width: s, height: s)) else { return nil }

        let out = min(128, s)
        guard let ctx = CGContext(data: nil, width: out * 2, height: out * 2, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        let o = CGFloat(out)
        for (fx, fy) in [(false, false), (true, false), (false, true), (true, true)] {
            ctx.saveGState()
            // Top row is y = o…2o in CG's bottom-left space; mirror by flipping into the quadrant.
            ctx.translateBy(x: fx ? 2 * o : 0, y: o)
            ctx.scaleBy(x: fx ? -1 : 1, y: fy ? -1 : 1)
            ctx.draw(crop, in: CGRect(x: 0, y: 0, width: o, height: o))
            ctx.restoreGState()
        }
        guard let tile = ctx.makeImage() else { return nil }
        return Fabric(tile: tile, ratio: CGFloat(s) / CGFloat(bw))
    }

    private static func decode(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Shows a garment's photo if it has one, otherwise its drawn silhouette.
struct GarmentImage: View {
    let garment: Garment
    var large = false

    @State private var image: UIImage?

    private var key: String { "\(garment.id.uuidString)-\(large ? "L" : "S")" }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else if !garment.hasPhoto {
                GarmentArt(category: garment.category, colorHex: garment.colorHex)
            } else {
                Color.clear
            }
        }
        .task(id: key) {
            if let hit = ImagePipeline.shared.cached(key) { image = hit; return }
            guard let data = large ? (garment.imageData ?? garment.thumbnailData) : garment.thumbnailData else { return }
            image = await ImagePipeline.shared.image(for: key, data: data, maxPixel: large ? 1400 : 480)
        }
    }
}
