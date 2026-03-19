import { useSyncExternalStore } from 'react';
import {
  BrandSizeExceptionEntry,
  MeasurementUnit,
  StyleProfile,
  SizePreferenceEntry,
  STYLE_PROFILE_VERSION,
  createDefaultStyleProfile,
  normalizeOrder,
} from '@/types/styleProfile';
import {
  createRandomId,
  defaultNowUtc,
  getStyleProfile,
  initializeStorage,
  upsertStyleProfile,
} from './storage';

const LOG_TAG = '[style-profile-store]';

type Listener = () => void;

type StyleProfileState = {
  loading: boolean;
  profile: StyleProfile | null;
  error: string | null;
};

export type MeasurementPayload = {
  id?: string;
  label: string;
  value: number;
  unit: MeasurementUnit;
  notes?: string;
};

export type SizePreferencePayload = {
  id?: string;
  garmentType: SizePreferenceEntry['garmentType'];
  sizeLabel: string;
  notes?: string;
};

export type BrandExceptionPayload = {
  id?: string;
  brand: string;
  garmentType: BrandSizeExceptionEntry['garmentType'];
  sizeLabel: string;
  notes?: string;
};

type ReorderDirection = 'up' | 'down';

export class StyleProfileStore {
  private state: StyleProfileState = { loading: true, profile: null, error: null };
  private listeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState(): StyleProfileState {
    return this.state;
  }

