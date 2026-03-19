import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '@theme';
import { usePlannerCalendarMonth, usePlannerEntriesForDate, usePlannerSearch, usePlannerState, plannerStore } from '@/services/plannerStore';
import { useClosetState, closetStore } from '@/services/closetStore';
import CalendarGrid from './PlannerScreen/CalendarGrid';
import EntryComposer from './PlannerScreen/EntryComposer';
import DayDetailSheet from './PlannerScreen/DayDetailSheet';
import { createPlannerEntry, updatePlannerEntry } from '@/types/planner';
import type { PlannerEntry, PlannerContext } from '@/types/planner';
import { createRandomId, defaultNowUtc } from '@/services/storage';
import { usePlannerAnalytics } from '@/services/analytics/plannerAnalytics';

export function PlannerScreen() {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonthUtc(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [composerVisible, setComposerVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PlannerEntry | null>(null);
  const [daySheetVisible, setDaySheetVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  const plannerState = usePlannerState();
  const closetState = useClosetState();
  const analytics = usePlannerAnalytics(plannerState.entries, closetState.items);

  useEffect(() => {
    plannerStore.initialize();
    const maybePromise = closetStore.initialize();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => undefined);
    }
  }, []);

  const year = monthCursor.getUTCFullYear();
  const monthIndex = monthCursor.getUTCMonth();
  const calendarWeeks = usePlannerCalendarMonth(year, monthIndex);
  const activeDate = selectedDate ?? formatDateKey(monthCursor);
  const dayEntries = usePlannerEntriesForDate(activeDate);
  const searchResults = usePlannerSearch(searchQuery);

  const wardrobeLookup = useMemo(() => {
    const map: Record<string, (typeof closetState.items)[number] | undefined> = {};
    closetState.items.forEach(item => {
      map[item.id] = item;
    });
    return map;
  }, [closetState.items]);

  const thumbnailLookup = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    closetState.items.forEach(item => {
      map[item.id] = item.thumbnailUri ?? item.imageUri;
    });
    return map;
  }, [closetState.items]);

  const handleMonthChange = (offset: number) => {
    const next = new Date(Date.UTC(year, monthIndex + offset, 1));
    setMonthCursor(next);
    setSelectedDate(formatDateKey(next));
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setDaySheetVisible(true);
  };

  const handleOpenComposer = (entry?: PlannerEntry) => {
    setEditingEntry(entry ?? null);
    setComposerVisible(true);
  };

  const handleSaveEntry = async (payload: {
    wardrobeItemIds: string[];
    note: string;
    context?: PlannerContext;
    lookKind: 'outfit' | 'single';
    coverImageUri?: string;
  }) => {
    if (!selectedDate) {
      return;
    }
    try {
      setSavingEntry(true);
      if (editingEntry) {
        const updated = updatePlannerEntry(
          editingEntry,
          {
            wardrobeItemIds: payload.wardrobeItemIds,
            note: payload.note,
            labels: payload.context ? { context: payload.context } : undefined,
            coverImageUri: payload.coverImageUri,
            lookKind: payload.lookKind,
          },
          defaultNowUtc,
          () => createRandomId('rev')
        );
        await plannerStore.save(updated);
      } else {
        const orderIndex = getNextOrderIndex(dayEntries);
        const entry = createPlannerEntry(
          {
            id: createRandomId('planner'),
            version: 1,
            calendarDate: selectedDate,
            lookKind: payload.lookKind,
            wardrobeItemIds: payload.wardrobeItemIds,
            note: payload.note,
            labels: payload.context ? { context: payload.context } : undefined,
            coverImageUri: payload.coverImageUri,
            orderIndex,
            syncStatus: 'pending',
          },
          defaultNowUtc,
          () => createRandomId('rev')
        );
        await plannerStore.save(entry);
      }
      setComposerVisible(false);
      setEditingEntry(null);
      setDaySheetVisible(true);
    } catch (error) {
      console.error('Failed to save planner entry', error);
    } finally {
      setSavingEntry(false);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    await plannerStore.remove(entryId);
  };

  const handleReorderEntries = async (orderedIds: string[]) => {
    await plannerStore.reorder(selectedDate, orderedIds);
  };

  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => handleMonthChange(-1)} accessibilityLabel="Previous month">
            <Feather name="chevron-left" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => handleMonthChange(1)} accessibilityLabel="Next month">
            <Feather name="chevron-right" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.helper, styles.sectionSpacing]}>
          Add multiple looks per day, keep notes for events, and reorder them so the first look shows on the calendar.
        </Text>

        {plannerState.loading || closetState.loading ? (
          <ActivityIndicator
            size="small"
            color={colors.accent.primary}
            style={[styles.loader, styles.sectionSpacing]}
          />
        ) : null}

        <View style={styles.sectionSpacing}>
          <CalendarGrid
            weeks={calendarWeeks}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            thumbnailLookup={thumbnailLookup}
          />
        </View>

        <View style={[styles.actionRow, styles.sectionSpacing]}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => handleOpenComposer()}>
            <Feather name="plus" size={20} color={colors.text.inverse} style={styles.primaryButtonIcon} />
            <Text style={styles.primaryButtonText}>Add look</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setDaySheetVisible(true)}
            disabled={!selectedDate}
          >
            <Text style={styles.secondaryButtonText}>View day</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchCard, styles.sectionSpacing]}>
          <Text style={styles.searchTitle}>Notes & search</Text>
          <TextInput
            placeholder="Search past looks by note, context, or color"
            placeholderTextColor={colors.text.tertiary}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.slice(0, 5).map(result => (
                <TouchableOpacity
                  key={result.id}
                  style={styles.searchResultRow}
                  onPress={() => {
                    setSelectedDate(result.calendarDate);
                    setDaySheetVisible(true);
                  }}
                >
                  <View>
                    <Text style={styles.searchResultTitle}>{result.title}</Text>
                    <Text style={styles.searchResultMeta}>
                      {new Date(`${result.calendarDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {result.labels?.context ? ` • ${formatContextLabel(result.labels.context)}` : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              ))}
              {searchResults.length === 0 && (
                <Text style={styles.emptySearch}>No looks matched that search yet.</Text>
              )}
            </View>
          )}
        </View>

        <View style={[styles.summaryCard, styles.sectionSpacing]}>
          <View style={styles.summaryHeaderRow}>
            <Text style={styles.summaryTitle}>Usage highlights</Text>
            <Text style={styles.summaryBadge}>
              {analytics.longestStreak > 0 ? `${analytics.longestStreak} day streak` : 'Start a streak'}
            </Text>
          </View>
          {analytics.mostWornItems[0] ? (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Most worn</Text>
              <Text style={styles.statValue}>
                {analytics.mostWornItems[0].name} · {analytics.mostWornItems[0].count} wears
              </Text>
            </View>
          ) : (
            <Text style={styles.summarySubtitle}>Log outfits to unlock trends and color stories.</Text>
          )}
          {analytics.contextBreakdown.length > 0 && (
            <View style={styles.chipRow}>
              {analytics.contextBreakdown.slice(0, 3).map(item => (
                <View key={item.context} style={styles.chip}>
                  <Text style={styles.chipLabel}>{formatContextLabel(item.context)}</Text>
                  <Text style={styles.chipValue}>{item.count}</Text>
                </View>
              ))}
            </View>
          )}
          {analytics.colorUsage.length > 0 && (
            <View style={styles.chipRow}>
              {analytics.colorUsage.slice(0, 3).map(color => (
                <View key={color.color} style={styles.chipLight}>
                  <Text style={styles.chipLabel}>{capitalize(color.color)}</Text>
                  <Text style={styles.chipValue}>{color.count}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.summaryFootnote}>
            {analytics.totalLoggedDays} active days • {analytics.totalLooks} logged looks
          </Text>
        </View>
      </ScrollView>

      <DayDetailSheet
        visible={daySheetVisible}
        calendarDate={selectedDate}
        entries={dayEntries}
        wardrobeLookup={wardrobeLookup}
        onClose={() => setDaySheetVisible(false)}
        onAddEntry={() => handleOpenComposer()}
        onEditEntry={entry => handleOpenComposer(entry)}
        onRemoveEntry={handleRemoveEntry}
        onReorderEntries={handleReorderEntries}
      />

      <EntryComposer
        visible={composerVisible}
        calendarDate={selectedDate}
        wardrobeItems={closetState.items}
        entry={editingEntry}
        onCancel={() => {
          setComposerVisible(false);
          setEditingEntry(null);
        }}
        onSubmit={handleSaveEntry}
        saving={savingEntry}
      />
    </View>
  );
}

function startOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getNextOrderIndex(entries: PlannerEntry[]) {
  if (!entries.length) {
    return 0;
  }
  return Math.max(...entries.map(entry => entry.orderIndex)) + 1;
}

function formatContextLabel(context: string) {
  if (context === 'goingOut') {
    return 'Going out';
  }
  return context.charAt(0).toUpperCase() + context.slice(1);
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  sectionSpacing: {
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  helper: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.normal * typography.fontSize.sm,
  },
  loader: {
    alignSelf: 'flex-start',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginRight: spacing.md,
  },
  primaryButtonIcon: {
    marginRight: spacing.xs,
  },
  primaryButtonText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  secondaryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
  },
  searchCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  searchTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
  },
  searchResults: {
    marginTop: spacing.md,
  },
  searchResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchResultTitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
  },
  searchResultMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  emptySearch: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  summaryBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    backgroundColor: colors.offWhite,
    color: colors.accent.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  summarySubtitle: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  summaryFootnote: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  statRow: {
    marginTop: spacing.sm,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    backgroundColor: colors.offWhite,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipLight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    backgroundColor: colors.background,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginRight: spacing.xs,
  },
  chipValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
});

