import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
} from 'react-native';
import type { WardrobeItem } from '@/types/item';
import type { PlannerContext, PlannerEntry, PlannerEntryKind } from '@/types/planner';
import { PLANNER_CONTEXTS } from '@/types/planner';
import { colors, spacing, borderRadius, typography } from '@theme';

type SubmitPayload = {
  wardrobeItemIds: string[];
  note: string;
  context?: PlannerContext;
  lookKind: PlannerEntryKind;
  coverImageUri?: string;
};

type Props = {
  visible: boolean;
  calendarDate: string | null;
  wardrobeItems: WardrobeItem[];
  entry?: PlannerEntry | null;
  onCancel: () => void;
  onSubmit: (payload: SubmitPayload) => void;
  saving?: boolean;
};

export function EntryComposer({
  visible,
  calendarDate,
  wardrobeItems,
  entry,
  onCancel,
  onSubmit,
  saving = false,
}: Props) {
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [context, setContext] = useState<PlannerContext | undefined>('work');
  const [lookKind, setLookKind] = useState<PlannerEntryKind>('outfit');

  useEffect(() => {
    if (visible) {
      setSelectedItemIds(entry ? entry.wardrobeItemIds : []);
      setNote(entry?.note ?? '');
      setContext(entry?.labels?.context ?? 'work');
      setLookKind(entry?.lookKind ?? (entry?.wardrobeItemIds.length === 1 ? 'single' : 'outfit'));
    } else {
      setSelectedItemIds([]);
      setNote('');
    }
  }, [entry, visible]);

  const selectedItems = useMemo(
    () => wardrobeItems.filter(item => selectedItemIds.includes(item.id)),
    [wardrobeItems, selectedItemIds]
  );

  const handleToggleItem = (itemId: string) => {
    setSelectedItemIds(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      }
      return [...prev, itemId];
    });
  };

  const handleSubmit = () => {
    if (!selectedItemIds.length || !calendarDate) {
      return;
    }
    const coverImageUri = selectedItems[0]?.thumbnailUri ?? selectedItems[0]?.imageUri;
    onSubmit({
      wardrobeItemIds: selectedItemIds,
      note,
      context,
      lookKind: lookKind === 'single' ? 'single' : selectedItemIds.length === 1 ? 'single' : 'outfit',
      coverImageUri,
    });
  };

  if (!calendarDate) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{entry ? 'Update Look' : 'Log your outfit'}</Text>
          <Text style={styles.panelSubtitle}>
            {new Date(`${calendarDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
          <TextInput
            placeholder="Notes, events, how it felt..."
            placeholderTextColor={colors.text.tertiary}
            multiline
            value={note}
            onChangeText={setNote}
            style={styles.noteInput}
          />
          <Text style={styles.helperText}>
            The first line becomes the title on your calendar. Use it to label the look.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Context</Text>
            <View style={styles.contextRow}>
              {PLANNER_CONTEXTS.map(option => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setContext(option)}
                  style={[styles.contextChip, context === option && styles.contextChipSelected]}
                >
                  <Text
                    style={[
                      styles.contextChipText,
                      context === option && styles.contextChipTextSelected,
                    ]}
                  >
                    {formatContext(option)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Look type</Text>
            <View style={styles.toggleRow}>
              {(['outfit', 'single'] as PlannerEntryKind[]).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[styles.toggleChip, lookKind === option && styles.toggleChipActive]}
                  onPress={() => setLookKind(option)}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      lookKind === option && styles.toggleChipTextActive,
                    ]}
                  >
                    {option === 'single' ? 'Single item' : 'Full outfit'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Pick pieces</Text>
          <FlatList
            data={wardrobeItems}
            keyExtractor={item => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.itemsRow}
            renderItem={({ item }) => {
              const isSelected = selectedItemIds.includes(item.id);
              return (
                <TouchableOpacity
                  onPress={() => handleToggleItem(item.id)}
                  style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                >
                  {item.thumbnailUri || item.imageUri ? (
                    <Image
                      source={{ uri: item.thumbnailUri ?? item.imageUri }}
                      style={styles.itemImage}
                    />
                  ) : (
                    <View style={styles.itemPlaceholder}>
                      <Text style={styles.itemPlaceholderText}>{item.name.charAt(0)}</Text>
                    </View>
                  )}
                  <Text numberOfLines={1} style={styles.itemName}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!selectedItemIds.length || saving) && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedItemIds.length || saving}
            >
              <Text style={styles.primaryButtonText}>
                {entry ? 'Save changes' : 'Save to calendar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatContext(context: PlannerContext) {
  if (context === 'goingOut') {
    return 'Going out';
  }
  return context.charAt(0).toUpperCase() + context.slice(1);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  panelTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  panelSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  noteInput: {
    marginTop: spacing.md,
    backgroundColor: colors.offWhite,
    borderRadius: borderRadius.lg,
    minHeight: 80,
    padding: spacing.md,
    textAlignVertical: 'top',
    color: colors.text.primary,
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  contextChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  contextChipSelected: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  contextChipText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  contextChipTextSelected: {
    color: colors.text.inverse,
  },
  toggleRow: {
    flexDirection: 'row',
  },
  toggleChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  toggleChipActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.primary,
  },
  toggleChipText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  toggleChipTextActive: {
    color: colors.text.inverse,
    fontWeight: typography.fontWeight.semibold,
  },
  itemsRow: {
    paddingVertical: spacing.sm,
  },
  itemCard: {
    width: 96,
    marginRight: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    alignItems: 'center',
  },
  itemCardSelected: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.offWhite,
  },
  itemImage: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
  },
  itemPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    backgroundColor: colors.paleGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPlaceholderText: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.bold,
  },
  itemName: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.text.primary,
  },
  buttonRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  primaryButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.lightGray,
  },
  primaryButtonText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});

export default EntryComposer;





