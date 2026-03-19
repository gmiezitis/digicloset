import { z } from 'zod';
import type { ItemRevision, SyncStatus } from './item';
import { itemRevisionSchema, SYNC_STATUS } from './item';

export const PLANNER_ENTRY_VERSION = 1;

export const PLANNER_ENTRY_KINDS = ['outfit', 'single'] as const;
export type PlannerEntryKind = (typeof PLANNER_ENTRY_KINDS)[number];

export const PLANNER_CONTEXTS = ['work', 'goingOut', 'event', 'travel', 'casual', 'other'] as const;
export type PlannerContext = (typeof PLANNER_CONTEXTS)[number];

export const PLANNER_MOODS = ['confident', 'relaxed', 'creative', 'energised', 'focused', 'other'] as const;
export type PlannerMood = (typeof PLANNER_MOODS)[number];

export const PLANNER_WEATHERS = ['hot', 'warm', 'mild', 'cool', 'cold', 'rainy', 'snowy', 'humid', 'other'] as const;
export type PlannerWeather = (typeof PLANNER_WEATHERS)[number];

export interface PlannerEntryLabels {
  context?: PlannerContext;
  mood?: PlannerMood;
  weather?: PlannerWeather;
  palette?: string[];
}

export interface PlannerEntry {
  id: string;
  version: number;
  calendarDate: string; // YYYY-MM-DD in UTC
  lookKind: PlannerEntryKind;
  wardrobeItemIds: string[];
  note?: string;
  title: string;
  coverImageUri?: string;
  labels?: PlannerEntryLabels;
  searchKeywords?: string[];
  orderIndex: number;
  createdAtUtc: string;
  revision: ItemRevision;
  syncStatus: SyncStatus;
}

export interface PlannerDaySummary {
  calendarDate: string;
  entries: PlannerEntry[];
}

export interface PlannerWornHistoryEntry {
  wardrobeItemId: string;
  occurrences: number;
  firstWornAtUtc: string;
  lastWornAtUtc: string;
}

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'calendarDate must be formatted as YYYY-MM-DD');

const paletteSchema = z.array(z.string().min(1)).max(3);

const plannerEntryLabelsSchema = z
  .object({
    context: z.enum(PLANNER_CONTEXTS).optional(),
    mood: z.enum(PLANNER_MOODS).optional(),
    weather: z.enum(PLANNER_WEATHERS).optional(),
    palette: paletteSchema.optional(),
  })
  .optional();

export const plannerEntrySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  calendarDate: calendarDateSchema,
  lookKind: z.enum(PLANNER_ENTRY_KINDS),
  wardrobeItemIds: z.array(z.string().min(1)).nonempty('At least one wardrobe item is required'),
  note: z.string().max(2000).optional(),
  title: z.string().min(1).max(140),
  coverImageUri: z.string().url().optional(),
  labels: plannerEntryLabelsSchema,
  searchKeywords: z.array(z.string().min(1)).max(20).optional(),
  orderIndex: z.number().int().nonnegative(),
  createdAtUtc: z.string().datetime({ offset: true }),
  revision: itemRevisionSchema,
  syncStatus: z.enum(SYNC_STATUS),
});

export function derivePlannerEntryTitle(
  note?: string,
  fallbackTitle?: string,
  lookKind: PlannerEntryKind = 'outfit'
): string {
  if (note) {
    const firstLine = note
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);
    if (firstLine) {
      return truncate(firstLine, 140);
    }
  }

  if (fallbackTitle) {
    return truncate(fallbackTitle.trim(), 140);
  }

  return lookKind === 'single' ? 'Single item look' : 'Outfit';
}

export function validatePlannerEntry(data: PlannerEntry): PlannerEntry {
  return plannerEntrySchema.parse(data);
}

export function createPlannerEntry(
  input: Omit<PlannerEntry, 'revision' | 'createdAtUtc' | 'title' | 'version'> & {
    revision?: ItemRevision;
    createdAtUtc?: string;
    version?: number;
  },
  nowUtc: () => string,
  generateRevisionId: () => string,
  options?: { fallbackTitle?: string }
): PlannerEntry {
  const createdAtUtc = input.createdAtUtc ?? nowUtc();
  const revision = input.revision
    ? itemRevisionSchema.parse(input.revision)
    : itemRevisionSchema.parse({
        revisionId: generateRevisionId(),
        updatedAtUtc: createdAtUtc,
      });
  const title = derivePlannerEntryTitle(input.note, options?.fallbackTitle, input.lookKind);
  const version = input.version ?? PLANNER_ENTRY_VERSION;

  const searchKeywords = normalizeSearchKeywords(
    input.searchKeywords ??
      buildPlannerSearchKeywords({
        title,
        note: input.note,
        labels: input.labels,
      })
  );

  const entry: PlannerEntry = {
    ...input,
    version,
    title,
    createdAtUtc,
    revision,
    searchKeywords,
  };

  return validatePlannerEntry(entry);
}

