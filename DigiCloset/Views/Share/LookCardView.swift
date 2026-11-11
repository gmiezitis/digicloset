import SwiftUI
import UIKit

/// A shareable image of a look or a family look: everyone on their photo model,
/// the look's name and colours. Made only from images already on the phone
/// (dressed looks, or the product photos as a flat lay), so sharing never
/// starts a paid try-on.
struct LookCardSheet: View {
    let title: String
    let looks: [Look]
    @Environment(\.dismiss) private var dismiss
    @State private var card: UIImage?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer(minLength: 0)
                Group {
                    if let card {
                        Image(uiImage: card)
                            .resizable()
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            .shadow(color: .black.opacity(0.15), radius: 18, y: 8)
                            .transition(.opacity.combined(with: .scale(scale: 0.97)))
                    } else {
                        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(maxHeight: 520)
                Spacer(minLength: 0)
                if let card {
                    ShareLink(item: Image(uiImage: card), preview: SharePreview(title, image: Image(uiImage: card))) {
                        PrimaryButtonLabel(title: "Share", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(PressableStyle())
                } else {
                    PrimaryButtonLabel(title: "Share", systemImage: "square.and.arrow.up").opacity(0.45)
                }
            }
            .padding(20)
            .background(StudioBackground())
            .navigationTitle("Look card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .animation(.smooth, value: card != nil)
            .task { card = await LookCardRenderer.render(title: title, looks: looks) }
        }
    }
}

@MainActor
enum LookCardRenderer {
    struct Entry: Identifiable {
        let id = UUID()
        let name: String
        /// The dressed model, if this look has been dressed before.
        let photo: UIImage?
        /// Product photos for a flat lay when it hasn't.
        let pieces: [UIImage]
    }

    static func render(title: String, looks: [Look]) async -> UIImage? {
        var entries: [Entry] = []
        for look in looks {
            entries.append(await entry(for: look))
        }
        let art = LookCardArt(title: title, entries: entries,
                              palette: Array(looks.flatMap(\.palette).uniqued().prefix(8)),
                              eyebrow: looks.count > 1 ? "Family look" : (looks.first?.wearer?.name ?? "Look"),
                              appName: appName)
        let renderer = ImageRenderer(content: art)
        renderer.scale = 3 // 360 × 450 pt → 1080 × 1350 px, the 4:5 size social apps like
        return renderer.uiImage
    }

    private static func entry(for look: Look) async -> Entry {
        let kind = look.kind
        let wearable = look.items.filter { kind.isPet ? TryOnService.isPetWear($0.category) : TryOnService.supports($0.category) }
        let base = TryOnService.Base.photo(for: look.wearer, kind: kind)
        var photo: UIImage?
        if PhotoMannequin.canShow(kind), !wearable.isEmpty {
            let pieces = await TryOnService.pieces(for: wearable)
            if !pieces.isEmpty {
                photo = await TryOnService.cached(pieces, on: base)
                if photo == nil { photo = await TryOnService.quickCached(pieces, on: base) }
            }
        }
        let flat = photo == nil ? look.items.compactMap { $0.thumbnailData.flatMap(UIImage.init(data:)) } : []
        return Entry(name: look.wearer?.name ?? "", photo: photo, pieces: flat)
    }

    /// The app's name from its bundle, so the card follows a rename.
    private static var appName: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
            ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ?? ""
    }
}

/// The card itself: a fixed 360 × 450 layout that ImageRenderer draws at 3×.
struct LookCardArt: View {
    let title: String
    let entries: [LookCardRenderer.Entry]
    let palette: [String]
    let eyebrow: String
    let appName: String

    private let size = CGSize(width: 360, height: 450)
    private let pad: CGFloat = 24
    private let gap: CGFloat = 10

    private var columns: Int { max(1, min(entries.count, 3)) }
    private var rows: Int { max(1, Int((Double(entries.count) / Double(columns)).rounded(.up))) }
    /// Each model is 2:3; as large as fits the space between the title and footer.
    private var cell: CGSize {
        let width = size.width - pad * 2
        let height: CGFloat = size.height - pad * 2 - 84 - 34
        let nameRow: CGFloat = 18
        let byWidth = (width - gap * CGFloat(columns - 1)) / CGFloat(columns)
        let byHeight = ((height - gap * CGFloat(rows - 1)) / CGFloat(rows) - nameRow) * 2 / 3
        let w = min(byWidth, byHeight, 210)
        return CGSize(width: w, height: w * 1.5)
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 6) {
                Text(eyebrow.uppercased())
                    .font(.system(size: 9, weight: .semibold).width(.expanded))
                    .kerning(1.6)
                    .foregroundStyle(Theme.muted)
                Text(title)
                    .font(Theme.display(28))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .frame(height: 84)

            Spacer(minLength: 0)
            Grid(horizontalSpacing: gap, verticalSpacing: gap) {
                ForEach(0..<rows, id: \.self) { row in
                    GridRow {
                        ForEach(Array(entries.dropFirst(row * columns).prefix(columns))) { entry in
                            figure(entry)
                        }
                    }
                }
            }
            Spacer(minLength: 0)

            HStack {
                HStack(spacing: 5) {
                    ForEach(palette, id: \.self) { hex in
                        Circle().fill(Color(hex: hex)).frame(width: 10, height: 10)
                            .overlay(Circle().strokeBorder(Color.black.opacity(0.08)))
                    }
                }
                Spacer()
                if !appName.isEmpty {
                    Text(appName)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
            }
            .frame(height: 34)
        }
        .padding(pad)
        .frame(width: size.width, height: size.height)
        .background(Theme.canvas)
    }

    private func figure(_ entry: LookCardRenderer.Entry) -> some View {
        VStack(spacing: 4) {
            ZStack {
                Theme.studio
                if let photo = entry.photo {
                    Image(uiImage: photo).resizable().scaledToFill()
                } else {
                    VStack(spacing: 2) {
                        ForEach(Array(entry.pieces.prefix(4).enumerated()), id: \.offset) { _, piece in
                            Image(uiImage: piece).resizable().scaledToFit()
                        }
                    }
                    .padding(cell.width * 0.12)
                }
            }
            .frame(width: cell.width, height: cell.height)
            .clipShape(RoundedRectangle(cornerRadius: min(16, cell.width * 0.1), style: .continuous))
            Text(entry.name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .frame(height: 14)
        }
    }
}
