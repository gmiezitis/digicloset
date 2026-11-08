import ImageIO
import Observation
import UIKit

/// Processes new photos a few at a time in the background: background removal,
/// recognition and colour, so a whole batch is sorted in seconds while the UI
/// stays responsive. Each card fills in the moment its photo is done.
@MainActor
@Observable
final class ImportQueue {
    struct Item: Identifiable {
        enum State { case loading, processing, ready, failed }

        let id = UUID()
        var state: State = .loading
        var preview: UIImage?
        var cutout: UIImage?
        var output: CutoutService.Output?
        var name = ""
        var nameEdited = false
        var category: GarmentCategory = .top
        var categoryEdited = false
        var colorHex = "D9D4CC"
        var confidence = 0.0
    }

    private(set) var items: [Item] = []
    var forPet = false

    private var waiting: [(UUID, Data)] = []
    private var running = 0
    private let maxConcurrent = 3

    var isBusy: Bool { items.contains { $0.state == .loading || $0.state == .processing } }
    var readyCount: Int { items.filter { $0.state == .ready }.count }
    var progress: Double {
        guard !items.isEmpty else { return 0 }
        return Double(items.filter { $0.state == .ready || $0.state == .failed }.count) / Double(items.count)
    }

    /// Adds a placeholder card right away; the data arrives later.
    func reserve() -> UUID {
        let item = Item()
        items.append(item)
        return item.id
    }

    func fill(_ id: UUID, with data: Data?) {
        guard let data else { update(id) { $0.state = .failed }; return }
        update(id) { $0.state = .processing }
        waiting.append((id, data))
        pump()
    }

    func add(_ data: Data) { fill(reserve(), with: data) }

    func remove(_ id: UUID) { items.removeAll { $0.id == id } }

    func update(_ id: UUID, _ change: (inout Item) -> Void) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[i])
    }

    /// Keeps categories valid when the owner switches between a person and a pet.
    func adapt(to kind: WearerKind) {
        forPet = kind.isPet
        for i in items.indices where !kind.categories.contains(items[i].category) {
            items[i].category = kind.categories[0]
        }
    }

    private func pump() {
        while running < maxConcurrent, !waiting.isEmpty {
            let (id, data) = waiting.removeFirst()
            running += 1
            let forPet = forPet
            Task {
                let preview = await Task.detached(priority: .userInitiated) { Self.thumbnail(data, maxPixel: 700) }.value
                update(id) { $0.preview = preview }
                do {
                    let output = try await CutoutService.process(data, forPet: forPet)
                    let cutout = await Task.detached(priority: .userInitiated) { Self.thumbnail(output.cutout, maxPixel: 900) }.value
                    update(id) { item in
                        item.output = output
                        item.cutout = cutout
                        item.confidence = output.recognition.confidence
                        item.colorHex = output.dominantHex
                        if !item.nameEdited { item.name = output.recognition.suggestedName }
                        if !item.categoryEdited { item.category = output.recognition.category }
                        item.state = .ready
                    }
                } catch {
                    update(id) { $0.state = .failed }
                }
                running -= 1
                pump()
            }
        }
    }

    nonisolated private static func thumbnail(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary).map(UIImage.init(cgImage:))
    }
}
