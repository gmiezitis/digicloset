# Camera Capture & Cleanup Architecture

This module defines the capture pipeline before native camera modules are integrated. It keeps the flow modular, event-driven, and resilient to offline states.

## Service Boundaries

### `CameraService`
- Accepts capture requests through a pluggable `NativeCameraAdapter`.
- Falls back to an optional `fallbackCapture` so the flow works when the native bridge is missing or offline.
- Persists every capture in a `CaptureCacheStore`, versioned with UTC timestamps for conflict resolution.
- Emits structured events for each lifecycle transition:
  - `captureCreated` — local capture persisted.
  - `captureUpdated` — processing progress or metadata change.
  - `captureReady` — background cleanup finished and assets are ready to sync.
  - `captureFailed` — capture or processing failed; retries and errors retained for UX.
- Provides imperative helpers (`markCaptureProcessing`, `markCaptureReady`, `markCaptureFailed`, `markCaptureCached`) so queues can advance captures without mutating shared state directly.
- Logs every transition, enabling downstream telemetry without tight coupling.
- Exposes read APIs (`listCachedCaptures`, `getCachedCapture`) for hooks like `useCaptureProcessing` to surface progress from local cache.

### `BackgroundCleanupQueue`
- Subscribes to `CameraService` events instead of polling so new captures are discovered instantly.
- Schedules cleanup jobs with exponential backoff. Dependencies such as `removeFile`, timers, and clocks are injected for mocking or native replacements.
- Replays jobs on startup by bootstrapping from cached captures that already reached `ready` or `failed` states.
- Calls `cameraService.markCaptureCached()` after local files are removed so storage state stays consistent.
- Emits snapshots of scheduled and running jobs, giving diagnostics or UI surfaces insight into retention work.

Both modules are dependency-injected, letting us swap storage drivers, adapters, or timing logic without rewriting consumers. Tests can supply in-memory doubles, while native builds inject platform implementations.

## Offline Fallbacks & Local-First Data

- Every capture is saved locally before any network call. Draft sync, background removal, and uploads run asynchronously afterward.
- Failed captures persist a record with retries, last error, and a placeholder URI so UX can surface actionable messaging.
- Cached capture lookups always return the last known record, allowing queues and sync orchestrators to recover after crashes or partial storage loss.
- Cleanup jobs rehydrate capture metadata from cache before deleting files, ensuring we never orphan a draft because of missing URIs.

## Event-Driven Notifications

- UI surfaces subscribe to `CameraService` events to update progress indicators (pending → processing → ready/failed) in real time.
- The cleanup queue listens to the same events to schedule file retention or retries, keeping logic decoupled from UI.
- Draft sync and notification modules can hook into these events to trigger retries, nudge users, or schedule uploads.
- Each event is logged with timestamps and identifiers so telemetry exports can reconstruct behaviour without replaying application state.

## Integration Checklist

1. Provide a real `NativeCameraAdapter` implementation (Swift/Kotlin) that matches the `capture()` signature.
2. Replace the in-memory cache with a persistent driver (FileSystem/SQLite) via the `CaptureCacheStore` interface.
3. Wire the queue’s `removeFile` dependency to the native file system.
4. Hook UI or notifications to service events to surface progress and delivery confirmations.
5. Ensure jest mocks reflect the native adapter so tests stay deterministic and faithful to production behaviour.
6. Monitor telemetry for retries and storage failures; surface metrics in release builds to catch flaky devices early.

This setup gives us production-ready boundaries while native work is in flight.