import CoreImage
import CoreVideo
import ImageIO
import UIKit
import UniformTypeIdentifiers
import Vision

/// Turns a photo of a piece of clothing into a clean cutout, entirely on the
/// device (Apple Vision), and finds its main colour. No server, no cost.
///
/// Vision often finds several things in a photo (the garment, a hanger, a
/// hand, a chair). Only the piece in the middle of the shot is kept, and the
/// rest stays available so the user can tap to add or remove it.
enum CutoutService {
    struct Output: Sendable {
        let cutout: Data
        let thumbnail: Data
        let dominantHex: String
        let didRemoveBackground: Bool
        let recognition: Recognition
        /// The original photo and mask, so the cutout can be edited later.
        let source: Source
    }

    /// Everything needed to re-cut a photo: the photo itself, the current
    /// mask (white = keep) and the objects Vision found.
    struct Source: Sendable {
        let photo: Data
        let mask: Data?
        let objects: ObjectMap?
        let chosen: [Int]
    }

    /// Low-resolution map of the separate objects Vision found; 0 is background.
    struct ObjectMap: Sendable {
        let labels: [UInt8]
        let width: Int
        let height: Int

        /// Object under a point given in 0–1 photo coordinates (top-left origin).
        func object(atX x: Double, y: Double) -> Int {
            let px = min(width - 1, max(0, Int(x * Double(width))))
            let py = min(height - 1, max(0, Int(y * Double(height))))
            // Look in a small neighbourhood so taps near an edge still count.
            var counts: [UInt8: Int] = [:]
            let r = max(1, width / 60)
            for dy in -r...r {
                for dx in -r...r {
                    let qx = px + dx, qy = py + dy
                    guard qx >= 0, qy >= 0, qx < width, qy < height else { continue }
                    let label = labels[qy * width + qx]
                    if label != 0 { counts[label, default: 0] += 1 }
                }
            }
            return Int(counts.max { $0.value < $1.value }?.key ?? 0)
        }
    }

    enum Failure: Error { case unreadableImage }

    private static let context = CIContext(options: [.cacheIntermediates: false])

    static func process(_ data: Data, forPet: Bool = false) async throws -> Output {
        try await Task.detached(priority: .userInitiated) { try run(data, forPet: forPet) }.value
    }

    /// A new mask keeping just these objects. Nil when Vision isn't available.
    static func mask(for source: Source, keeping objects: [Int]) async -> Data? {
        await Task.detached(priority: .userInitiated) { () -> Data? in
            guard let photo = decode(source.photo),
                  let mask = visionMask(for: photo, keeping: IndexSet(objects)) else { return nil }
            return encodePNG(mask)
        }.value
    }

    /// Re-cuts the photo with an edited mask (from the touch-up brush or tap-to-pick).
    static func finish(_ source: Source, mask: Data, forPet: Bool) async throws -> Output {
        try await Task.detached(priority: .userInitiated) { () -> Output in
            guard let photo = decode(source.photo) else { throw Failure.unreadableImage }
            return try finish(photo: photo, photoData: source.photo, mask: decode(mask), maskData: mask,
                              objects: source.objects, chosen: source.chosen, forPet: forPet)
        }.value
    }

    private nonisolated static func run(_ data: Data, forPet: Bool) throws -> Output {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let photo = downsample(source, maxPixel: 1600),
              let photoData = encodeJPEG(photo) else { throw Failure.unreadableImage }

        // 1. Apple Vision subject masks (needs the Neural Engine, so not in the simulator).
        // 2. Otherwise key out the background colour sampled from the photo's edges,
        //    which handles the usual flat-lay on a bed, floor or table.
        var mask: CGImage?
        var objects: ObjectMap?
        var chosen: [Int] = []
        if let vision = visionObjects(for: photo) {
            mask = vision.mask
            objects = vision.map
            chosen = vision.chosen
        } else if let keyed = backgroundKeyMask(for: photo) {
            mask = renderMask(keyed, width: photo.width, height: photo.height)
        }
        return try finish(photo: photo, photoData: photoData, mask: mask, maskData: mask.flatMap(encodePNG),
                          objects: objects, chosen: chosen, forPet: forPet)
    }

