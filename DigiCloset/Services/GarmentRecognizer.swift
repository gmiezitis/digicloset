import CoreGraphics
import Foundation
import Vision

/// What the app worked out about a new piece, so adding clothes takes one tap.
struct Recognition: Sendable {
    var category: GarmentCategory
    /// 0–1. Below about 0.5 the UI asks the user to check the category.
    var confidence: Double
    /// Main colours, biggest first.
    var palette: [String]
    var colorName: String
    var suggestedName: String
    /// Labels Apple Vision saw, best first.
    var labels: [String]
}

/// Recognises a garment entirely on the device by combining three signals:
/// 1. Apple Vision's image classifier (good at shoes, hats, bags, jeans, jackets),
/// 2. the cutout's silhouette (sleeves, a gap between legs, a flared hem),
/// 3. a k-means colour palette, which also names the piece ("Rose & ivory top").
enum GarmentRecognizer {
    static func recognize(cutout: CGImage, classifyImage: CGImage?, hasAlpha: Bool, forPet: Bool) -> Recognition {
        let grid = AlphaGrid(cutout, maxSide: 96, hasAlpha: hasAlpha)
        let palette = grid.map { Self.palette(of: $0) } ?? []
        let shape = hasAlpha ? grid.map(Shape.init) : nil
        let labels = classifyImage.map(classify) ?? []

        var (category, noun, confidence) = forPet ? petGuess(shape) : humanGuess(shape)

        // A confident Vision label beats the silhouette.
        if let hit = labels.lazy.compactMap({ l in labelMap[l.id].map { (l, $0) } }).first(where: { $0.0.confidence >= 0.3 }) {
            let (label, mapped) = hit
            if forPet == mapped.category.isPetCategory {
                category = mapped.category
                noun = mapped.noun
                confidence = max(confidence, min(0.95, 0.55 + label.confidence * 0.5))
            }
        }

        let main = palette.first?.hex ?? "D9D4CC"
        var colorName = ColorScience.name(main)
        if palette.count > 1, palette[1].share >= 0.28,
           ColorScience.family(palette[1].hex) != ColorScience.family(main) {
            colorName += " & " + ColorScience.name(palette[1].hex).lowercased()
        }
        return Recognition(
            category: category,
            confidence: confidence,
            palette: palette.map(\.hex),
            colorName: colorName,
            suggestedName: "\(colorName) \(noun)",
            labels: labels.prefix(5).map(\.id)
        )
    }

    // MARK: Vision labels

    private struct Label { let id: String; let confidence: Double }

