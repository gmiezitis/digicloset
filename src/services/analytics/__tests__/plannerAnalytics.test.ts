import { computePlannerAnalytics } from '../plannerAnalytics';
import { createPlannerEntry } from '@/types/planner';
import type { WardrobeItem } from '@/types/item';

const now = () => '2025-04-10T08:00:00.000Z';
let revCounter = 0;
const nextRev = () => `rev_${revCounter++}`;

const wardrobeItems: WardrobeItem[] = [
  {
    id: 'item_a',
    category: 'tops',
    name: 'Blue Oxford',
    seasons: ['spring'],
    colors: [
      { name: 'Blue', hex: '#3366FF' },
      { name: 'White', hex: '#FFFFFF' },
    ],
    imageUri: 'https://example.com/a.jpg',
    revision: { revisionId: 'rev_a', updatedAtUtc: '2025-04-01T00:00:00.000Z' },
    createdAtUtc: '2025-04-01T00:00:00.000Z',
    syncStatus: 'pending',
  },
  {
    id: 'item_b',
    category: 'bottoms',
    name: 'Black Jeans',
    seasons: ['spring'],
    colors: [{ name: 'Black', hex: '#000000' }],
    imageUri: 'https://example.com/b.jpg',
    revision: { revisionId: 'rev_b', updatedAtUtc: '2025-04-01T00:00:00.000Z' },
    createdAtUtc: '2025-04-01T00:00:00.000Z',
    syncStatus: 'pending',
  },
];

const entries = [
  createPlannerEntry(
    {
      id: 'entry-1',
      calendarDate: '2025-04-10',
      lookKind: 'outfit',
      wardrobeItemIds: ['item_a', 'item_b'],
      orderIndex: 0,
      note: 'Work fit',
      labels: { context: 'work' },
      syncStatus: 'pending',
    },
    now,
    nextRev
  ),
  createPlannerEntry(
    {
      id: 'entry-2',
      calendarDate: '2025-04-11',
      lookKind: 'single',
      wardrobeItemIds: ['item_a'],
      orderIndex: 0,
      note: 'Dinner out',
      labels: { context: 'goingOut' },
      syncStatus: 'pending',
    },
    now,
    nextRev
  ),
  createPlannerEntry(
    {
      id: 'entry-3',
      calendarDate: '2025-04-13',
      lookKind: 'single',
      wardrobeItemIds: ['item_a'],
      orderIndex: 0,
      syncStatus: 'pending',
    },
    now,
    nextRev
  ),
];

describe('plannerAnalytics', () => {
  it('summarises top items, contexts, colors, and streaks', () => {
    const summary = computePlannerAnalytics(entries, wardrobeItems);

    expect(summary.totalLooks).toBe(3);
    expect(summary.totalLoggedDays).toBe(3);
    expect(summary.longestStreak).toBe(2);
    expect(summary.mostWornItems[0]).toMatchObject({ name: 'Blue Oxford', count: 3 });
    expect(summary.contextBreakdown[0]).toEqual({ context: 'work', count: 1 });
    expect(summary.contextBreakdown[1]).toEqual({ context: 'goingOut', count: 1 });
    expect(summary.colorUsage[0].color).toBe('blue');
    expect(summary.recentNotes.length).toBe(2);
  });
});





