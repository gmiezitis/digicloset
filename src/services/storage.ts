import { Platform } from 'react-native';
import type { WardrobeItem, SyncStatus, ItemRevision } from '@/types/item';
import { markSyncStatus } from '@/types/item';
import type { PlannerEntry } from '@/types/planner';
import { validatePlannerEntry } from '@/types/planner';
import type { WardrobeDraft, AddItemWizardDraftPayload } from '@/types/draft';
import { createWardrobeDraftFromWizard, validateWardrobeDraft } from '@/types/draft';
import type { StyleProfile, ProfileRevision } from '@/types/styleProfile';
import { validateStyleProfile } from '@/types/styleProfile';

const LOG_TAG = '[storage]';
const DRAFT_VERSION = 1;

export type SyncSnapshot = {
  status: SyncStatus;
  revisionId: string | null;
  timestampUtc: string;
};

export type UpsertResult =
  | { applied: true; item: WardrobeItem }
  | { applied: false; item: WardrobeItem; reason: 'staleRevision' };

export type DraftUpsertResult =
  | { applied: true; draft: WardrobeDraft }
  | { applied: false; draft: WardrobeDraft; reason: 'staleRevision' };

export type PlannerUpsertResult =
  | { applied: true; entry: PlannerEntry }
  | { applied: false; entry: PlannerEntry; reason: 'staleRevision' };

export type StyleProfileUpsertResult =
  | { applied: true; profile: StyleProfile }
  | { applied: false; profile: StyleProfile; reason: 'staleRevision' };

export interface StorageDriver {
  init(): Promise<void>;
  getItem(id: string): Promise<WardrobeItem | null>;
  listItems(): Promise<WardrobeItem[]>;
  upsertItem(item: WardrobeItem): Promise<void>;
  deleteItem(id: string): Promise<void>;
  getDraft(id: string): Promise<WardrobeDraft | null>;
  listDrafts(): Promise<WardrobeDraft[]>;
  upsertDraft(draft: WardrobeDraft): Promise<void>;
  deleteDraft(id: string): Promise<void>;
  getLastSyncSnapshot(): Promise<SyncSnapshot | null>;
  setLastSyncSnapshot(snapshot: SyncSnapshot | null): Promise<void>;
  getPlannerEntry(id: string): Promise<PlannerEntry | null>;
  listPlannerEntries(): Promise<PlannerEntry[]>;
  upsertPlannerEntry(entry: PlannerEntry): Promise<void>;
  deletePlannerEntry(id: string): Promise<void>;
  getStyleProfile(): Promise<StyleProfile | null>;
  upsertStyleProfile(profile: StyleProfile): Promise<void>;
}

type PersistedState = {
  items: Record<string, WardrobeItem>;
  drafts: Record<string, WardrobeDraft>;
  plannerEntries: Record<string, PlannerEntry>;
  lastSyncSnapshot: SyncSnapshot | null;
  styleProfile: StyleProfile | null;
};

class InMemoryDriver implements StorageDriver {
  private state: PersistedState = {
    items: {},
    drafts: {},
    plannerEntries: {},
    lastSyncSnapshot: null,
    styleProfile: null,
  };

  async init() {
    /* noop */
  }

  async getItem(id: string) {
    return this.state.items[id] ?? null;
  }

  async listItems() {
    return Object.values(this.state.items);
  }

  async upsertItem(item: WardrobeItem) {
    this.state.items[item.id] = item;
  }

  async deleteItem(id: string) {
    delete this.state.items[id];
  }

  async getDraft(id: string) {
    return this.state.drafts[id] ?? null;
  }

  async listDrafts() {
    return Object.values(this.state.drafts);
  }

  async upsertDraft(draft: WardrobeDraft) {
    this.state.drafts[draft.id] = draft;
  }

  async deleteDraft(id: string) {
    delete this.state.drafts[id];
  }

  async getLastSyncSnapshot() {
    return this.state.lastSyncSnapshot;
  }

  async setLastSyncSnapshot(snapshot: SyncSnapshot | null) {
    this.state.lastSyncSnapshot = snapshot;
  }

  async getPlannerEntry(id: string) {
    return this.state.plannerEntries[id] ?? null;
  }

  async listPlannerEntries() {
    return Object.values(this.state.plannerEntries);
  }

  async upsertPlannerEntry(entry: PlannerEntry) {
    this.state.plannerEntries[entry.id] = entry;
  }

  async deletePlannerEntry(id: string) {
    delete this.state.plannerEntries[id];
  }

  async getStyleProfile() {
    return this.state.styleProfile ?? null;
  }