    private static func classify(_ image: CGImage) -> [Label] {
        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: image)
        guard (try? handler.perform([request])) != nil else { return [] }
        return (request.results ?? []).prefix(20).map { Label(id: $0.identifier, confidence: Double($0.confidence)) }
    }

    private static let labelMap: [String: (category: GarmentCategory, noun: String)] = [
        "jeans": (.bottom, "jeans"),
        "jacket": (.outerwear, "jacket"),
        "lab_coat": (.outerwear, "coat"),
        "suit": (.outerwear, "blazer"),
        "kimono": (.outerwear, "kimono"),
        "hoodie": (.top, "hoodie"),
        "gown": (.dress, "gown"),
        "wedding_dress": (.dress, "dress"),
        "shoes": (.shoes, "shoes"),
        "sneaker": (.shoes, "sneakers"),
        "boot": (.shoes, "boots"),
        "ski_boot": (.shoes, "boots"),
        "high_heel": (.shoes, "heels"),
        "sandal": (.shoes, "sandals"),
        "hat": (.hat, "hat"),
        "sunhat": (.hat, "sun hat"),
        "cowboy_hat": (.hat, "hat"),
        "baseball_hat": (.hat, "cap"),
        "beanie": (.hat, "beanie"),
        "purse": (.bag, "bag"),
        "bag": (.bag, "bag"),
        "backpack": (.bag, "backpack"),
        "leash": (.collar, "collar"),
    ]

    // MARK: Silhouette

    /// Rough measurements of the cutout's outline, as fractions of its width.
    struct Shape {
        var aspect = 1.0       // height ÷ width
        var fill = 1.0         // share of the bounding box that's fabric
        var shoulders = 1.0    // widest row in the top part
        var waist = 1.0
        var hem = 1.0
        var neck = 1.0
        var legGap = 0.0       // share of lower rows split into two legs
        var splitTop = 0.0     // share of upper rows also split (a pair of shoes)

        init(_ grid: AlphaGrid) {
            let w = grid.width, h = grid.height
            aspect = Double(h) / Double(w)
            fill = Double(grid.opaque.lazy.filter { $0 }.count) / Double(w * h)

            func runs(_ y: Int) -> [(Int, Int)] {
                var result: [(Int, Int)] = []
                var start: Int?
                for x in 0..<w {
                    let on = grid.opaque[y * w + x]
                    if on, start == nil { start = x }
                    if !on, let s = start { result.append((s, x - 1)); start = nil }
                }
                if let s = start { result.append((s, w - 1)) }
                return result.filter { $0.1 - $0.0 >= 1 }
            }
            func width(_ y: Int) -> Double {
                let r = runs(y)
                guard let first = r.first, let last = r.last else { return 0 }
                return Double(last.1 - first.0 + 1) / Double(w)
            }
            func band(_ a: Double, _ b: Double) -> [Int] {
                Array(Int(Double(h) * a)..<max(Int(Double(h) * a) + 1, Int(Double(h) * b)))
            }
            func mean(_ rows: [Int]) -> Double {
                let values = rows.map(width).filter { $0 > 0 }
                return values.isEmpty ? 0 : values.reduce(0, +) / Double(values.count)
            }
            func split(_ rows: [Int]) -> Double {
                let hits = rows.filter { y in
                    let r = runs(y)
                    guard r.count >= 2 else { return false }
                    // The gap between the two widest runs must sit near the middle.
                    for i in 1..<r.count {
                        let gapStart = r[i - 1].1, gapEnd = r[i].0
                        let centre = Double(gapStart + gapEnd) / 2 / Double(w)
                        if centre > 0.3, centre < 0.7, Double(gapEnd - gapStart) / Double(w) >= 0.04 { return true }
                    }
                    return false
                }
                return Double(hits.count) / Double(max(rows.count, 1))
            }

            neck = mean(band(0.0, 0.08))
            shoulders = band(0.08, 0.42).map(width).max() ?? 0
            waist = mean(band(0.5, 0.72))
            hem = mean(band(0.84, 0.96))
            legGap = split(band(0.72, 0.95))
            splitTop = split(band(0.05, 0.3))
        }
    }

    private static func humanGuess(_ shape: Shape?) -> (GarmentCategory, String, Double) {
        guard let s = shape else { return (.top, "top", 0.2) }
        let sleeves = s.shoulders / max(s.waist, 0.05)
        let flare = s.hem / max(s.neck, s.waist * 0.8, 0.05)

        if s.legGap > 0.5 && s.splitTop > 0.6 { return (.shoes, "shoes", 0.55) }
        if s.legGap > 0.45 { return s.aspect < 1.0 ? (.bottom, "shorts", 0.72) : (.bottom, "trousers", 0.78) }
        if s.aspect < 0.62 { return (.shoes, "shoes", 0.4) }
        if flare > 1.3 && sleeves < 1.25 {
            return s.aspect > 1.3 ? (.dress, "dress", 0.66) : (.skirt, "skirt", 0.66)
        }
        if sleeves > 1.3 { return s.aspect > 1.35 ? (.outerwear, "coat", 0.55) : (.top, "top", 0.62) }
        if s.aspect > 1.6 { return (.dress, "dress", 0.42) }
        return (.top, s.aspect > 1.1 ? "knit" : "top", 0.42)
    }

    private static func petGuess(_ shape: Shape?) -> (GarmentCategory, String, Double) {
        guard let s = shape else { return (.sweater, "sweater", 0.3) }
        if s.fill < 0.4 { return (.collar, "collar", 0.6) }
        let top = max(s.neck, s.shoulders * 0.9)
        if top > s.hem * 1.8 { return (.bandana, "bandana", 0.6) }
        return (.sweater, "sweater", 0.55)
    }

    // MARK: Colour palette

    struct Swatch: Sendable { let hex: String; let share: Double }

    /// k-means in Lab on the visible pixels. Similar clusters are merged so a
    /// shadowed fold doesn't count as a second colour.
    static func palette(of grid: AlphaGrid) -> [Swatch] {
        let points = grid.pixels
        guard points.count >= 8 else { return [] }
        let labs = points.map { ColorScience.lab(r: $0.r, g: $0.g, b: $0.b) }

        // Farthest-point seeding: deterministic, spreads seeds across colours.
        let k = min(5, labs.count)
        var centres = [labs[labs.count / 2]]
        while centres.count < k {
            var best = 0, bestD = -1.0
            for (i, p) in labs.enumerated() {
                let d = centres.map { ColorScience.distance($0, p) }.min() ?? 0
                if d > bestD { bestD = d; best = i }
            }
            if bestD < 6 { break }
            centres.append(labs[best])
        }

        var assignment = [Int](repeating: 0, count: labs.count)
        for _ in 0..<10 {
            for (i, p) in labs.enumerated() {
                var best = 0, bestD = Double.infinity
                for (c, centre) in centres.enumerated() {
                    let d = ColorScience.distance(centre, p)
                    if d < bestD { bestD = d; best = c }
                }
                assignment[i] = best
            }
            var sums = [(l: Double, a: Double, b: Double, n: Double)](repeating: (0, 0, 0, 0), count: centres.count)
            for (i, p) in labs.enumerated() {
                let c = assignment[i]
                sums[c].l += p.l; sums[c].a += p.a; sums[c].b += p.b; sums[c].n += 1
            }
            for c in centres.indices where sums[c].n > 0 {
                centres[c] = .init(l: sums[c].l / sums[c].n, a: sums[c].a / sums[c].n, b: sums[c].b / sums[c].n)
            }
        }

        // Average RGB per cluster for the output colour.
        struct Cluster { var lab: ColorScience.Lab; var r = 0.0, g = 0.0, b = 0.0, n = 0.0 }
        var clusters = centres.map { Cluster(lab: $0) }
        for (i, p) in points.enumerated() {
            let c = assignment[i]
            clusters[c].r += Double(p.r); clusters[c].g += Double(p.g); clusters[c].b += Double(p.b); clusters[c].n += 1
        }
        clusters = clusters.filter { $0.n > 0 }.sorted { $0.n > $1.n }

        // Merge near-identical clusters into the bigger one.
        var merged: [Cluster] = []
        for c in clusters {
            if let i = merged.firstIndex(where: { ColorScience.distance($0.lab, c.lab) < 14 }) {
                merged[i].r += c.r; merged[i].g += c.g; merged[i].b += c.b; merged[i].n += c.n
            } else {
                merged.append(c)
            }
        }
        let total = Double(points.count)
        return merged.sorted { $0.n > $1.n }
            .filter { $0.n / total >= 0.08 }
            .prefix(3)
            .map { Swatch(hex: ColorScience.hex(r: $0.r / $0.n, g: $0.g / $0.n, b: $0.b / $0.n), share: $0.n / total) }
    }
}

