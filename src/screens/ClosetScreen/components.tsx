import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';
import type { WardrobeDraft } from '@/types/draft';
import type { WardrobeItem, SyncStatus } from '@/types/item';
import type { DraftSyncQueueSnapshot } from '@/services/draftSyncQueue';
import { ClothingImage3D } from '@/components/ClothingImage3D';

export type SyncStatSummary = {
  total: number;
  pending: number;
  failed: number;
  synced: number;
};

export type SyncSummaryProps = {
  lastSnapshotUtc: string | null;
  lastSnapshotStatus: SyncStatus | null;
  itemStats: SyncStatSummary;
  draftStats: SyncStatSummary;
};

export type DraftCardProps = {
  draft: WardrobeDraft;
  queue: DraftSyncQueueSnapshot | null;
  onRetry: (draftId: string) => void;
};

export type ItemCardProps = {
  item: WardrobeItem;
};

export type SectionProps = {
  title: string;
  description: string;
  emptyLabel: string;
  children: React.ReactNode;
};

export function SyncSummary({
  lastSnapshotUtc,
  lastSnapshotStatus,
  itemStats,
  draftStats,
}: SyncSummaryProps) {
  const lastSnapshotLabel = lastSnapshotUtc
    ? `Last sync ${formatLocalTime(lastSnapshotUtc)} · ${formatStatusLabel(
      lastSnapshotStatus ?? 'pending'
    )}`
    : 'No sync attempts yet. Captures will sync automatically.';

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Sync Status</Text>
      <View style={styles.summaryMetricsRow}>
        <SummaryMetric label="Items" value={itemStats.total} testID="sync-metric-items" />
        <SummaryMetric label="Drafts" value={draftStats.total} testID="sync-metric-drafts" />
      </View>
      <SyncLegend label="Drafts" stats={draftStats} testID="sync-legend-drafts" />
      <SyncLegend label="Items" stats={itemStats} testID="sync-legend-items" />
      <Text style={styles.summaryMeta}>{lastSnapshotLabel}</Text>
    </View>
  );
}

export function Section({ title, description, emptyLabel, children }: SectionProps) {
  const isEmpty = React.Children.count(children) === 0;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
      {isEmpty ? <Text style={styles.emptyState}>{emptyLabel}</Text> : children}
    </View>
  );
}

export function DraftCard({ draft, queue, onRetry }: DraftCardProps) {
  const showRetry = draft.syncStatus === 'failed';
  const lastAttemptLabel = draft.lastSyncAttemptUtc
    ? `Last attempt ${formatLocalTime(draft.lastSyncAttemptUtc)}`
    : 'No attempts yet';

  const queueLabel = getQueueLabel(queue);

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`Draft ${draft.name}`}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {draft.name}
        </Text>
        <StatusBadge status={draft.syncStatus} />
      </View>
      <View style={styles.stepRow}>
        <DraftStep label="Photo" done={draft.wizard.photoConfirmed} />
        <DraftStep label="Cleanup" done={draft.wizard.cleanupConfirmed} />
        <DraftStep label="Review" done={draft.wizard.reviewAcknowledged} />
      </View>
      <View style={styles.metaBlock}>
        <Text style={styles.metaText}>{lastAttemptLabel}</Text>
        {draft.lastSyncError ? (
          <Text style={styles.metaError}>{draft.lastSyncError}</Text>
        ) : null}
        {queueLabel ? <Text style={styles.metaText}>{queueLabel}</Text> : null}
      </View>
      {showRetry ? (
        <Pressable
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel={`Retry sync for ${draft.name}`}
          onPress={() => onRetry(draft.id)}
        >
          <Text style={styles.retryButtonLabel}>Retry sync</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ItemCard({ item }: ItemCardProps) {
  const statusDescription = getItemStatusDescription(item.syncStatus);
  const imageUri = item.thumbnailUri || item.imageUri;

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`Item ${item.name}`}>
      <View style={styles.itemCardContent}>
        {/* Image with 3D effect */}
        {imageUri ? (
          <View style={styles.itemImageContainer}>
            <ClothingImage3D
              uri={imageUri}
              style={{ width: 80, height: 80 }}
              shadowIntensity="light"
            />
          </View>
        ) : null}

        {/* Item details */}
        <View style={styles.itemDetails}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <StatusBadge status={item.syncStatus} />
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaText}>{statusDescription}</Text>
            <Text style={styles.metaText}>Captured {formatLocalTime(item.createdAtUtc)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function StatusBadge({ status }: { status: SyncStatus }) {
  const theme = useMemo(() => getStatusTheme(status), [status]);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: theme.backgroundColor, borderColor: theme.borderColor },
      ]}
    >
      <Text style={[styles.badgeLabel, { color: theme.textColor }]}>{formatStatusLabel(status)}</Text>
    </View>
  );
}

