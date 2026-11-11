import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { MeasurementEntry, MeasurementUnit } from '@/types/styleProfile';
import { styleProfileStore } from '@/services/styleProfileStore';
import { styles } from './styles';
import { colors } from '@theme';

type BodyMeasurementsSectionProps = {
  measurements: MeasurementEntry[];
  loading: boolean;
  onFeedback: (message: string | null) => void;
};

type MeasurementFormState = {
  id?: string | null;
  label: string;
  value: string;
  unit: MeasurementUnit;
  notes: string;
};

const UNIT_OPTIONS: MeasurementUnit[] = ['cm', 'in'];

export function BodyMeasurementsSection({
  measurements,
  loading,
  onFeedback,
}: BodyMeasurementsSectionProps) {
  const [draft, setDraft] = useState<MeasurementFormState>(createMeasurementDraft);

  const handleSave = async () => {
    onFeedback(null);
    const numericValue = Number(draft.value);
    if (!draft.label.trim()) {
      onFeedback('Please name your measurement before saving.');
      return;
    }
    if (!(numericValue > 0)) {
      onFeedback('Measurement value must be greater than zero.');
      return;
    }
    try {
      await styleProfileStore.saveMeasurement({
        id: draft.id ?? undefined,
        label: draft.label,
        unit: draft.unit,
        value: numericValue,
        notes: draft.notes,
      });
      setDraft(createMeasurementDraft());
      onFeedback('Measurement saved locally.');
    } catch (error) {
      onFeedback('Unable to save measurement. Please try again.');
      console.error('[style-stats] measurement-save-failed', error);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Body measurements</Text>
      {loading && measurements.length === 0 ? (
        <ActivityIndicator color={colors.accent.primary} />
      ) : measurements.length === 0 ? (
        <Text style={styles.helperText}>Save waist, inseam, hips, or any custom measurement.</Text>
      ) : (
        measurements.map(entry => (
          <View key={entry.id} style={styles.cardRow}>
            <View>
              <Text style={styles.rowTitle}>
                {entry.label} · {entry.value}
                {entry.unit}
              </Text>
              {entry.notes ? <Text style={styles.rowSubtitle}>{entry.notes}</Text> : null}
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() =>
                  setDraft({
                    id: entry.id,
                    label: entry.label,
                    value: `${entry.value}`,
                    unit: entry.unit,
                    notes: entry.notes ?? '',
                  })
                }
              >
                <Text style={styles.actionLink}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => styleProfileStore.deleteMeasurement(entry.id)}>
                <Text style={styles.actionLink}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => styleProfileStore.reorderMeasurement(entry.id, 'up')}>
                <Text style={styles.actionLink}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => styleProfileStore.reorderMeasurement(entry.id, 'down')}
              >
                <Text style={styles.actionLink}>↓</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <View style={styles.formRow}>
        <TextInput
          style={styles.input}
          placeholder="Measurement label"
          value={draft.label}
          onChangeText={text => setDraft(prev => ({ ...prev, label: text }))}
          testID="measurement-label-input"
        />
        <TextInput
          style={styles.input}
          placeholder="Measurement value"
          value={draft.value}
          onChangeText={text => setDraft(prev => ({ ...prev, value: text }))}
          keyboardType="numeric"
          testID="measurement-value-input"
        />
        <View style={styles.unitToggle}>
          {UNIT_OPTIONS.map(unit => (
            <TouchableOpacity
              key={unit}
              style={[styles.unitChip, draft.unit === unit && styles.unitChipSelected]}
              onPress={() => setDraft(prev => ({ ...prev, unit }))}
            >
              <Text
                style={[styles.unitChipText, draft.unit === unit && styles.unitChipTextSelected]}
              >
                {unit.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Notes (optional)"
          value={draft.notes}
          onChangeText={text => setDraft(prev => ({ ...prev, notes: text }))}
        />
        <View style={styles.formActions}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            testID="measurement-save-button"
          >
            <Text style={styles.saveButtonText}>
              {draft.id ? 'Update measurement' : 'Save measurement'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDraft(createMeasurementDraft())}>
            <Text style={styles.actionLink}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function createMeasurementDraft(): MeasurementFormState {
  return { id: null, label: '', value: '', unit: 'cm', notes: '' };
}




