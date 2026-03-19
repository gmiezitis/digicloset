import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '@theme';
import { useClosetState, closetStore } from '@/services/closetStore';
import { usePlannerState, plannerStore } from '@/services/plannerStore';
import type { WardrobeItem } from '@/types/item';
import type { PlannerEntry } from '@/types/planner';
import { defaultNowUtc } from '@/services/storage';

const LOG_TAG = '[home-screen]';

const WARDROBE_PROFILES = [
  { id: 'self', label: 'You', description: 'Personal closet' },
  { id: 'child', label: 'Child', description: 'Mini stylist' },
  { id: 'animal', label: 'Animal', description: 'Pet wardrobe' },
] as const;

type WardrobeProfileId = (typeof WARDROBE_PROFILES)[number]['id'];

const PROFILE_TAGS: Record<WardrobeProfileId, string> = {
  self: 'wardrobe:self',
  child: 'wardrobe:child',
  animal: 'wardrobe:animal',
};

const SUGGESTION_LIMIT = 3;
const ITEMS_PER_SUGGESTION = 3;

type LookSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  items: WardrobeItem[];
  accent: string;
};

export function HomeScreen() {
  const closetState = useClosetState();
  const plannerState = usePlannerState();
  const [selectedProfile, setSelectedProfile] = useState<WardrobeProfileId>('self');
  const [nowUtc] = useState(() => defaultNowUtc());
  const [shuffleToken, setShuffleToken] = useState(() => defaultNowUtc());

  useEffect(() => {
    closetStore.initialize().catch(error => {
      logHomeEvent('closet-init-error', { error });
    });
    plannerStore.initialize().catch(error => {
      logHomeEvent('planner-init-error', { error });
    });
  }, []);

  const greeting = useMemo(() => buildGreeting(nowUtc), [nowUtc]);
  const profileMeta = useMemo(
    () => WARDROBE_PROFILES.find(profile => profile.id === selectedProfile),
    [selectedProfile]
  );

  const suggestions = useMemo(
    () =>
      buildLookSuggestions({
        items: closetState.items,
        profile: selectedProfile,
        seed: shuffleToken,
      }),
    [closetState.items, selectedProfile, shuffleToken]
  );

  const stats = useMemo(
    () => buildHomeStats(plannerState.entries ?? []),
    [plannerState.entries]
  );

  const pendingDrafts = useMemo(
    () => closetState.drafts.filter(draft => draft.syncStatus !== 'synced').length,
    [closetState.drafts]
  );

  const handleSelectProfile = useCallback(
    (profile: WardrobeProfileId) => {
      if (profile === selectedProfile) {
        return;
      }
      setSelectedProfile(profile);
      logHomeEvent('profile-selected', { profile });
    },
    [selectedProfile]
  );

  const handleShuffle = useCallback(() => {
    const token = defaultNowUtc();
    setShuffleToken(token);
    logHomeEvent('suggestions-shuffled', { profile: selectedProfile, token });
  }, [selectedProfile]);

  const lastSyncLabel = formatRelativeUtc(closetState.lastSyncSnapshot?.timestampUtc);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} testID="home-scroll-view">
        <View style={styles.heroCard}>
          <Text testID="greeting-title" style={styles.heroGreeting}>
            {greeting.title}
          </Text>
          <Text style={styles.heroSubtitle}>{greeting.subtitle}</Text>
          <Text style={styles.heroMeta}>
            {profileMeta ? `Curating looks for ${profileMeta.label}` : 'Curating fresh looks'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wardrobe focus</Text>
          <Text style={styles.sectionSubtitle}>
            Choose whose closet to prioritise—perfect for kids or four-legged icons.
          </Text>
          <View style={styles.profileRow} testID="wardrobe-picker">
            {WARDROBE_PROFILES.map(profile => {
              const isSelected = profile.id === selectedProfile;
              return (
                <TouchableOpacity
                  key={profile.id}
                  onPress={() => handleSelectProfile(profile.id)}
                  style={[styles.profilePill, isSelected && styles.profilePillSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  testID={`wardrobe-picker-button-${profile.id}`}
                >
                  <Text
                    style={[styles.profileLabel, isSelected && styles.profileLabelSelected]}
                  >
                    {profile.label}
                  </Text>
                  <Text
                    style={[
                      styles.profileDescription,
                      isSelected && styles.profileDescriptionSelected,
                    ]}
                  >
                    {profile.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Suggested looks</Text>
            <TouchableOpacity style={styles.shuffleButton} onPress={handleShuffle} testID="shuffle-button">
              <Text style={styles.shuffleButtonText}>Shuffle looks</Text>
            </TouchableOpacity>
          </View>
          <Text testID="shuffle-timestamp" style={styles.sectionFootnote}>
            Refreshed at {formatLocalTime(shuffleToken)}
          </Text>

          {closetState.loading ? (
            <Text style={styles.helperText}>Pulling outfits from your local cache…</Text>
          ) : null}

          {suggestions.length === 0 ? (
            <Text style={styles.emptyState}>
              Add a few wardrobe items to unlock instant outfit shuffles for each wardrobe.
            </Text>
          ) : (
            suggestions.map(suggestion => (
              <View key={suggestion.id} style={styles.suggestionCard} testID="suggestion-card">
                <View style={styles.suggestionHeader}>
                  <View style={[styles.accentDot, { backgroundColor: suggestion.accent }]} />
                  <View>
                    <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                    <Text style={styles.suggestionSubtitle}>{suggestion.subtitle}</Text>
                  </View>
                </View>
                <View style={styles.suggestionItems}>
                  {suggestion.items.map(item => (
                    <View key={item.id} style={styles.suggestionItem}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemCategory}>{formatCategory(item.category)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress snapshot</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Looks logged</Text>
              <Text style={styles.statValue}>{stats.totalLooks}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Active days</Text>
              <Text style={styles.statValue}>{stats.activeDays}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Items ready</Text>
              <Text style={styles.statValue}>{closetState.items.length}</Text>
            </View>
          </View>
          <Text style={styles.sectionSubtitle}>
            {stats.latestEntryTitle
              ? `Latest logged look: “${stats.latestEntryTitle}”`
              : 'Log a look to start your style streak.'}
          </Text>
          <Text style={styles.sectionFootnote}>
            {pendingDrafts > 0
              ? `${pendingDrafts} offline captures waiting for sync • Last sync ${lastSyncLabel}`
              : `All captures synced • Last sync ${lastSyncLabel}`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function buildGreeting(nowUtc: string) {
  const date = new Date(nowUtc);
  const hourLocal = date.getHours(); // convert to local only for UI copy
  let title = 'Hello';
  if (hourLocal < 12) {
    title = 'Good morning';
  } else if (hourLocal < 18) {
    title = 'Good afternoon';
  } else {
    title = 'Good evening';
  }
  const subtitle = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return {
    title,
    subtitle: `It is ${subtitle}—perfect for a quick style shuffle.`,
  };
}

function buildLookSuggestions(input: {
  items: WardrobeItem[];
  profile: WardrobeProfileId;
  seed: string;
}): LookSuggestion[] {
  if (input.items.length === 0) {
    return [];
  }

  const filtered = filterItemsForProfile(input.items, input.profile);
  const shuffled = shuffleWithSeed(filtered, input.seed);
  const suggestions: LookSuggestion[] = [];

  for (let index = 0; index < SUGGESTION_LIMIT; index++) {
    const start = index * ITEMS_PER_SUGGESTION;
    const block = shuffled.slice(start, start + ITEMS_PER_SUGGESTION);
    if (block.length === 0) {
      break;
    }
    suggestions.push({
      id: `${input.profile}-${input.seed}-${index}`,
      title: `Look ${index + 1}`,
      subtitle: buildLookSubtitle(block),
      items: block,
      accent: block[0]?.colors?.[0]?.hex ?? colors.accent.primary,
    });
  }

  return suggestions;
}

function buildHomeStats(entries: PlannerEntry[]) {
  const totalLooks = entries.length;
  const daySet = new Set(entries.map(entry => entry.calendarDate));
  const latest = [...entries].sort(
    (a, b) => Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc)
  )[0];
  return {
    totalLooks,
    activeDays: daySet.size,
    latestEntryTitle: latest?.title ?? null,
  };
}

function buildLookSubtitle(items: WardrobeItem[]) {
  if (items.length === 0) {
    return 'Add more wardrobe pieces to generate combos.';
  }
  const categories = Array.from(new Set(items.map(item => formatCategory(item.category))));
  return categories.join(' • ');
}

function filterItemsForProfile(items: WardrobeItem[], profile: WardrobeProfileId) {
  const tag = PROFILE_TAGS[profile];
  const matching = items.filter(item => item.tags?.includes(tag));
  return matching.length > 0 ? matching : items;
}

function formatCategory(category: string) {
  if (!category) {
    return 'Item';
  }
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatLocalTime(utcIso?: string | null) {
  if (!utcIso) {
    return 'now';
  }
  const date = new Date(utcIso);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeUtc(utcIso?: string | null) {
  if (!utcIso) {
    return 'waiting to sync';
  }
  const date = new Date(utcIso);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const deltaMs = date.getTime() - Date.now();
  const deltaMinutes = Math.round(deltaMs / (60 * 1000));
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, 'minute');
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, 'hour');
  }
  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(deltaDays, 'day');
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const source = [...items];
  let currentIndex = source.length;
  let random = seededRandom(seed);
  while (currentIndex > 0) {
    const randomIndex = Math.floor(random() * currentIndex);
    currentIndex -= 1;
    [source[currentIndex], source[randomIndex]] = [source[randomIndex], source[currentIndex]];
  }
  return source;
}

function seededRandom(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return function () {
    hash = (hash + 0x6d2b79f5) | 0;
    let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function logHomeEvent(event: string, metadata?: Record<string, unknown>) {
  console.log(LOG_TAG, event, { timestampUtc: defaultNowUtc(), ...(metadata ?? {}) });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    ...shadows.md,
    gap: spacing.sm,
  },
  heroGreeting: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  heroSubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
  },
  heroMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  section: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  sectionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  sectionFootnote: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  profileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  profilePill: {
    flexBasis: '30%',
    minWidth: 120,
    flexGrow: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  profilePillSelected: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.offWhite,
  },
  profileLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  profileLabelSelected: {
    color: colors.accent.primary,
  },
  profileDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  profileDescriptionSelected: {
    color: colors.text.primary,
  },
  shuffleButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.round,
    backgroundColor: colors.accent.primary,
  },
  shuffleButtonText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  helperText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  emptyState: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  suggestionCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.round,
  },
  suggestionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  suggestionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  suggestionItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestionItem: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.offWhite,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  itemName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  itemCategory: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: borderRadius.md,
    backgroundColor: colors.offWhite,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
});


