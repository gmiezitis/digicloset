import UIKit
import CryptoKit

/// Photo-real try-on: sends the person's photo and a garment to our backend
/// (Kling, falling back to FASHN) and caches each result so it's paid for once.
enum TryOnService {
    enum Failure: LocalizedError {
        case notConfigured, unsupported, badImage, server(String)
        var errorDescription: String? {
            switch self {
            case .notConfigured: "Try-on isn't connected yet."
            case .unsupported: "Try-on works with tops, sweaters, coats, dresses, trousers and skirts."
            case .badImage: "Couldn't read one of the photos."
            case .server(let message): message
            }
        }
    }

    static func category(for category: GarmentCategory) -> String? {
        switch category {
        case .top, .sweater, .outerwear: "tops"
        case .bottom, .skirt: "bottoms"
        case .dress: "one-pieces"
        default: nil
        }
    }

    // MARK: Your photo

    private static var personURL: URL {
        URL.documentsDirectory.appending(path: "tryon-person.jpg")
    }

    static func savedPerson() -> UIImage? {
        UIImage(contentsOfFile: personURL.path(percentEncoded: false))
    }

    static func savePerson(_ data: Data) throws {
        guard let image = UIImage(data: data), let jpeg = resized(image, maxSide: 1280)?.jpegData(compressionQuality: 0.88)
        else { throw Failure.badImage }
        try jpeg.write(to: personURL, options: .atomic)
    }

    // MARK: Try-on

    static func cached(garmentID: UUID) -> UIImage? {
        guard let url = cacheURL(garmentID: garmentID) else { return nil }
        return UIImage(contentsOfFile: url.path(percentEncoded: false))
    }

    static func tryOn(garmentID: UUID, garmentImage: Data, category: GarmentCategory) async throws -> UIImage {
        guard TryOnConfig.isReady else { throw Failure.notConfigured }
        guard let falCategory = self.category(for: category) else { throw Failure.unsupported }
        guard let personData = try? Data(contentsOf: personURL),
              let garment = UIImage(data: garmentImage),
              let garmentJPEG = onWhite(garment)?.jpegData(compressionQuality: 0.9)
        else { throw Failure.badImage }

        let link = TryOnConfig.usesWorker
            ? try await viaWorker(person: personData, garment: garmentJPEG, category: falCategory)
            : try await viaFal(person: personData, garment: garmentJPEG, category: falCategory)
        guard let imageURL = URL(string: link) else { throw Failure.server("Try-on failed. Please try again.") }

        let (imageData, _) = try await URLSession.shared.data(from: imageURL)
        guard let image = UIImage(data: imageData) else { throw Failure.badImage }
        if let url = cacheURL(garmentID: garmentID) { try? imageData.write(to: url, options: .atomic) }
        return image
    }

    private static func viaWorker(person: Data, garment: Data, category: String) async throws -> String {
        guard let endpoint = URL(string: TryOnConfig.workerURL)?.appending(path: "tryon") else { throw Failure.notConfigured }
        let json = try await post(endpoint, headers: ["X-App-Token": TryOnConfig.appToken], body: [
            "person": person.base64EncodedString(),
            "garment": garment.base64EncodedString(),
            "category": category,
        ])
        guard let link = json["image"] as? String else { throw Failure.server("Try-on failed: \(json["error"] ?? "unknown")") }
        return link
    }

    /// Development only: straight to fal.ai with the key from Secrets.plist. Kling first, FASHN if it fails.
    private static func viaFal(person: Data, garment: Data, category: String) async throws -> String {
        guard let key = TryOnConfig.devFalKey else { throw Failure.notConfigured }
        let personURI = "data:image/jpeg;base64,\(person.base64EncodedString())"
        let garmentURI = "data:image/jpeg;base64,\(garment.base64EncodedString())"
        let headers = ["Authorization": "Key \(key)"]
        do {
            let json = try await post(URL(string: "https://fal.run/fal-ai/kling/v1-5/kolors-virtual-try-on")!, headers: headers,
                                      body: ["human_image_url": personURI, "garment_image_url": garmentURI])
            if let link = (json["image"] as? [String: Any])?["url"] as? String { return link }
        } catch {}
        let json = try await post(URL(string: "https://fal.run/fal-ai/fashn/tryon/v1.6")!, headers: headers, body: [
            "model_image": personURI, "garment_image": garmentURI, "category": category,
            "garment_photo_type": "flat-lay", "output_format": "jpeg",
        ])
        guard let link = ((json["images"] as? [[String: Any]])?.first)?["url"] as? String
        else { throw Failure.server("Try-on failed. Please try again.") }
        return link
    }

    private static func post(_ url: URL, headers: [String: String], body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: url, timeoutInterval: 120)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw Failure.server("Try-on failed (\((response as? HTTPURLResponse)?.statusCode ?? 0)). Please try again.")
        }
        return json
    }

    // MARK: Helpers

    /// Cache key includes the person photo, so a new photo means fresh results.
    private static func cacheURL(garmentID: UUID) -> URL? {
        guard let person = try? Data(contentsOf: personURL) else { return nil }
        let tag = SHA256.hash(data: person).prefix(6).map { String(format: "%02x", $0) }.joined()
        let dir = URL.cachesDirectory.appending(path: "tryon", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appending(path: "\(garmentID.uuidString)-\(tag).jpg")
    }

    /// Try-on models expect a product shot on white, not a transparent cutout.
    private static func onWhite(_ image: UIImage) -> UIImage? {
        let scale = min(1, 1024 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let pad = max(size.width, size.height) * 0.08
        let canvas = CGSize(width: size.width + pad * 2, height: size.height + pad * 2)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: canvas, format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: canvas))
            image.draw(in: CGRect(origin: CGPoint(x: pad, y: pad), size: size))
        }
    }

    private static func resized(_ image: UIImage, maxSide: CGFloat) -> UIImage? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
