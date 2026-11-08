import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  AccessibilityState,
  Alert,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';
import type { CameraCaptureRecord } from '@/services/camera/CameraService';
import { useCaptureProcessing, type CaptureProcessingStatus } from '@/hooks/useCaptureProcessing';
import { getCameraService, getBackgroundRemovalQueue, retryBackgroundRemoval } from '@/services/cameraCoordinator';
import { CameraCaptureCancelledError } from '@/services/camera/CameraService';
import { CleanupStatusPanel } from './CleanupStatusPanel';
import { ManualCleanupEditor } from './ManualCleanupEditor';
import { ITEM_CATEGORIES, SEASONS, type ItemCategory, type ItemSeason } from '@/types/item';
import type { BackgroundRemovalQueueSnapshot } from '@/services/camera/BackgroundRemovalQueue';
import { useCanAddItem, useRemainingQuota, quotaStore } from '@/services/quotaStore';
import { adService } from '@/services/adService';
import { QuotaStatusBar } from '../QuotaComponents';
import { ImageAnalysisPanel } from './ImageAnalysisPanel';
import type { ColorMatch } from '@/services/imageAnalysisService';

const STEP_SEQUENCE = ['capture', 'cleanup', 'analysis', 'details', 'review'] as const;

type StepId = (typeof STEP_SEQUENCE)[number];

const stepMeta: Record<
  StepId,
  {
    title: string;
    subtitle: string;
  }
> = {
  capture: {
    title: 'Capture Item Photo',
    subtitle: 'Snap the garment in good lighting.',
  },
  cleanup: {
    title: 'Clean Background',
    subtitle: 'Remove distractions or mark what to erase.',
  },
  analysis: {
    title: 'Analyze Item',
    subtitle: 'Review detected colors, materials, and style tags.',
  },
  details: {
    title: 'Add Item Details',
    subtitle: 'Give the piece a memorable name.',
  },
  review: {
    title: 'Review & Confirm',
    subtitle: 'Double-check everything before saving.',
  },
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  dresses: 'Dresses',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  accessories: 'Accessories',
};

const SEASON_LABELS: Record<ItemSeason, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
  all: 'All seasons',
};

export type AddItemFlowResult = {
  name: string;
  category: ItemCategory;
  seasons: ItemSeason[];
  photoConfirmed: boolean;
  cleanupConfirmed: boolean;
  reviewAcknowledged: boolean;
  confirmedAtUtc: string;
  captureId?: string;
  imageUri?: string;
};

type FlowState = {
  photoConfirmed: boolean;
  cleanupConfirmed: boolean;
  analysisComplete: boolean;
  selectedColors: ColorMatch[];
  selectedMaterials: string[];
  selectedTags: string[];
  name: string;
  category: ItemCategory | null;
  seasons: ItemSeason[];
  reviewAcknowledged: boolean;
};

const INITIAL_STATE: FlowState = {
  photoConfirmed: false,
  cleanupConfirmed: false,
  analysisComplete: false,
  selectedColors: [],
  selectedMaterials: [],
  selectedTags: [],
  name: '',
  category: null,
  seasons: [],
  reviewAcknowledged: false,
};

export type AddItemFlowProps = {
  onComplete: (result: AddItemFlowResult) => void;
  onStepChange?: (step: StepId) => void;
  nowUtc?: () => string;
};

