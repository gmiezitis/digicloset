# DigiCloset - Quick Start Guide

## 🚀 Get Running in 3 Minutes

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Start the Development Server

```bash
npm start
```

This will open the Expo Dev Tools in your browser.

### Step 3: Run on Your Device

**Option A: Physical Device (Recommended for testing)**

1. Install "Expo Go" app from App Store (iOS) or Play Store (Android)
2. Scan the QR code shown in the terminal/browser
3. App will load on your device

**Option B: iOS Simulator (Mac only)**

```bash
npm run ios
```

**Option C: Android Emulator**

```bash
npm run android
```

---

## ✅ What You'll See

1. **Splash Screen**: "DigiCloset" with smooth fade-in animation
2. **Main App**: Bottom tab navigation with 5 screens:
   - **Closet**: Your wardrobe items (placeholder)
   - **Outfits**: Create outfit combinations (placeholder)
   - **Add** (center button): Add new items (placeholder)
   - **Planner**: Calendar view (placeholder)
   - **Profile**: Settings (placeholder)

---

## 🎨 Current Features

### ✅ Implemented
- Splash screen with branding
- Bottom tab navigation
- 5 placeholder screens
- Scandinavian minimal design system
- TypeScript strict mode
- Path aliases for clean imports

### 🚧 Coming Next (Sprint 1)
- Camera capture for wardrobe items
- Background removal
- Item tagging with hierarchical categories
- Local storage

---

## 📂 Project Structure

```
digicloset/
├── src/
│   ├── constants/          # App constants
│   ├── hooks/             # Custom React hooks
│   ├── navigation/        # Navigation setup
│   ├── screens/           # Screen components
│   └── theme/             # Design tokens
├── assets/                # Images and icons
├── App.tsx                # Root component
├── app.json               # Expo config
└── package.json           # Dependencies
```

---

## 🛠️ Useful Commands

```bash
# Start dev server
npm start

# Start with cache cleared
npm run clear

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Type checking
npm run type-check

# Lint
npm run lint
```

---

## 🐛 Troubleshooting

### Metro bundler won't start
```bash
npm run clear
```

### Can't connect to device
```bash
npm run tunnel
```

### iOS build fails
```bash
cd ios && pod install && cd ..
npm run ios
```

### Android build fails
```bash
cd android && ./gradlew clean && cd ..
npm run android
```

---

## 📖 Next Steps

1. **Read the full README**: `README.md` for project vision and roadmap
2. **Development Guide**: `DEVELOPMENT.md` for coding standards and best practices
3. **Project Status**: `PROJECT_STATUS.md` for current progress and upcoming sprints

---

## 🎯 Ready to Build?

The foundation is complete! Next sprint focuses on the **Add Item Flow**:
- Camera capture
- Background removal
- Hierarchical categories
- Item tagging

See `DEVELOPMENT.md` for detailed implementation guide.

---

**Happy Coding! 🎉**

