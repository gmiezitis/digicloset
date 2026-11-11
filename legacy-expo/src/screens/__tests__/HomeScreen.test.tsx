import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { HomeScreen } from '../HomeScreen';
import type { WardrobeItem } from '@/types/item';
import type { PlannerEntry } from '@/types/planner';

jest.mock('@/services/closetStore', () => ({
  useClosetState: jest.fn(),
  closetStore: {
    initialize: jest.fn(),
  },
}));

jest.mock('@/services/plannerStore', () => ({
  usePlannerState: jest.fn(),
  plannerStore: {
    initialize: jest.fn(),
  },
}));

jest.mock('@/services/storage', () => ({
  defaultNowUtc: jest.fn(() => '2025-04-11T08:00:00.000Z'),
}));

const closetStoreModule = jest.requireMock('@/services/closetStore');
const plannerStoreModule = jest.requireMock('@/services/plannerStore');
const storageModule = jest.requireMock('@/services/storage');

const baseSnapshot = {
  status: 'synced' as const,
  revisionId: 'rev-sync',
  timestampUtc: '2025-04-10T12:00:00.000Z',
};

function buildItem(
  overrides: Partial<WardrobeItem> & Pick<WardrobeItem, 'id' | 'name'>
): WardrobeItem {
  const createdAtUtc = overrides.createdAtUtc ?? '2025-04-10T00:00:00.000Z';
  return {
    id: overrides.id,
    name: overrides.name,
    category: overrides.category ?? 'tops',
    seasons: overrides.seasons ?? ['spring'],
    colors: overrides.colors ?? [{ name: 'Coral', hex: '#FF6F61' }],
    imageUri: overrides.imageUri ?? 'https://example.com/item.jpg',
    createdAtUtc,
    revision:
      overrides.revision ??
      {
        revisionId: `rev-${overrides.id}`,
        updatedAtUtc: createdAtUtc,
      },
    syncStatus: overrides.syncStatus ?? 'synced',
    tags: overrides.tags,
    brand: overrides.brand,
    description: overrides.description,
    priceCents: overrides.priceCents,
    currency: overrides.currency,
    location: overrides.location,
    notes: overrides.notes,
    subCategory: overrides.subCategory,
    thumbnailUri: overrides.thumbnailUri,
    isFavorite: overrides.isFavorite,
    lastWornAtUtc: overrides.lastWornAtUtc,
  };
}

function buildEntry(
  overrides: Partial<PlannerEntry> & Pick<PlannerEntry, 'id' | 'title'>
): PlannerEntry {
  const createdAtUtc = overrides.createdAtUtc ?? '2025-04-09T09:00:00.000Z';
  return {
    id: overrides.id,
    title: overrides.title,
    version: overrides.version ?? 1,
    calendarDate: overrides.calendarDate ?? '2025-04-09',
    lookKind: overrides.lookKind ?? 'outfit',
    wardrobeItemIds: overrides.wardrobeItemIds ?? ['self-top'],
    note: overrides.note,
    coverImageUri: overrides.coverImageUri,
    labels: overrides.labels,
    searchKeywords: overrides.searchKeywords,
    orderIndex: overrides.orderIndex ?? 0,
    createdAtUtc,
    revision:
      overrides.revision ??
      {
        revisionId: `rev-${overrides.id}`,
        updatedAtUtc: createdAtUtc,
      },
    syncStatus: overrides.syncStatus ?? 'synced',
  };
}

function createClosetState(items: WardrobeItem[]) {
  return {
    loading: false,
    drafts: [],
    items,
    lastSyncSnapshot: baseSnapshot,
    hydratedAtUtc: '2025-04-10T12:00:00.000Z',
  };
}

const baseSelfItems = [
  buildItem({ id: 'self-top', name: 'Cozy Cardigan', tags: ['wardrobe:self'] }),
  buildItem({ id: 'self-bottom', name: 'Wide Pants', tags: ['wardrobe:self'], category: 'bottoms' }),
  buildItem({ id: 'self-shoes', name: 'White Sneakers', tags: ['wardrobe:self'], category: 'shoes' }),
];

const childOnlyItems = [
  buildItem({ id: 'child-top', name: 'Mini Hoodie', tags: ['wardrobe:child'] }),
  buildItem({
    id: 'child-bottom',
    name: 'Play Joggers',
    tags: ['wardrobe:child'],
    category: 'bottoms',
  }),
  buildItem({
    id: 'child-shoes',
    name: 'Sparkle Trainers',
    tags: ['wardrobe:child'],
    category: 'shoes',
  }),
];

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storageModule.defaultNowUtc.mockReturnValue('2025-04-11T08:00:00.000Z');
    closetStoreModule.useClosetState.mockReturnValue(createClosetState(baseSelfItems));
    closetStoreModule.closetStore.initialize.mockResolvedValue(undefined);
    plannerStoreModule.usePlannerState.mockReturnValue({
      loading: false,
      entries: [buildEntry({ id: 'entry-1', title: 'Brunch Shuffle' })],
    });
    plannerStoreModule.plannerStore.initialize.mockResolvedValue(undefined);
  });

  it('renders greeting, shuffled looks, and stats snapshot', () => {
    const { getByTestId, getAllByTestId, getByText } = render(<HomeScreen />);

    expect(getByTestId('greeting-title')).toBeTruthy();
    expect(getByText(/Curating looks for You/i)).toBeTruthy();
    expect(getAllByTestId('suggestion-card').length).toBeGreaterThan(0);
    expect(getByText('Looks logged')).toBeTruthy();
    expect(closetStoreModule.closetStore.initialize).toHaveBeenCalled();
    expect(plannerStoreModule.plannerStore.initialize).toHaveBeenCalled();
  });

  it('lets the user switch wardrobe focus and re-renders suggestions', async () => {
    closetStoreModule.useClosetState.mockReturnValue(
      createClosetState([...baseSelfItems, ...childOnlyItems])
    );
    const { getByText, queryByText } = render(<HomeScreen />);

    expect(getByText('Cozy Cardigan')).toBeTruthy();

    fireEvent.press(getByText('Child'));

    await waitFor(() => {
      expect(getByText(/Curating looks for Child/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(queryByText('Cozy Cardigan')).toBeNull();
      expect(getByText('Mini Hoodie')).toBeTruthy();
    });
  });
});

