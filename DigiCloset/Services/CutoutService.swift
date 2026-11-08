import CoreImage
import ImageIO
import UIKit
import UniformTypeIdentifiers
import Vision

/// Turns a photo of a piece of clothing into a clean cutout, entirely on the
/// device (Apple Vision), and finds its main colour. No server, no cost.
enum CutoutService {
    struct Output: Sendable {
        let cutout: Data
        let thumbnail: Data
        let dominantHex: String
        let didRemoveBackground: Bool
    }

    enum Failure: Error { case unreadableImage }

    private nonisolated(unsafe) static let context = CIContext(options: [.cacheIntermediates: false])

    static func process(_ data: Data) async throws -> Output {
        try await Task.detached(priority: .userInitiated) { try run(data) }.value
    }

    private nonisolated static func run(_ data: Data) throws -> Output {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let photo = downsample(source, maxPixel: 1600) else { throw Failure.unreadableImage }

        // 1. Apple Vision subject mask (needs the Neural Engine, so not in the simulator).
        // 2. Otherwise key out the background colour sampled from the photo's edges,
        //    which handles the usual flat-lay on a bed, floor or table.
        var result = photo
        var removed = false
        if let mask = visionMask(for: photo) ?? backgroundKeyMask(for: photo),
           let cut = applyMask(mask, to: photo) {
            result = cut
            removed = true
        }

        guard let full = encodePNG(result),
              let thumbSource = CGImageSourceCreateWithData(full as CFData, nil),
              let thumbImage = downsample(thumbSource, maxPixel: 480),
              let thumb = encodePNG(thumbImage) else { throw Failure.unreadableImage }

        return Output(cutout: full, thumbnail: thumb, dominantHex: dominantHex(result), didRemoveBackground: removed)
    }

    // MARK: Masks

    /// Full-size subject mask from Vision, or nil when Vision isn't available.
    private nonisolated static func visionMask(for photo: CGImage) -> CIImage? {
        let handler = VNImageRequestHandler(cgImage: photo)
        let request = VNGenerateForegroundInstanceMaskRequest()
        guard (try? handler.perform([request])) != nil,
              let observation = request.results?.first,
              let buffer = try? observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
        else { return nil }
        return CIImage(cvPixelBuffer: buffer)
    }

    /// Mask made by flood-filling everything connected to the photo's edges that
    /// looks like the background colour. Lightness counts for less than hue, so
    /// soft shadows under the garment are treated as background too.
    private nonisolated static func backgroundKeyMask(for photo: CGImage) -> CIImage? {
        let scale = min(1, 420 / Double(max(photo.width, photo.height)))
        let w = max(8, Int(Double(photo.width) * scale)), h = max(8, Int(Double(photo.height) * scale))
        var px = [UInt8](repeating: 0, count: w * h * 4)
        let drawn: Bool = px.withUnsafeMutableBytes { raw in
            guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(photo, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drawn else { return nil }

        let count = w * h
        var lab = [MatchEngine.Lab](repeating: MatchEngine.Lab(l: 0, a: 0, b: 0), count: count)
        for i in 0..<count {
            lab[i] = MatchEngine.lab(r: px[i * 4], g: px[i * 4 + 1], b: px[i * 4 + 2])
        }

        // Background colour = average of the outer band of the photo.
        let band = max(2, min(w, h) / 30)
        var sum = (l: 0.0, a: 0.0, b: 0.0), n = 0.0
        var border: [Int] = []
        for y in 0..<h {
            for x in 0..<w where x < band || y < band || x >= w - band || y >= h - band {
                let i = y * w + x
                border.append(i)
                sum.l += lab[i].l; sum.a += lab[i].a; sum.b += lab[i].b; n += 1
            }
        }
        let bg = MatchEngine.Lab(l: sum.l / n, a: sum.a / n, b: sum.b / n)
        func distance(_ i: Int) -> Double {
            let c = lab[i]
            let dl = (c.l - bg.l) * (c.l < bg.l ? 0.3 : 0.8) // darker = probably shadow
            return sqrt(dl * dl + pow(c.a - bg.a, 2) + pow(c.b - bg.b, 2))
        }
        let spread = border.map(distance).reduce(0, +) / Double(border.count)
        let tolerance = min(30, max(9, spread * 3 + 5))

        var isBackground = [Bool](repeating: false, count: count)
        var queue: [Int] = []
        queue.reserveCapacity(count)
        for i in border where distance(i) < tolerance {
            isBackground[i] = true
            queue.append(i)
        }
        var head = 0
        while head < queue.count {
            let i = queue[head]; head += 1
            let x = i % w, y = i / w
            for (nx, ny) in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] where nx >= 0 && ny >= 0 && nx < w && ny < h {
                let j = ny * w + nx
                if !isBackground[j] && distance(j) < tolerance {
                    isBackground[j] = true
                    queue.append(j)
                }
            }
        }

        // Give up if it found no clear subject (e.g. busy backgrounds).
        let foreground = isBackground.lazy.filter { !$0 }.count
        guard foreground > count / 50, foreground < count * 95 / 100 else { return nil }

        let maskBytes = isBackground.map { $0 ? UInt8(0) : UInt8(255) }
        guard let provider = CGDataProvider(data: Data(maskBytes) as CFData),
              let small = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: w,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0),
                                  provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        else { return nil }
        return CIImage(cgImage: small)
    }

