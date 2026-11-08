# DigiCloset (iOS)

A digital closet for you, your friends and your pets. Style looks on studio
mannequins, match outfits across people and animals, and plan what to wear.

## Run it

Open `DigiCloset.xcodeproj` in Xcode 27 and run on an iPhone simulator or device
(iOS 18+). The app seeds a sample closet (Me, Sofia, Biscuit the dog, Luna the cat)
on first launch.

## How it's built

- **SwiftUI + SwiftData**, Swift 6 strict concurrency, no third-party dependencies.
- **Local-first**: everything is stored on the device. Photos use external storage
  so the database stays small; closet queries are indexed by owner and category.
- **On-device background removal** with Apple Vision (`CutoutService`), plus
  automatic colour detection. No server, no per-image cost.
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
  Services/   cutout, image cache, colour matching
  Views/      Runway, Closet, Add, Looks, Planner, Profiles, Figure
legacy-expo/  the previous React Native version (reference only)
```
