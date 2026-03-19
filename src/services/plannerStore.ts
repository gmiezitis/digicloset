import { useMemo, useSyncExternalStore } from 'react';
import type { PlannerEntry } from '@/types/planner';
import { buildWornHistory, sortPlannerEntries } from '@/types/planner';
import {
  defaultNowUtc,
  listPlannerEntries,
  removePlannerEntry,
  upsertPlannerEntry,
} from './storage';
import {
  buildCalendarMatrix,
  groupPlannerDays,
  searchPlannerEntries,
} from './plannerSelectors';

const LOG_TAG = '[planner-store]';

type OptimisticStatus = 'saving' | 'deleting';

type PlannerState = {
  loading: boolean;
  entries: PlannerEntry[];
  hydratedAtUtc: string | null;
  error: string | null;
  optimistic: Record<string, OptimisticStatus>;
};

type Listener = () => void;

const INITIAL_STATE: PlannerState = {
  loading: true,
  entries: [],
  hydratedAtUtc: null,
  error: null,
  optimistic: {},
};

class PlannerStore {
  private state: PlannerState = INITIAL_STATE;
  private listeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState() {
    return this.state;
  }

  async initialize() {
    if (!this.initPromise) {
      this.initPromise = this.refresh();
    }
    return this.initPromise;
  }

  async refresh() {
    this.setState(prev => ({ ...prev, loading: true }));
    try {
      const entries = sortPlannerEntries(await listPlannerEntries());
      this.setState(prev => ({
        ...prev,
        loading: false,
        entries,
        hydratedAtUtc: defaultNowUtc(),
        error: null,
      }));
      this.log('refreshed', { entries: entries.length });
    } catch (error) {
      this.logError('refresh', error);
      this.setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load planner entries',
      }));
    }
  }

  async save(entry: PlannerEntry) {
    this.applyOptimistic(entry.id, 'saving');
    this.setState(prev => ({
      ...prev,
      entries: sortPlannerEntries(replaceById(prev.entries, entry)),
    }));

    try {
      const result = await upsertPlannerEntry(entry);
      this.setState(prev => ({
        ...prev,
        entries: sortPlannerEntries(replaceById(prev.entries, result.entry)),
        optimistic: omitOptimistic(prev.optimistic, entry.id),
      }));
      this.log('entry-saved', { id: entry.id, calendarDate: entry.calendarDate });
      return result.entry;
    } catch (error) {
      this.logError('save', error, { id: entry.id });
      this.setState(prev => ({
        ...prev,
        optimistic: omitOptimistic(prev.optimistic, entry.id),
        error: 'We could not save that outfit. Please retry.',
      }));
      throw error;
    }
  }

  async remove(entryId: string) {
    this.applyOptimistic(entryId, 'deleting');
    const previousEntries = this.state.entries;
    this.setState(prev => ({
      ...prev,
      entries: prev.entries.filter(entry => entry.id !== entryId),
    }));
    try {
      await removePlannerEntry(entryId);
      this.setState(prev => ({
        ...prev,
        optimistic: omitOptimistic(prev.optimistic, entryId),
      }));
      this.log('entry-removed', { id: entryId });
    } catch (error) {
      this.logError('remove', error, { id: entryId });
      this.setState(prev => ({
        ...prev,
        entries: previousEntries,
        optimistic: omitOptimistic(prev.optimistic, entryId),
        error: 'Unable to delete that entry right now.',
      }));
      throw error;
    }
  }

  async reorder(calendarDate: string, orderedIds: string[]) {
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const dayEntries = this.state.entries.filter(entry => entry.calendarDate === calendarDate);
    if (dayEntries.length === 0) {
      return;
    }

    const updates = dayEntries.map(entry => {
      const nextIndex = orderMap.get(entry.id);
      if (nextIndex == null || nextIndex === entry.orderIndex) {
        return entry;
      }
      return { ...entry, orderIndex: nextIndex };
    });

    const hasChanges = updates.some((entry, index) => entry.orderIndex !== dayEntries[index].orderIndex);
    if (!hasChanges) {
      return;
    }

    this.setState(prev => ({
      ...prev,
      entries: sortPlannerEntries(
        prev.entries.map(entry => updates.find(update => update.id === entry.id) ?? entry)
      ),
    }));

    await Promise.all(
      updates.map(async entry => {
        if (dayEntries.find(current => current.id === entry.id && current.orderIndex === entry.orderIndex)) {
          return;
        }
        try {
          const result = await upsertPlannerEntry(entry);
          this.setState(prev => ({
            ...prev,
            entries: sortPlannerEntries(replaceById(prev.entries, result.entry)),
          }));
        } catch (error) {
          this.logError('reorder', error, { id: entry.id });
          throw error;
        }
      })
    );
    this.log('reordered-day', { calendarDate, ids: orderedIds });
  }

  getEntriesForDate(calendarDate: string) {
    return this.state.entries.filter(entry => entry.calendarDate === calendarDate);
  }

  resetForTests() {
    this.state = INITIAL_STATE;
    this.initPromise = null;
    this.listeners.forEach(listener => listener());
  }

  private applyOptimistic(id: string, status: OptimisticStatus) {
    this.setState(prev => ({
      ...prev,
      optimistic: {
        ...prev.optimistic,
        [id]: status,
      },
    }));
  }

  private setState(updater: (prev: PlannerState) => PlannerState) {
    this.state = updater(this.state);
    this.listeners.forEach(listener => listener());
  }

  private log(event: string, metadata?: Record<string, unknown>) {
    console.log(LOG_TAG, event, { timestampUtc: defaultNowUtc(), ...(metadata ?? {}) });
  }

  private logError(event: string, error: unknown, metadata?: Record<string, unknown>) {
    console.error(LOG_TAG, `${event} failed`, { timestampUtc: defaultNowUtc(), error, ...(metadata ?? {}) });
  }
}

export const plannerStore = new PlannerStore();

export function usePlannerState() {
  return useSyncExternalStore(
    plannerStore.subscribe,
    () => plannerStore.getState(),
    () => plannerStore.getState()
  );
}

export function usePlannerEntriesForDate(calendarDate: string) {
  const state = usePlannerState();
  return useMemo(
    () => sortPlannerEntries(state.entries.filter(entry => entry.calendarDate === calendarDate)),
    [state.entries, calendarDate]
  );
}

export function usePlannerCalendarMonth(year: number, month: number) {
  const state = usePlannerState();
  return useMemo(
    () => buildCalendarMatrix(state.entries, year, month),
    [state.entries, year, month]
  );
}

export function usePlannerSearch(query: string) {
  const state = usePlannerState();
  return useMemo(() => searchPlannerEntries(state.entries, query), [state.entries, query]);
}

export function usePlannerWornHistory() {
  const state = usePlannerState();
  return useMemo(() => buildWornHistory(state.entries), [state.entries]);
}

function replaceById(entries: PlannerEntry[], entry: PlannerEntry) {
  const map = new Map(entries.map(current => [current.id, current]));
  map.set(entry.id, entry);
  return Array.from(map.values());
}

function omitOptimistic(optimistic: Record<string, OptimisticStatus>, id: string) {
  const next = { ...optimistic };
  delete next[id];
  return next;
}

export { groupPlannerDays } from './plannerSelectors';
export type { CalendarDayCell } from './plannerSelectors';