    /// Scales a mask to the photo, smooths its edges, cuts the subject out and
    /// crops to it.
    private nonisolated static func applyMask(_ rawMask: CIImage, to photo: CGImage) -> CGImage? {
        let source = CIImage(cgImage: photo)
        let extent = source.extent
        var mask = rawMask.transformed(by: CGAffineTransform(scaleX: extent.width / rawMask.extent.width,
                                                             y: extent.height / rawMask.extent.height))
        // Soften stair-steps, then tighten the ramp so edges stay crisp (and slightly inset to avoid halos).
        let sigma = max(1.5, extent.width / 500)
        mask = mask.clampedToExtent().applyingGaussianBlur(sigma: sigma).cropped(to: extent)
            .applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 2.2, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: 2.2, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 2.2, w: 0),
                "inputBiasVector": CIVector(x: -0.6, y: -0.6, z: -0.6, w: 0),
            ])
            .applyingFilter("CIColorClamp")
        let cut = source.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: CIImage.empty(),
            kCIInputMaskImageKey: mask,
        ])
        guard let full = context.createCGImage(cut, from: extent, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)),
              let box = opaqueBounds(of: full) else { return nil }
        return full.cropping(to: box)
    }

    /// Bounding box of visible pixels, in the image's own top-left coordinates.
    private nonisolated static func opaqueBounds(of image: CGImage) -> CGRect? {
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
        var minX = w, minY = h, maxX = -1, maxY = -1
        for y in 0..<h {
            let row = y * w * 4
            for x in 0..<w where px[row + x * 4 + 3] > 10 {
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
            }
        }
        guard maxX >= minX, maxY >= minY else { return nil }
        let pad = 6
        return CGRect(x: max(0, minX - pad), y: max(0, minY - pad),
                      width: min(w, maxX + pad + 1) - max(0, minX - pad),
                      height: min(h, maxY + pad + 1) - max(0, minY - pad))
    }

    // MARK: Encoding

    private nonisolated static func downsample(_ source: CGImageSource, maxPixel: CGFloat) -> CGImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    private nonisolated static func encodePNG(_ image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, nil)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }

    /// Average colour of the visible (non-transparent) pixels.
    private nonisolated static func dominantHex(_ image: CGImage) -> String {
        let input = CIImage(cgImage: image)
        guard let filter = CIFilter(name: "CIAreaAverage", parameters: [
            kCIInputImageKey: input,
            kCIInputExtentKey: CIVector(cgRect: input.extent),
        ]), let output = filter.outputImage else { return "D9D4CC" }

        var px = [UInt8](repeating: 0, count: 4)
        context.render(output, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                       format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
        let alpha = max(Double(px[3]) / 255, 0.01)
        func channel(_ v: UInt8) -> Int { min(255, Int(Double(v) / alpha)) }
        return String(format: "%02X%02X%02X", channel(px[0]), channel(px[1]), channel(px[2]))
    }
}