  async upsertStyleProfile(profile: StyleProfile) {
    this.state.styleProfile = profile;
  }
}

export function createInMemoryDriver(): StorageDriver {
  return new InMemoryDriver();
}

let driver: StorageDriver | null = null;

export async function initializeStorage(customDriver?: StorageDriver) {
  if (customDriver) {
    driver = customDriver;
  } else if (!driver) {
    driver = await createDefaultDriver();
  }

  if (!driver) {
    throw new Error('Storage driver failed to initialize.');
  }

  await driver.init();
  log('initialized');
}

async function ensureDriver(): Promise<StorageDriver> {
  if (!driver) {
    await initializeStorage();
  }
  if (!driver) {
    throw new Error('Storage driver failed to initialize.');
  }
  return driver;
}

export async function getWardrobeItem(id: string) {
  const activeDriver = await ensureDriver();
  return activeDriver.getItem(id);
}

export async function listWardrobeItems() {
  const activeDriver = await ensureDriver();
  return activeDriver.listItems();
}

export async function getWardrobeDraft(id: string) {
  const activeDriver = await ensureDriver();
  return activeDriver.getDraft(id);
}

export async function listWardrobeDrafts() {
  const activeDriver = await ensureDriver();
  return activeDriver.listDrafts();
}

export async function removeWardrobeItem(id: string) {
  const activeDriver = await ensureDriver();
  await runSafely('remove', () => activeDriver.deleteItem(id), { id });
}

export async function removeWardrobeDraft(id: string) {
  const activeDriver = await ensureDriver();
  await runSafely('draft-remove', () => activeDriver.deleteDraft(id), { id });
}

export async function getPlannerEntry(id: string) {
  const activeDriver = await ensureDriver();
  return activeDriver.getPlannerEntry(id);
}

export async function listPlannerEntries() {
  const activeDriver = await ensureDriver();
  return activeDriver.listPlannerEntries();
}

export async function removePlannerEntry(id: string) {
  const activeDriver = await ensureDriver();
  await runSafely('planner-remove', () => activeDriver.deletePlannerEntry(id), { id });
}

export async function getStyleProfile() {
  const activeDriver = await ensureDriver();
  return activeDriver.getStyleProfile();
}

export async function upsertStyleProfile(profile: StyleProfile): Promise<StyleProfileUpsertResult> {
  const activeDriver = await ensureDriver();
  const validProfile = validateStyleProfile(profile);
  const existing = await activeDriver.getStyleProfile();

  if (existing && !isProfileRevisionNewer(validProfile.revision, existing.revision)) {
    log('style-profile-upsert-skipped', {
      revisionId: validProfile.revision.revisionId,
      reason: 'staleRevision',
    });
    return { applied: false, profile: existing, reason: 'staleRevision' };
  }

  await runSafely('style-profile-upsert', () => activeDriver.upsertStyleProfile(validProfile), {
    revisionId: validProfile.revision.revisionId,
  });

  return { applied: true, profile: validProfile };
}

export async function upsertWardrobeItem(item: WardrobeItem): Promise<UpsertResult> {
  const activeDriver = await ensureDriver();
  const existing = await activeDriver.getItem(item.id);

  if (existing && !isNewerRevision(item.revision, existing.revision)) {
    log('upsert-skipped', { id: item.id, reason: 'staleRevision' });
    return { applied: false, item: existing, reason: 'staleRevision' };
  }

  await runSafely('upsert', () => activeDriver.upsertItem(item), {
    id: item.id,
    revisionId: item.revision.revisionId,
  });

  return { applied: true, item };
}

export async function upsertWardrobeDraft(draft: WardrobeDraft): Promise<DraftUpsertResult> {
  const activeDriver = await ensureDriver();
  const validDraft = validateWardrobeDraft(draft);
  const existing = await activeDriver.getDraft(validDraft.id);

  if (existing && !isNewerRevision(validDraft.revision, existing.revision)) {
    log('draft-upsert-skipped', { id: validDraft.id, reason: 'staleRevision' });
    return { applied: false, draft: existing, reason: 'staleRevision' };
  }

  await runSafely(
    'draft-upsert',
    () => activeDriver.upsertDraft(validDraft),
    {
      id: validDraft.id,
      revisionId: validDraft.revision.revisionId,
      version: validDraft.version,
    }
  );

  return { applied: true, draft: validDraft };
}

