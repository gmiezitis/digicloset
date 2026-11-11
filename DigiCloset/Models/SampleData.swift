import Foundation
import SwiftData

/// A starter closet so the app looks alive on first launch: your pieces and
/// looks, plus (only for people who want to match) a friend, a dog and a cat
/// with matching sets already styled.
@MainActor
enum SampleData {
    static func seedIfNeeded(_ context: ModelContext, includeFamily: Bool = true) {
        guard (try? context.fetchCount(FetchDescriptor<Wearer>())) == 0 else { return }

        let me = Wearer(name: "Me", kind: .woman, accentHex: "C9A27E", sortIndex: 0)
        me.isSelf = true
        context.insert(me)

        var stamp = Date.now
        func piece(_ owner: Wearer, _ name: String, _ brand: String, _ category: GarmentCategory, _ hex: String) -> Garment {
            let garment = Garment(name: name, brand: brand, category: category, colorHex: hex, owner: owner)
            stamp = stamp.addingTimeInterval(-60)
            garment.createdAt = stamp
            context.insert(garment)
            garment.wearer = owner
            return garment
        }

        // Me
        let linenShirt = piece(me, "Linen shirt", "Arket", .top, "EFE6D2")
        let camelTrousers = piece(me, "Camel trousers", "COS", .bottom, "B88A5A")
        let sneakers = piece(me, "White sneakers", "Veja", .shoes, "F3F2EE")
        let strawHat = piece(me, "Straw hat", "Lack of Color", .hat, "D8C08E")
        let roseDress = piece(me, "Rose slip dress", "Reformation", .dress, "D9A3A0")
        let blackCoat = piece(me, "Wool coat", "Totême", .outerwear, "2B2A29")
        let sageKnit = piece(me, "Sage knit", "& Other Stories", .top, "A9B79A")
        let blackJeans = piece(me, "Straight jeans", "Agolde", .bottom, "2A2C30")
        let loafers = piece(me, "Leather loafers", "G.H. Bass", .shoes, "3A2A22")
        _ = piece(me, "Ivory midi skirt", "Mango", .skirt, "EDE6D6")
        _ = piece(me, "Woven tote", "Loewe", .bag, "C9A27E")

        func look(_ owner: Wearer, _ name: String, _ items: [Garment]) -> Look {
            let look = Look(name: name, owner: owner)
            stamp = stamp.addingTimeInterval(-60)
            look.createdAt = stamp
            context.insert(look)
            look.wearer = owner
            look.garments = items
            return look
        }

        let sundayLinen = look(me, "Sunday Linen", [linenShirt, camelTrousers, sneakers, strawHat])
        let roseHour = look(me, "Rose Hour", [roseDress, sneakers])
        let cityNoir = look(me, "City Noir", [blackCoat, sageKnit, blackJeans, loafers])

        let calendar = Calendar.current
        let today = Date.now
        func plan(_ offset: Int, look: Look? = nil, set: MatchSet? = nil) {
            let entry = PlanEntry(day: calendar.date(byAdding: .day, value: offset, to: today) ?? today)
            context.insert(entry)
            entry.look = look
            entry.matchSet = set
        }
        plan(5, look: cityNoir)

        guard includeFamily else {
            plan(0, look: sundayLinen)
            plan(2, look: roseHour)
            try? context.save()
            return
        }

        let sofia = Wearer(name: "Sofia", kind: .woman, accentHex: "D8A7A0", sortIndex: 1)
        let biscuit = Wearer(name: "Biscuit", kind: .dog, accentHex: "B8946A", sortIndex: 2)
        let luna = Wearer(name: "Luna", kind: .cat, accentHex: "9AA7B8", sortIndex: 3)
        [sofia, biscuit, luna].forEach(context.insert)

        // Sofia
        let blushBlouse = piece(sofia, "Blush blouse", "Sézane", .top, "E8C3BC")
        let roseSkirt = piece(sofia, "Rose midi skirt", "Rouje", .skirt, "C98C8A")
        let flats = piece(sofia, "Ballet flats", "Repetto", .shoes, "EBD9D2")
        let denimJacket = piece(sofia, "Denim jacket", "Levi's", .outerwear, "6E86A3")
        let navyTrousers = piece(sofia, "Wide-leg trousers", "Arket", .bottom, "2E3B55")

        // Biscuit
        let camelSweater = piece(biscuit, "Cable knit", "Ware of the Dog", .sweater, "B88A5A")
        let creamCollar = piece(biscuit, "Cream collar", "Wild One", .collar, "EFE6D2")
        _ = piece(biscuit, "Rose bandana", "Maxbone", .bandana, "D9A3A0")
        let navyCoat = piece(biscuit, "Rain coat", "Barbour", .sweater, "2E3B55")

        // Luna
        let blushBandana = piece(luna, "Blush bandana", "Meowtique", .bandana, "E8C3BC")
        _ = piece(luna, "Velvet collar", "Wild One", .collar, "2A2C30")
        let sageSweater = piece(luna, "Sage sweater", "Little Knits", .sweater, "A9B79A")

        let biscuitLinen = look(biscuit, "Sunday Linen", [camelSweater, creamCollar])
        let sofiaRose = look(sofia, "Rose Hour", [blushBlouse, roseSkirt, flats])
        let lunaRose = look(luna, "Rose Hour", [blushBandana])
        let weekendBlue = look(sofia, "Weekend Blue", [denimJacket, blushBlouse, navyTrousers, flats])
        let biscuitBlue = look(biscuit, "Weekend Blue", [navyCoat, creamCollar])
        _ = look(luna, "Garden", [sageSweater])

        func set(_ name: String, _ looks: [Look]) -> MatchSet {
            let set = MatchSet(name: name)
            stamp = stamp.addingTimeInterval(-60)
            set.createdAt = stamp
            context.insert(set)
            set.looks = looks
            return set
        }

        let linenSet = set("Sunday Linen", [sundayLinen, biscuitLinen])
        let roseSet = set("Rose Hour", [roseHour, sofiaRose, lunaRose])
        _ = set("Weekend Blue", [weekendBlue, biscuitBlue])

        plan(0, set: linenSet)
        plan(2, set: roseSet)

        try? context.save()
    }