export function formatLocalTime(utc: string) {
  try {
    return new Date(utc).toLocaleString();
  } catch {
    return utc;
  }
}

type SyncLegendProps = {
  label: string;
  stats: SyncStatSummary;
  testID?: string;
};

function SyncLegend({ label, stats, testID }: SyncLegendProps) {
  return (
    <View style={styles.legendContainer} testID={testID}>
      <Text style={styles.legendLabel}>{label}</Text>
      <View style={styles.legendPills}>
        <LegendPill status="pending" count={stats.pending} />
        <LegendPill status="synced" count={stats.synced} />
        <LegendPill status="failed" count={stats.failed} />
      </View>
    </View>
  );
}

function SummaryMetric({
  label,
  value,
  testID,
}: {
  label: string;
  value: number;
  testID?: string;
}) {
  return (
    <View style={styles.summaryMetricBlock} testID={testID}>
      <Text style={styles.summaryMetric}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function LegendPill({ status, count }: { status: SyncStatus; count: number }) {
  const theme = useMemo(() => getStatusTheme(status), [status]);
  return (
    <View
      style={[
        styles.legendPill,
        { backgroundColor: theme.backgroundColor, borderColor: theme.borderColor },
      ]}
      accessibilityLabel={`${formatStatusLabel(status)} ${count}`}
    >
      <Text style={[styles.legendPillLabel, { color: theme.textColor }]}>
        {formatStatusLabel(status)} · {count}
      </Text>
    </View>
  );
}

function DraftStep({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, done && styles.stepDotDone]} />
      <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{label}</Text>
    </View>
  );
}

function getQueueLabel(queue: DraftSyncQueueSnapshot | null) {
  if (!queue) {
    return '';
  }

  if (queue.state === 'running') {
    return 'Sync running now';
  }

  if (queue.nextRunUtc) {
    return `Next retry ${formatLocalTime(queue.nextRunUtc)} (attempt ${queue.attempt + 1})`;
  }

  return `Scheduled attempt ${queue.attempt + 1}`;
}

function getItemStatusDescription(status: SyncStatus) {
  switch (status) {
    case 'pending':
      return 'Pending sync · safely stored offline while we retry in the background.';
    case 'failed':
      return 'Sync failed · review the capture and retry from the closet.';
    case 'synced':
    default:
      return 'Synced · item is safely in your closet.';
  }
}

function getStatusTheme(status: SyncStatus) {
  switch (status) {
    case 'synced':
      return {
        backgroundColor: colors.status.success,
        textColor: colors.text.inverse,
        borderColor: colors.status.success,
      };
    case 'failed':
      return {
        backgroundColor: colors.status.error,
        textColor: colors.text.inverse,
        borderColor: colors.status.error,
      };
    case 'pending':
    default:
      return {
        backgroundColor: colors.status.warning,
        textColor: colors.text.primary,
        borderColor: colors.status.warning,
      };
  }
}

function formatStatusLabel(status: SyncStatus) {
  switch (status) {
    case 'failed':
      return 'Failed';
    case 'synced':
      return 'Synced';
    case 'pending':
    default:
      return 'Pending';
  }
}

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  summaryTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  summaryMetricBlock: {
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  summaryMetric: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  summaryLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  summaryMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  legendContainer: {
    gap: spacing.xs,
  },
  legendLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legendPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  legendPill: {
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
  },
  legendPillLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  sectionDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  emptyState: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.round,
    backgroundColor: colors.border,
  },
  stepDotDone: {
    backgroundColor: colors.accent.primary,
  },
  stepLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  stepLabelDone: {
    color: colors.text.primary,
  },
  metaBlock: {
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  metaError: {
    fontSize: typography.fontSize.xs,
    color: colors.status.error,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  retryButtonLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.accent.primary,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  badgeLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  // ItemCard with image layout
  itemCardContent: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  itemImageContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  itemDetails: {
    flex: 1,
    gap: spacing.sm,
  },
});


