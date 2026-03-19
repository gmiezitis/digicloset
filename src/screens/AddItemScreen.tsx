import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { colors, spacing, typography } from '@theme';
import { AddItemFlow, AddItemFlowResult } from '@components/addItem';
import { saveAddItemWizardDraft } from '@/services/storage';
import { closetStore } from '@/services/closetStore';
import { enqueueDraftSync } from '@/services/draftSyncQueue';
import { initializeCameraProcessing, shutdownCameraProcessing } from '@/services/cameraCoordinator';

export function AddItemScreen() {
  useEffect(() => {
    initializeCameraProcessing();
    return () => {
      shutdownCameraProcessing();
    };
  }, []);

  const handleComplete = useCallback(async (result: AddItemFlowResult) => {
    try {
      const draft = await saveAddItemWizardDraft(result);
      closetStore.applyDraftUpsert(draft);
      enqueueDraftSync(draft, { reason: 'wizard-complete', immediate: true });
      Alert.alert(
        '🎉 Draft saved offline',
        `“${draft.name}” is safe on this device and will sync once cleanup finishes.`
      );
      console.log('[AddItemFlow] Draft saved', draft);
    } catch (error) {
      console.error('[AddItemFlow] Failed to save draft', error);
      Alert.alert(
        'Save incomplete',
        'We could not persist your draft locally. Please try again in a moment.'
      );
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Add New Wardrobe Item</Text>
        <Text style={styles.subtitle}>
          Follow the guided steps to capture, refine, and review your piece.
        </Text>
      </View>
      <AddItemFlow onComplete={handleComplete} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingVertical: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
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
});