import React from 'react';
import { render, within } from '@testing-library/react-native';
import { SyncSummary, type SyncStatSummary } from '../ClosetScreen/components';

describe('SyncSummary', () => {
  it('renders metrics, legends, and fallback messaging', () => {
    const draftStats: SyncStatSummary = { total: 2, pending: 1, failed: 1, synced: 0 };
    const itemStats: SyncStatSummary = { total: 3, pending: 1, failed: 0, synced: 2 };

    const { getByTestId, getByText } = render(
      <SyncSummary
        lastSnapshotUtc={null}
        lastSnapshotStatus={null}
        itemStats={itemStats}
        draftStats={draftStats}
      />
    );

    expect(within(getByTestId('sync-metric-items')).getByText('3')).toBeTruthy();
    expect(within(getByTestId('sync-metric-drafts')).getByText('2')).toBeTruthy();

    const draftLegend = getByTestId('sync-legend-drafts');
    expect(within(draftLegend).getByText('Pending · 1')).toBeTruthy();
    expect(within(draftLegend).getByText('Failed · 1')).toBeTruthy();

    const itemLegend = getByTestId('sync-legend-items');
    expect(within(itemLegend).getByText('Pending · 1')).toBeTruthy();
    expect(within(itemLegend).getByText('Synced · 2')).toBeTruthy();

    expect(
      getByText('No sync attempts yet. Captures will sync automatically.')
    ).toBeTruthy();
  });
});


