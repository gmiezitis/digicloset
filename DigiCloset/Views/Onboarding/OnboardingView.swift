import SwiftData
import SwiftUI

/// First launch: a few calm questions that shape the whole app. Everything
/// stays on the device; body details are optional.
struct OnboardingView: View {
    enum Step: Int, CaseIterable { case welcome, name, goals, body, measurements, style, people, ready }

    @Environment(\.modelContext) private var context
    @Query private var existingWearers: [Wearer]

    @State private var step: Step = .welcome
    @State private var forward = true

    @State private var name = ""
    @State private var goals: [AppGoal] = []
    @State private var figure: WearerKind = .woman
    @State private var shape: BodyShape?
    @State private var usesMetric = Locale.current.measurementSystem == .metric
    @State private var heightCm = 166
    @State private var weightKg = 60
    @State private var measured = false
    @State private var vibes: [StyleVibe] = []
    @State private var colors: [String] = []
    @State private var companions: [Companion] = []
    @State private var withExamples = true
    @FocusState private var nameFocused: Bool

    struct Companion: Identifiable {
        let id = UUID()
        var name: String
        var kind: WearerKind
    }

    private var steps: [Step] {
        // Body shape and measurements are asked later, in Your style: personal
        // questions before any value is the main reason people quit a sign-up.
        Step.allCases.filter { step in
            if step == .body || step == .measurements { return false }
            return step != .people || goals.contains(.matchFriends) || goals.contains(.dressPets)
        }
    }

