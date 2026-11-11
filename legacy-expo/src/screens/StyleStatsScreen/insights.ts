import type { WardrobeItem } from '@/types/item';
import type { PlannerEntry } from '@/types/planner';
import { buildWornHistory } from '@/types/planner';

export type ValueTotal = {
  currency: string;
  amountCents: number;
};

export type ColorStat = {
  id: string;
  label: string;
  count: number;
  hexes: string[];
  sampleHex: string;
};

export type UsageStat = {
  itemId: string;
  count: number;
  item: WardrobeItem | null;
};

export type StyleInsights = {
  closetCount: number;
  closetValue: ValueTotal[];
  colorBreakdown: ColorStat[];
  unusedItems: WardrobeItem[];
  unusedItemCount: number;
  staleItems: WardrobeItem[];
  staleItemCount: number;
  mostWorn: UsageStat[];
  leastWorn: UsageStat[];
  outfitCount: number;
  lookCount: number;
  averageItemsPerLook: number;
  recentItems: WardrobeItem[];
};

export const STALEDAYS = 45;

export function buildStyleInsights(input: {
  items: WardrobeItem[];
  entries: PlannerEntry[];
  nowUtc: string;
}): StyleInsights {
  const closetCount = input.items.length;
  const closetValue = buildClosetValue(input.items);
  const colorBreakdown = buildColorBreakdown(input.items);
  const { unusedItems, unusedItemCount } = findUnusedItems(input.items, input.entries);
  const { staleItems, staleItemCount } = findStaleItems(input.items, input.entries, input.nowUtc);
  const { mostWorn, leastWorn } = buildUsageStats(input.items, input.entries);
  const outfitCount = input.entries.filter(entry => entry.lookKind === 'outfit').length;
  const lookCount = input.entries.length;
  const totalItemsLogged = input.entries.reduce(
    (total, entry) => total + entry.wardrobeItemIds.length,
    0
  );
  const averageItemsPerLook = lookCount === 0 ? 0 : totalItemsLogged / lookCount;
  const recentItems = [...input.items]
    .sort((a, b) => Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc))
    .slice(0, 5);

  return {
    closetCount,
    closetValue,
    colorBreakdown,
    unusedItems,
    unusedItemCount,
    staleItems,
    staleItemCount,
    mostWorn,
    leastWorn,
    outfitCount,
    lookCount,
    averageItemsPerLook,
    recentItems,
  };
}

export function formatCurrency(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      amountCents / 100
    );
  } catch {
    return `${currency} ${(amountCents / 100).toFixed(2)}`;
  }
}

export function formatDate(utcString: string) {
  const date = new Date(utcString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatGarmentType(value: string) {
  if (value === 'other') {
    return 'Other';
  }
  return capitalize(value);
}

export function capitalize(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildClosetValue(items: WardrobeItem[]): ValueTotal[] {
  const totals = new Map<string, number>();
  items.forEach(item => {
    if (item.priceCents != null && item.currency) {
      const current = totals.get(item.currency) ?? 0;
      totals.set(item.currency, current + item.priceCents);
    }
  });
  return Array.from(totals.entries()).map(([currency, amountCents]) => ({
    currency,
    amountCents,
  }));
}

function buildColorBreakdown(items: WardrobeItem[]): ColorStat[] {
  const map = new Map<string, ColorStat>();
  items.forEach(item => {
    item.colors.forEach(color => {
      const key = color.name?.trim().toLowerCase() || color.hex;
      const entry = map.get(key);
      if (entry) {
        entry.count += 1;
        if (!entry.hexes.includes(color.hex)) {
          entry.hexes.push(color.hex);
        }
      } else {
        map.set(key, {
          id: key,
          label: capitalize(color.name || 'Color'),
          count: 1,
          hexes: [color.hex],
          sampleHex: color.hex,
        });
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function findUnusedItems(items: WardrobeItem[], entries: PlannerEntry[]) {
  const used = new Set<string>();
  entries.forEach(entry => {
    entry.wardrobeItemIds.forEach(id => used.add(id));
  });
  const unused = items.filter(item => !used.has(item.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { unusedItems: unused.slice(0, 6), unusedItemCount: unused.length };
}

function findStaleItems(items: WardrobeItem[], entries: PlannerEntry[], nowUtc: string) {
  const lastUsed = new Map<string, number>();
  entries.forEach(entry => {
    const timestamp = Date.parse(entry.createdAtUtc);
    entry.wardrobeItemIds.forEach(id => {
      const stored = lastUsed.get(id);
      if (!stored || timestamp > stored) {
        lastUsed.set(id, timestamp);
      }
    });
  });
  const nowMs = Date.parse(nowUtc);
  const threshold = STALEDAYS * 24 * 60 * 60 * 1000;
  const stale = items
    .filter(item => {
      const last = lastUsed.get(item.id);
      if (!last) {
        return true;
      }
      return nowMs - last > threshold;
    })
    .sort((a, b) => {
      const lastA = lastUsed.get(a.id) ?? 0;
      const lastB = lastUsed.get(b.id) ?? 0;
      return lastA - lastB;
    });
  return { staleItems: stale.slice(0, 6), staleItemCount: stale.length };
}

function buildUsageStats(items: WardrobeItem[], entries: PlannerEntry[]) {
  const history = buildWornHistory(entries);
  const index = new Map(items.map(item => [item.id, item]));
  const mostWorn = history.slice(0, 10).map(entry => ({
    itemId: entry.wardrobeItemId,
    count: entry.occurrences,
    item: index.get(entry.wardrobeItemId) ?? null,
  }));
  const leastRaw = [...history].reverse().slice(0, 10);
  const leastWorn = leastRaw.map(entry => ({
    itemId: entry.wardrobeItemId,
    count: entry.occurrences,
    item: index.get(entry.wardrobeItemId) ?? null,
  }));
  return { mostWorn, leastWorn };
}