    private nonisolated static func finish(photo: CGImage, photoData: Data, mask: CGImage?, maskData: Data?,
                                           objects: ObjectMap?, chosen: [Int], forPet: Bool) throws -> Output {
        var result = photo
        var removed = false
        if let mask, let cut = applyMask(CIImage(cgImage: mask), to: photo) {
            result = cut
            removed = true
        }

        guard let full = encodePNG(result),
              let thumbSource = CGImageSourceCreateWithData(full as CFData, nil),
              let thumbImage = downsample(thumbSource, maxPixel: 480),
              let thumb = encodePNG(thumbImage) else { throw Failure.unreadableImage }

        // Classify the clean cutout on white when we have one: less clutter, better labels.
        let classifyImage = removed ? onWhite(result) : photo
        let recognition = GarmentRecognizer.recognize(cutout: result, classifyImage: classifyImage, hasAlpha: removed, forPet: forPet)
        return Output(cutout: full, thumbnail: thumb, dominantHex: recognition.palette.first ?? dominantHex(result),
                      didRemoveBackground: removed, recognition: recognition,
                      source: Source(photo: photoData, mask: maskData, objects: objects, chosen: chosen))
    }

    // MARK: Vision

    /// Finds the separate objects in the photo and picks the garment: the
    /// biggest thing near the middle that isn't spilling off the edges. Objects
    /// of a similar size right next to it (the other shoe of a pair) come too.
    private nonisolated static func visionObjects(for photo: CGImage) -> (mask: CGImage, map: ObjectMap, chosen: [Int])? {
        let handler = VNImageRequestHandler(cgImage: photo)
        let request = VNGenerateForegroundInstanceMaskRequest()
        guard (try? handler.perform([request])) != nil, let observation = request.results?.first,
              let map = objectMap(observation.instanceMask) else { return nil }
        let instances = Array(observation.allInstances)
        guard !instances.isEmpty else { return nil }

        struct Stats { var count = 0; var sx = 0.0; var sy = 0.0; var minX = Int.max; var minY = Int.max; var maxX = 0; var maxY = 0 }
        var stats: [Int: Stats] = [:]
        for y in 0..<map.height {
            for x in 0..<map.width {
                let label = Int(map.labels[y * map.width + x])
                guard label != 0 else { continue }
                var s = stats[label] ?? Stats()
                s.count += 1; s.sx += Double(x); s.sy += Double(y)
                s.minX = min(s.minX, x); s.minY = min(s.minY, y); s.maxX = max(s.maxX, x); s.maxY = max(s.maxY, y)
                stats[label] = s
            }
        }
        let total = Double(map.width * map.height)
        func score(_ label: Int) -> Double {
            guard let s = stats[label], s.count > 0 else { return 0 }
            let cx = s.sx / Double(s.count) / Double(map.width) - 0.5
            let cy = s.sy / Double(s.count) / Double(map.height) - 0.5
            let centrality = 1 - min(1, (cx * cx + cy * cy).squareRoot() / 0.7) * 0.7
            let edges = [s.minX <= 1, s.minY <= 1, s.maxX >= map.width - 2, s.maxY >= map.height - 2].filter { $0 }.count
            let edgePenalty = edges >= 3 ? 0.35 : edges == 2 ? 0.7 : 1
            return Double(s.count) / total * centrality * edgePenalty
        }
        guard let best = instances.max(by: { score($0) < score($1) }), let b = stats[best] else { return nil }

        var chosen = [best]
        let padX = (b.maxX - b.minX) / 3, padY = (b.maxY - b.minY) / 3
        for label in instances where label != best {
            guard let s = stats[label], Double(s.count) >= Double(b.count) * 0.45 else { continue }
            let near = s.minX <= b.maxX + padX && s.maxX >= b.minX - padX && s.minY <= b.maxY + padY && s.maxY >= b.minY - padY
            if near { chosen.append(label) }
        }
        guard let buffer = try? observation.generateScaledMaskForImage(forInstances: IndexSet(chosen), from: handler),
              let mask = renderMask(CIImage(cvPixelBuffer: buffer), width: photo.width, height: photo.height) else { return nil }
        return (mask, map, chosen.sorted())
    }