    var body: some View {
        ZStack {
            StudioBackground()
            VStack(spacing: 0) {
                if step != .welcome { topBar }
                ZStack {
                    content
                        .id(step)
                        .transition(.asymmetric(
                            insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                            removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                bottomBar
            }
        }
        .sensoryFeedback(.selection, trigger: step)
    }

    // MARK: Chrome

    private var topBar: some View {
        HStack(spacing: 14) {
            Button(action: back) {
                Image(systemName: "chevron.left").font(.system(size: 16, weight: .semibold))
                    .frame(width: 36, height: 36)
            }
            .foregroundStyle(Theme.ink)
            GeometryReader { geo in
                let index = steps.firstIndex(of: step) ?? 0
                let progress = CGFloat(index) / CGFloat(max(steps.count - 1, 1))
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.hairline)
                    Capsule().fill(Theme.ink).frame(width: max(8, geo.size.width * progress))
                }
            }
            .frame(height: 4)
            .animation(.smooth, value: step)
            Color.clear.frame(width: 36, height: 36)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var bottomBar: some View {
        VStack(spacing: 10) {
            Button(action: next) {
                PrimaryButtonLabel(title: primaryTitle)
            }
            .buttonStyle(PressableStyle())
            .disabled(!canContinue)
            .opacity(canContinue ? 1 : 0.35)

            if isOptional {
                Button("Skip for now", action: skip)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
        .animation(.smooth, value: canContinue)
    }

    private var primaryTitle: String {
        switch step {
        case .welcome: "Get started"
        case .ready: "Enter DigiCloset"
        default: "Continue"
        }
    }

    private var canContinue: Bool {
        switch step {
        case .name: !name.trimmingCharacters(in: .whitespaces).isEmpty
        case .goals: !goals.isEmpty
        default: true
        }
    }

    private var isOptional: Bool { [.body, .measurements, .style, .people].contains(step) }

    // MARK: Steps

    @ViewBuilder
    private var content: some View {
        switch step {
        case .welcome: WelcomeStep()
        case .name: nameStep
        case .goals: goalsStep
        case .body: bodyStep
        case .measurements: measurementsStep
        case .style: styleStep
        case .people: peopleStep
        case .ready: readyStep
        }
    }

    private var nameStep: some View {
        StepLayout(title: "What should we\ncall you?", subtitle: "Your closet, your name on it.") {
            TextField("Your name", text: $name)
                .font(Theme.display(34))
                .textContentType(.givenName)
                .submitLabel(.continue)
                .focused($nameFocused)
                .onSubmit { if canContinue { next() } }
                .padding(.vertical, 12)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink.opacity(0.15)).frame(height: 1) }
        }
        .onAppear { nameFocused = true }
    }

    private var goalsStep: some View {
        StepLayout(title: "What brings you\nto DigiCloset?", subtitle: "Pick all that apply. The app adapts to what you use most.") {
            VStack(spacing: 10) {
                ForEach(AppGoal.allCases) { goal in
                    let isOn = goals.contains(goal)
                    Button {
                        withAnimation(.spring(duration: 0.3)) {
                            if isOn { goals.removeAll { $0 == goal } } else { goals.append(goal) }
                        }
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: goal.symbol)
                                .font(.system(size: 17, weight: .medium))
                                .frame(width: 42, height: 42)
                                .background(isOn ? Color.white.opacity(0.15) : Theme.studio, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(goal.title).font(.system(size: 16, weight: .semibold))
                                Text(goal.detail).font(.system(size: 12)).opacity(0.7)
                            }
                            Spacer()
                            Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 20))
                                .opacity(isOn ? 1 : 0.3)
                        }
                        .padding(12)
                        .foregroundStyle(isOn ? Color.white : Theme.ink)
                        .background(isOn ? Theme.ink : Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.hairline))
                    }
                    .buttonStyle(PressableStyle())
                    .sensoryFeedback(.selection, trigger: isOn)
                }
            }
        }
    }

    private var bodyStep: some View {
        StepLayout(title: "Your figure", subtitle: "Used to style outfits that flatter you. It stays on this phone.") {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 8) {
                    Chip(title: "Womenswear", isOn: figure == .woman) { figure = .woman }
                    Chip(title: "Menswear", isOn: figure == .man) { figure = .man }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(BodyShape.allCases) { option in
                        BodyShapeCard(shape: option, isOn: shape == option) {
                            withAnimation(.spring(duration: 0.3)) { shape = shape == option ? nil : option }
                        }
                    }
                }
            }
        }
    }

    private var measurementsStep: some View {
        StepLayout(title: "Height & weight", subtitle: "So your figure looks like you. Optional and private.") {
            VStack(spacing: 16) {
                Picker("Units", selection: $usesMetric) {
                    Text("cm · kg").tag(true)
                    Text("ft · lb").tag(false)
                }
                .pickerStyle(.segmented)

                HStack(alignment: .bottom, spacing: 8) {
                    StandingFigure(kind: figure, layers: [], height: 230, fit: previewFit)
                        .frame(width: 110, height: 250, alignment: .bottom)
                    VStack(spacing: 4) {
                        Eyebrow("Height")
                        Picker("Height", selection: $heightCm) {
                            ForEach(Array(stride(from: 140, through: 210, by: 1)), id: \.self) { cm in
                                Text(usesMetric ? "\(cm) cm" : Self.feet(cm)).tag(cm)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(height: 140)
                    }
                    VStack(spacing: 4) {
                        Eyebrow("Weight")
                        Picker("Weight", selection: $weightKg) {
                            ForEach(Array(stride(from: 38, through: 160, by: 1)), id: \.self) { kg in
                                Text(usesMetric ? "\(kg) kg" : "\(Int((Double(kg) * 2.20462).rounded())) lb").tag(kg)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(height: 140)
                    }
                }
            }
            .onChange(of: heightCm) { measured = true }
            .onChange(of: weightKg) { measured = true }
        }
    }

    private var previewFit: BodyFit {
        var fit = BodyFit.make(kind: figure, heightCm: Double(heightCm), weightKg: Double(weightKg))
        fit.height = 1
        return fit
    }

    private var styleStep: some View {
        StepLayout(title: "Your style", subtitle: "Pick any vibes and colours you love. Shuffle starts from here and learns as you go.") {
            VStack(alignment: .leading, spacing: 22) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(StyleVibe.allCases) { vibe in
                        let isOn = vibes.contains(vibe)
                        Button {
                            withAnimation(.spring(duration: 0.3)) {
                                if isOn { vibes.removeAll { $0 == vibe } } else { vibes.append(vibe) }
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                PaletteRow(hexes: vibe.palette, size: 20)
                                Text(vibe.title).font(.system(size: 15, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .foregroundStyle(isOn ? Color.white : Theme.ink)
                            .background(isOn ? Theme.ink : Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.hairline))
                        }
                        .buttonStyle(PressableStyle())
                        .sensoryFeedback(.selection, trigger: isOn)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Eyebrow("Colours you love")
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 12) {
                        ForEach(Self.colorChoices, id: \.self) { hex in
                            let isOn = colors.contains(hex)
                            Button {
                                withAnimation(.spring(duration: 0.25)) {
                                    if isOn { colors.removeAll { $0 == hex } } else { colors.append(hex) }
                                }
                            } label: {
                                Swatch(hex: hex, size: 38)
                                    .overlay(Circle().strokeBorder(Theme.ink, lineWidth: isOn ? 2 : 0).padding(-4))
                                    .overlay {
                                        if isOn {
                                            Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                                                .foregroundStyle(ColorScience.lab(hex).l > 60 ? Theme.ink : .white)
                                        }
                                    }
                            }
                            .accessibilityLabel(ColorScience.name(hex))
                        }
                    }
                }
            }
        }
    }

    @State private var newName = ""
    @State private var newKind: WearerKind = .dog

    private var peopleStep: some View {
        StepLayout(title: "Who else is\nin your closet?", subtitle: "Add the friends and pets you like to match with.") {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(companions) { c in
                    HStack(spacing: 12) {
                        Image(c.kind.mannequin).resizable().scaledToFit().frame(width: 36, height: 36)
                        Text(c.name).font(.system(size: 16, weight: .semibold))
                        Text(c.kind.isPet ? c.kind.title : "Friend").font(.system(size: 13)).foregroundStyle(Theme.muted)
                        Spacer()
                        Button { companions.removeAll { $0.id == c.id } } label: { Image(systemName: "xmark") }
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(12)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Chip(title: "Dog", isOn: newKind == .dog) { newKind = .dog }
                        Chip(title: "Cat", isOn: newKind == .cat) { newKind = .cat }
                        Chip(title: "Friend", isOn: newKind == .woman) { newKind = .woman }
                    }
                    HStack {
                        TextField(newKind.isPet ? "Pet's name" : "Friend's name", text: $newName)
                            .font(.system(size: 17))
                            .submitLabel(.done)
                            .onSubmit(addCompanion)
                        Button(action: addCompanion) {
                            Image(systemName: "plus").font(.system(size: 15, weight: .bold))
                                .frame(width: 36, height: 36)
                                .foregroundStyle(.white)
                                .background(Theme.ink, in: Circle())
                        }
                        .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    .padding(12)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.hairline))
                }
            }
        }
    }

    private var readyStep: some View {
        VStack(spacing: 22) {
            Spacer(minLength: 10)
            HStack(alignment: .bottom, spacing: -10) {
                StandingFigure(kind: figure, layers: Self.readyLook(figure), height: 300, solo: false, fit: measured ? previewFit : .standard)
                if let pet = companions.first(where: \.kind.isPet) {
                    StandingFigure(kind: pet.kind, layers: Self.readyLook(pet.kind), height: 300, solo: false)
                }
            }
            .frame(height: 320, alignment: .bottom)
            VStack(spacing: 8) {
                Text("Welcome, \(name.trimmingCharacters(in: .whitespaces)).")
                    .font(Theme.display(32))
                Text(readyLine)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 28)
            if existingWearers.isEmpty {
                Toggle(isOn: $withExamples) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Start with example pieces").font(.system(size: 15, weight: .semibold))
                        Text("Explore with a styled closet. Delete anytime.").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                }
                .tint(Theme.ink)
                .padding(14)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .padding(.horizontal, 24)
            }
            Spacer(minLength: 0)
        }
    }

    private var readyLine: String {
        switch goals.first ?? .discover {
        case .discover: "Your first shuffle is waiting. Love what you like and it gets sharper every time."
        case .plan: "Plan the week ahead in a few taps."
        case .matchFriends: "Style a look and we'll match your friends to it."
        case .dressPets: "Style a look and we'll find the perfect match for your pet."
        case .organize: "Add a batch of photos and each piece is cut out and sorted for you."
        }
    }

    // MARK: Navigation

    private func next() {
        guard canContinue else { return }
        if step == .ready { finish(); return }
        go(by: 1)
    }

    private func skip() {
        switch step {
        case .body: shape = nil
        case .measurements: measured = false
        case .style: vibes = []; colors = []
        default: break
        }
        go(by: 1)
    }

    private func back() { go(by: -1) }

    private func go(by delta: Int) {
        nameFocused = false
        guard let i = steps.firstIndex(of: step), steps.indices.contains(i + delta) else { return }
        forward = delta > 0
        withAnimation(.spring(duration: 0.5, bounce: 0.15)) { step = steps[i + delta] }
    }

    private func addCompanion() {
        let clean = newName.trimmingCharacters(in: .whitespaces)
        guard !clean.isEmpty else { return }
        withAnimation(.spring(duration: 0.35)) { companions.append(Companion(name: clean, kind: newKind)) }
        newName = ""
    }

    private func finish() {
        let profile = Personalizer.profile(in: context)
        let cleanName = name.trimmingCharacters(in: .whitespaces)
        profile.name = cleanName
        profile.goals = goals
        profile.vibes = vibes
        profile.favoriteColors = colors
        profile.usesMetric = usesMetric
        Personalizer.seed(profile)

        if existingWearers.isEmpty && withExamples {
            // Example friends and pets only for people who came to match; everyone else starts alone.
            SampleData.seedIfNeeded(context, includeFamily: goals.contains(.matchFriends) || goals.contains(.dressPets))
        }

        let me = Personalizer.me(in: context) ?? {
            let wearer = Wearer(name: cleanName, kind: figure, accentHex: "C9A27E", sortIndex: 0)
            context.insert(wearer)
            return wearer
        }()
        me.isSelf = true
        me.name = cleanName
        me.kind = figure
        me.bodyShape = shape
        me.heightCm = measured ? Double(heightCm) : 0
        me.weightKg = measured ? Double(weightKg) : 0

        let nextIndex = ((try? context.fetch(FetchDescriptor<Wearer>()))?.map(\.sortIndex).max() ?? 0) + 1
        for (offset, c) in companions.enumerated() {
            let accent = Theme.accents[(offset + 1) % Theme.accents.count]
            context.insert(Wearer(name: c.name, kind: c.kind, accentHex: accent, sortIndex: nextIndex + offset))
        }

        withAnimation(.smooth(duration: 0.6)) { profile.onboardedAt = .now }
        try? context.save()
    }

    // MARK: Data

    static let colorChoices = ["F5F5F2", "EFE6D2", "D9C9AE", "B88A5A", "7A5236", "1C1C1E",
                               "9A9A9A", "2E3B55", "6E86A3", "A9C6E3", "A9B79A", "6F6B3A",
                               "D9A3A0", "E8C3BC", "C2302E", "6E2433", "C26A4A", "D1A23B",
                               "C3B1D9", "5E3553", "2E7D5B", "BFE0CC", "F0B796", "C8407E"]

    static func feet(_ cm: Int) -> String {
        let inches = Int((Double(cm) / 2.54).rounded())
        return "\(inches / 12)′ \(inches % 12)″"
    }

    static func readyLook(_ kind: WearerKind) -> [FigureLayer] {
        switch kind {
        case .dog, .cat:
            [FigureLayer(id: UUID(uuidString: "00000000-0000-0000-0000-0000000000A1")!, category: .sweater, colorHex: "D9A3A0")]
        default:
            [FigureLayer(id: UUID(uuidString: "00000000-0000-0000-0000-0000000000B1")!, category: .dress, colorHex: "D9A3A0"),
             FigureLayer(id: UUID(uuidString: "00000000-0000-0000-0000-0000000000B2")!, category: .shoes, colorHex: "F3F2EE")]
        }
    }
}