  async initialize() {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await initializeStorage();
        await this.refresh();
      })().catch(error => {
        this.logError('initialize', error);
        throw error;
      });
    }

    return this.initPromise;
  }

  async refresh() {
    this.setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const profile = (await getStyleProfile()) ?? (await this.persistDefaultProfile());
      this.setState(() => ({ loading: false, profile, error: null }));
      this.log('refreshed', { revisionId: profile.revision.revisionId });
    } catch (error) {
      this.logError('refresh', error);
      this.setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  async saveMeasurement(payload: MeasurementPayload) {
    return this.applyProfile(current => {
      const label = payload.label.trim();
      if (!label) {
        return current;
      }
      if (!(payload.value > 0)) {
        return current;
      }
      const now = defaultNowUtc();
      const targetId = payload.id ?? createRandomId('measure');
      const existing = current.measurements.find(entry => entry.id === targetId);
      const nextEntry = {
        id: targetId,
        label,
        value: Number(payload.value),
        unit: payload.unit,
        notes: payload.notes?.trim() || undefined,
        orderIndex: existing?.orderIndex ?? current.measurements.length,
        updatedAtUtc: now,
      };
      const nextMeasurements = normalizeOrder([
        ...current.measurements.filter(entry => entry.id !== targetId),
        nextEntry,
      ]);
      this.log('measurement-saved', { id: targetId });
      return {
        ...current,
        measurements: nextMeasurements,
      };
    });
  }

  async deleteMeasurement(id: string) {
    return this.applyProfile(current => {
      const nextMeasurements = normalizeOrder(
        current.measurements.filter(entry => entry.id !== id)
      );
      this.log('measurement-deleted', { id });
      return {
        ...current,
        measurements: nextMeasurements,
      };
    });
  }

  async reorderMeasurement(id: string, direction: ReorderDirection) {
    return this.applyProfile(current => ({
      ...current,
      measurements: this.reorderEntries(current.measurements, id, direction),
    }));
  }

  async saveSizePreference(payload: SizePreferencePayload) {
    return this.applyProfile(current => {
      const sizeLabel = payload.sizeLabel.trim();
      if (!sizeLabel) {
        return current;
      }
      const now = defaultNowUtc();
      const targetId = payload.id ?? createRandomId('size');
      const existing = current.sizePreferences.find(entry => entry.id === targetId);
      const nextEntry: SizePreferenceEntry = {
        id: targetId,
        garmentType: payload.garmentType,
        sizeLabel,
        notes: payload.notes?.trim() || undefined,
        orderIndex: existing?.orderIndex ?? current.sizePreferences.length,
        updatedAtUtc: now,
      };
      const nextPreferences = normalizeOrder([
        ...current.sizePreferences.filter(entry => entry.id !== targetId),
        nextEntry,
      ]);
      this.log('size-preference-saved', { id: targetId, garmentType: payload.garmentType });
      return {
        ...current,
        sizePreferences: nextPreferences,
      };
    });
  }

  async deleteSizePreference(id: string) {
    return this.applyProfile(current => ({
      ...current,
      sizePreferences: normalizeOrder(
        current.sizePreferences.filter(entry => entry.id !== id)
      ),
    }));
  }

  async reorderSizePreference(id: string, direction: ReorderDirection) {
    return this.applyProfile(current => ({
      ...current,
      sizePreferences: this.reorderEntries(current.sizePreferences, id, direction),
    }));
  }

  async saveBrandException(payload: BrandExceptionPayload) {
    return this.applyProfile(current => {
      const brand = payload.brand.trim();
      const sizeLabel = payload.sizeLabel.trim();
      if (!brand || !sizeLabel) {
        return current;
      }
      const now = defaultNowUtc();
      const targetId = payload.id ?? createRandomId('brand-size');
      const nextEntry: BrandSizeExceptionEntry = {
        id: targetId,
        brand,
        garmentType: payload.garmentType,
        sizeLabel,
        notes: payload.notes?.trim() || undefined,
        updatedAtUtc: now,
      };
      const withoutTarget = current.brandSizeExceptions.filter(entry => entry.id !== targetId);
      const nextExceptions = [nextEntry, ...withoutTarget].sort(
        (a, b) => Date.parse(b.updatedAtUtc) - Date.parse(a.updatedAtUtc)
      );
      this.log('brand-exception-saved', { id: targetId, brand });
      return {
        ...current,
        brandSizeExceptions: nextExceptions,
      };
    });
  }

  async deleteBrandException(id: string) {
    return this.applyProfile(current => ({
      ...current,
      brandSizeExceptions: current.brandSizeExceptions.filter(entry => entry.id !== id),
    }));
  }

  private async applyProfile(mutator: (draft: StyleProfile) => StyleProfile) {
    this.setState(prev => ({ ...prev, loading: true }));
    try {
      const base = this.state.profile ?? (await this.ensureProfileFromStorage());
      const draft = this.cloneProfile(base);
      const mutated = mutator(draft);
      const now = defaultNowUtc();
      const next: StyleProfile = {
        ...mutated,
        id: 'style-profile',
        version: STYLE_PROFILE_VERSION,
        updatedAtUtc: now,
        revision: {
          revisionId: createRandomId('rev'),
          updatedAtUtc: now,
        },
      };
      const result = await upsertStyleProfile(next);
      const applied = result.applied ? next : result.profile;
      this.setState(prev => ({ ...prev, loading: false, profile: applied, error: null }));
      this.log('profile-applied', { revisionId: applied.revision.revisionId });
      return applied;
    } catch (error) {
      this.logError('profile-apply', error);
      this.setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
      throw error;
    }
  }

  private async ensureProfileFromStorage() {
    const profile = await getStyleProfile();
    if (profile) {
      return profile;
    }
    return this.persistDefaultProfile();
  }

  private async persistDefaultProfile() {
    const profile = createDefaultStyleProfile({
      nowUtc: defaultNowUtc,
      generateId: prefix => createRandomId(prefix),
      generateRevisionId: () => createRandomId('rev'),
    });
    await upsertStyleProfile(profile);
    return profile;
  }

  private reorderEntries<T extends { id: string; orderIndex: number; updatedAtUtc: string }>(
    entries: T[],
    id: string,
    direction: ReorderDirection
  ): T[] {
    const index = entries.findIndex(entry => entry.id === id);
    if (index === -1) {
      return entries;
    }
    const nextIndex =
      direction === 'up' ? Math.max(0, index - 1) : Math.min(entries.length - 1, index + 1);
    if (index === nextIndex) {
      return entries;
    }
    const clone = [...entries];
    const [moved] = clone.splice(index, 1);
    clone.splice(nextIndex, 0, moved);
    const timestamp = defaultNowUtc();
    return clone.map((entry, orderIndex) => ({
      ...entry,
      orderIndex,
      updatedAtUtc: entry.id === moved.id ? timestamp : entry.updatedAtUtc,
    }));
  }

  private cloneProfile(profile: StyleProfile) {
    return JSON.parse(JSON.stringify(profile)) as StyleProfile;
  }

  private setState(updater: (prev: StyleProfileState) => StyleProfileState) {
    this.state = updater(this.state);
    this.listeners.forEach(listener => listener());
  }

  private log(event: string, metadata?: Record<string, unknown>) {
    console.log(LOG_TAG, event, { timestampUtc: defaultNowUtc(), ...(metadata ?? {}) });
  }

  private logError(event: string, error: unknown, metadata?: Record<string, unknown>) {
    console.error(LOG_TAG, `${event} failed`, {
      timestampUtc: defaultNowUtc(),
      ...(metadata ?? {}),
      error,
    });
  }
}

export const styleProfileStore = new StyleProfileStore();

export function useStyleProfileState() {
  return useSyncExternalStore(
    styleProfileStore.subscribe,
    () => styleProfileStore.getState(),
    () => styleProfileStore.getState()
  );
}