export async function upsertPlannerEntry(entry: PlannerEntry): Promise<PlannerUpsertResult> {
  const activeDriver = await ensureDriver();
  const validEntry = validatePlannerEntry(entry);
  const existing = await activeDriver.getPlannerEntry(validEntry.id);

  if (existing && !isNewerRevision(validEntry.revision, existing.revision)) {
    log('planner-upsert-skipped', { id: validEntry.id, reason: 'staleRevision' });
    return { applied: false, entry: existing, reason: 'staleRevision' };
  }

  await runSafely(
    'planner-upsert',
    () => activeDriver.upsertPlannerEntry(validEntry),
    {
      id: validEntry.id,
      calendarDate: validEntry.calendarDate,
      revisionId: validEntry.revision.revisionId,
      orderIndex: validEntry.orderIndex,
    }
  );

  return { applied: true, entry: validEntry };
}

export async function markWardrobeItemSyncStatus(
  id: string,
  status: SyncStatus,
  revisionOverrides?: Partial<ItemRevision>
) {
  const activeDriver = await ensureDriver();
  const existing = await activeDriver.getItem(id);
  if (!existing) {
    log('mark-sync-miss', { id, status });
    return null;
  }

  const updated = markSyncStatus(existing, status, revisionOverrides);
  await runSafely('mark-sync', () => activeDriver.upsertItem(updated), {
    id,
    status,
  });
  return updated;
}

export async function getLastSyncSnapshot() {
  const activeDriver = await ensureDriver();
  return activeDriver.getLastSyncSnapshot();
}

export async function setLastSyncSnapshot(snapshot: SyncSnapshot | null) {
  const activeDriver = await ensureDriver();
  await runSafely('set-last-sync', () => activeDriver.setLastSyncSnapshot(snapshot), snapshot);
}

export async function saveAddItemWizardDraft(
  payload: AddItemWizardDraftPayload,
  options?: {
    nowUtc?: () => string;
    generateId?: () => string;
    generateRevisionId?: () => string;
    version?: number;
  }
): Promise<WardrobeDraft> {
  const nowUtc = options?.nowUtc ?? defaultNowUtc;
  const generateId = options?.generateId ?? (() => createRandomId('draft'));
  const generateRevisionId = options?.generateRevisionId ?? (() => createRandomId('rev'));
  const version = options?.version ?? DRAFT_VERSION;

  const draft = createWardrobeDraftFromWizard(payload, {
    nowUtc,
    generateId,
    generateRevisionId,
    version,
  });

  const result = await upsertWardrobeDraft(draft);
  if (!result.applied) {
    log('draft-upsert-stale', { id: result.draft.id });
    return result.draft;
  }

  log('draft-saved', { id: result.draft.id, name: payload.name });
  log('draft-sync-state', {
    id: result.draft.id,
    syncStatus: result.draft.syncStatus,
    lastSyncAttemptUtc: result.draft.lastSyncAttemptUtc,
    category: result.draft.category,
    seasons: result.draft.seasons,
  });
  return result.draft;
}

function isNewerRevision(next: ItemRevision, current: ItemRevision) {
  return Date.parse(next.updatedAtUtc) > Date.parse(current.updatedAtUtc);
}

function isProfileRevisionNewer(next: ProfileRevision, current: ProfileRevision) {
  return Date.parse(next.updatedAtUtc) > Date.parse(current.updatedAtUtc);
}

async function runSafely<T>(event: string, task: () => Promise<T>, metadata?: unknown) {
  try {
    const result = await task();
    log(event, metadata);
    return result;
  } catch (error) {
    logError(event, error, metadata);
    throw error;
  }
}

function log(event: string, metadata?: unknown) {
  if (metadata) {
    console.log(`${LOG_TAG} ${event}`, metadata);
  } else {
    console.log(`${LOG_TAG} ${event}`);
  }
}

function logError(event: string, error: unknown, metadata?: unknown) {
  console.error(`${LOG_TAG} ${event} failed`, { error, metadata });
}

async function createDefaultDriver(): Promise<StorageDriver> {
  if (Platform.OS === 'web') {
    log('using-in-memory-driver', { reason: 'web-platform' });
    return createInMemoryDriver();
  }

  try {
    const { createFileSystemDriver } = await import('./storageFileSystemDriver');
    return createFileSystemDriver();
  } catch (error) {
    logError('fs-driver-unavailable', error);
    return createInMemoryDriver();
  }
}

export function defaultNowUtc() {
  return new Date().toISOString();
}

export function createRandomId(prefix: string) {
  const cryptoGlobal = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const uuid = cryptoGlobal?.randomUUID?.();
  if (uuid) {
    return `${prefix}_${uuid}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}_${random}`;
}