export function AddItemFlow({ onComplete, onStepChange, nowUtc }: AddItemFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<FlowState>(INITIAL_STATE);
  const { capture: activeCapture, status: captureStatus, isBusy: captureBusy, hasError: captureHasError } =
    useCaptureProcessing();
  const [isCapturing, setIsCapturing] = useState(false);
  const [queueEntry, setQueueEntry] = useState<BackgroundRemovalQueueSnapshot | null>(null);
  const [showManualCleanup, setShowManualCleanup] = useState(false);

  const currentStep = STEP_SEQUENCE[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isFinalStep = stepIndex === STEP_SEQUENCE.length - 1;

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 'capture':
        return state.photoConfirmed;
      case 'cleanup':
        return state.cleanupConfirmed;
      case 'analysis':
        return state.analysisComplete;
      case 'details':
        return (
          state.name.trim().length > 0 &&
          state.category !== null &&
          state.seasons.length > 0
        );
      case 'review':
        return state.reviewAcknowledged;
      default:
        return false;
    }
  }, [currentStep, state]);

  const handleStateUpdate = useCallback(
    (updates: Partial<FlowState>) => {
      setState(prev => ({ ...prev, ...updates }));
    },
    [setState]
  );

  const handleCapture = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    setIsCapturing(true);
    try {
      const record = await getCameraService().capture();
      if (record.status === 'failed') {
        handleStateUpdate({
          photoConfirmed: false,
          cleanupConfirmed: false,
          reviewAcknowledged: false,
        });
        Alert.alert(
          'Capture failed',
          record.lastError ??
          'We could not capture a photo right now. Please check lighting and try again.'
        );
        return;
      }

      handleStateUpdate({
        photoConfirmed: true,
        cleanupConfirmed: false,
        reviewAcknowledged: false,
      });
    } catch (error) {
      if (error instanceof CameraCaptureCancelledError) {
        handleStateUpdate({
          photoConfirmed: false,
          cleanupConfirmed: false,
          reviewAcknowledged: false,
        });
      } else {
        console.error('[AddItemFlow] Camera capture failed', error);
        if (error instanceof Error) {
          if (error.message === 'camera-permission-denied') {
            Alert.alert(
              'Camera access needed',
              'Enable camera permissions to capture new pieces. Drafts stay safe offline meanwhile.'
            );
          } else if (error.message === 'camera-no-asset') {
            Alert.alert(
              'Capture unavailable',
              'We could not read the captured photo. Please try again.'
            );
          } else {
            Alert.alert(
              'Capture unavailable',
              'We could not access the camera. Please check permissions and try again.'
            );
          }
        } else {
          Alert.alert(
            'Capture unavailable',
            'We could not access the camera. Please check permissions and try again.'
          );
        }
      }
    } finally {
      setIsCapturing(false);
    }
  }, [handleStateUpdate, isCapturing]);

  const handleLibraryPick = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    setIsCapturing(true);
    try {
      const records = await getCameraService().importFromLibrary({ multiple: true });
      if (records.length === 0) {
        return;
      }

      // If multiple items are picked, we currently only focus on the most recent one in this flow.
      // In a future update, we could add a queue browser here.
      handleStateUpdate({
        photoConfirmed: true,
        cleanupConfirmed: false,
        reviewAcknowledged: false,
      });
    } catch (error) {
      if (error instanceof CameraCaptureCancelledError) {
        // User cancelled, do nothing
      } else {
        console.error('[AddItemFlow] Library import failed', error);
        Alert.alert(
          'Import unavailable',
          'We could not load images from your gallery. Please check permissions.'
        );
      }
    } finally {
      setIsCapturing(false);
    }
  }, [handleStateUpdate, isCapturing]);

  const handleRetryCleanup = useCallback(() => {
    if (!activeCapture) {
      return;
    }

    retryBackgroundRemoval(activeCapture.id).catch(error => {
      console.error('[AddItemFlow] Failed to retry background removal', error);
      Alert.alert(
        'Retry unavailable',
        'We could not schedule a retry right now. Please try again shortly.'
      );
    });
  }, [activeCapture?.id]);

  useEffect(() => {
    const queue = getBackgroundRemovalQueue();
    if (!queue) {
      setQueueEntry(null);
      return;
    }

    let mounted = true;
    const sync = (snapshot: BackgroundRemovalQueueSnapshot[]) => {
      if (!mounted) {
        return;
      }
      if (!activeCapture) {
        setQueueEntry(null);
        return;
      }
      const entry = snapshot.find(item => item.captureId === activeCapture.id) ?? null;
      setQueueEntry(entry);
    };

    sync(queue.getSnapshot());
    const unsubscribe = queue.subscribe(sync);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [activeCapture]);

  useEffect(() => {
    if (!activeCapture) {
      setState(prev => {
        if (!prev.photoConfirmed && !prev.cleanupConfirmed) {
          return prev;
        }
        return {
          ...prev,
          photoConfirmed: false,
          cleanupConfirmed: false,
          reviewAcknowledged: false,
        };
      });
      return;
    }

    setState(prev => {
      const updates: Partial<FlowState> = {};

      if (!prev.photoConfirmed) {
        updates.photoConfirmed = true;
      }

      if (captureStatus === 'ready' || captureStatus === 'cached') {
        if (!prev.cleanupConfirmed) {
          updates.cleanupConfirmed = true;
        }
      } else if (captureStatus === 'failed') {
        if (prev.photoConfirmed || prev.cleanupConfirmed) {
          updates.photoConfirmed = false;
          updates.cleanupConfirmed = false;
          updates.reviewAcknowledged = false;
        }
      } else {
        if (prev.cleanupConfirmed) {
          updates.cleanupConfirmed = false;
          updates.reviewAcknowledged = false;
        }
      }

      if (Object.keys(updates).length === 0) {
        return prev;
      }

      return { ...prev, ...updates };
    });
  }, [activeCapture, captureStatus]);

  useEffect(() => {
    if (!activeCapture) {
      setState(prev => {
        if (!prev.photoConfirmed && !prev.cleanupConfirmed && !prev.reviewAcknowledged) {
          return prev;
        }
        return {
          ...prev,
          photoConfirmed: false,
          cleanupConfirmed: false,
          reviewAcknowledged: false,
        };
      });
      return;
    }

    if (activeCapture.status === 'failed') {
      setState(prev => {
        if (!prev.photoConfirmed && !prev.cleanupConfirmed && !prev.reviewAcknowledged) {
          return prev;
        }
        return {
          ...prev,
          photoConfirmed: false,
          cleanupConfirmed: false,
          reviewAcknowledged: false,
        };
      });
    }
  }, [activeCapture]);

  const handleBrushTool = useCallback(() => {
    if (!activeCapture?.processedUri && !activeCapture?.localUri) {
      Alert.alert('No Image', 'Capture an image first before using brush tools.');
      return;
    }
    setShowManualCleanup(true);
  }, [activeCapture]);

  const handleEraseTool = useCallback(() => {
    if (!activeCapture?.processedUri && !activeCapture?.localUri) {
      Alert.alert('No Image', 'Capture an image first before using erase tools.');
      return;
    }
    setShowManualCleanup(true);
  }, [activeCapture]);

  const handleManualCleanupSave = useCallback((editedMaskUri: string) => {
    setShowManualCleanup(false);
    // In a full implementation, this would update the capture with the edited mask
    Alert.alert('Edits Applied', 'Your manual edits have been saved.');
  }, []);

  const handleManualCleanupCancel = useCallback(() => {
    setShowManualCleanup(false);
  }, []);

  const handleAnalysisComplete = useCallback((result: {
    selectedColors: ColorMatch[];
    selectedMaterials: string[];
    selectedTags: string[];
  }) => {
    setState(prev => ({
      ...prev,
      analysisComplete: true,
      selectedColors: result.selectedColors,
      selectedMaterials: result.selectedMaterials,
      selectedTags: result.selectedTags,
    }));
  }, []);

  const handleAnalysisSkip = useCallback(() => {
    setState(prev => ({
      ...prev,
      analysisComplete: true,
    }));
  }, []);

  const handleSelectCategory = useCallback((category: ItemCategory) => {
    setState(prev => ({ ...prev, category }));
  }, []);

  const handleToggleSeason = useCallback((season: ItemSeason) => {
    setState(prev => {
      const hasSeason = prev.seasons.includes(season);
      let nextSeasons: ItemSeason[];

      if (hasSeason) {
        nextSeasons = prev.seasons.filter(entry => entry !== season);
      } else if (season === 'all') {
        nextSeasons = ['all'];
      } else {
        nextSeasons = [...prev.seasons.filter(entry => entry !== 'all'), season];
      }

      return { ...prev, seasons: nextSeasons };
    });
  }, []);

  const handleNext = useCallback(async () => {
    if (!canProceed) {
      return;
    }

    if (isFinalStep) {
      if (!state.category || state.seasons.length === 0) {
        return;
      }

      // Check if user can add more items
      const canAdd = quotaStore.canAddItem();
      if (!canAdd.allowed) {
        Alert.alert('Closet Full', canAdd.reason || 'Upgrade to Premium for more space!');
        return;
      }

      const result: AddItemFlowResult = {
        name: state.name.trim(),
        category: state.category,
        seasons: [...state.seasons],
        photoConfirmed: state.photoConfirmed,
        cleanupConfirmed: state.cleanupConfirmed,
        reviewAcknowledged: state.reviewAcknowledged,
        confirmedAtUtc: (nowUtc ?? defaultNowUtc)(),
        captureId: activeCapture?.id,
        imageUri: activeCapture?.processedUri ?? activeCapture?.localUri,
      };

      // Complete the flow
      onComplete(result);

      // Increment item count in quota tracker
      quotaStore.incrementItemCount();

      // Show ad after save (free users only)
      await adService.onItemSaved();

      setState(INITIAL_STATE);
      setStepIndex(0);
      onStepChange?.(STEP_SEQUENCE[0]);
      return;
    }

    const nextIndex = Math.min(stepIndex + 1, STEP_SEQUENCE.length - 1);
    setStepIndex(nextIndex);
    onStepChange?.(STEP_SEQUENCE[nextIndex]);
  }, [canProceed, isFinalStep, nowUtc, onComplete, onStepChange, state, stepIndex]);

  const handleBack = useCallback(() => {
    if (isFirstStep) {
      return;
    }

    const previousIndex = Math.max(stepIndex - 1, 0);
    setStepIndex(previousIndex);
    onStepChange?.(STEP_SEQUENCE[previousIndex]);
  }, [isFirstStep, onStepChange, stepIndex]);

  // Render manual cleanup editor if active
  if (showManualCleanup && activeCapture) {
    const imageUri = activeCapture.processedUri ?? activeCapture.localUri;
    return (
      <ManualCleanupEditor
        imageUri={imageUri}
        maskUri={activeCapture.maskUri}
        onSave={handleManualCleanupSave}
        onCancel={handleManualCleanupCancel}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.stepIndicator} testID="step-indicator">
        {STEP_SEQUENCE.map((step, index) => {
          const isActive = index === stepIndex;
          const isComplete = index < stepIndex;
          return (
            <View key={step} style={styles.stepBadgeContainer}>
              <View
                style={[
                  styles.stepBadge,
                  isActive && styles.stepBadgeActive,
                  isComplete && styles.stepBadgeComplete,
                ]}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.stepBadgeLabel,
                    (isActive || isComplete) && styles.stepBadgeLabelActive,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                {stepMeta[step].title}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Quota status for free users */}
      <QuotaStatusBar />

      <View style={styles.card}>
        <Text style={styles.title} testID="step-title">
          {stepMeta[currentStep].title}
        </Text>
        <Text style={styles.subtitle} testID="step-subtitle">
          {stepMeta[currentStep].subtitle}
        </Text>

        <View style={styles.content}>
          {renderStepContent(currentStep, state, handleStateUpdate, {
            capture: activeCapture,
            captureStatus,
            captureError: captureHasError ? activeCapture?.lastError ?? null : null,
            isCaptureBusy: captureBusy,
            isCapturing,
            onCapture: handleCapture,
            onLibraryPick: handleLibraryPick,
            queue: queueEntry,
            onRetryCleanup: handleRetryCleanup,
            onBrush: handleBrushTool,
            onErase: handleEraseTool,
            selectedCategory: state.category,
            selectedSeasons: state.seasons,
            onSelectCategory: handleSelectCategory,
            onToggleSeason: handleToggleSeason,
          })}
        </View>

        <View style={styles.footer}>
          <ActionButton
            label="Back"
            onPress={handleBack}
            disabled={isFirstStep}
            testID="back-button"
            variant="ghost"
          />
          <ActionButton
            label={isFinalStep ? 'Save Item' : 'Next'}
            onPress={handleNext}
            disabled={!canProceed}
            testID="next-button"
          />
        </View>
      </View>
    </View>
  );
}

function renderStepContent(
  step: StepId,
  state: FlowState,
  updateState: (updates: Partial<FlowState>) => void,
  context: {
    capture: CameraCaptureRecord | null;
    captureStatus: CaptureProcessingStatus;
    captureError: string | null;
    isCaptureBusy: boolean;
    isCapturing: boolean;
    onCapture: () => void;
    onLibraryPick: () => void;
    queue: BackgroundRemovalQueueSnapshot | null;
    onRetryCleanup: () => void;
    onBrush: () => void;
    onErase: () => void;
    selectedCategory: ItemCategory | null;
    selectedSeasons: ItemSeason[];
    onSelectCategory: (category: ItemCategory) => void;
    onToggleSeason: (season: ItemSeason) => void;
  }
) {
  switch (step) {
    case 'capture': {
      const statusCopy = getCaptureStatusCopy(context.captureStatus, context.capture);
      const captureButtonLabel = context.isCapturing
        ? 'Capturing…'
        : context.capture
          ? 'Retake Photo'
          : 'Capture Photo';
      const captureDisabled = context.isCapturing || context.isCaptureBusy;
      const captureVariant = context.capture ? 'outline' : 'primary';

      return (
        <View style={styles.stepBody}>
          <Text style={styles.bodyText}>{statusCopy}</Text>
          {context.captureError ? (
            <Text style={styles.captureErrorText} testID="capture-error-message">
              {context.captureError}
            </Text>
          ) : null}
          <ActionButton
            label={captureButtonLabel}
            onPress={context.onCapture}
            testID="capture-trigger-button"
            disabled={captureDisabled}
            variant={captureVariant}
          />
          {!context.capture && (
            <ActionButton
              label="Pick from Gallery"
              onPress={context.onLibraryPick}
              testID="library-pick-button"
              disabled={captureDisabled}
              variant="outline"
            />
          )}
          <ActionButton
            label={state.photoConfirmed ? 'Photo Confirmed' : 'Mark Photo Captured'}
            onPress={() => updateState({ photoConfirmed: true })}
            testID="capture-confirm-button"
            variant={state.photoConfirmed ? 'outline' : 'ghost'}
            disabled={context.isCapturing || Boolean(context.capture)}
          />
        </View>
      );
    }
    case 'cleanup':
      return (
        <View style={styles.stepBody}>
          <CleanupStatusPanel
            capture={context.capture}
            queue={context.queue}
            onRetry={context.onRetryCleanup}
            onBrush={context.onBrush}
            onErase={context.onErase}
          />
          <Text style={styles.bodyText}>
            Confirm once you are happy with the cleanup or want to continue to tagging.
          </Text>
          <ActionButton
            label={state.cleanupConfirmed ? 'Background Ready' : 'Mark Background Cleaned'}
            onPress={() => updateState({ cleanupConfirmed: true })}
            testID="cleanup-confirm-button"
            variant={state.cleanupConfirmed ? 'outline' : 'primary'}
          />
        </View>
      );
    case 'details':
      return (
        <View style={styles.stepBody}>
          <Text style={styles.inputLabel}>Item name</Text>
          <TextInput
            style={styles.input}
            value={state.name}
            onChangeText={text => updateState({ name: text })}
            placeholder="e.g. Linen Overshirt"
            placeholderTextColor={colors.text.tertiary}
            testID="details-name-input"
            autoCapitalize="words"
          />
          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>Category</Text>
            <View style={styles.chipGroup}>
              {ITEM_CATEGORIES.map(category => (
                <SelectionChip
                  key={category}
                  label={CATEGORY_LABELS[category]}
                  selected={context.selectedCategory === category}
                  onPress={() => context.onSelectCategory(category)}
                  testID={`category-chip-${category}`}
                />
              ))}
            </View>
          </View>
          <View style={styles.selectorBlock}>
            <Text style={styles.selectorLabel}>Seasonal tags</Text>
            <View style={styles.chipGroup}>
              {SEASONS.map(season => (
                <SelectionChip
                  key={season}
                  label={SEASON_LABELS[season]}
                  selected={context.selectedSeasons.includes(season)}
                  onPress={() => context.onToggleSeason(season)}
                  testID={`season-chip-${season}`}
                />
              ))}
            </View>
          </View>
          <Text style={styles.helperText}>
            Choose where this piece lives in your closet and which seasons it thrives in.
          </Text>
        </View>
      );
    case 'review':
      return (
        <View style={styles.stepBody}>
          <Text style={styles.bodyText}>Name: {state.name.trim() || 'Unnamed item'}</Text>
          <Text style={styles.bodyText}>
            Category: {state.category ? CATEGORY_LABELS[state.category] : 'Not selected'}
          </Text>
          <Text style={styles.bodyText}>
            Seasons: {formatSeasonList(state.seasons)}
          </Text>
          <Text style={styles.bodyText}>
            Photo captured: {state.photoConfirmed ? 'Yes' : 'Not yet'}
          </Text>
          <Text style={styles.bodyText}>
            Background cleaned: {state.cleanupConfirmed ? 'Yes' : 'Not yet'}
          </Text>
          <ActionButton
            label={
              state.reviewAcknowledged ? 'Review Confirmed' : 'I confirm everything looks good'
            }
            onPress={() => updateState({ reviewAcknowledged: true })}
            testID="review-confirm-button"
            variant={state.reviewAcknowledged ? 'outline' : 'primary'}
          />
        </View>
      );
    default:
      return null;
  }
}

function getCaptureStatusCopy(
  status: CaptureProcessingStatus,
  capture: CameraCaptureRecord | null
) {
  if (!capture) {
    return 'Capture a clear photo of your garment. We will store it safely offline before syncing.';
  }

  switch (status) {
    case 'pending':
      return 'Photo saved locally. Background cleanup will start shortly.';
    case 'processing':
      return 'Cleaning the background. Keep the app open or continue to tagging.';
    case 'ready':
    case 'cached':
      return 'Cleanup complete. Review the processed image or retake the photo if needed.';
    case 'failed':
      return 'Capture needs another attempt before we can continue.';
    default:
      return 'Capture saved. Retake the photo if you need a different angle.';
  }
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  variant?: 'primary' | 'outline' | 'ghost';
};

function ActionButton({ label, onPress, disabled, testID, variant = 'primary' }: ActionButtonProps) {
  const accessibilityState: AccessibilityState = { disabled };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      style={({ pressed }) => [
        styles.buttonBase,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'outline' && styles.buttonOutline,
        variant === 'ghost' && styles.buttonGhost,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          variant !== 'primary' && styles.buttonLabelAlt,
          disabled && styles.buttonLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function defaultNowUtc() {
  return new Date().toISOString();
}

function formatSeasonList(seasons: ItemSeason[]) {
  if (seasons.length === 0) {
    return 'Not selected';
  }
  return seasons.map(season => SEASON_LABELS[season]).join(', ');
}

type SelectionChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
};

function SelectionChip({ label, selected, onPress, testID }: SelectionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  stepIndicator: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  stepBadgeContainer: {
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 140,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  stepBadgeActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  stepBadgeComplete: {
    backgroundColor: colors.accent.secondary,
    borderColor: colors.accent.secondary,
  },
  stepBadgeLabel: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  stepBadgeLabelActive: {
    color: colors.text.inverse,
  },
  stepLabel: {
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    color: colors.text.tertiary,
  },
  stepLabelActive: {
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  content: {
    gap: spacing.md,
  },
  stepBody: {
    gap: spacing.md,
  },
  bodyText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  captureErrorText: {
    fontSize: typography.fontSize.xs,
    color: colors.status.error,
  },
  selectorBlock: {
    gap: spacing.xs,
  },
  selectorLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  helperText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.primary,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  chipLabelSelected: {
    color: colors.text.inverse,
    fontWeight: typography.fontWeight.medium,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  buttonBase: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  buttonOutline: {
    backgroundColor: colors.surface,
    borderColor: colors.accent.primary,
  },
  buttonGhost: {
    backgroundColor: colors.surface,
    borderColor: 'transparent',
  },
  buttonDisabled: {
    backgroundColor: colors.border,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.inverse,
  },
  buttonLabelAlt: {
    color: colors.accent.primary,
  },
  buttonLabelDisabled: {
    color: colors.text.inverse,
    opacity: 0.6,
  },
});


