# Development Guide - DigiCloset

## Quick Start

```bash
# Install dependencies
npm install

# Start Expo dev server
npm start

# Or run directly on platform
npm run ios     # iOS simulator
npm run android # Android emulator
```

## Development Workflow

### 1. Feature Development Process

Each feature should be developed as a "slice" - a complete vertical feature that can be tested independently:

1. Create necessary components in `src/components/`
2. Update or create screens in `src/screens/`
3. Add navigation if needed in `src/navigation/`
4. Update types in `src/types/`
5. Test on both iOS and Android

### 2. Code Organization

```
src/
├── components/       # Reusable UI components
│   ├── common/      # Buttons, inputs, cards, etc.
│   ├── closet/      # Closet-specific components
│   ├── outfit/      # Outfit builder components
│   └── planner/     # Calendar components
├── screens/         # Full screen views
├── navigation/      # Navigation configuration
├── hooks/          # Custom React hooks
├── services/       # API calls, storage, etc.
├── utils/          # Helper functions
├── types/          # TypeScript type definitions
├── theme/          # Design tokens
└── constants/      # App constants
```

### 3. Design Tokens Usage

Always use design tokens from `@theme` instead of hardcoded values:

```typescript
import { colors, spacing, typography, shadows } from '@theme';

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
});
```

### 4. Path Aliases

Use path aliases for cleaner imports:

```typescript
// ✅ Good
import { colors } from '@theme';
import { Button } from '@components/common/Button';
import { ClosetScreen } from '@screens';

// ❌ Avoid
import { colors } from '../../../theme/tokens';
```

## Next Development Slices

### Slice 1: Add Item Flow (Priority 1)

**Goal**: Allow users to add wardrobe items with photos and tags

**Tasks**:
1. Create `AddItemFlow` component with step-by-step wizard
2. Integrate `expo-camera` for photo capture
3. Integrate `expo-image-picker` for gallery selection
4. Add image compression utility
5. Create background removal service (remove.bg API)
6. Build manual brush/erase tool (canvas-based)
7. Create tagging form with hierarchical categories
8. Implement local file storage
9. Add item to local database

**Files to create**:
- `src/components/camera/CameraCapture.tsx`
- `src/components/camera/ImageEditor.tsx`
- `src/components/forms/ItemTagForm.tsx`
- `src/services/backgroundRemoval.ts`
- `src/services/storage.ts`
- `src/utils/imageProcessing.ts`
- `src/types/item.ts`

**Dependencies to add**:
```bash
npm install expo-camera expo-image-picker expo-file-system react-native-canvas
```

### Slice 2: Closet Grid (Priority 2)

**Goal**: Display wardrobe items in a performant grid

**Tasks**:
1. Set up local database (SQLite or Realm)
2. Create item data models
3. Build optimized FlatList grid
4. Generate and cache thumbnails
5. Add search functionality
6. Create filter chips UI
7. Implement sort options
8. Build item detail modal

**Files to create**:
- `src/components/closet/ItemGrid.tsx`
- `src/components/closet/ItemCard.tsx`
- `src/components/closet/FilterBar.tsx`
- `src/components/closet/SearchBar.tsx`
- `src/components/closet/ItemDetail.tsx`
- `src/services/database.ts`
- `src/hooks/useItems.ts`

**Dependencies to add**:
```bash
npm install @realm/react realm expo-sqlite
```

### Slice 3: Outfit Builder (Priority 3)

**Goal**: Create and save outfit combinations

**Tasks**:
1. Build canvas-based outfit workspace
2. Create silhouette backgrounds (woman/man/child)
3. Implement drag-and-drop for items
4. Add layering controls (z-index management)
5. Scale, rotate, position controls
6. Save outfit composition
7. Generate outfit preview image
8. Create "Saved Looks" collection
9. Build shuffle mode with smart randomization

