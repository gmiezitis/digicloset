# DigiCloset - Developer Agent Handover Guide

This document is the primary source of truth for **Developer Agents** working on **DigiCloset**. It provides all the necessary context, technical architecture, and design principles to ensure consistent and high-quality contributions.

---

## 🎯 Project Vision & Context

**DigiCloset** is a premium digital wardrobe app that helps users digitize their wardrobe, create outfit combinations, and plan their looks with a high-end, minimalist aesthetic. It is built using **React Native (Expo)** with a **local-first** approach.

### Core Values
1.  **Scandinavian Minimalism**: Clean, spacious, and extremely polished layouts.
2.  **Privacy by Design**: All user data resides on the device by default.
3.  **Visual Excellence**: Smooth transitions (60fps), subtle shadows, and a "premium" feel.
4.  **Effortless Utility**: Quick photo capture, auto-categorization, and intuitive navigation.

---

## 🛠️ Technical Stack & Architecture

### Frontend (Mobile App)
-   **Core**: React Native (Expo SDK 54)
-   **Language**: TypeScript (Strict Mode)
-   **Styling**: React Native StyleSheet + Custom Theme Tokens (`@theme`).
-   **Animations**: React Native Reanimated 2 + Gesture Handler.
-   **Navigation**: React Navigation (Native Stack + Bottom Tabs).
-   **Storage**: Local storage via `FileSystem` + `AsyncStorage`.
-   **State**: `useSyncExternalStore` for predictable, persistent global state.

### Backend (Image Processing Services)
-   **Background Removal**: `rembg-service` (Dockerized Python/FastAPI).
-   **Depth Estimation (Try-On)**: `midas-service` (Dockerized Python/FastAPI).
-   **Cloud Functions**: Firebase Functions (v2) for optional sync and advanced features.

### Key Architectural Patterns
1.  **The Draft-to-Item Pipeline**:
    -   New captures enter as `WardrobeDraft`.
    -   A `DraftSyncQueue` handles asynchronous background tasks (Cloud uploads, AI processing).
    -   User-confirmed drafts are promoted to `WardrobeItem`.
2.  **Coordinator Pattern**:
    -   `cameraCoordinator.ts`: Manages the capture-to-persistence lifecycle.
    -   `draftSyncCoordinator.ts`: Orchestrates synchronization and promotion events.
3.  **Local Sync Engine**:
    -   Automatic retries with exponential backoff.
    -   Telemetry and snapshot tracking for every sync attempt.

---

## 🎨 Design Principles & "The Feel"

Developer agents MUST adhere to the following when building UI:

-   **Color Palette**: Off-white background (`#F8F8F6`), muted teal accents (`#7BA5A3`), and dark gray text (`#1A1A1A`).
-   **Spacing**: Use the 8px base unit (4, 8, 16, 24, 32, 48 scale).
-   **Shadows**: Subtle, low-opacity drop shadows to create depth without clutter.
-   **Animations**: Every layout change or transition MUST be smooth. Use Reanimated hooks (`useAnimatedStyle`, `withTiming`, `withSpring`).
-   **User Psychology**:
    -   **Reward Instantly**: Provide satisfying visual feedback for every user action.
    -   **Reduce Friction**: Auto-categorize and suggest tags whenever possible.
    -   **Surprise & Delight**: Use "Shuffle" features to help users rediscover their own wardrobe.

---

## 📜 Mandatory Coding Rules

Agents MUST follow these rules without exception:

1.  **Simplicity First**: Always choose the simplest solution over a complex one.
2.  **No Duplication**: Search for existing logic in `src/services/` or `src/utils/` before writing new code.
3.  **Clean & Organized**: Files MUST be under **300 lines**. Refactor into smaller components or custom hooks early.
4.  **Environment Aware**: Ensure code works across dev, test, and production environments.
5.  **No Mocks in Dev/Prod**: Real data and services MUST be used. Mocking is ONLY for tests.
6.  **Zod Schema Validation**: Use Zod for all data modeling (see `src/types/`).
7.  **Path Aliases**: ALWAYS use aliases (e.g., `@theme`, `@components`, `@services`).

---

## 🗺️ Roadmap & Current Status

**Current Status**: Sprint 0 Complete (Foundation). Sprint 1 (Add Item Flow) is In Progress.

### Phase 1: Wardrobe Management
-   [ ] **AddItemWizard**: Complete the multi-step capture/tagging flow.
-   [ ] **Background Removal**: Connect `rembg-service` to the `DraftSyncQueue`.
-   [ ] **Hierarchical Categories**: Implement nested tags (e.g., Tops > Sweaters).

### Phase 2: Closet & Discovery
-   [ ] **Closet Grid**: Build a high-performance grid with fast image loading.
-   [ ] **Search & Filter**: Powerful search across categories, colors, and seasons.

### Phase 3: Outfit Builder & Planner
-   [ ] **Outfit Workspace**: Drag-and-drop builder with body silhouettes.
-   [ ] **Smart Shuffle**: Intelligent outfit generation based on logic/categories.
-   [ ] **Planner**: Calendar view for scheduling upcoming looks.

---

## 📂 Project Structure

```text
src/
├── components/     # High-quality UI components
├── screens/        # Primary layout views
├── navigation/     # Navigation logic (Stacks, Tabs)
├── services/       # Core business logic (Stores, Queues, API clients)
├── theme/          # Design system & tokens
├── types/          # Data schemas (Zod) & interfaces
├── hooks/          # Shared logic hooks
└── utils/          # Helper utilities
```

---

> [!IMPORTANT]
> If a task feels "not quite right" in terms of design, it's likely lacking the Scandinavian minimal aesthetic. Focus on **white space**, **balance**, and **typography hierarchy**.
