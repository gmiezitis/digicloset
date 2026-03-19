import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';
import type { CameraCaptureRecord } from '@/services/camera/CameraService';
import type { BackgroundRemovalQueueSnapshot } from '@/services/camera/BackgroundRemovalQueue';

type CleanupStatusPanelProps = {
  capture: CameraCaptureRecord | null;
  queue?: BackgroundRemovalQueueSnapshot | null;
  onRetry?: (capture: CameraCaptureRecord) => void;
  onBrush?: (capture: CameraCaptureRecord) => void;
  onErase?: (capture: CameraCaptureRecord) => void;
};

export function CleanupStatusPanel({
  capture,
  queue,
  onRetry,
  onBrush,
  onErase,
}: CleanupStatusPanelProps) {
  const meta = useMemo(() => deriveStatusMeta(capture), [capture]);
  const previewUri = derivePreviewUri(capture);

  const handleRetry = () => {
    if (capture && onRetry) {
      onRetry(capture);
    }
  };

  const handleBrush = () => {
    if (capture && onBrush) {
      onBrush(capture);
    }
  };

  const handleErase = () => {
    if (capture && onErase) {
      onErase(capture);
    }
  };

  return (
    <View style={styles.panel} testID="cleanup-status-panel">
      <View style={styles.headerRow}>
        <Text style={styles.panelTitle}>Background Cleanup</Text>
        <StatusBadge tone={meta.tone} label={meta.badgeLabel} />
      </View>
      <Text style={styles.description} testID="cleanup-status-message">
        {meta.message}
      </Text>
      {previewUri ? (
        <Image
          source={{ uri: previewUri }}
          style={styles.previewImage}
          resizeMode="cover"
          testID="cleanup-preview-image"
        />
      ) : null}
      {meta.showProgress ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color={colors.accent.primary} size="small" />
          <Text style={styles.progressText}>Processing photo…</Text>
        </View>
      ) : null}
      {capture?.lastError && meta.showError ? (
        <Text style={styles.errorText} testID="cleanup-status-error">
          {capture.lastError}
        </Text>
      ) : null}
      <View style={styles.actionRow}>
        <Pressable
          testID="cleanup-retry-button"
          style={[styles.actionButton, !meta.canRetry && styles.actionButtonDisabled]}
          accessibilityRole="button"
          onPress={handleRetry}
          disabled={!meta.canRetry}
        >
          <Text
            style={[
              styles.actionButtonLabel,
              !meta.canRetry && styles.actionButtonLabelDisabled,
            ]}
          >
            Retry cleanup
          </Text>
        </Pressable>
        <Pressable
          testID="cleanup-brush-button"
          style={[styles.actionButton, !meta.canBrush && styles.actionButtonDisabled]}
          accessibilityRole="button"
          onPress={handleBrush}
          disabled={!meta.canBrush}
        >
          <Text
            style={[
              styles.actionButtonLabel,
              !meta.canBrush && styles.actionButtonLabelDisabled,
            ]}
          >
            Brush
          </Text>
        </Pressable>
        <Pressable
          testID="cleanup-erase-button"
          style={[styles.actionButton, !meta.canBrush && styles.actionButtonDisabled]}
          accessibilityRole="button"
          onPress={handleErase}
          disabled={!meta.canBrush}
        >
          <Text
            style={[
              styles.actionButtonLabel,
              !meta.canBrush && styles.actionButtonLabelDisabled,
            ]}
          >
            Erase
          </Text>
        </Pressable>
      </View>
      <Text style={styles.queueText} testID="cleanup-queue-message">
        {formatQueueMessage(queue, capture)}
      </Text>
      <Text style={styles.localCopy}>💾 Saved offline. We will sync when cleanup finishes.</Text>
    </View>
  );
}

type Tone = 'neutral' | 'warning' | 'success' | 'error';

function deriveStatusMeta(capture: CameraCaptureRecord | null) {
  if (!capture) {
    return {
      badgeLabel: 'Awaiting capture',
      tone: 'neutral' as Tone,
      message: 'Capture a garment photo to kick off background cleanup.',
      showProgress: false,
      showError: false,
      canRetry: false,
      canBrush: false,
    };
  }

  switch (capture.status) {
    case 'pending':
      return {
        badgeLabel: 'Queued',
        tone: 'neutral' as Tone,
        message: 'Waiting for cleanup to begin. Keep the app open or come back later.',
        showProgress: false,
        showError: false,
        canRetry: true,
        canBrush: false,
      };
    case 'processing':
      return {
        badgeLabel: 'Processing',
        tone: 'warning' as Tone,
        message: 'We are clearing the background. This usually takes a few moments.',
        showProgress: true,
        showError: false,
        canRetry: false,
        canBrush: false,
      };
    case 'failed':
      return {
        badgeLabel: 'Failed',
        tone: 'error' as Tone,
        message: 'Cleanup hit a snag. Retry or refine manually.',
        showProgress: false,
        showError: true,
        canRetry: true,
        canBrush: false,
      };
    case 'ready':
    case 'cached':
      return {
        badgeLabel: 'Ready',
        tone: 'success' as Tone,
        message: capture.maskUri
          ? 'Cleanup complete. Refine edges with brush or erase tools.'
          : 'Cleanup complete. Review the processed image before continuing.',
        showProgress: false,
        showError: false,
        canRetry: false,
        canBrush: Boolean(capture.maskUri),
      };
    default:
      return {
        badgeLabel: 'Unknown',
        tone: 'neutral' as Tone,
        message: 'Current cleanup status is unknown.',
        showProgress: false,
        showError: false,
        canRetry: true,
        canBrush: false,
      };
  }
}

function derivePreviewUri(capture: CameraCaptureRecord | null) {
  if (!capture) {
    return null;
  }

  if (capture.status === 'ready' || capture.status === 'cached') {
    return capture.processedUri ?? capture.localUri ?? null;
  }

  return capture.localUri ?? null;
}

function formatQueueMessage(
  queue: BackgroundRemovalQueueSnapshot | null | undefined,
  capture: CameraCaptureRecord | null
) {
  if (!capture) {
    return 'Capture a garment photo to kick off cleanup.';
  }

  if (!queue) {
    return 'Saved offline. Cleanup will begin automatically.';
  }

  const attempt = queue.attempt + 1;
  if (queue.state === 'running') {
    return `Retry attempt ${attempt} is running now…`;
  }

  if (queue.nextRunUtc) {
    return `Next retry at ${formatUtc(queue.nextRunUtc)} (attempt ${attempt}).`;
  }

  return `Scheduled attempt ${attempt}. We will retry automatically.`;
}

function formatUtc(utc: string) {
  try {
    return new Date(utc).toLocaleString();
  } catch {
    return utc;
  }
}

function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const palette = useMemo(() => {
    switch (tone) {
      case 'success':
        return {
          background: colors.status.success,
          text: colors.text.inverse,
        };
      case 'warning':
        return {
          background: colors.status.warning,
          text: colors.text.primary,
        };
      case 'error':
        return {
          background: colors.status.error,
          text: colors.text.inverse,
        };
      default:
        return {
          background: colors.border,
          text: colors.text.secondary,
        };
    }
  }, [tone]);

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeLabel, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  previewImage: {
    width: '100%',
    height: 160,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  progressText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  errorText: {
    fontSize: typography.fontSize.xs,
    color: colors.status.error,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionButtonLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.accent.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionButtonLabelDisabled: {
    color: colors.text.tertiary,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.xl,
  },
  badgeLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  queueText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  localCopy: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
});


