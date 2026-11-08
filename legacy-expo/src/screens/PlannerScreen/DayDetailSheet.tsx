import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import type { PlannerEntry } from '@/types/planner';
import type { WardrobeItem } from '@/types/item';
import { colors, spacing, borderRadius, typography } from '@theme';
import { Feather } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  calendarDate: string | null;
  entries: PlannerEntry[];
  wardrobeLookup: Record<string, WardrobeItem | undefined>;
  onClose: () => void;
  onAddEntry: () => void;
  onEditEntry: (entry: PlannerEntry) => void;
  onRemoveEntry: (entryId: string) => void;
  onReorderEntries: (orderedIds: string[]) => void;
};

export function DayDetailSheet({
  visible,
  calendarDate,
  entries,
  wardrobeLookup,
  onClose,
  onAddEntry,
  onEditEntry,
  onRemoveEntry,
  onReorderEntries,
}: Props) {
  if (!calendarDate) {
    return null;
  }

  const formattedDate = new Date(`${calendarDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const handleMove = (entryId: string, direction: -1 | 1) => {
    const currentIdx = entries.findIndex(entry => entry.id === entryId);
    if (currentIdx < 0) {
      return;
    }
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= entries.length) {
      return;
    }
    const orderedIds = [...entries];
    const [removed] = orderedIds.splice(currentIdx, 1);
    orderedIds.splice(nextIdx, 0, removed);
    onReorderEntries(orderedIds.map(entry => entry.id));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent testID="day-detail-sheet">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>{formattedDate}</Text>
              <Text style={styles.sheetSubtitle}>
                {entries.length > 0
                  ? 'Tap a look to see details, notes, or reorder.'
                  : 'No looks saved yet. Add one to start tracking.'}
              </Text>
            </View>
            <TouchableOpacity accessibilityLabel="Close day detail" onPress={onClose}>
              <Feather name="x" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.entryList}>
            {entries.map((entry, index) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.entryCard}
                activeOpacity={0.9}
                onPress={() => onEditEntry(entry)}
              >
                <View style={styles.entryRow}>
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryTitle}>{entry.title}</Text>
                    {entry.labels?.context && (
                      <Text style={styles.entryContext}>{entry.labels.context}</Text>
                    )}
                    {entry.note && <Text style={styles.entryNote}>{entry.note}</Text>}
                    <View style={styles.itemTags}>
                      {entry.wardrobeItemIds.map(id => {
                        const item = wardrobeLookup[id];
                        return (
                          <Text key={id} style={styles.itemTag}>
                            {item?.name ?? 'Saved item'}
                          </Text>
                        );
                      })}
                    </View>
                  </View>
                  <View style={styles.entryActions}>
                    <TouchableOpacity
                      accessibilityLabel={`Move ${entry.title} earlier`}
                      onPress={() => handleMove(entry.id, -1)}
                      disabled={index === 0}
                      style={[styles.reorderButton, index === 0 && styles.disabledButton]}
                    >
                      <Feather name="arrow-up" size={16} color={colors.text.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel={`Move ${entry.title} later`}
                      onPress={() => handleMove(entry.id, 1)}
                      disabled={index === entries.length - 1}
                      style={[styles.reorderButton, index === entries.length - 1 && styles.disabledButton]}
                    >
                      <Feather name="arrow-down" size={16} color={colors.text.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel={`Remove ${entry.title}`}
                      onPress={() => onRemoveEntry(entry.id)}
                    >
                      <Feather name="trash-2" size={18} color={colors.status.error} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.entryMeta}>
                  Logged as {entry.lookKind === 'single' ? 'single item' : 'outfit'} •{' '}
                  {entry.syncStatus === 'synced' ? 'Synced' : 'Pending sync'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onAddEntry}>
              <Text style={styles.secondaryButtonText}>Add look</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.lg,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  sheetSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  entryList: {
    padding: spacing.lg,
  },
  entryCard: {
    backgroundColor: colors.offWhite,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryInfo: {
    flex: 1,
    paddingRight: spacing.md,
  },
  entryTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  entryContext: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.accent.primary,
    textTransform: 'capitalize',
  },
  entryNote: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  itemTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  itemTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  entryActions: {
    alignItems: 'flex-end',
  },
  reorderButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    marginBottom: spacing.xs,
  },
  disabledButton: {
    opacity: 0.3,
  },
  entryMeta: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
  },
  secondaryButton: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: typography.fontSize.md,
    color: colors.accent.primary,
    fontWeight: typography.fontWeight.medium,
  },
});

export default DayDetailSheet;


