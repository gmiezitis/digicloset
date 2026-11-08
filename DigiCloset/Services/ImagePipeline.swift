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
