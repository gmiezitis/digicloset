import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { BrandSizeExceptionEntry } from '@/types/styleProfile';
import { styleProfileStore } from '@/services/styleProfileStore';
import { styles } from './styles';
import { formatGarmentType } from './insights';

type BrandExceptionsSectionProps = {
  brandSizeExceptions: BrandSizeExceptionEntry[];
  onFeedback: (message: string | null) => void;
  disabled?: boolean;
};

type BrandFormState = {
  id?: string | null;
  brand: string;
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

export function BrandExceptionsSection({
  brandSizeExceptions,
  onFeedback,
  disabled,
}: BrandExceptionsSectionProps) {
  const [draft, setDraft] = useState<BrandFormState>(createBrandDraft);

  const handleSave = async () => {
    onFeedback(null);
    if (!draft.brand.trim() || !draft.sizeLabel.trim()) {
      onFeedback('Brand and size cannot be empty.');
      return;
    }
    try {
      await styleProfileStore.saveBrandException({
        id: draft.id ?? undefined,
        brand: draft.brand,
        garmentType: draft.garmentType,
        sizeLabel: draft.sizeLabel,
        notes: draft.notes,
      });
      setDraft(createBrandDraft());
      onFeedback('Brand exception saved.');
    } catch (error) {
      onFeedback('Unable to save brand exception.');
      console.error('[style-stats] brand-exception-save-failed', error);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Brand exceptions</Text>
      {brandSizeExceptions.length === 0 ? (
        <Text style={styles.helperText}>
          Save fit tips for brands so you never second guess a size again.
        </Text>
      ) : (
        brandSizeExceptions.map(entry => (
          <View key={entry.id} style={styles.cardRow}>
            <View>
              <Text style={styles.rowTitle}>
                {entry.brand} · {formatGarmentType(entry.garmentType)} · {entry.sizeLabel}
              </Text>
              {entry.notes ? <Text style={styles.rowSubtitle}>{entry.notes}</Text> : null}
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() =>
                  setDraft({
                    id: entry.id,
                    brand: entry.brand,
                    garmentType: entry.garmentType as GarmentOption,
                    sizeLabel: entry.sizeLabel,
                    notes: entry.notes ?? '',
                  })
                }
              >
                <Text style={styles.actionLink}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => styleProfileStore.deleteBrandException(entry.id)}>
                <Text style={styles.actionLink}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <View style={styles.formRow}>
        <TextInput
          style={styles.input}
          placeholder="Brand"
          value={draft.brand}
          onChangeText={text => setDraft(prev => ({ ...prev, brand: text }))}
          testID="brand-input"
        />
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
          placeholder="Size"
          value={draft.sizeLabel}
          onChangeText={text => setDraft(prev => ({ ...prev, sizeLabel: text }))}
          testID="brand-size-input"
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
            testID="brand-save-button"
          >
            <Text style={styles.saveButtonText}>
              {draft.id ? 'Update brand exception' : 'Save brand exception'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDraft(createBrandDraft())}>
            <Text style={styles.actionLink}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function createBrandDraft(): BrandFormState {
  return { id: null, brand: '', garmentType: 'tops', sizeLabel: '', notes: '' };
}




