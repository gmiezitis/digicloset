import StoreKit
import SwiftUI

/// Individual vs Family. As a sheet at a natural moment (a third person, more
/// pets), or with `hard: true` as the screen after onboarding that the app stays
/// behind until the user starts the trial or subscribes.
struct PaywallView: View {
    var reason: PaywallReason?
    var hard = false
    @Environment(\.dismiss) private var dismiss
    @State private var store = StoreKitManager.shared
    @State private var entitlements = Entitlements.shared
    @State private var yearly = true
    @State private var chosen: Plan = .family
    @State private var buying = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    header
                    Picker("Billing", selection: $yearly) {
                        Text("Monthly").tag(false)
                        Text("Yearly").tag(true)
                    }
                    .pickerStyle(.segmented)

                    PlanCard(plan: .family, title: "Family", product: store.product(.family, yearly: yearly), yearly: yearly,
                             features: ["Up to 6 people, plus every pet", "Family photo looks with everyone in them",
                                        "50 AI try-ons a month, shared", "One subscription with Family Sharing"],
                             badge: "Best for families", isChosen: chosen == .family) { chosen = .family }
                    PlanCard(plan: .individual, title: "Individual", product: store.product(.individual, yearly: yearly), yearly: yearly,
                             features: ["You and one other person, any number of pets", "Matching looks for two",
                                        "30 AI try-ons a month"],
                             badge: nil, isChosen: chosen == .individual) { chosen = .individual }

                    if !hard && !Plan.hardPaywall { freeLine }
                    buyButton
                    if store.loadFailed {
                        Button("Try again") { Task { await store.loadProducts() } }
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.ink)
                        if hard {
                            // Never leave someone locked out because the App Store is unreachable.
                            Button("Continue with Free for now") { entitlements.continuedWithoutStore = true }
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    if let message {
                        Text(message).font(.footnote).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    }
                    footer
                }
                .padding(20)
            }
            .background(StudioBackground())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !hard {
                    ToolbarItem(placement: .cancellationAction) { Button("Not now") { dismiss() } }
                }
            }
            .task { if store.products.isEmpty { await store.loadProducts() } }
            .onAppear { if reason == .tryOns || reason == .morePets { chosen = .individual } }
            .onChange(of: entitlements.plan) { _, plan in if plan != .free && !hard { dismiss() } }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Eyebrow(eyebrow)
            Text(headline)
                .font(Theme.display(34))
                .multilineTextAlignment(.center)
            Text("Matching outfits for your whole family, and your pets.")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    private var eyebrow: String {
        switch reason {
        case .familySeats: "More people"
        case .morePets: "More pets"
        case .tryOns: "More try-ons"
        case .familyPhotoLook: "Family photo look"
        case nil: hard ? "Welcome" : "Plans"
        }
    }

    private var headline: String {
        switch reason {
        case .familySeats: "Dress the whole family"
        case .morePets: "Room for every pet"
        case .tryOns: "Keep trying things on"
        case .familyPhotoLook: "One look for everyone"
        case nil: hard ? "Try everything free for 7 days" : "Unlock the whole family"
        }
    }

    private var freeLine: some View {
        Text("Free stays free: your closet, cut-outs, Shuffle, one other person, one pet and 3 try-ons.")
            .font(.footnote)
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
    }

    private var buyButton: some View {
        Button {
            Task { await buy() }
        } label: {
            if buying {
                ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(Theme.ink, in: Capsule())
            } else {
                PrimaryButtonLabel(title: buyTitle, systemImage: "sparkles")
            }
        }
        .buttonStyle(PressableStyle())
        .disabled(buying || store.product(chosen, yearly: yearly) == nil)
        .opacity(store.product(chosen, yearly: yearly) == nil ? 0.45 : 1)
    }

    private var buyTitle: String {
        guard let product = store.product(chosen, yearly: yearly) else {
            return store.loadFailed ? "Plans aren't available right now" : "Loading plans…"
        }
        return product.subscription?.introductoryOffer != nil ? "Start 7-day free trial" : "Subscribe for \(product.displayPrice)"
    }

    private var footer: some View {
        VStack(spacing: 10) {
            Button("Restore purchases") {
                Task {
                    buying = true
                    await store.restore()
                    buying = false
                    if entitlements.plan == .free { message = "No active plan was found for this Apple Account." }
                }
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Theme.ink)
            Text("Renews automatically until cancelled in Settings. Cancel at least 24 hours before the trial ends to avoid being charged.")
                .font(.caption2)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            // TODO before App Store submission: link real Terms of Use and Privacy Policy pages.
            HStack(spacing: 16) {
                Text("Terms of Use")
                Text("Privacy Policy")
            }
            .font(.caption2)
            .foregroundStyle(Theme.muted)
        }
    }

    private func buy() async {
        guard let product = store.product(chosen, yearly: yearly) else { return }
        buying = true
        defer { buying = false }
        message = nil
        do {
            // Cancelled or waiting for approval (Ask to Buy) just returns false: nothing to say.
            // On success the plan changes and the sheet closes itself.
            _ = try await store.purchase(product)
        } catch {
            message = "The purchase didn't go through. Please try again."
        }
    }
}

private struct PlanCard: View {
    let plan: Plan
    let title: String
    let product: Product?
    let yearly: Bool
    let features: [String]
    let badge: String?
    let isChosen: Bool
    let choose: () -> Void

    var body: some View {
        Button(action: choose) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title).font(Theme.display(24))
                    if let badge {
                        Text(badge)
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Theme.studio, in: Capsule())
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(product?.displayPrice ?? "–").font(.system(size: 17, weight: .semibold))
                        Text(yearly ? "per year" : "per month").font(.caption2).foregroundStyle(Theme.muted)
                    }
                }
                ForEach(features, id: \.self) { feature in
                    Label(feature, systemImage: "checkmark")
                        .font(.system(size: 14))
                        .labelStyle(FeatureLabelStyle())
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(isChosen ? Theme.ink : Theme.hairline, lineWidth: isChosen ? 2 : 1))
        }
        .buttonStyle(PressableStyle())
        .foregroundStyle(Theme.ink)
        .sensoryFeedback(.selection, trigger: isChosen)
        .accessibilityAddTraits(isChosen ? .isSelected : [])
    }
}

private struct FeatureLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.muted)
            configuration.title
        }
    }
}
