import CoreGraphics
import Foundation

/// Places accessory photos (hat, shoes, bag) on the photo mannequin. Try-on
/// AI only dresses clothing, but the mannequin always stands in the same pose,
/// so each accessory has a fixed spot: instant, free, and works offline.
/// Positions are fractions of the image, measured on the bundled mannequin.
enum MannequinAccessories {
    struct Spot { let centerX: Double; let anchorY: Double; let width: Double; let anchorIsBottom: Bool }

    // Brim sits on the forehead; shoes stand where the feet are; the bag hangs
    // from the hand on the viewer's right.
    static let hat = Spot(centerX: 0.505, anchorY: 0.128, width: 0.25, anchorIsBottom: true)
    static let shoes = Spot(centerX: 0.525, anchorY: 0.972, width: 0.27, anchorIsBottom: true)
    static let bag = Spot(centerX: 0.705, anchorY: 0.505, width: 0.19, anchorIsBottom: false)

    static func place(on image: CGImage, hat hatImage: CGImage?, shoes shoesImage: CGImage?, bag bagImage: CGImage?) -> CGImage? {
        let w = image.width, h = image.height
        guard hatImage != nil || shoesImage != nil || bagImage != nil,
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return image }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        // The head sits a little higher or lower from one dressed image to the
        // next, so the hat is seated on the head found in this image.
        var hatSpot = hat
        if hatImage != nil, let head = findHead(image) {
            hatSpot = Spot(centerX: head.centerX, anchorY: head.top + head.height * 0.78,
                           width: head.width * 2.35, anchorIsBottom: true)
        }
        // Shoes first (furthest back), then the bag, then the hat on top.
        for (piece, spot, shadow) in [(shoesImage, shoes, 0.35), (bagImage, bag, 0.28), (hatImage, hatSpot, 0.22)] {
            guard let piece else { continue }
            let pw = Double(w) * spot.width
            let ph = pw * Double(piece.height) / Double(piece.width)
            let x = Double(w) * spot.centerX - pw / 2
            // CoreGraphics' origin is bottom-left; spots are measured from the top.
            let anchor = Double(h) * (1 - spot.anchorY)
            let y = spot.anchorIsBottom ? anchor : anchor - ph
            ctx.saveGState()
            ctx.setShadow(offset: CGSize(width: 0, height: -Double(h) * 0.006), blur: Double(h) * 0.012,
                          color: CGColor(gray: 0, alpha: shadow))
            ctx.draw(piece, in: CGRect(x: x, y: y, width: pw, height: ph))
            ctx.restoreGState()
        }
        return ctx.makeImage()
    }

    /// The mannequin's head: its top edge, centre, width and height as
    /// fractions of the image. The head is the bright shape at the top centre
    /// of a plain grey backdrop.
    static func findHead(_ image: CGImage) -> (top: Double, centerX: Double, width: Double, height: Double)? {
        let w = 120, h = w * image.height / image.width
        var px = [UInt8](repeating: 0, count: w * h)
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        // Backdrop brightness from the top corners.
        var bg = 0
        for y in 0..<6 { for x in 0..<6 { bg += Int(px[y * w + x]) + Int(px[y * w + w - 1 - x]) } }
        bg /= 72
        let bright = { (x: Int, y: Int) in Int(px[y * w + x]) > bg + 28 }
        let lo = w * 38 / 100, hi = w * 62 / 100
        // Top edge: first row (from the top, skipping the outer 3%) with a run of bright pixels mid-image.
        var top: Int?
        for y in (h * 3 / 100)..<(h * 30 / 100) {
            var run = 0, best = 0
            for x in lo..<hi { run = bright(x, y) ? run + 1 : 0; best = max(best, run) }
            if best >= 3 { top = y; break }
        }
        guard let top else { return nil }
        // Width a little below the top, where the head is widest.
        let probe = min(h - 1, top + h * 4 / 100)
        var left = lo, right = hi - 1
        let mid = w / 2
        var x = mid
        while x > lo, bright(x, probe) { x -= 1 }; left = x
        x = mid
        while x < hi - 1, bright(x, probe) { x += 1 }; right = x
        let width = Double(right - left) / Double(w)
        guard width > 0.05, width < 0.2 else { return nil }
        return (Double(top) / Double(h), Double(left + right) / 2 / Double(w), width, width * 1.45 * Double(w) / Double(h))
    }
}
