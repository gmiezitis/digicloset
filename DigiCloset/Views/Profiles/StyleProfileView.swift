import SwiftData
import SwiftUI

/// Everything the app knows about your style, in the open: what you told it
/// and what it learned. Edit anything to make suggestions more precise.
struct StyleProfileView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Bindable var profile: UserProfile
    @Query(sort: \Wearer.sortIndex) private var wearers: [Wearer]
    @State private var confirmReset = false

    private var me: Wearer? { wearers.first(where: \.isSelf) ?? wearers.first { !$0.kind.isPet } }
    private var taste: Taste { profile.taste }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if let me { hero(me) }
                    learned
                    if let me { bodySection(me) }
                    goalsSection
                    styleSection
                    footer
                }
                .padding(20)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .navigationTitle("Your style")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.fontWeight(.semibold) }
            }
            .confirmationDialog("Reset what DigiCloset has learned?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Reset", role: .destructive) {
                    profile.taste = Taste()
                    Personalizer.seed(profile)
                }
            } message: {
                Text("Your answers stay. Shuffle starts learning again from scratch.")
            }
        }
    }

    // MARK: Sections

    private func hero(_ me: Wearer) -> some View {
        HStack(spacing: 18) {
            StandingFigure(kind: me.kind, layers: favouriteLayers(me.kind), height: 150, fit: me.fit)
                .frame(width: 70, height: 160, alignment: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                TextField("Name", text: Binding(get: { profile.name }, set: { profile.name = $0; me.name = $0 }))
                    .font(Theme.display(30))
                Text(summary).font(.system(size: 13)).foregroundStyle(Theme.muted)
                if let shape = me.bodyShape {
                    Text(shape.tip)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink)
                        .padding(10)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }
    }

    private var summary: String {
        let vibes = profile.vibes.map(\.title).joined(separator: ", ")
        let goal = profile.primaryGoal.title
        return vibes.isEmpty ? "Mostly here to \(goal.lowercased())." : "\(vibes) · mostly here to \(goal.lowercased())."
    }

    /// The figure wears the colours you like most.
    private func favouriteLayers(_ kind: WearerKind) -> [FigureLayer] {
        let hexes = topFamilies.map(\.0.swatch) + profile.favoriteColors
        guard !kind.isPet else { return [] }
        let slots: [GarmentCategory] = [.top, .bottom, .shoes]
        return zip(slots, hexes).enumerated().map { i, pair in
            FigureLayer(id: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", 900 + i))!, category: pair.0, colorHex: pair.1)
        }
    }

    private var topFamilies: [(ColorFamily, Double)] {
        taste.families.compactMap { key, value in ColorFamily(rawValue: key).map { ($0, value) } }
            .filter { $0.1 > 0.05 }
            .sorted { $0.1 > $1.1 }
    }

    private var learned: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Eyebrow("What DigiCloset has learned")
                Spacer()
                Text(taste.events == 1 ? "1 signal" : "\(taste.events) signals").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
            }
            if topFamilies.isEmpty {
                Text("Love or skip a few outfits in Shuffle and your taste shows up here.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
            } else {
                VStack(spacing: 10) {
                    let maxValue = topFamilies.first?.1 ?? 1
                    ForEach(topFamilies.prefix(5), id: \.0) { family, value in
                        HStack(spacing: 10) {
                            Swatch(hex: family.swatch, size: 18)
                            Text(family.title).font(.system(size: 13, weight: .medium)).frame(width: 120, alignment: .leading)
                            GeometryReader { geo in
                                Capsule().fill(Color(hex: family.swatch))
                                    .frame(width: max(6, geo.size.width * value / maxValue))
                            }
                            .frame(height: 8)
                        }
                    }
                }
                if taste.events >= 3, let pair = taste.pairs.filter({ $0.value > 0.2 }).max(by: { $0.value < $1.value }) {
                    let names = pair.key.split(separator: "|").compactMap { ColorFamily(rawValue: String($0)) }
                    Label("Favourite pairing: \(names.map { $0.title.lowercased() }.joined(separator: " with "))", systemImage: "heart")
                        .font(.system(size: 13))
                }
                if taste.events >= 3, let category = taste.categories.max(by: { $0.value < $1.value }), category.value > 0.2,
                   let c = GarmentCategory(rawValue: category.key) {
                    Label("Reaches for \(c.title.lowercased()) most", systemImage: "hanger")
                        .font(.system(size: 13))
                }
            }
        }
        .padding(16)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func bodySection(_ me: Wearer) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow("Figure")
            HStack(spacing: 8) {
                Chip(title: "Womenswear", isOn: me.kind == .woman) { me.kind = .woman }
                Chip(title: "Menswear", isOn: me.kind == .man) { me.kind = .man }
            }
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(BodyShape.allCases) { shape in
                        BodyShapeCard(shape: shape, isOn: me.bodyShape == shape, compact: true) {
                            withAnimation(.smooth) { me.bodyShape = me.bodyShape == shape ? nil : shape }
                        }
                        .frame(width: 92)
                    }
                }
            }
            .scrollIndicators(.hidden)
            HStack(spacing: 12) {
                MeasureField(title: "Height", value: Binding(get: { me.heightCm }, set: { me.heightCm = $0 }),
                             range: 140...210, start: 166, format: { profile.usesMetric ? "\(Int($0)) cm" : OnboardingView.feet(Int($0)) })
                MeasureField(title: "Weight", value: Binding(get: { me.weightKg }, set: { me.weightKg = $0 }),
                             range: 38...160, start: 60, format: { profile.usesMetric ? "\(Int($0)) kg" : "\(Int(($0 * 2.20462).rounded())) lb" })
            }
        }
    }

    private var goalsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow("Here to")
            FlowLayout(spacing: 8) {
                ForEach(AppGoal.allCases) { goal in
                    Chip(title: goal.title, isOn: profile.goals.contains(goal)) {
                        if profile.goals.contains(goal) { profile.goals.removeAll { $0 == goal } } else { profile.goals.append(goal) }
                    }
                }
            }
        }
    }

    private var styleSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow("Style")
            FlowLayout(spacing: 8) {
                ForEach(StyleVibe.allCases) { vibe in
                    Chip(title: vibe.title, isOn: profile.vibes.contains(vibe)) {
                        if profile.vibes.contains(vibe) { profile.vibes.removeAll { $0 == vibe } } else { profile.vibes.append(vibe) }
                    }
                }
            }
            Eyebrow("Colours you love").padding(.top, 6)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 8), spacing: 10) {
                ForEach(OnboardingView.colorChoices, id: \.self) { hex in
                    let isOn = profile.favoriteColors.contains(hex)
                    Button {
                        if isOn { profile.favoriteColors.removeAll { $0 == hex } } else { profile.favoriteColors.append(hex) }
                    } label: {
                        Swatch(hex: hex, size: 30)
                            .overlay(Circle().strokeBorder(Theme.ink, lineWidth: isOn ? 2 : 0).padding(-3))
                    }
                    .accessibilityLabel(ColorScience.name(hex))
                }
            }
        }
    }

    private var footer: some View {
        VStack(spacing: 12) {
            Button("Reset what it learned", role: .destructive) { confirmReset = true }
            Button("Replay onboarding") {
                dismiss()
                profile.onboardedAt = nil
            }
            .foregroundStyle(Theme.muted)
        }
        .font(.system(size: 14, weight: .medium))
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
}

private struct MeasureField: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let start: Double
    let format: (Double) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
            if value == 0 {
                Button("Add") { value = start }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            } else {
                Stepper(value: $value, in: range, step: 1) {
                    Text(format(value)).font(.system(size: 15, weight: .semibold)).monospacedDigit().lineLimit(1).fixedSize()
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Wraps chips onto as many lines as they need.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0,
                      height: rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0)))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = [Row()]
        for (i, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            if !rows[rows.count - 1].indices.isEmpty, rows[rows.count - 1].width + spacing + size.width > width {
                rows.append(Row())
            }
            var row = rows[rows.count - 1]
            row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.indices.append(i)
            rows[rows.count - 1] = row
        }
        return rows
    }
}
