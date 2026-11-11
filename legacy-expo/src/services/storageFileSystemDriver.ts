import * as FileSystem from 'expo-file-system/legacy';
import type { StorageDriver, SyncSnapshot } from './storage';
import type { WardrobeItem } from '@/types/item';
import { validateWardrobeItem } from '@/types/item';
import type { WardrobeDraft } from '@/types/draft';
import { validateWardrobeDraft } from '@/types/draft';
import type { PlannerEntry } from '@/types/planner';
import { validatePlannerEntry } from '@/types/planner';
import type { StyleProfile } from '@/types/styleProfile';
import { validateStyleProfile } from '@/types/styleProfile';

type PersistedState = {
  items: Record<string, WardrobeItem>;
  drafts: Record<string, WardrobeDraft>;
  plannerEntries: Record<string, PlannerEntry>;
  lastSyncSnapshot: SyncSnapshot | null;
  styleProfile: StyleProfile | null;
};

const DIRECTORY_NAME = 'tidless/storage';
const FILE_NAME = 'wardrobe.json';
const expoFs = FileSystem as unknown as {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
};

class FileSystemDriver implements StorageDriver {
  private loaded = false;
  private readonly directory: string;
  private readonly filePath: string;
  private state: PersistedState = {
    items: {},
    drafts: {},
    plannerEntries: {},
    lastSyncSnapshot: null,
    styleProfile: null,
  };
  private writeChain: Promise<void> = Promise.resolve();

  constructor(baseDirectory: string) {
    this.directory = `${baseDirectory}${DIRECTORY_NAME}/`;
    this.filePath = `${this.directory}${FILE_NAME}`;
  }

  async init() {
    if (this.loaded) {
      return;
    }

    await this.ensureDirectory();
    await this.loadState();
    this.loaded = true;
  }

  async getItem(id: string) {
    await this.ensureLoaded();
    return this.state.items[id] ?? null;
  }

  async listItems() {
    await this.ensureLoaded();
    return Object.values(this.state.items);
  }

  async upsertItem(item: WardrobeItem) {
    await this.ensureLoaded();
    this.state.items[item.id] = item;
    await this.persist();
  }

  async deleteItem(id: string) {
    await this.ensureLoaded();
    delete this.state.items[id];
    await this.persist();
  }

  async getDraft(id: string) {
    await this.ensureLoaded();
    return this.state.drafts[id] ?? null;
  }

  async listDrafts() {
    await this.ensureLoaded();
    return Object.values(this.state.drafts);
  }

  async upsertDraft(draft: WardrobeDraft) {
    await this.ensureLoaded();
    this.state.drafts[draft.id] = draft;
    await this.persist();
  }

  async deleteDraft(id: string) {
    await this.ensureLoaded();
    delete this.state.drafts[id];
    await this.persist();
  }

  async getLastSyncSnapshot() {
    await this.ensureLoaded();
    return this.state.lastSyncSnapshot;
  }

  async setLastSyncSnapshot(snapshot: SyncSnapshot | null) {
    await this.ensureLoaded();
    this.state.lastSyncSnapshot = snapshot;
    await this.persist();
  }

  async getPlannerEntry(id: string) {
    await this.ensureLoaded();
    return this.state.plannerEntries[id] ?? null;
  }

  async listPlannerEntries() {
    await this.ensureLoaded();
    return Object.values(this.state.plannerEntries);
  }

  async upsertPlannerEntry(entry: PlannerEntry) {
    await this.ensureLoaded();
    this.state.plannerEntries[entry.id] = entry;
    await this.persist();
  }

  async deletePlannerEntry(id: string) {
    await this.ensureLoaded();
    delete this.state.plannerEntries[id];
    await this.persist();
  }

  async getStyleProfile() {
    await this.ensureLoaded();
    return this.state.styleProfile ?? null;
  }

  async upsertStyleProfile(profile: StyleProfile) {
    await this.ensureLoaded();
    this.state.styleProfile = profile;
    await this.persist();
  }

  private async ensureLoaded() {
    if (!this.loaded) {
      await this.init();
    }
  }

  private async ensureDirectory() {
    const info = await FileSystem.getInfoAsync(this.directory);
    if (!info?.exists) {
      await FileSystem.makeDirectoryAsync(this.directory, { intermediates: true });
    }
  }

  private async loadState() {
    const info = await FileSystem.getInfoAsync(this.filePath);
    if (!info?.exists) {
      await this.persist();
      return;
    }

    try {
      const contents = await FileSystem.readAsStringAsync(this.filePath);
      const parsed = JSON.parse(contents) as Partial<PersistedState>;
      this.state = sanitizeState(parsed);
    } catch (error) {
      console.warn('[storage] Failed to read persisted state, resetting.', error);
      this.state = { items: {}, drafts: {}, plannerEntries: {}, lastSyncSnapshot: null, styleProfile: null };
      await this.persist();
    }
  }

  private persist() {
    this.writeChain = this.writeChain.then(async () => {
      const serialised = JSON.stringify(this.state);
      await FileSystem.writeAsStringAsync(this.filePath, serialised);
    });
    return this.writeChain;
  }
}

function sanitizeState(state: Partial<PersistedState> | undefined): PersistedState {
  const itemsArray = Object.values(state?.items ?? {});
  const validatedItems: Record<string, WardrobeItem> = {};
  const draftsArray = Object.values(state?.drafts ?? {});
  const validatedDrafts: Record<string, WardrobeDraft> = {};
  const plannerArray = Object.values(state?.plannerEntries ?? {});
  const validatedPlannerEntries: Record<string, PlannerEntry> = {};
  let validatedProfile: StyleProfile | null = null;

  itemsArray.forEach(item => {
    try {
      const valid = validateWardrobeItem(item);
      validatedItems[valid.id] = valid;
    } catch (error) {
      console.warn('[storage] Discarded invalid item during load', { item, error });
    }
  });

  draftsArray.forEach(draft => {
    try {
      const valid = validateWardrobeDraft(draft);
      validatedDrafts[valid.id] = valid;
    } catch (error) {
      console.warn('[storage] Discarded invalid draft during load', { draft, error });
    }
  });

  plannerArray.forEach(entry => {
    try {
      const valid = validatePlannerEntry(entry);
      validatedPlannerEntries[valid.id] = valid;
    } catch (error) {
      console.warn('[storage] Discarded invalid planner entry during load', { entry, error });
    }
  });

  if (state?.styleProfile) {
    try {
      validatedProfile = validateStyleProfile(state.styleProfile);
    } catch (error) {
      console.warn('[storage] Discarded invalid style profile during load', { error });
    }
  }

  return {
    items: validatedItems,
    drafts: validatedDrafts,
    plannerEntries: validatedPlannerEntries,
    lastSyncSnapshot: state?.lastSyncSnapshot ?? null,
    styleProfile: validatedProfile,
  };
}

export async function createFileSystemDriver(): Promise<StorageDriver> {
  const baseDirectory =
    expoFs.documentDirectory ?? expoFs.cacheDirectory ?? 'file:///data/data/';
  return new FileSystemDriver(baseDirectory);
}