    /// Whether this wearer gets a starter wardrobe: pets and children.
    static func getsStarter(_ kind: WearerKind) -> Bool { kind.isPet || kind == .child }

    /// A new pet or child starts with a few real pieces (the bundled example
    /// photos), so Shuffle and matching have something to work with right away.
    @MainActor
    static func starterWardrobe(for pet: Wearer, in context: ModelContext) {
        let pieces: [(String, String, GarmentCategory, String)] = pet.kind == .child
            ? [("Striped tee", "Petit Bateau", .top, "2E3B6B"), ("Kids jeans", "Mini Rodini", .bottom, "4A6A9A"),
               ("Pinafore dress", "Bonpoint", .dress, "C9952E"), ("Yellow raincoat", "Stutterheim", .outerwear, "F2C230"),
               ("Kids sneakers", "Veja", .shoes, "F3F2EE"), ("Knit beanie", "Bobo Choses", .hat, "EDE3CF")]
            : pet.kind == .cat
            ? [("Sage sweater", "Little Knits", .sweater, "A9B79A"), ("Blush bandana", "Meowtique", .bandana, "E8C3BC"),
               ("Velvet collar", "Wild One", .collar, "2A2C30")]
            : [("Cable knit", "Ware of the Dog", .sweater, "B88A5A"), ("Rain coat", "Barbour", .sweater, "2E3B55"),
               ("Rose bandana", "Maxbone", .bandana, "D9A3A0"), ("Cream collar", "Wild One", .collar, "EFE6D2")]
        for (name, brand, category, hex) in pieces {
            let garment = Garment(name: name, brand: brand, category: category, colorHex: hex, owner: pet)
            context.insert(garment)
            garment.wearer = pet
        }
        try? context.save()
        // Fills in the real photos for these pieces.
        Task { await GarmentStudio.fillMissing(in: context) }
    }

    /// Pets and children added before starter wardrobes existed get one, once.
    /// One whose wardrobe is later emptied on purpose isn't refilled.
    @MainActor
    static func stockEmptyPets(in context: ModelContext) {
        let key = "starterWardrobe.stocked"
        var stocked = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
        let pets = ((try? context.fetch(FetchDescriptor<Wearer>())) ?? []).filter { getsStarter($0.kind) }
        for pet in pets where !stocked.contains(pet.id.uuidString) {
            if (pet.garments ?? []).isEmpty { starterWardrobe(for: pet, in: context) }
            stocked.insert(pet.id.uuidString)
        }
        UserDefaults.standard.set(Array(stocked), forKey: key)
    }
}
