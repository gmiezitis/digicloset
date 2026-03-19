import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { SizePreferenceEntry } from '@/types/styleProfile';
import { styleProfileStore } from '@/services/styleProfileStore';
import { styles } from './styles';
import { formatGarmentType } from './insights';

type SizesSectionProps = {
  sizePreferences: SizePreferenceEntry[];
  onFeedback: (message: string | null) => void;
  disabled?: boolean;
};

type SizeFormState = {
  id?: string | null;
  garmentType: GarmentOption;
  sizeLabel: string;
  notes: string;
};

type GarmentOption =
  | 'tops'
  | 'bottoms'
  | 'dresses'
  | 'outerwear'
  | 'shoes'
  | 'accessories'
  | 'other';

const GARMENT_OPTIONS: GarmentOption[] = [
  'tops',
  'bottoms',
  'dresses',
  'outerwear',
  'shoes',
  'accessories',
  'other',
];

export function SizesSection({ sizePreferences, onFeedback, disabled }: SizesSectionProps) {
  const [draft, setDraft] = useState<SizeFormState>(createSizeDraft);

  const handleSave = async () => {
    onFeedback(null);
    if (!draft.sizeLabel.trim()) {
      onFeedback('Add a size label before saving.');
      return;
    }
    try {
      await styleProfileStore.saveSizePreference({
        id: draft.id ?? undefined,
        garmentType: draft.garmentType,
        sizeLabel: draft.sizeLabel,
        notes: draft.notes,
      });
      setDraft(createSizeDraft());
      onFeedback('Size preference saved.');
    } catch (error) {
      onFeedback('Unable to save size preference.');
      console.error('[style-stats] size-preference-save-failed', error);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Clothing sizes</Text>
      {sizePreferences.length === 0 ? (
        <Text style={styles.helperText}>Track sizes for tops, dresses, shoes, and more.</Text>
      ) : (
        sizePreferences.map(entry => (
          <View key={entry.id} style={styles.cardRow}>
            <View>
              <Text style={styles.rowTitle}>
                {formatGarmentType(entry.garmentType)} · {entry.sizeLabel}
              </Text>
              {entry.notes ? <Text style={styles.rowSubtitle}>{entry.notes}</Text> : null}
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() =>
                  setDraft({
                    id: entry.id,
                    garmentType: entry.garmentType as GarmentOption,
                    sizeLabel: entry.sizeLabel,
                    notes: entry.notes ?? '',
                  })
                }
              >
                <Text style={styles.actionLink}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => styleProfileStore.deleteSizePreference(entry.id)}>
                <Text style={styles.actionLink}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => styleProfileStore.reorderSizePreference(entry.id, 'up')}
              >
                <Text style={styles.actionLink}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => styleProfileStore.reorderSizePreference(entry.id, 'down')}
              >
                <Text style={styles.actionLink}>↓</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <View style={styles.formRow}>
        <View style={styles.chipRow}>
          {GARMENT_OPTIONS.map(option => (
            <TouchableOpacity
              key={option}
              style={[styles.typeChip, draft.garmentType === option && styles.typeChipSelected]}
              onPress={() => setDraft(prev => ({ ...prev, garmentType: option }))}
            >
              <Text
                style={[
                  styles.typeChipText,
                  draft.garmentType === option && styles.typeChipTextSelected,
                ]}
              >
                {formatGarmentType(option)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Size label"
          value={draft.sizeLabel}
          onChangeText={text => setDraft(prev => ({ ...prev, sizeLabel: text }))}
          testID="size-label-input"
        />
        <TextInput
          style={styles.input}
          placeholder="Notes"
          value={draft.notes}
          onChangeText={text => setDraft(prev => ({ ...prev, notes: text }))}
        />
        <View style={styles.formActions}>
          <TouchableOpacity
            style={[styles.saveButton, disabled && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={disabled}
            testID="size-save-button"
          >
            <Text style={styles.saveButtonText}>
              {draft.id ? 'Update size' : 'Save size'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDraft(createSizeDraft())}>
            <Text style={styles.actionLink}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function createSizeDraft(): SizeFormState {
  return { id: null, garmentType: 'tops', sizeLabel: '', notes: '' };
}


