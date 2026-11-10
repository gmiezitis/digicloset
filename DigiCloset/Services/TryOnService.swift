import UIKit
import CryptoKit

/// Photo-real try-on with Kling (FASHN as fallback), through our backend or,
/// in development, straight to fal.ai.
///
/// Speed: results are cached on disk by the images involved, so a preview made
/// while adding a piece is reused everywhere later. Identical requests share one
/// network call, uploads are downscaled, and the result comes back inline.
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

    /// Who wears the garment: the built-in photo-real mannequin or the user's own photo.
    enum Base: String, CaseIterable, Identifiable, Sendable {
        case mannequin, me, dog, cat
        var id: String { rawValue }
        /// What the user can pick on the try-on screen.
        static var allCases: [Base] { [.mannequin, .me] }
        static func photo(for kind: WearerKind) -> Base {
            switch kind {
            case .dog: .dog
            case .cat: .cat
            default: .mannequin
            }
        }
        var title: String { self == .mannequin ? "Mannequin" : "My photo" }
    }

    /// One piece ready to send: product shot on white plus its try-on category.
    struct Piece: Sendable {
        let jpeg: Data
        let category: String
        let key: String
        let order: Int
        /// Name of a bundled, already-dressed mannequin image (example pieces).
        var preset: String? = nil
    }

    /// What's needed to make a piece, read from a garment on the main actor.
    struct Source: Sendable {
        let data: Data
        let category: GarmentCategory
        let preset: String?
    }

    @MainActor
    static func source(for garment: Garment) -> Source? {
        guard supports(garment.category) || editKind(for: garment.category) != nil,
              let data = garment.imageData ?? garment.thumbnailData else { return nil }
        let preset = ExamplePhotos.matches(name: garment.name, brand: garment.brand) ? ExamplePhotos.slug(garment.name) : nil
        return Source(data: data, category: garment.category, preset: preset)
    }

    static func piece(_ source: Source) -> Piece? {
        guard var piece = piece(source.data, category: source.category) else { return nil }
        piece.preset = source.preset
        return piece
    }

    static func category(for category: GarmentCategory) -> String? {
        switch category {
        case .top, .sweater, .outerwear: "tops"
        case .bottom, .skirt: "bottoms"
        case .dress: "one-pieces"
        default: nil
        }
    }

    static func supports(_ category: GarmentCategory) -> Bool { self.category(for: category) != nil }

    /// Pieces the try-on model can't put on (pet wear, hats, shoes, bags) go
    /// through an image-editing model instead, one piece per image.
    static func editKind(for category: GarmentCategory) -> String? {
        switch category {
        case .sweater, .collar, .bandana, .hat, .shoes, .bag: category.rawValue
        default: nil
        }
    }

    static func isPetWear(_ category: GarmentCategory) -> Bool { [.sweater, .collar, .bandana].contains(category) }
    static func isAccessory(_ category: GarmentCategory) -> Bool { [.hat, .shoes, .bag].contains(category) }

    /// Where each accessory sits on the mannequin, as fractions from the top-left.
    static func region(for category: GarmentCategory) -> CGRect {
        switch category {
        case .hat: CGRect(x: 0.2, y: 0, width: 0.6, height: 0.27)
        case .shoes: CGRect(x: 0.2, y: 0.8, width: 0.6, height: 0.2)
        default: CGRect(x: 0, y: 0.3, width: 1, height: 0.6)
        }
    }

    // MARK: Bases

    private static var personURL: URL { URL.documentsDirectory.appending(path: "tryon-person.jpg") }

    private static let mannequinData: Data? =
        Bundle.main.url(forResource: "tryon-mannequin", withExtension: "jpg").flatMap { try? Data(contentsOf: $0) }
    private static let mannequinHash: String? = mannequinData.map(hash)
    nonisolated(unsafe) private static var mannequinImage: UIImage?

    static func baseData(_ base: Base) -> Data? {
        switch base {
        case .mannequin: mannequinData
        case .me: try? Data(contentsOf: personURL)
        case .dog, .cat: Bundle.main.url(forResource: "tryon-\(base.rawValue)", withExtension: "jpg").flatMap { try? Data(contentsOf: $0) }
        }
    }

    private static func baseHash(_ base: Base, _ data: Data) -> String {
        base == .mannequin ? (mannequinHash ?? hash(data)) : hash(data)
    }

    static func image(for base: Base) -> UIImage? {
        if base == .mannequin {
            if let mannequinImage { return mannequinImage }
            let image = mannequinData.flatMap(UIImage.init(data:))?.preparingForDisplay()
            mannequinImage = image
            return image
        }
        return baseData(base).flatMap(UIImage.init(data:))
    }

    static func savePerson(_ data: Data) throws {
        guard let image = UIImage(data: data), let jpeg = resized(image, maxSide: 1024)?.jpegData(compressionQuality: 0.85)
        else { throw Failure.badImage }
        try jpeg.write(to: personURL, options: .atomic)
    }

    // MARK: Public API

    static func piece(_ imageData: Data, category: GarmentCategory) -> Piece? {
        guard let falCategory = self.category(for: category) ?? editKind(for: category).map({ "edit:" + $0 }),
              let image = UIImage(data: imageData),
              let jpeg = onWhite(image)?.jpegData(compressionQuality: 0.85) else { return nil }
        // Layer order: bottoms, dresses, tops, coats; pets: sweater, bandana,
        // collar; accessories are laid on afterwards.
        let order = switch category {
        case .bottom, .skirt: 0
        case .dress: 1
        case .top: 2
        case .outerwear: 3
        case .sweater: 20
        case .bandana: 21
        case .collar: 22
        default: 30
        }
        return Piece(jpeg: jpeg, category: falCategory, key: hash(jpeg), order: order)
    }

    /// A saved result for exactly these pieces, read and decoded off the main thread.
    static func cached(_ pieces: [Piece], on base: Base) async -> UIImage? {
        guard !pieces.isEmpty else { return nil }
        return await Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let data = baseData(base) else { return nil }
            let key = chainKey(baseHash(base, data), pieces.sorted { $0.order < $1.order })
            return read(key).flatMap(UIImage.init(data:))?.preparingForDisplay()
        }.value
    }

    // MARK: Prepared pieces

    /// Preparing a piece (white background, JPEG, hash) takes tens of milliseconds,
    /// so each one is made once per photo and reused by every card that shows it.
    nonisolated(unsafe) private static var preparedPieces: [String: Piece] = [:]
    private static let piecesLock = NSLock()

    @MainActor
    static func pieces(for garments: [Garment]) async -> [Piece] {
        var found: [Piece] = []
        var missing: [(String, Source)] = []
        for garment in garments where supports(garment.category) || editKind(for: garment.category) != nil {
            // The thumbnail is stored inline, so its size is cheap to read; the
            // full photo lives in a separate file and is only read when needed.
            let id = "\(garment.id.uuidString)-\(garment.thumbnailData?.count ?? 0)-\(garment.categoryRaw)"
            let hit = piecesLock.withLock { preparedPieces[id] }
            if let hit { found.append(hit) } else if let source = source(for: garment) { missing.append((id, source)) }
        }
        guard !missing.isEmpty else { return found }
        let made = await Task.detached(priority: .userInitiated) {
            missing.compactMap { id, source in piece(source).map { (id, $0) } }
        }.value
        piecesLock.withLock { for (id, piece) in made { preparedPieces[id] = piece } }
        return found + made.map(\.1)
    }

    /// Dresses the base in each piece in turn (bottoms, then dresses, then tops, then coats).
    /// `progress` reports the step that's running, and `partial` each finished step's image.
    @MainActor
    static func dress(_ pieces: [Piece], on base: Base,
                      progress: (@MainActor (Int, Int) -> Void)? = nil,
                      partial: (@MainActor (UIImage) -> Void)? = nil) async throws -> UIImage {
        guard TryOnConfig.isReady else { throw Failure.notConfigured }
        guard !pieces.isEmpty else { throw Failure.unsupported }
        guard var person = baseData(base) else { throw Failure.badImage }
        let ordered = pieces.sorted { $0.order < $1.order }
        var key = baseHash(base, person)
        for (index, piece) in ordered.enumerated() {
            progress?(index + 1, ordered.count)
            let stepKey = chainKey(key, [piece])
            person = try await InFlight.shared.run(stepKey) { [person] in
                if let hit = read(stepKey) { return hit }
                let result = try await call(person: person, garment: piece.jpeg, category: piece.category)
                write(stepKey, result)
                return result
            }
            key = stepKey
            if index < ordered.count - 1, let image = UIImage(data: person) { partial?(image) }
        }
        guard let image = UIImage(data: person)?.preparingForDisplay() else { throw Failure.badImage }
        return image
    }

    /// Starts a try-on in the background so it's ready by the time the user looks.
    @MainActor
    static func prefetch(_ imageData: Data, category: GarmentCategory, on base: Base = .mannequin) {
        guard TryOnConfig.isReady else { return }
        Task {
            guard let piece = await Task.detached(priority: .userInitiated, operation: { self.piece(imageData, category: category) }).value
            else { return }
            _ = try? await dress([piece], on: base)
        }
    }

    // MARK: Instant combining

    /// A top over a bottom (or one piece alone) can be combined on the phone
    /// from each piece's own mannequin image. Coats and dresses-with-layers
    /// need the full AI dressing to sit right.
    static func canCombine(_ pieces: [Piece]) -> Bool {
        let orders = pieces.map(\.order).sorted()
        if !orders.isEmpty, orders.allSatisfy({ (20..<30).contains($0) }) { return true }   // pet wear layers freely
        return orders.count == 1 || orders == [0, 2]
    }

    nonisolated(unsafe) private static let combos = NSCache<NSString, UIImage>()

    private static func presetData(_ piece: Piece, _ base: Base) -> Data? {
        guard base != .me, let name = piece.preset,
              let url = Bundle.main.url(forResource: "tryon-\(name)", withExtension: "jpg") else { return nil }
        return try? Data(contentsOf: url)
    }

    private static func compose(_ baseData: Data, _ singles: [Data], human: Bool = true) -> UIImage? {
        if singles.count == 1 { return UIImage(data: singles[0])?.preparingForDisplay() }
        guard let base = UIImage(data: baseData)?.cgImage else { return nil }
        let layers = singles.compactMap { UIImage(data: $0)?.cgImage }
        guard layers.count == singles.count,
              let out = TryOnCompositor.compose(base: base, layers: layers, human: human) else { return nil }
        return UIImage(cgImage: out)
    }

    /// The combination if every piece has been dressed before. No network.
    static func quickCached(_ pieces: [Piece], on base: Base) async -> UIImage? {
        guard canCombine(pieces), let baseData = baseData(base) else { return nil }
        let ordered = pieces.sorted { $0.order < $1.order }
        let baseKey = baseHash(base, baseData)
        let comboKey = "q" + chainKey(baseKey, ordered) as NSString
        if let hit = combos.object(forKey: comboKey) { return hit }
        let image = await Task.detached(priority: .userInitiated) { () -> UIImage? in
            var singles: [Data] = []
            for piece in ordered {
                guard let data = presetData(piece, base) ?? read(chainKey(baseKey, [piece])) else { return nil }
                singles.append(data)
            }
            return compose(baseData, singles, human: base == .mannequin || base == .me)
        }.value
        if let image { combos.setObject(image, forKey: comboKey) }
        return image
    }

    /// Dresses any piece not seen before (all at once), then combines.
    @MainActor
    static func quickDress(_ pieces: [Piece], on base: Base) async throws -> UIImage {
        guard canCombine(pieces), let baseData = baseData(base) else { throw Failure.unsupported }
        let ordered = pieces.sorted { $0.order < $1.order }
        let baseKey = baseHash(base, baseData)
        // New pieces are all fetched at the same time.
        let tasks = ordered.map { piece in
            Task { @MainActor in try await single(piece, baseData: baseData, baseKey: baseKey, base: base) }
        }
        var singles: [Data] = []
        for task in tasks { singles.append(try await task.value) }
        let ready = singles, human = base == .mannequin || base == .me
        guard let image = await Task.detached(priority: .userInitiated, operation: { compose(baseData, ready, human: human) }).value
        else { throw Failure.badImage }
        combos.setObject(image, forKey: "q" + chainKey(baseKey, ordered) as NSString)
        return image
    }

    @MainActor
    private static func single(_ piece: Piece, baseData: Data, baseKey: String, base: Base) async throws -> Data {
        if let preset = presetData(piece, base) { return preset }
        guard TryOnConfig.isReady else { throw Failure.notConfigured }
        let key = chainKey(baseKey, [piece])
        return try await InFlight.shared.run(key) {
            if let hit = read(key) { return hit }
            let result = piece.category.hasPrefix("edit:")
                ? try await editCall(base: baseData, piece: piece.jpeg, kind: String(piece.category.dropFirst(5)), on: base)
                : try await call(person: baseData, garment: piece.jpeg, category: piece.category)
            write(key, result)
            return result
        }
    }

    // MARK: Accessories

    /// The bare mannequin wearing just this accessory, if made before. No network.
    static func accessoryCached(_ piece: Piece) -> Data? {
        guard let baseData = mannequinData, let baseKey = mannequinHash else { return nil }
        return presetData(piece, .mannequin) ?? read(chainKey(baseKey, [piece]))
    }

    /// Dresses the bare mannequin in one accessory (once; saved after that).
    @MainActor
    static func accessoryLayer(_ piece: Piece) async throws -> Data {
        guard let baseData = mannequinData, let baseKey = mannequinHash else { throw Failure.badImage }
        return try await single(piece, baseData: baseData, baseKey: baseKey, base: .mannequin)
    }

    /// Lays accessory layers (from `accessoryLayer`) over a dressed mannequin.
    static func accessorize(_ outfit: UIImage, with layers: [(Data, GarmentCategory)]) -> UIImage? {
        guard var current = outfit.cgImage, let base = mannequinData.flatMap(UIImage.init(data:))?.cgImage else { return nil }
        // Shoes, then bag, then hat on top.
        let order: [GarmentCategory] = [.shoes, .bag, .hat]
        for (data, category) in layers.sorted(by: { order.firstIndex(of: $0.1) ?? 0 < order.firstIndex(of: $1.1) ?? 0 }) {
            guard let layer = UIImage(data: data)?.cgImage,
                  let next = TryOnCompositor.overlay(base: base, outfit: current, layer: layer, region: region(for: category),
                                                     skipBareSkin: category == .bag) else { continue }
            current = next
        }
        return UIImage(cgImage: current)
    }

    // MARK: Network

    /// Pet wear and accessories, through an image-editing model (fal.ai nano-banana).
    private static func editCall(base: Data, piece: Data, kind: String, on target: Base) async throws -> Data {
        guard let key = TryOnConfig.devFalKey else { throw Failure.notConfigured }
        let keep = "Keep everything else exactly the same: the same pose, position and size in the frame, the same camera, "
            + "crop, plain grey studio background, floor shadow and lighting. Photorealistic."
        let animal = target == .cat ? "cat" : "dog"
        let ask = switch kind {
        case "sweater": "Dress the white \(animal) statue in the first image in the garment from the second image, fitted naturally to its body. "
        case "collar": "Put the collar from the second image around the neck of the white \(animal) statue in the first image. "
        case "bandana": "Tie the bandana from the second image around the neck of the white \(animal) statue in the first image. "
        case "hat": "Put the hat from the second image on the mannequin's head in the first image, worn properly: the crown covers the top of the head and the brim sits level, at a realistic size. "
        case "shoes": "Put the shoes from the second image on the mannequin's feet in the first image, worn properly at a realistic size. "
        default: "Make the mannequin in the first image carry the bag from the second image, hanging from its hand by the handles at its side, at a realistic size. "
        }
        let json = try await post(URL(string: "https://fal.run/fal-ai/nano-banana/edit")!, headers: ["Authorization": "Key \(key)"], body: [
            "prompt": ask + keep,
            "image_urls": ["data:image/jpeg;base64,\(base.base64EncodedString())", "data:image/jpeg;base64,\(piece.base64EncodedString())"],
            "num_images": 1, "output_format": "jpeg", "aspect_ratio": "2:3", "sync_mode": true,
        ])
        guard let link = ((json["images"] as? [[String: Any]])?.first)?["url"] as? String
        else { throw Failure.server("Couldn't dress that piece. Please try again.") }
        return try await download(link)
    }

    private static func call(person: Data, garment: Data, category: String) async throws -> Data {
        TryOnConfig.usesWorker
            ? try await viaWorker(person: person, garment: garment, category: category)
            : try await viaFal(person: person, garment: garment, category: category)
    }

    private static func viaWorker(person: Data, garment: Data, category: String) async throws -> Data {
        guard let endpoint = URL(string: TryOnConfig.workerURL)?.appending(path: "tryon") else { throw Failure.notConfigured }
        let json = try await post(endpoint, headers: ["X-App-Token": TryOnConfig.appToken], body: [
            "person": person.base64EncodedString(),
            "garment": garment.base64EncodedString(),
            "category": category,
        ])
        guard let link = json["image"] as? String else { throw Failure.server("Try-on failed. Please try again.") }
        return try await download(link)
    }

    /// Development only: straight to fal.ai with the key from Secrets.plist. Kling first, FASHN if it fails.
    private static func viaFal(person: Data, garment: Data, category: String) async throws -> Data {
        guard let key = TryOnConfig.devFalKey else { throw Failure.notConfigured }
        let personURI = "data:image/jpeg;base64,\(person.base64EncodedString())"
        let garmentURI = "data:image/jpeg;base64,\(garment.base64EncodedString())"
        let headers = ["Authorization": "Key \(key)"]
        do {
            let json = try await post(URL(string: "https://fal.run/fal-ai/kling/v1-5/kolors-virtual-try-on")!, headers: headers,
                                      body: ["human_image_url": personURI, "garment_image_url": garmentURI, "sync_mode": true])
            if let link = (json["image"] as? [String: Any])?["url"] as? String { return try await download(link) }
        } catch {}
        let json = try await post(URL(string: "https://fal.run/fal-ai/fashn/tryon/v1.6")!, headers: headers, body: [
            "model_image": personURI, "garment_image": garmentURI, "category": category,
            "garment_photo_type": "flat-lay", "output_format": "jpeg", "mode": "performance", "sync_mode": true,
        ])
        guard let link = ((json["images"] as? [[String: Any]])?.first)?["url"] as? String
        else { throw Failure.server("Try-on failed. Please try again.") }
        return try await download(link)
    }

    /// Accepts inline data URIs (sync mode) as well as normal links.
    private static func download(_ link: String) async throws -> Data {
        if link.hasPrefix("data:"), let comma = link.firstIndex(of: ",") {
            guard let data = Data(base64Encoded: String(link[link.index(after: comma)...])) else { throw Failure.badImage }
            return data
        }
        guard let url = URL(string: link) else { throw Failure.badImage }
        return try await URLSession.shared.data(from: url).0
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

    // MARK: Cache

    private static func hash(_ data: Data) -> String {
        SHA256.hash(data: data).prefix(10).map { String(format: "%02x", $0) }.joined()
    }

    private static func chainKey(_ start: String, _ pieces: [Piece]) -> String {
        pieces.reduce(start) { hash(Data(($0 + $1.key).utf8)) }
    }

    private static func cacheURL(_ key: String) -> URL {
        let dir = URL.cachesDirectory.appending(path: "tryon", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appending(path: "\(key).jpg")
    }

    private static func read(_ key: String) -> Data? { try? Data(contentsOf: cacheURL(key)) }
    private static func write(_ key: String, _ data: Data) { try? data.write(to: cacheURL(key), options: .atomic) }

    // MARK: Images

    /// Try-on models expect a product shot on white, not a transparent cutout.
    private static func onWhite(_ image: UIImage) -> UIImage? {
        let scale = min(1, 768 / max(image.size.width, image.size.height))
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

/// Makes identical try-ons share one network call (e.g. a background prefetch
/// and the user tapping "Try it on" a second later).
@MainActor
final class InFlight {
    static let shared = InFlight()
    private var tasks: [String: Task<Data, Error>] = [:]

    func run(_ key: String, _ work: @escaping @Sendable () async throws -> Data) async throws -> Data {
        if let task = tasks[key] { return try await task.value }
        let task = Task.detached(priority: .userInitiated) { try await work() }
        tasks[key] = task
        defer { tasks[key] = nil }
        return try await task.value
    }

    func isRunning(_ key: String) -> Bool { tasks[key] != nil }
}
