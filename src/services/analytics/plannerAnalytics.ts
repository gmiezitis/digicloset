import { useMemo } from 'react';
import type { PlannerEntry, PlannerContext } from '@/types/planner';
import { buildWornHistory } from '@/types/planner';
import type { WardrobeItem } from '@/types/item';

export type PlannerAnalyticsSummary = {
  mostWornItems: Array<{ itemId: string; name: string; count: number; lastWornAtUtc: string }>;
  contextBreakdown: Array<{ context: PlannerContext; count: number }>;
  colorUsage: Array<{ color: string; count: number }>;
  longestStreak: number;
  totalLoggedDays: number;
  totalLooks: number;
  recentNotes: Array<{ id: string; calendarDate: string; title: string; note?: string }>;
};

const EMPTY_SUMMARY: PlannerAnalyticsSummary = {
  mostWornItems: [],
  contextBreakdown: [],
  colorUsage: [],
  longestStreak: 0,
  totalLoggedDays: 0,
  totalLooks: 0,
  recentNotes: [],
};

export function computePlannerAnalytics(
  entries: PlannerEntry[],
  wardrobeItems: WardrobeItem[]
): PlannerAnalyticsSummary {
  if (!entries.length) {
    return EMPTY_SUMMARY;
  }

  const itemLookup = new Map(wardrobeItems.map(item => [item.id, item]));
  const datedEntries = [...entries].sort((a, b) => a.calendarDate.localeCompare(b.calendarDate));

  const wornHistory = buildWornHistory(entries);
  const mostWornItems = wornHistory.slice(0, 3).map(item => ({
    itemId: item.wardrobeItemId,
    name: itemLookup.get(item.wardrobeItemId)?.name ?? 'Saved item',
    count: item.occurrences,
    lastWornAtUtc: item.lastWornAtUtc,
  }));

  const contextCounts = new Map<PlannerContext, number>();
  datedEntries.forEach(entry => {
    const context = entry.labels?.context;
    if (context) {
      contextCounts.set(context, (contextCounts.get(context) ?? 0) + 1);
    }
  });
  const contextBreakdown = Array.from(contextCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([context, count]) => ({ context, count }));

  const colorCounts = new Map<string, number>();
  datedEntries.forEach(entry => {
    entry.wardrobeItemIds.forEach(itemId => {
      const item = itemLookup.get(itemId);
      item?.colors?.forEach(color => {
        const name = color.name.toLowerCase();
        colorCounts.set(name, (colorCounts.get(name) ?? 0) + 1);
      });
    });
  });
  const colorUsage = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([color, count]) => ({ color, count }));

  const longestStreak = computeLongestStreak(datedEntries);

  const uniqueDays = new Set(datedEntries.map(entry => entry.calendarDate));

  const recentNotes = datedEntries
    .filter(entry => entry.note)
    .sort((a, b) => Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc))
    .slice(0, 3)
    .map(entry => ({
      id: entry.id,
      calendarDate: entry.calendarDate,
      title: entry.title,
      note: entry.note,
    }));

  return {
    mostWornItems,
    contextBreakdown,
    colorUsage,
    longestStreak,
    totalLoggedDays: uniqueDays.size,
    totalLooks: entries.length,
    recentNotes,
  };
}

export function usePlannerAnalytics(entries: PlannerEntry[], wardrobeItems: WardrobeItem[]) {
  return useMemo(() => computePlannerAnalytics(entries, wardrobeItems), [entries, wardrobeItems]);
}

function computeLongestStreak(entries: PlannerEntry[]) {
  if (!entries.length) {
    return 0;
  }
  const uniqueDates = Array.from(new Set(entries.map(entry => entry.calendarDate))).sort();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  uniqueDates.forEach(date => {
    if (previous && daysBetween(previous, date) === 1) {
      current += 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
    previous = date;
  });
  return longest;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}





