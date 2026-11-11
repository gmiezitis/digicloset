# DigiCloset - Digital Wardrobe MVP

A beautiful, minimal digital wardrobe app built with React Native and Expo. Organize your clothes, build outfits, plan your looks, and share your style.

## 🎯 Project Vision

DigiCloset helps users digitize their wardrobe, create outfit combinations, and plan what to wear. The MVP focuses on core functionality with a premium Scandinavian minimal aesthetic.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Expo Go app on your phone (for testing)

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

## 📱 Current Features (v1.0.0)

### ✅ Completed

- **Splash Screen**: Branded launch experience with smooth animations
- **Navigation Shell**: Bottom tab navigation with 5 main sections
- **Design System**: Complete theme tokens (colors, spacing, typography, shadows)
- **Screen Placeholders**: 
  - Closet (wardrobe grid)
  - Outfit Builder (create looks)
  - Add Item (camera/upload)
  - Planner (calendar)
  - Profile (settings)

## 🗺️ Roadmap - Next Development Slices

### Phase 1: Core Wardrobe Management (Weeks 1-2)

#### Slice 1: Add Item Flow
- Camera integration with expo-camera
- Gallery picker with expo-image-picker
- Image compression and optimization
- Background removal API integration (remove.bg)
- Manual brush/erase tool for corrections
- Item tagging system:
  - **Hierarchical categories**: 
    - Main: Tops, Bottoms, Dresses, Outerwear, Shoes, Accessories
    - Sub-categories: Blouses, Sweaters, T-shirts, Jeans, Skirts, etc.
  - **Seasonal tags**: Spring, Summer, Fall, Winter, All-season
  - **Color detection**: Auto-suggest + manual override
  - **Optional metadata**: Brand, location, price, notes
  - **Label visibility**: Toggle which fields show in grid view
- Local storage with file system

#### Slice 2: Closet Grid & Management
- Fast FlatList with thumbnail optimization
- Search functionality
- Filter chips (category, color, season)
- Item detail view (full image, edit tags, delete)
- Grid/list view toggle
- Sort options (date added, color, category)

### Phase 2: Outfit Creation & Planning (Week 3)

#### Slice 3: Outfit Builder
- Canvas-based outfit composition
- Item picker by category
- Layering controls (bring forward/back)
- **Silhouette backgrounds**: Woman, man, child body outlines
- Drag items onto silhouette
- Scale, rotate, position items
- Save outfit combinations
- Generate outfit preview images
- **Saved Looks**: Favorite outfit collections
- **Shuffle Mode**:
  - Smart outfit randomization
  - Category-specific shuffle (tops only, bottoms only, etc.)
  - Exclude items from shuffle
  - Keep some items while shuffling others
  - "Try new outfits" collection

#### Slice 4: Calendar Planner
- Month/week calendar view
- Assign outfits to dates
- Quick outfit preview on calendar
- Notes per day
- Upcoming outfits list view

### Phase 3: Polish & Premium Features (Week 4)

#### Slice 5: Pro Features (Future Premium Tier)
- **Extended wardrobes**: 
  - Men's wardrobe
  - Children's wardrobe
  - Pet accessories (dog, cat)
- Cloud sync & backup
- Advanced AI outfit suggestions
- Weather-based recommendations
- Wear frequency analytics
- Virtual try-on (AR)

#### Slice 6: Sharing & Export
- Share outfit as image
- Native share sheet integration
- Export wardrobe data (JSON)
- Import/restore functionality

#### Slice 7: Settings & Preferences
- Theme toggle (light/dark - future)
- Analytics opt-in/out
- Notification preferences
- Data export/delete (GDPR)
- Feedback form
- Privacy policy & terms

## 🏗️ Project Structure

```
digicloset/
├── src/
│   ├── components/        # Reusable UI components
│   ├── screens/          # Screen components
│   │   ├── SplashScreen.tsx
│   │   ├── ClosetScreen.tsx
│   │   ├── OutfitBuilderScreen.tsx
│   │   ├── AddItemScreen.tsx
│   │   ├── PlannerScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── navigation/       # Navigation configuration
│   │   ├── TabNavigator.tsx
│   │   └── index.tsx
│   ├── hooks/           # Custom React hooks
│   │   └── useCachedResources.ts
│   ├── theme/           # Design tokens
│   │   └── tokens.ts
│   ├── constants/       # App constants
│   │   └── index.ts
│   ├── utils/           # Helper functions (future)
│   ├── services/        # API services (future)
│   └── types/           # TypeScript types (future)
├── assets/              # Images, fonts, icons
├── App.tsx              # Root component
├── app.json             # Expo configuration
├── package.json
└── tsconfig.json
```

## 🎨 Design System

### Color Palette (Scandinavian Minimal)
- **Background**: `#F8F8F6` (off-white)
- **Surface**: `#FFFFFF` (pure white)
- **Primary Accent**: `#7BA5A3` (muted teal)
- **Secondary Accent**: `#E8B4A0` (soft salmon)
- **Text**: `#1A1A1A` to `#8A8A86` (dark to light gray)

### Typography
- System fonts (San Francisco on iOS, Roboto on Android)
- Clear hierarchy with 7 size scales
- Generous touch targets (44px minimum)

### Spacing
- 8px base unit
- Scales: 4, 8, 16, 24, 32, 48

### Shadows
- Subtle drop shadows for depth
- 3 levels: sm, md, lg

## 🛠️ Tech Stack

- **Framework**: React Native (Expo managed workflow)
- **Language**: TypeScript
- **Navigation**: React Navigation v6
- **Animations**: Reanimated 2
- **Gestures**: React Native Gesture Handler
- **State Management**: React hooks (Context API for future global state)
- **Storage**: Expo FileSystem + AsyncStorage (SQLite/Realm coming)
- **Image Processing**: expo-image-picker, expo-camera
- **Background Removal**: remove.bg API (future)

## 📦 Key Dependencies

```json
{
  "expo": "~54.0.22",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "@react-navigation/native": "^6.x",
  "@react-navigation/bottom-tabs": "^6.x",
  "react-native-reanimated": "^3.x",
  "react-native-gesture-handler": "^2.x",
  "expo-splash-screen": "^0.x",
  "expo-font": "^12.x"
}
```

## 🧪 Testing Strategy (Future)

- Unit tests with Jest
- Component tests with React Native Testing Library
- E2E tests with Detox
- Visual regression tests

## 📱 Platform Support

- **iOS**: 13.0+
- **Android**: API 21+ (Android 5.0+)
- **Target Devices**: iPhone 12+, mid-range Android phones

## 🔐 Privacy & Security

- **Local-first**: All data stored on device by default
- **Minimal PII**: No personal data collected in MVP
- **GDPR Ready**: Export and delete functionality
- **Analytics**: Opt-in only (Firebase Analytics planned)

## 🚢 Release Plan

### MVP Timeline (4 weeks)
- **Week 1**: Add item flow + closet grid
- **Week 2**: Outfit builder + silhouettes
- **Week 3**: Planner + shuffle features
- **Week 4**: Polish, testing, store submission

### Store Submission
- App Store (TestFlight beta)
- Google Play Store (Internal testing)

## 🤝 Contributing

This is currently a solo project. Contribution guidelines will be added in the future.

## 📄 License

Proprietary - All rights reserved

## 📞 Contact

For questions or feedback: [Add contact info]

---

**Current Status**: 🟢 Active Development - Splash & Navigation Complete

**Next Up**: Add Item Flow (Camera + Background Removal)

