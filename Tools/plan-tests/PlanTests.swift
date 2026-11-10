// Checks the plan rules in DigiCloset/Services/Plans.swift.
// Run: Tools/plan-tests/run.sh
import Foundation

var failures = 0
@MainActor func check(_ name: String, _ ok: Bool) {
    if !ok { failures += 1; print("FAIL \(name)") }
}

let me: [WearerKind] = []
let partner: [WearerKind] = [.man]
let partnerDog: [WearerKind] = [.man, .dog]

// Extra people
check("free: first extra person ok", FeatureGate.canAddWearer(.man, existing: me, plan: .free) == .allowed)
check("free: second extra person -> family seats", FeatureGate.canAddWearer(.child, existing: partner, plan: .free) == .paywall(.familySeats))
check("individual: second extra person -> family seats", FeatureGate.canAddWearer(.child, existing: partner, plan: .individual) == .paywall(.familySeats))
check("family: fifth extra person ok", FeatureGate.canAddWearer(.child, existing: [.man, .child, .child, .woman], plan: .family) == .allowed)
check("family: sixth extra person blocked", FeatureGate.canAddWearer(.child, existing: [.man, .child, .child, .woman, .man], plan: .family) == .paywall(.familySeats))
check("pets don't use people seats", FeatureGate.canAddWearer(.man, existing: [.dog, .cat], plan: .individual) == .allowed)

// Pets
check("free: first pet ok", FeatureGate.canAddWearer(.dog, existing: partner, plan: .free) == .allowed)
check("free: second pet -> more pets", FeatureGate.canAddWearer(.cat, existing: partnerDog, plan: .free) == .paywall(.morePets))
check("individual: many pets ok", FeatureGate.canAddWearer(.cat, existing: [.dog, .dog, .cat], plan: .individual) == .allowed)
check("family: many pets ok", FeatureGate.canAddWearer(.dog, existing: [.dog, .cat, .cat], plan: .family) == .allowed)

// Try-ons
check("free: third try-on ok", FeatureGate.canStartTryOn(usedLifetime: 2, usedThisMonth: 2, plan: .free) == .allowed)
check("free: fourth try-on -> paywall", FeatureGate.canStartTryOn(usedLifetime: 3, usedThisMonth: 0, plan: .free) == .paywall(.tryOns))
check("free: 2-piece outfit with 2 used -> paywall", FeatureGate.canStartTryOn(usedLifetime: 2, usedThisMonth: 0, needed: 2, plan: .free) == .paywall(.tryOns))
check("individual: 30th ok", FeatureGate.canStartTryOn(usedLifetime: 500, usedThisMonth: 29, plan: .individual) == .allowed)
check("individual: 31st -> paywall", FeatureGate.canStartTryOn(usedLifetime: 500, usedThisMonth: 30, plan: .individual) == .paywall(.tryOns))
check("family: 50th ok", FeatureGate.canStartTryOn(usedLifetime: 0, usedThisMonth: 49, plan: .family) == .allowed)
check("family: 51st -> paywall", FeatureGate.canStartTryOn(usedLifetime: 0, usedThisMonth: 50, plan: .family) == .paywall(.tryOns))

// Family photo look
check("free: no family look", FeatureGate.canBuildFamilyPhotoLook(wearerCount: 2, plan: .free) == .paywall(.familyPhotoLook))
check("individual: you + 1 ok", FeatureGate.canBuildFamilyPhotoLook(wearerCount: 2, plan: .individual) == .allowed)
check("individual: 3 wearers -> paywall", FeatureGate.canBuildFamilyPhotoLook(wearerCount: 3, plan: .individual) == .paywall(.familyPhotoLook))
check("family: 4 people + dog ok", FeatureGate.canBuildFamilyPhotoLook(wearerCount: 5, plan: .family) == .allowed)

// Exports
check("free exports watermarked", !FeatureGate.canExportClean(plan: .free))
check("paid exports clean", FeatureGate.canExportClean(plan: .individual) && FeatureGate.canExportClean(plan: .family))

print(failures == 0 ? "all plan checks passed" : "\(failures) failed")
exit(failures == 0 ? 0 : 1)