**Files to create**:
- `src/components/outfit/OutfitCanvas.tsx`
- `src/components/outfit/Silhouette.tsx`
- `src/components/outfit/ItemPicker.tsx`
- `src/components/outfit/LayerControls.tsx`
- `src/components/outfit/ShuffleMode.tsx`
- `src/services/outfitGenerator.ts`
- `src/types/outfit.ts`

## Performance Best Practices

### 1. Image Optimization

```typescript
// Always compress images before storage
const compressedImage = await ImageManipulator.manipulateAsync(
  imageUri,
  [{ resize: { width: MAX_IMAGE_SIZE } }],
  { compress: IMAGE_COMPRESSION_QUALITY, format: SaveFormat.JPEG }
);

// Generate thumbnails for grid views
const thumbnail = await ImageManipulator.manipulateAsync(
  imageUri,
  [{ resize: { width: THUMBNAIL_SIZE } }],
  { compress: 0.7, format: SaveFormat.JPEG }
);
```

### 2. List Performance

```typescript
// Use proper FlatList optimization
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  windowSize={10}
  maxToRenderPerBatch={10}
  updateCellsBatchingPeriod={50}
  removeClippedSubviews={true}
  getItemLayout={getItemLayout} // If fixed height
/>
```

### 3. Memoization

```typescript
// Memoize expensive computations
const filteredItems = useMemo(() => {
  return items.filter(item => 
    item.category === selectedCategory
  );
}, [items, selectedCategory]);

// Memoize components
const ItemCard = React.memo(({ item }) => {
  // ...
});
```

## Testing

### Running Tests (Future)

```bash
# Unit tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Manual Testing Checklist

- [ ] Splash screen displays correctly
- [ ] Navigation tabs work on both iOS and Android
- [ ] All screens are accessible
- [ ] Back button works correctly (Android)
- [ ] App doesn't crash on background/foreground
- [ ] Memory usage is reasonable
- [ ] No console warnings or errors

## Debugging

### Expo Dev Tools

```bash
# Open dev menu
# iOS: Cmd+D
# Android: Cmd+M (Mac) or Ctrl+M (Windows/Linux)
```

### Common Issues

**Metro bundler issues**:
```bash
# Clear cache and restart
npm start -- --clear
```

**iOS build issues**:
```bash
cd ios && pod install && cd ..
npm run ios
```

**Android build issues**:
```bash
cd android && ./gradlew clean && cd ..
npm run android
```

## Environment Setup

### Required Tools

- Node.js 18+
- Xcode 14+ (for iOS development)
- Android Studio (for Android development)
- Expo CLI (installed via npx)

### Optional Tools

- React Native Debugger
- Flipper (for advanced debugging)
- Reactotron (for state inspection)

## Code Style

### TypeScript

- Use strict mode
- Define interfaces for all data structures
- Avoid `any` type
- Use proper type inference

### React

- Use functional components with hooks
- Prefer named exports over default exports
- Keep components under 200 lines
- Extract complex logic into custom hooks

### Naming Conventions

- Components: PascalCase (`ItemCard.tsx`)
- Hooks: camelCase with 'use' prefix (`useItems.ts`)
- Utils: camelCase (`imageProcessing.ts`)
- Constants: UPPER_SNAKE_CASE (`MAX_IMAGE_SIZE`)
- Types: PascalCase (`Item`, `Outfit`)

## Git Workflow

```bash
# Feature branches
git checkout -b feature/add-item-flow

# Commit messages
git commit -m "feat: add camera capture component"
git commit -m "fix: resolve image compression issue"
git commit -m "docs: update development guide"

# Conventional commits
# feat: new feature
# fix: bug fix
# docs: documentation
# style: formatting
# refactor: code restructuring
# test: adding tests
# chore: maintenance
```

## Release Process (Future)

1. Update version in `app.json` and `package.json`
2. Run full test suite
3. Build with EAS Build
4. Submit to TestFlight/Play Store Internal Testing
5. Test on real devices
6. Release to production

---

**Happy Coding! 🚀**