export function updatePlannerEntry(
  current: PlannerEntry,
  changes: Partial<Omit<PlannerEntry, 'id' | 'createdAtUtc' | 'revision' | 'version'>>,
  nowUtc: () => string,
  generateRevisionId: () => string
): PlannerEntry {
  const revision = itemRevisionSchema.parse({
    revisionId: generateRevisionId(),
    updatedAtUtc: nowUtc(),
  });

  const note = changes.note ?? current.note;
  const lookKind = changes.lookKind ?? current.lookKind;

  const title = derivePlannerEntryTitle(note, current.title, lookKind);
  const labels = changes.labels ?? current.labels;
  const searchKeywords = normalizeSearchKeywords(
    changes.searchKeywords ??
      buildPlannerSearchKeywords({
        title,
        note,
        labels,
      })
  );

  const entry: PlannerEntry = {
    ...current,
    ...changes,
    title,
    labels,
    searchKeywords,
    revision,
  };

  return validatePlannerEntry(entry);
}

export function sortPlannerEntries(entries: PlannerEntry[]): PlannerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.calendarDate === b.calendarDate) {
      return a.orderIndex - b.orderIndex || Date.parse(a.createdAtUtc) - Date.parse(b.createdAtUtc);
    }
    return a.calendarDate.localeCompare(b.calendarDate);
  });
}

export function groupPlannerEntriesByDay(entries: PlannerEntry[]): PlannerDaySummary[] {
  const map = new Map<string, PlannerEntry[]>();
  entries.forEach(entry => {
    const existing = map.get(entry.calendarDate) ?? [];
    existing.push(entry);
    map.set(entry.calendarDate, sortPlannerEntries(existing));
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([calendarDate, dayEntries]) => ({
      calendarDate,
      entries: dayEntries,
    }));
}

export function buildWornHistory(entries: PlannerEntry[]): PlannerWornHistoryEntry[] {
  const index = new Map<string, PlannerWornHistoryEntry>();

  entries.forEach(entry => {
    entry.wardrobeItemIds.forEach(wardrobeItemId => {
      const existing = index.get(wardrobeItemId);
      if (!existing) {
        index.set(wardrobeItemId, {
          wardrobeItemId,
          occurrences: 1,
          firstWornAtUtc: entry.createdAtUtc,
          lastWornAtUtc: entry.createdAtUtc,
        });
        return;
      }

      existing.occurrences += 1;
      if (Date.parse(entry.createdAtUtc) < Date.parse(existing.firstWornAtUtc)) {
        existing.firstWornAtUtc = entry.createdAtUtc;
      }
      if (Date.parse(entry.createdAtUtc) > Date.parse(existing.lastWornAtUtc)) {
        existing.lastWornAtUtc = entry.createdAtUtc;
      }
    });
  });

  return Array.from(index.values()).sort((a, b) => b.occurrences - a.occurrences);
}

function truncate(text: string, limit: number) {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3)}...`;
}

export function buildPlannerSearchKeywords(input: {
  title?: string;
  note?: string;
  labels?: PlannerEntryLabels;
}): string[] | undefined {
  const tokens = new Set<string>();
  if (input.title) {
    tokenize(input.title).forEach(token => tokens.add(token));
  }
  if (input.note) {
    tokenize(input.note).forEach(token => tokens.add(token));
  }
  if (input.labels?.context) {
    tokens.add(input.labels.context);
  }
  if (input.labels?.mood) {
    tokens.add(input.labels.mood);
  }
  if (input.labels?.weather) {
    tokens.add(input.labels.weather);
  }
  input.labels?.palette?.forEach(color => {
    tokenize(color).forEach(token => tokens.add(token));
  });

  const list = Array.from(tokens);
  return list.length ? list.slice(0, 20) : undefined;
}

function normalizeSearchKeywords(keywords?: string[] | null): string[] | undefined {
  if (!keywords || keywords.length === 0) {
    return undefined;
  }
  const deduped = Array.from(
    new Set(
      keywords
        .map(keyword => keyword.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  return deduped.length ? deduped.slice(0, 20) : undefined;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(Boolean);
}



