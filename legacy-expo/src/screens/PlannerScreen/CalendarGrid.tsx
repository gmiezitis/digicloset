import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import type { PlannerEntry } from '@/types/planner';
import type { CalendarDayCell } from '@/services/plannerStore';
import { colors, spacing, borderRadius, typography } from '@theme';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Props = {
  weeks: CalendarDayCell[][];
  selectedDate: string | null;
  onSelectDate: (calendarDate: string) => void;
  thumbnailLookup: Record<string, string | undefined>;
};

export function CalendarGrid({ weeks, selectedDate, onSelectDate, thumbnailLookup }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map(label => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>
      {weeks.map((week, weekIdx) => (
        <View key={`week-${weekIdx}`} style={styles.weekRow}>
          {week.map(day => {
            const isSelected = day.calendarDate === selectedDate;
            const dateNumber = Number(day.calendarDate.slice(-2));
            const previewEntries = day.entries.slice(0, 2);
            return (
              <TouchableOpacity
                key={day.calendarDate}
                style={[
                  styles.dayCell,
                  isSelected && styles.selectedDay,
                  !day.inCurrentMonth && styles.outsideMonth,
                ]}
                activeOpacity={0.8}
                onPress={() => onSelectDate(day.calendarDate)}
              >
                <View style={styles.dayHeader}>
                  <Text style={[styles.dateLabel, !day.inCurrentMonth && styles.fadedText]}>{dateNumber}</Text>
                  {day.entries.length > 0 && (
                    <View style={styles.counterBadge}>
                      <Text style={styles.counterText}>{day.entries.length}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.previewRow}>
                  {previewEntries.map(entry => (
                    <EntryThumbnail
                      key={entry.id}
                      entry={entry}
                      thumbnailLookup={thumbnailLookup}
                    />
                  ))}
                </View>
                {day.entries.some(entry => entry.syncStatus !== 'synced') && <View style={styles.pendingDot} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

type EntryThumbnailProps = {
  entry: PlannerEntry;
  thumbnailLookup: Record<string, string | undefined>;
};

function EntryThumbnail({ entry, thumbnailLookup }: EntryThumbnailProps) {
  const previewUri = resolvePreview(entry, thumbnailLookup);
  if (!previewUri) {
    return (
      <View style={styles.previewPlaceholder}>
        <Text style={styles.previewPlaceholderText}>{entry.title.charAt(0)}</Text>
      </View>
    );
  }
  return <Image source={{ uri: previewUri }} style={styles.previewImage} />;
}

function resolvePreview(entry: PlannerEntry, thumbnailLookup: Record<string, string | undefined>) {
  if (entry.coverImageUri) {
    return entry.coverImageUri;
  }
  for (const wardrobeId of entry.wardrobeItemIds) {
    const uri = thumbnailLookup[wardrobeId];
    if (uri) {
      return uri;
    }
  }
  return undefined;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow(),
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  dayCell: {
    flex: 1,
    minHeight: 72,
    marginHorizontal: 2,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    backgroundColor: colors.offWhite,
  },
  selectedDay: {
    borderWidth: 1,
    borderColor: colors.accent.primary,
    backgroundColor: colors.white,
  },
  outsideMonth: {
    backgroundColor: colors.background,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  fadedText: {
    color: colors.text.tertiary,
  },
  counterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: borderRadius.round,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  counterText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  previewRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  previewImage: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
  },
  previewPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.paleGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  previewPlaceholderText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.round,
    backgroundColor: colors.status.warning,
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
  },
});

function shadow() {
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  };
}

export default CalendarGrid;