extension GarmentCategory {
    var isPetCategory: Bool { GarmentCategory.petCases.contains(self) }
}

/// A small copy of an image: which pixels are fabric, and their colours.
struct AlphaGrid {
    let width: Int
    let height: Int
    let opaque: [Bool]
    let pixels: [(r: UInt8, g: UInt8, b: UInt8)]

    init?(_ image: CGImage, maxSide: Int, hasAlpha: Bool) {
        let scale = Double(maxSide) / Double(max(image.width, image.height))
        let w = max(4, Int(Double(image.width) * min(1, scale)))
        let h = max(4, Int(Double(image.height) * min(1, scale)))
        var raw = [UInt8](repeating: 0, count: w * h * 4)
        let drawn: Bool = raw.withUnsafeMutableBytes { buffer in
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let ctx = CGContext(data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drawn else { return nil }

        var opaque = [Bool](repeating: false, count: w * h)
        var pixels: [(r: UInt8, g: UInt8, b: UInt8)] = []
        pixels.reserveCapacity(w * h)
        for y in 0..<h {
            for x in 0..<w {
                let i = (y * w + x) * 4
                let a = raw[i + 3]
                // Without a cutout, only trust the middle of the photo for colour.
                let central = hasAlpha || (x > w / 5 && x < w * 4 / 5 && y > h / 5 && y < h * 4 / 5)
                if a > 128 {
                    opaque[y * w + x] = true
                    if central {
                        let f = 255 / Double(a)
                        pixels.append((UInt8(min(255, Double(raw[i]) * f)), UInt8(min(255, Double(raw[i + 1]) * f)), UInt8(min(255, Double(raw[i + 2]) * f))))
                    }
                }
            }
        }
        self.width = w
        self.height = h
        self.opaque = opaque
        self.pixels = pixels
    }
}
