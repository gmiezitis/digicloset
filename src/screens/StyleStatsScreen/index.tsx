import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useClosetState } from '@/services/closetStore';
import { usePlannerState } from '@/services/plannerStore';
import { styleProfileStore, useStyleProfileState } from '@/services/styleProfileStore';
import type { StyleProfile } from '@/types/styleProfile';
import { defaultNowUtc } from '@/services/storage';
import {
  STALEDAYS,
  buildStyleInsights,
  formatCurrency,
  formatDate,
  StyleInsights,
} from './insights';
import { styles } from './styles';
import { StatCard, ListRow, UsageRow } from './components';
import { BodyMeasurementsSection } from './BodyMeasurementsSection';
import { SizesSection } from './SizesSection';
import { BrandExceptionsSection } from './BrandExceptionsSection';

export function StyleStatsScreen() {
  const closetState = useClosetState();
  const plannerState = usePlannerState();
  const profileState = useStyleProfileState();
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

  useEffect(() => {
    styleProfileStore.initialize().catch(error => {
      console.error('[style-stats] profile-init-failed', error);
    });
  }, []);

  const insights = useMemo<StyleInsights>(
    () =>
      buildStyleInsights({
        items: closetState.items,
        entries: plannerState.entries ?? [],
        nowUtc: defaultNowUtc(),
      }),
    [closetState.items, plannerState.entries]
  );

  useEffect(() => {
    if (insights.colorBreakdown.length > 0) {
      setSelectedColorId(insights.colorBreakdown[0].id);
    } else {
      setSelectedColorId(null);
    }
  }, [insights.colorBreakdown]);

  const selectedColor = insights.colorBreakdown.find(color => color.id === selectedColorId) ?? null;
  const profile = profileState.profile ?? createEmptyProfileSnapshot();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} testID="style-stats-scroll">
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Style Stats</Text>
          <Text style={styles.heroSubtitle}>
            Get the most out of your wardrobe by gaining insight into how you use your clothes.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Closet pulse</Text>
          <View style={styles.statRow}>
            <StatCard label="Closet count" value={`${insights.closetCount}`} helper="Items saved locally" />
            <StatCard
              label="Outfit count"
              value={`${insights.outfitCount}`}
              helper="Looks logged on calendar"
            />
            <StatCard
              label="Avg items/look"
              value={insights.averageItemsPerLook.toFixed(1)}
              helper="Useful when you pack"
            />
          </View>
          <View style={styles.valueList}>
            {insights.closetValue.length === 0 ? (
              <Text style={styles.helperText}>
                Add prices to clothing notes to unlock closet value insights.
              </Text>
            ) : (
              insights.closetValue.map(total => (
                <Text key={total.currency} style={styles.valueRow}>
                  {formatCurrency(total.amountCents, total.currency)} total ({total.currency})
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Color counts</Text>
            <Text style={styles.sectionSubtitle}>Tap a color block to drill into shades.</Text>
          </View>
          {insights.colorBreakdown.length === 0 ? (
            <Text style={styles.helperText}>
              Add colors to your wardrobe items to visualise your palette.
            </Text>
          ) : (
            <>
              <View style={styles.colorBar} testID="color-bar">
                {insights.colorBreakdown.map(color => (
                  <TouchableOpacity
                    key={color.id}
                    style={[
                      styles.colorSegment,
                      {
                        flex: color.count,
                        backgroundColor: color.sampleHex,
                        opacity: selectedColorId === color.id ? 1 : 0.6,
                      },
                    ]}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedColorId(color.id);
                      logStatsEvent('color-selected', { color: color.label });
                    }}
                  />
                ))}
              </View>
              {selectedColor ? (
                <View style={styles.selectedColorCard}>
                  <Text style={styles.selectedColorTitle}>
                    {selectedColor.label} · {selectedColor.count} items
                  </Text>
                  <View style={styles.shadeRow}>
                    {selectedColor.hexes.map(hex => (
                      <View key={hex} style={[styles.shadeSwatch, { backgroundColor: hex }]} />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Under-used gems</Text>
          <Text style={styles.sectionSubtitle}>
            Surface pieces that need some love or a calendar reminder.
          </Text>
          {insights.unusedItems.length === 0 ? (
            <Text style={styles.helperText}>Every saved item has been part of an outfit.</Text>
          ) : (
            <>
              {insights.unusedItems.map(item => (
                <ListRow key={item.id} title={item.name} subtitle="Never logged" />
              ))}
              <Text style={styles.sectionFootnote}>
                Showing {insights.unusedItems.length} of {insights.unusedItemCount} items without an outfit.
              </Text>
            </>
          )}
          <View style={styles.divider} />
          <Text style={styles.sectionSubtitle}>Not recorded on calendar (last {STALEDAYS} days)</Text>
          {insights.staleItems.length === 0 ? (
            <Text style={styles.helperText}>All items have recent activity logged.</Text>
          ) : (
            <>
              {insights.staleItems.map(item => (
                <ListRow key={item.id} title={item.name} subtitle="Waiting for a rewear" />
              ))}
              <Text style={styles.sectionFootnote}>
                Showing {insights.staleItems.length} of {insights.staleItemCount} items awaiting a calendar entry.
              </Text>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Most & least worn</Text>
          {insights.mostWorn.length === 0 ? (
            <Text style={styles.helperText}>Log outfits to unlock wear history.</Text>
          ) : (
            <View style={styles.wornGrid}>
              <View style={styles.wornColumn}>
                <Text style={styles.columnTitle}>Top 10 most worn</Text>
                {insights.mostWorn.map(entry => (
                  <UsageRow key={entry.itemId} entry={entry} />
                ))}
              </View>
              <View style={styles.wornColumn}>
                <Text style={styles.columnTitle}>Top 10 least worn</Text>
                {insights.leastWorn.map(entry => (
                  <UsageRow key={entry.itemId} entry={entry} />
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Most recently added</Text>
          {insights.recentItems.length === 0 ? (
            <Text style={styles.helperText}>Add wardrobe items to see them here.</Text>
          ) : (
            insights.recentItems.map(item => (
              <ListRow
                key={item.id}
                title={item.name}
                subtitle={`Added ${formatDate(item.createdAtUtc)}`}
              />
            ))
          )}
        </View>

        <BodyMeasurementsSection
          measurements={profile.measurements}
          loading={profileState.loading}
          onFeedback={setFormFeedback}
        />

        <SizesSection
          sizePreferences={profile.sizePreferences}
          onFeedback={setFormFeedback}
          disabled={profileState.loading}
        />

        <BrandExceptionsSection
          brandSizeExceptions={profile.brandSizeExceptions}
          onFeedback={setFormFeedback}
          disabled={profileState.loading}
        />

        {formFeedback ? <Text style={styles.feedbackText}>{formFeedback}</Text> : null}
      </ScrollView>
    </View>
  );
}

function createEmptyProfileSnapshot(): Pick<
  StyleProfile,
  'measurements' | 'sizePreferences' | 'brandSizeExceptions'
> {
  return {
    measurements: [],
    sizePreferences: [],
    brandSizeExceptions: [],
  };
}

function logStatsEvent(event: string, metadata?: Record<string, unknown>) {
  console.log('[style-stats-screen]', event, { timestampUtc: defaultNowUtc(), ...(metadata ?? {}) });
}




