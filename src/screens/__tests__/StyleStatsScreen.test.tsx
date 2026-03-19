import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleStatsScreen } from '../StyleStatsScreen';
import type { WardrobeItem } from '@/types/item';
import type { PlannerEntry } from '@/types/planner';

jest.mock('@/services/closetStore', () => ({
  useClosetState: jest.fn(),
}));

jest.mock('@/services/plannerStore', () => ({
  usePlannerState: jest.fn(),
}));

jest.mock('@/services/styleProfileStore', () => ({
  useStyleProfileState: jest.fn(),
  styleProfileStore: {
    initialize: jest.fn(),
    saveMeasurement: jest.fn(),
    deleteMeasurement: jest.fn(),
    reorderMeasurement: jest.fn(),
    saveSizePreference: jest.fn(),
    deleteSizePreference: jest.fn(),
    reorderSizePreference: jest.fn(),
    saveBrandException: jest.fn(),
    deleteBrandException: jest.fn(),
  },
}));

const closetStoreModule = jest.requireMock('@/services/closetStore');
const plannerStoreModule = jest.requireMock('@/services/plannerStore');
const styleProfileModule = jest.requireMock('@/services/styleProfileStore');

const sampleItems: WardrobeItem[] = [
  {
    id: 'item-1',
    name: 'Indigo Denim',
    category: 'bottoms',
    seasons: ['spring'],
    colors: [{ name: 'Indigo', hex: '#264653' }],
    imageUri: 'https://example.com/1.jpg',
    createdAtUtc: '2025-04-10T12:00:00.000Z',
    revision: { revisionId: 'rev-1', updatedAtUtc: '2025-04-10T12:00:00.000Z' },
    syncStatus: 'synced',
    priceCents: 8900,
    currency: 'USD',
    tags: ['wardrobe:self'],
  },
  {
    id: 'item-2',
    name: 'Citrine Tee',
    category: 'tops',
    seasons: ['summer'],
    colors: [{ name: 'Yellow', hex: '#F4A261' }],
    imageUri: 'https://example.com/2.jpg',
    createdAtUtc: '2025-04-09T12:00:00.000Z',
    revision: { revisionId: 'rev-2', updatedAtUtc: '2025-04-09T12:00:00.000Z' },
    syncStatus: 'synced',
    priceCents: 3200,
    currency: 'USD',
    tags: ['wardrobe:self'],
  },
];

const sampleEntries: PlannerEntry[] = [
  {
    id: 'entry-1',
    version: 1,
    calendarDate: '2025-04-10',
    lookKind: 'outfit',
    wardrobeItemIds: ['item-1', 'item-2'],
    title: 'Travel Day',
    note: 'Airport layers',
    orderIndex: 0,
    createdAtUtc: '2025-04-10T15:00:00.000Z',
    revision: { revisionId: 'rev-entry', updatedAtUtc: '2025-04-10T15:00:00.000Z' },
    syncStatus: 'synced',
  },
];

describe('StyleStatsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    closetStoreModule.useClosetState.mockReturnValue({
      items: sampleItems,
      drafts: [],
      loading: false,
    });
    plannerStoreModule.usePlannerState.mockReturnValue({
      entries: sampleEntries,
      loading: false,
    });
    styleProfileModule.useStyleProfileState.mockReturnValue({
      loading: false,
      profile: {
        measurements: [],
        sizePreferences: [],
        brandSizeExceptions: [],
      },
    });
    styleProfileModule.styleProfileStore.initialize.mockResolvedValue(undefined);
    styleProfileModule.styleProfileStore.saveMeasurement.mockResolvedValue(undefined);
  });

  it('renders closet stats and color breakdown', () => {
    const { getByText, getByTestId } = render(<StyleStatsScreen />);

    expect(getByText('Closet count')).toBeTruthy();
    expect(getByText('Style Stats')).toBeTruthy();
    expect(getByTestId('color-bar')).toBeTruthy();
  });

  it('saves a measurement through the form', async () => {
    const { getByTestId, getByText } = render(<StyleStatsScreen />);

    fireEvent.changeText(getByTestId('measurement-label-input'), 'Waist');
    fireEvent.changeText(getByTestId('measurement-value-input'), '28');
    fireEvent.press(getByTestId('measurement-save-button'));

    await waitFor(() => {
      expect(styleProfileModule.styleProfileStore.saveMeasurement).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Waist', value: 28 })
      );
    });
    expect(getByText(/Measurement saved/i)).toBeTruthy();
  });
});