// MARK: - Pieces

private struct StepLayout<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(title)
                        .font(Theme.display(36))
                        .foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(subtitle)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                content
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }
}

/// Opening screen: you, changing outfits. Friends and pets join later, once added.
private struct WelcomeStep: View {
    @State private var index = 0

    private static let outfits: [(human: [(GarmentCategory, String)], dog: [(GarmentCategory, String)])] = [
        ([(.top, "EFE6D2"), (.bottom, "B88A5A"), (.shoes, "F3F2EE")], [(.sweater, "B88A5A"), (.collar, "EFE6D2")]),
        ([(.dress, "D9A3A0"), (.shoes, "EBD9D2")], [(.sweater, "E8C3BC"), (.bandana, "D9A3A0")]),
        ([(.top, "A9B79A"), (.bottom, "2A2C30"), (.outerwear, "2B2A29"), (.shoes, "3A2A22")], [(.sweater, "A9B79A"), (.collar, "2A2C30")]),
        ([(.top, "E8C3BC"), (.bottom, "2E3B55"), (.outerwear, "6E86A3"), (.shoes, "EBD9D2")], [(.sweater, "2E3B55"), (.collar, "EFE6D2")]),
    ]

    private func layers(_ items: [(GarmentCategory, String)], salt: Int) -> [FigureLayer] {
        items.enumerated().map { i, item in
            FigureLayer(id: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", salt * 100 + i))!, category: item.0, colorHex: item.1)
        }
    }

    var body: some View {
        let outfit = Self.outfits[index]
        VStack(spacing: 26) {
            Spacer(minLength: 20)
            StandingFigure(kind: .woman, layers: layers(outfit.human, salt: 1), height: 400, solo: false)
                .frame(height: 420, alignment: .bottom)
            VStack(spacing: 12) {
                Eyebrow("DigiCloset")
                Text("Your closet,\nbeautifully styled.")
                    .font(Theme.display(38))
                    .multilineTextAlignment(.center)
                Text("Style looks, shuffle new outfits and match\nwith friends and pets.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1.8))
                withAnimation(.smooth(duration: 0.8)) { index = (index + 1) % Self.outfits.count }
            }
        }
    }
}

struct BodyShapeCard: View {
    let shape: BodyShape
    var isOn: Bool
    var compact = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: compact ? 6 : 10) {
                BodyShapeIcon(shape: shape)
                    .fill(isOn ? Color.white : Theme.ink.opacity(0.75))
                    .frame(width: compact ? 26 : 40, height: compact ? 50 : 74)
                Text(shape.title).font(.system(size: compact ? 12 : 15, weight: .semibold))
                if !compact {
                    Text(shape.detail)
                        .font(.system(size: 11))
                        .multilineTextAlignment(.center)
                        .opacity(0.7)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: compact ? nil : 150)
            .padding(.vertical, compact ? 10 : 16)
            .padding(.horizontal, 10)
            .foregroundStyle(isOn ? Color.white : Theme.ink)
            .background(isOn ? Theme.ink : Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.hairline))
        }
        .buttonStyle(PressableStyle())
        .sensoryFeedback(.selection, trigger: isOn)
    }
}

