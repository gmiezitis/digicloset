import SwiftData
import SwiftUI

struct PlannerView: View {
    @Query(sort: \PlanEntry.day) private var entries: [PlanEntry]
    @Environment(\.modelContext) private var context

    @State private var selectedDay = Calendar.current.startOfDay(for: .now)
    @State private var showPicker = false
    @State private var openLook: Look?

    private let calendar = Calendar.current
    private var days: [Date] {
        let today = calendar.startOfDay(for: .now)
        return (-3...30).compactMap { calendar.date(byAdding: .day, value: $0, to: today) }
    }
    private var dayEntries: [PlanEntry] { entries.filter { calendar.isDate($0.day, inSameDayAs: selectedDay) } }
    private var upcoming: [PlanEntry] { entries.filter { $0.day > selectedDay }.prefix(5).map { $0 } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        Eyebrow(selectedDay.formatted(.dateTime.month(.wide).year()))
                        Text(calendar.isDateInToday(selectedDay) ? "Today" : selectedDay.formatted(.dateTime.weekday(.wide).day()))
                            .font(Theme.display(36))
                            .contentTransition(.opacity)
                    }
                    .padding(.horizontal, 20)

                    dayStrip

                    if dayEntries.isEmpty {
                        VStack(spacing: 14) {
                            PhotoMannequin(garments: [], kind: .woman, height: 230)
                            Text("Nothing planned").font(Theme.display(20))
                            Button { showPicker = true } label: { PrimaryButtonLabel(title: "Plan a look", systemImage: "plus") }
                                .buttonStyle(PressableStyle())
                                .padding(.horizontal, 40)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                    } else {
                        ForEach(dayEntries) { entry in
                            PlannedCard(entry: entry) { openLook = entry.looks.first } onRemove: {
                                withAnimation { context.delete(entry) }
                            }
                        }
                        .padding(.horizontal, 20)

                        Button { showPicker = true } label: { PrimaryButtonLabel(title: "Add another", systemImage: "plus", filled: false) }
                            .buttonStyle(PressableStyle())
                            .padding(.horizontal, 20)
                    }

                    if !upcoming.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Eyebrow("Coming up")
                            ForEach(upcoming) { entry in
                                Button { withAnimation(.smooth) { selectedDay = entry.day } } label: {
                                    HStack(spacing: 12) {
                                        LookFigure(looks: entry.looks, height: 64, autoDress: false)
                                            .frame(width: 64, height: 64)
                                        Text(entry.day.formatted(.dateTime.weekday(.abbreviated).day()))
                                            .font(.system(size: 13, weight: .semibold))
                                            .frame(width: 64, alignment: .leading)
                                        Text(entry.title).font(.system(size: 15))
                                        Spacer()
                                        PaletteRow(hexes: entry.looks.flatMap(\.palette).uniqued().prefix(5).map { $0 }, size: 13)
                                    }
                                    .padding(14)
                                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                }
                                .buttonStyle(PressableStyle())
                                .foregroundStyle(Theme.ink)
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
                .padding(.vertical, 12)
            }
            .scrollIndicators(.hidden)
            .background(StudioBackground())
            .navigationDestination(item: $openLook) { LookDetailView(look: $0) }
            .sheet(isPresented: $showPicker) { PlanPicker(day: selectedDay) }
        }
    }

    private var dayStrip: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 8) {
                ForEach(days, id: \.self) { day in
                    let isOn = calendar.isDate(day, inSameDayAs: selectedDay)
                    let planned = entries.contains { calendar.isDate($0.day, inSameDayAs: day) }
                    Button { withAnimation(.smooth) { selectedDay = day } } label: {
                        VStack(spacing: 6) {
                            Text(day.formatted(.dateTime.weekday(.narrow))).font(.system(size: 11, weight: .medium))
                                .foregroundStyle(isOn ? Color.white.opacity(0.7) : Theme.muted)
                            Text(day.formatted(.dateTime.day())).font(Theme.display(20))
                            Circle().fill(planned ? (isOn ? Color.white : Theme.ink) : .clear).frame(width: 5, height: 5)
                        }
                        .frame(width: 50, height: 78)
                        .foregroundStyle(isOn ? Color.white : Theme.ink)
                        .background(isOn ? Theme.ink : Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.hairline))
                    }
                    .buttonStyle(PressableStyle())
                    .id(day)
                }
            }
            .padding(.horizontal, 20)
            .scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        .defaultScrollAnchor(.leading)
        .sensoryFeedback(.selection, trigger: selectedDay)
    }
}

struct PlannedCard: View {
    let entry: PlanEntry
    var onOpen: () -> Void
    var onRemove: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 16) {
                LookFigure(looks: entry.looks, height: 170, autoDress: false)
                    .frame(width: 150, height: 180, alignment: .bottom)
                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow(entry.matchSet != nil ? "Matching set" : (entry.look?.wearer?.name ?? "Look"))
                    Text(entry.title).font(Theme.display(24))
                    Text(entry.looks.compactMap { $0.wearer?.name }.joined(separator: " · "))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                    PaletteRow(hexes: entry.looks.flatMap(\.palette).uniqued().prefix(6).map { $0 }, size: 14)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 16, y: 8)
        }
        .buttonStyle(PressableStyle())
        .foregroundStyle(Theme.ink)
        .overlay(alignment: .topTrailing) {
            Menu {
                Button("Remove from day", systemImage: "calendar.badge.minus", role: .destructive, action: onRemove)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(Theme.muted)
            }
            .padding(8)
            .accessibilityLabel("More")
        }
        .contextMenu {
            Button("Remove from day", systemImage: "calendar.badge.minus", role: .destructive, action: onRemove)
        }
    }
}

struct PlanPicker: View {
    let day: Date
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \MatchSet.createdAt, order: .reverse) private var sets: [MatchSet]
    @Query(sort: \Look.createdAt, order: .reverse) private var looks: [Look]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !sets.isEmpty {
                        Eyebrow("Matching sets")
                        ForEach(sets) { set in
                            row(title: set.name, subtitle: set.orderedLooks.compactMap { $0.wearer?.name }.joined(separator: " · "), looks: set.orderedLooks) {
                                plan { $0.matchSet = set }
                            }
                        }
                    }
                    if looks.isEmpty && sets.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "sparkles").font(.system(size: 28)).foregroundStyle(Theme.muted)
                            Text("No saved looks yet").font(Theme.display(20))
                            Text("Save an outfit you like in Shuffle, or create one in Looks. It will show up here to plan.")
                                .font(.system(size: 13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 50)
                    } else {
                        Eyebrow("Looks").padding(.top, 8)
                    }
                    ForEach(looks) { look in
                        row(title: look.name, subtitle: look.wearer?.name ?? "", looks: [look]) {
                            plan { $0.look = look }
                        }
                    }
                }
                .padding(20)
            }
            .background(StudioBackground())
            .navigationTitle(day.formatted(.dateTime.weekday(.wide).day().month()))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func row(title: String, subtitle: String, looks: [Look], action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                LookFigure(looks: looks, height: 90, autoDress: false)
                    .frame(width: 90, height: 96, alignment: .bottom)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(Theme.display(19))
                    Text(subtitle).font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: "plus.circle.fill").font(.system(size: 22))
            }
            .padding(12)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(PressableStyle())
        .foregroundStyle(Theme.ink)
    }

    private func plan(_ configure: (PlanEntry) -> Void) {
        let entry = PlanEntry(day: day)
        context.insert(entry)
        configure(entry)
        dismiss()
    }
}
