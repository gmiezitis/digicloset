import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';
import { useClosetState } from '@/services/closetStore';
import type { WardrobeItem, ItemCategory } from '@/types/item';
import { ITEM_CATEGORIES } from '@/types/item';
import { ClothingImage3D } from '@/components/ClothingImage3D';
import { useNavigation } from '@react-navigation/native';

type OutfitSlot = 'top' | 'bottom' | 'shoes' | 'accessory';

interface OutfitState {
  top: WardrobeItem | null;
  bottom: WardrobeItem | null;
  shoes: WardrobeItem | null;
  accessory: WardrobeItem | null;
}

const SLOT_CONFIG: Record<OutfitSlot, { label: string; categories: ItemCategory[] }> = {
  top: { label: 'Top', categories: ['tops', 'outerwear'] },
  bottom: { label: 'Bottom', categories: ['bottoms', 'dresses'] },
  shoes: { label: 'Shoes', categories: ['shoes'] },
  accessory: { label: 'Accessory', categories: ['accessories'] },
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  tops: '👕 Tops',
  bottoms: '👖 Bottoms',
  dresses: '👗 Dresses',
  outerwear: '🧥 Outerwear',
  shoes: '👟 Shoes',
  accessories: '🎒 Accessories',
};

export function OutfitBuilderScreen() {
  const { items } = useClosetState();
  const navigation = useNavigation<any>();
  const [outfit, setOutfit] = useState<OutfitState>({
    top: null,
    bottom: null,
    shoes: null,
    accessory: null,
  });
  const [activeSlot, setActiveSlot] = useState<OutfitSlot | null>(null);
  const [savedOutfits, setSavedOutfits] = useState<OutfitState[]>([]);

  // Filter items that are synced
  const availableItems = useMemo(
    () => items.filter(item => item.syncStatus === 'synced'),
    [items]
  );

  // Get items for the active slot
  const slotItems = useMemo(() => {
    if (!activeSlot) return [];
    const categories = SLOT_CONFIG[activeSlot].categories;
    return availableItems.filter(item => categories.includes(item.category));
  }, [activeSlot, availableItems]);

  const handleSlotPress = useCallback((slot: OutfitSlot) => {
    setActiveSlot(prev => (prev === slot ? null : slot));
  }, []);

  const handleItemSelect = useCallback((item: WardrobeItem) => {
    if (!activeSlot) return;
    setOutfit(prev => ({ ...prev, [activeSlot]: item }));
    setActiveSlot(null);
  }, [activeSlot]);

  const handleClearSlot = useCallback((slot: OutfitSlot) => {
    setOutfit(prev => ({ ...prev, [slot]: null }));
  }, []);

  const handleSaveOutfit = useCallback(() => {
    const filledSlots = Object.values(outfit).filter(Boolean);
    if (filledSlots.length < 2) {
      Alert.alert('Add More Items', 'Select at least 2 items to save an outfit.');
      return;
    }
    setSavedOutfits(prev => [...prev, outfit]);
    setOutfit({ top: null, bottom: null, shoes: null, accessory: null });
    Alert.alert('Outfit Saved! 🎉', 'Your outfit has been saved successfully.');
  }, [outfit]);

  const handleClearAll = useCallback(() => {
    setOutfit({ top: null, bottom: null, shoes: null, accessory: null });
  }, []);

  const filledSlotCount = Object.values(outfit).filter(Boolean).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Outfit Builder</Text>
      <Text style={styles.subtitle}>
        Mix and match items from your closet to create perfect outfits
      </Text>

      {/* Outfit Canvas */}
      <View style={styles.outfitCanvas}>
        <Text style={styles.sectionTitle}>Current Outfit</Text>
        <View style={styles.slotsGrid}>
          {(Object.keys(SLOT_CONFIG) as OutfitSlot[]).map(slot => (
            <Pressable
              key={slot}
              style={[
                styles.slotCard,
                activeSlot === slot && styles.slotCardActive,
                outfit[slot] && styles.slotCardFilled,
              ]}
              onPress={() => handleSlotPress(slot)}
              onLongPress={() => handleClearSlot(slot)}
            >
              {outfit[slot] ? (
                <View style={styles.slotContent}>
                  <ClothingImage3D
                    uri={outfit[slot]!.thumbnailUri || outfit[slot]!.imageUri}
                    style={styles.slotImage}
                    shadowIntensity="light"
                  />
                  <Text style={styles.slotItemName} numberOfLines={1}>
                    {outfit[slot]!.name}
                  </Text>
                </View>
              ) : (
                <View style={styles.slotPlaceholder}>
                  <Text style={styles.slotPlaceholderIcon}>+</Text>
                  <Text style={styles.slotLabel}>{SLOT_CONFIG[slot].label}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.outfitButton, styles.clearButton]}
            onPress={handleClearAll}
            disabled={filledSlotCount === 0}
          >
            <Text style={styles.clearButtonText}>Clear All</Text>
          </Pressable>
          <Pressable
            style={[styles.outfitButton, styles.tryOnButton]}
            onPress={() => {
              const firstItem = outfit.top || outfit.bottom || outfit.shoes || outfit.accessory;
              if (!firstItem) {
                Alert.alert('Select an Item', 'Add at least one item to try on.');
                return;
              }
              navigation.navigate('TryOn', {
                garmentUri: firstItem.imageUri,
                garmentName: firstItem.name,
                category: firstItem.category,
              });
            }}
            disabled={filledSlotCount === 0}
          >
            <Text style={styles.tryOnButtonText}>✨ Try On</Text>
          </Pressable>
          <Pressable
            style={[styles.outfitButton, styles.saveButton]}
            onPress={handleSaveOutfit}
            disabled={filledSlotCount < 2}
          >
            <Text style={styles.saveButtonText}>Save Outfit</Text>
          </Pressable>
        </View>
      </View>

      {/* Item Picker */}
      {activeSlot && (
        <View style={styles.pickerSection}>
          <Text style={styles.sectionTitle}>
            Select {SLOT_CONFIG[activeSlot].label}
          </Text>
          {slotItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No items found for this category. Add some items to your closet first!
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pickerScroll}
            >
              {slotItems.map(item => (
                <Pressable
                  key={item.id}
                  style={styles.pickerItem}
                  onPress={() => handleItemSelect(item)}
                >
                  <ClothingImage3D
                    uri={item.thumbnailUri || item.imageUri}
                    style={styles.pickerImage}
                    shadowIntensity="medium"
                  />
                  <Text style={styles.pickerItemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Saved Outfits */}
      {savedOutfits.length > 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.sectionTitle}>Saved Outfits ({savedOutfits.length})</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.savedScroll}
          >
            {savedOutfits.map((savedOutfit, index) => (
              <View key={index} style={styles.savedOutfitCard}>
                <Text style={styles.savedOutfitLabel}>Outfit {index + 1}</Text>
                <View style={styles.savedOutfitGrid}>
                  {(Object.entries(savedOutfit) as [OutfitSlot, WardrobeItem | null][])
                    .filter(([_, item]) => item !== null)
                    .map(([slot, item]) => (
                      <View key={slot} style={styles.savedOutfitItem}>
                        <Image
                          source={{ uri: item!.thumbnailUri || item!.imageUri }}
                          style={styles.savedOutfitImage}
                          resizeMode="cover"
                        />
                      </View>
                    ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tips */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>💡 Tips</Text>
        <Text style={styles.tipsText}>
          • Tap a slot to select an item{'\n'}
          • Long press to clear a slot{'\n'}
          • Save at least 2 items to create an outfit
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  outfitCanvas: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  slotCard: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  slotCardActive: {
    borderColor: colors.accent.primary,
    borderStyle: 'solid',
  },
  slotCardFilled: {
    borderStyle: 'solid',
    borderColor: colors.accent.secondary,
  },
  slotPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPlaceholderIcon: {
    fontSize: 32,
    color: colors.text.tertiary,
  },
  slotLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  slotContent: {
    flex: 1,
    padding: spacing.xs,
  },
  slotImage: {
    width: '100%',
    height: '80%',
  },
  slotItemName: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  outfitButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearButtonText: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  tryOnButton: {
    backgroundColor: colors.accent.secondary,
  },
  tryOnButtonText: {
    fontSize: typography.fontSize.md,
    color: colors.text.inverse,
    fontWeight: typography.fontWeight.semibold,
  },
  saveButton: {
    backgroundColor: colors.accent.primary,
  },
  saveButtonText: {
    fontSize: typography.fontSize.md,
    color: colors.text.inverse,
    fontWeight: typography.fontWeight.semibold,
  },
  pickerSection: {
    marginBottom: spacing.xl,
  },
  emptyState: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  pickerScroll: {
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  pickerItem: {
    width: 120,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerImage: {
    width: '100%',
    height: 100,
  },
  pickerItemName: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  savedSection: {
    marginBottom: spacing.xl,
  },
  savedScroll: {
    paddingVertical: spacing.sm,
  },
  savedOutfitCard: {
    width: 160,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savedOutfitLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  savedOutfitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  savedOutfitItem: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  savedOutfitImage: {
    width: '100%',
    height: '100%',
  },
  tipsSection: {
    backgroundColor: colors.accent.primary + '15',
    padding: spacing.lg,
    borderRadius: borderRadius.md,
  },
  tipsTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  tipsText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 22,
  },
});