/// A simple torso silhouette from the shape's shoulder, waist and hip widths.
struct BodyShapeIcon: Shape {
    let shape: BodyShape

    func path(in rect: CGRect) -> Path {
        let p = shape.proportions
        let w = rect.width, h = rect.height, mid = rect.midX
        func x(_ f: CGFloat, _ side: CGFloat) -> CGFloat { mid + side * f * w / 2 }
        var path = Path()
        // Head
        path.addEllipse(in: CGRect(x: mid - w * 0.17, y: rect.minY, width: w * 0.34, height: h * 0.17))
        // Body
        let top = rect.minY + h * 0.22
        let shoulderY = top + h * 0.06, waistY = top + h * 0.36, hipY = top + h * 0.56, bottom = rect.maxY
        path.move(to: CGPoint(x: mid, y: top))
        for side: CGFloat in [1, -1] {
            if side == -1 { path.move(to: CGPoint(x: mid, y: top)) }
            path.addQuadCurve(to: CGPoint(x: x(p.shoulders, side), y: shoulderY), control: CGPoint(x: x(p.shoulders * 0.7, side), y: top))
            path.addCurve(to: CGPoint(x: x(p.waist, side), y: waistY),
                          control1: CGPoint(x: x(p.shoulders, side), y: shoulderY + h * 0.1),
                          control2: CGPoint(x: x(p.waist, side), y: waistY - h * 0.1))
            path.addCurve(to: CGPoint(x: x(p.hips, side), y: hipY),
                          control1: CGPoint(x: x(p.waist, side), y: waistY + h * 0.08),
                          control2: CGPoint(x: x(p.hips, side), y: hipY - h * 0.08))
            path.addLine(to: CGPoint(x: x(p.hips * 0.62, side), y: bottom))
            path.addLine(to: CGPoint(x: mid, y: bottom))
            path.addLine(to: CGPoint(x: mid, y: top))
        }
        return path
    }
}
