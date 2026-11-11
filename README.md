# DigiCloset (iOS)

A digital closet for you, your friends and your pets. Style looks on studio
mannequins, match outfits across people and animals, and plan what to wear.

## Run it

Open `DigiCloset.xcodeproj` in Xcode 27 and run on an iPhone simulator or device
(iOS 18+). The app seeds a sample closet (Me, Sofia, Biscuit the dog, Luna the cat)
on first launch if you choose example pieces during onboarding.

## How it's built

- **SwiftUI + SwiftData**, Swift 6 strict concurrency, no third-party dependencies.
- **Local-first**: everything is stored on the device. Photos use external storage
  so the database stays small; closet queries are indexed by owner and category.
- **On-device background removal** with Apple Vision (`CutoutService`), with a
  colour-key fallback for flat-lays. No server, no per-image cost.
- **Recognition** (`GarmentRecognizer`): combines Vision's image labels, the
  cutout's silhouette (sleeves, leg gap, flared hem) and a k-means colour palette
  to fill in category, colours and a name ("Navy & white top") automatically.
- **Batch import** (`ImportQueue`): pick up to 30 photos; they're processed three
  at a time in the background and each card fills in as soon as it's ready.
- **Onboarding**: name, goals, figure and body shape, height and weight (optional,
  stays on the device), style vibes and favourite colours, friends and pets.
- **Personalization** (`Personalizer`): every love, skip, wear, plan and save
  nudges a learned taste profile (colour families, pairings, categories). It ranks
  Shuffle results, explains each pick, and decides which tab the app opens on.
  "Your style" shows everything it learned and lets you edit or reset it.
- **Shuffle** (`OutfitGenerator`): tap or shake for a new outfit from your closet,
  lock pieces you want to keep, and add a friend or pet to dress them to match.
- **Image pipeline** (`ImagePipeline`): decodes thumbnails off the main thread at
  display size and caches them, so large closets scroll smoothly.
- **Figures** (`FigureView`): each garment's colour is multiplied onto a mannequin
  cutout, zone by zone, so the sculpted shading shows through like fabric.
- **Matching** (`MatchEngine`): compares colours in Lab space to pick pieces from a
  friend's or pet's closet that echo your look, and scores palette harmony.

## Layout

```
DigiCloset/
  App/        app entry + tab bar
  Design/     theme, shared controls
  Models/     SwiftData models + sample data
  Services/   cutout, recognition, import queue, image cache, colour, personalization
  Views/      Onboarding, Runway, Shuffle, Closet, Add, Looks, Planner, Profiles, Figure
legacy-expo/  the previous React Native version (reference only)
```