    private nonisolated static func visionMask(for photo: CGImage, keeping objects: IndexSet) -> CGImage? {
        let handler = VNImageRequestHandler(cgImage: photo)
        let request = VNGenerateForegroundInstanceMaskRequest()
        guard (try? handler.perform([request])) != nil, let observation = request.results?.first else { return nil }
        let keep = objects.intersection(observation.allInstances)
        guard !keep.isEmpty, let buffer = try? observation.generateScaledMaskForImage(forInstances: keep, from: handler) else { return nil }
        return renderMask(CIImage(cvPixelBuffer: buffer), width: photo.width, height: photo.height)
    }

    private nonisolated static func objectMap(_ buffer: CVPixelBuffer) -> ObjectMap? {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
        let w = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        let bytes = base.assumingMemoryBound(to: UInt8.self)
        var labels = [UInt8](repeating: 0, count: w * h)
        for y in 0..<h {
            for x in 0..<w { labels[y * w + x] = bytes[y * rowBytes + x] }
        }
        return ObjectMap(labels: labels, width: w, height: h)
    }

    /// Draws any mask into a grey image the same size as the photo.
    private nonisolated static func renderMask(_ mask: CIImage, width: Int, height: Int) -> CGImage? {
        let scaled = mask.transformed(by: CGAffineTransform(scaleX: CGFloat(width) / mask.extent.width,
                                                            y: CGFloat(height) / mask.extent.height))
        return context.createCGImage(scaled, from: CGRect(x: 0, y: 0, width: width, height: height),
                                     format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
    }

    private nonisolated static func decode(_ data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    private nonisolated static func encodeJPEG(_ image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
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

        keepMainObject(&isBackground, width: w, height: h)

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

    /// Drops separate things lying next to the garment (a mug, a phone): keeps
    /// the biggest blob near the middle, plus same-sized neighbours like the
    /// other shoe of a pair. Tiny specks go too.
    private nonisolated static func keepMainObject(_ isBackground: inout [Bool], width w: Int, height h: Int) {
        var label = [Int32](repeating: 0, count: w * h)
        struct Blob { var count = 0; var sx = 0; var sy = 0; var minX = Int.max; var minY = Int.max; var maxX = 0; var maxY = 0 }
        var blobs: [Blob] = [Blob()] // index 0 = background
        var stack: [Int] = []
        for start in 0..<(w * h) where !isBackground[start] && label[start] == 0 {
            let id = Int32(blobs.count)
            var blob = Blob()
            label[start] = id
            stack.append(start)
            while let i = stack.popLast() {
                let x = i % w, y = i / w
                blob.count += 1; blob.sx += x; blob.sy += y
                blob.minX = min(blob.minX, x); blob.maxX = max(blob.maxX, x); blob.minY = min(blob.minY, y); blob.maxY = max(blob.maxY, y)
                for (nx, ny) in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] where nx >= 0 && ny >= 0 && nx < w && ny < h {
                    let j = ny * w + nx
                    if !isBackground[j] && label[j] == 0 { label[j] = id; stack.append(j) }
                }
            }
            blobs.append(blob)
        }
        guard blobs.count > 2 else { return }

        func score(_ b: Blob) -> Double {
            let cx = Double(b.sx) / Double(b.count) / Double(w) - 0.5
            let cy = Double(b.sy) / Double(b.count) / Double(h) - 0.5
            return Double(b.count) * (1 - min(1, (cx * cx + cy * cy).squareRoot() / 0.7) * 0.7)
        }
        guard let best = blobs.indices.dropFirst().max(by: { score(blobs[$0]) < score(blobs[$1]) }) else { return }
        let b = blobs[best]
        let padX = (b.maxX - b.minX) / 3, padY = (b.maxY - b.minY) / 3
        var keep = Set([best])
        for i in blobs.indices.dropFirst() where i != best {
            let s = blobs[i]
            guard Double(s.count) >= Double(b.count) * 0.45 else { continue }
            if s.minX <= b.maxX + padX && s.maxX >= b.minX - padX && s.minY <= b.maxY + padY && s.maxY >= b.minY - padY { keep.insert(i) }
        }
        for i in 0..<(w * h) where !isBackground[i] && !keep.contains(Int(label[i])) { isBackground[i] = true }
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

    private nonisolated static func onWhite(_ image: CGImage) -> CGImage? {
        let scale = min(1, 512 / Double(max(image.width, image.height)))
        let w = max(1, Int(Double(image.width) * scale)), h = max(1, Int(Double(image.height) * scale))
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage()
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
