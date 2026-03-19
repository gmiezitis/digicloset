import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { colors, spacing, typography } from '@theme';
import type { SyncStatus } from '@/types/item';
import { useClosetState } from '@/services/closetStore';
import {
  DraftSyncQueueSnapshot,
  getDraftSyncQueueSnapshot,
  retryDraftSync,
  subscribeToDraftSyncQueue,
} from '@/services/draftSyncQueue';
import { initializeDraftSync } from '@/services/draftSyncCoordinator';
import {
  DraftCard,
  ItemCard,
  Section,
  SyncSummary,
  type SyncStatSummary,
} from './ClosetScreen/components';

export function ClosetScreen() {
  const state = useClosetState();
  const queueSnapshot = useDraftSyncQueueSnapshot();

  useEffect(() => {
    void initializeDraftSync();
  }, []);

  const queueByDraftId = useMemo(() => {
    return new Map(queueSnapshot.map(entry => [entry.draftId, entry]));
  }, [queueSnapshot]);

  const draftsByStatus = useMemo(() => partitionByStatus(state.drafts), [state.drafts]);
  const itemsByStatus = useMemo(() => partitionByStatus(state.items), [state.items]);

  const draftsInProgress = draftsByStatus.pending;
  const draftsFailed = draftsByStatus.failed;
  const itemsPending = itemsByStatus.pending;
  const itemsSynced = itemsByStatus.synced;
  const itemsFailed = itemsByStatus.failed;

  const draftStats = useMemo(() => buildSyncStats(state.drafts), [state.drafts]);
  const itemStats = useMemo(() => buildSyncStats(state.items), [state.items]);

  const handleRetry = useCallback((draftId: string) => {
    retryDraftSync(draftId, { immediate: true }).catch(error => {
      console.error('[ClosetScreen] Failed to retry draft sync', { draftId, error });
    });
  }, []);

  const hasData = state.items.length > 0 || state.drafts.length > 0;
  const isInitialising = state.loading && !state.hydratedAtUtc;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} testID="closet-scroll-view">
        <Text style={styles.title}>Closet Control Center</Text>
        <Text style={styles.subtitle}>
          Track captured drafts, sync health, and wardrobe arrivals in real time.
        </Text>

        <SyncSummary
          lastSnapshotUtc={state.lastSyncSnapshot?.timestampUtc ?? null}
          lastSnapshotStatus={state.lastSyncSnapshot?.status ?? null}
          itemStats={itemStats}
          draftStats={draftStats}
        />

        {isInitialising ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
            <Text style={styles.loadingText}>Hydrating local wardrobe data…</Text>
          </View>
        ) : (
          <>
            <Section
              title="Drafts in Flight"
              description="Offline captures that are working through cleanup and sync."
              emptyLabel="No drafts pending right now. Capture a new piece to get started."
            >
              {draftsInProgress.map(draft => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  queue={queueByDraftId.get(draft.id) ?? null}
                  onRetry={handleRetry}
                />
              ))}
            </Section>

            <Section
              title="Needs Attention"
              description="Drafts that need a nudge. Retry to resume syncing."
              emptyLabel="All drafts are progressing smoothly."
            >
              {draftsFailed.map(draft => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  queue={queueByDraftId.get(draft.id) ?? null}
                  onRetry={handleRetry}
                />
              ))}
            </Section>

            <Section
              title="Wardrobe Syncing"
              description="Items promoting from drafts. We will confirm them as soon as cleanup finishes."
              emptyLabel="No wardrobe items waiting for sync."
            >
              {itemsPending.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </Section>

            <Section
              title="Wardrobe Sync Issues"
              description="These items need attention before we can confirm them in your wardrobe."
              emptyLabel="No wardrobe sync issues right now."
            >
              {itemsFailed.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </Section>

            <Section
              title="Wardrobe Items"
              description="Items already in your closet collection."
              emptyLabel={
                hasData
                  ? 'Synced items will appear here once background jobs finish.'
                  : 'Your closet is waiting for its first item.'
              }
            >
              {itemsSynced.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function useDraftSyncQueueSnapshot() {
  const [snapshot, setSnapshot] = useState<DraftSyncQueueSnapshot[]>(() =>
    getDraftSyncQueueSnapshot()
  );

  useEffect(() => subscribeToDraftSyncQueue(setSnapshot), []);

  return snapshot;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  title: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
});

type Syncable = { syncStatus: SyncStatus };

function buildSyncStats<T extends Syncable>(collection: T[]): SyncStatSummary {
  return collection.reduce<SyncStatSummary>(
    (acc, item) => {
      acc.total += 1;

      switch (item.syncStatus) {
        case 'failed':
          acc.failed += 1;
          break;
        case 'synced':
          acc.synced += 1;
          break;
        case 'pending':
        default:
          acc.pending += 1;
          break;
      }

      return acc;
    },
    { total: 0, pending: 0, failed: 0, synced: 0 }
  );
}

type StatusBuckets<T extends Syncable> = {
  pending: T[];
  synced: T[];
  failed: T[];
};

function partitionByStatus<T extends Syncable>(collection: T[]): StatusBuckets<T> {
  return collection.reduce<StatusBuckets<T>>(
    (acc, entry) => {
      switch (entry.syncStatus) {
        case 'failed':
          acc.failed.push(entry);
          break;
        case 'synced':
          acc.synced.push(entry);
          break;
        case 'pending':
        default:
          acc.pending.push(entry);
          break;
      }
      return acc;
    },
    { pending: [], synced: [], failed: [] }
  );
}
