import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';
import {
    analyzeClothingImage,
    type ColorMatch,
    type MaterialMatch,
    type StyleTag,
    type ImageAnalysisResult,
    getColorPalette,
    getMaterialsList,
} from '@/services/imageAnalysisService';

interface ImageAnalysisPanelProps {
    imageUri: string;
    category?: string;
    onComplete: (result: {
        selectedColors: ColorMatch[];
        selectedMaterials: string[];
        selectedTags: string[];
    }) => void;
    onSkip?: () => void;
}

export function ImageAnalysisPanel({
    imageUri,
    category,
    onComplete,
    onSkip,
}: ImageAnalysisPanelProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(true);
    const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null);
    const [selectedColors, setSelectedColors] = useState<ColorMatch[]>([]);
    const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showMaterialPicker, setShowMaterialPicker] = useState(false);

    useEffect(() => {
        async function analyze() {
            setIsAnalyzing(true);
            try {
                const result = await analyzeClothingImage(imageUri, { category });
                setAnalysisResult(result);

                // Pre-select top suggestions
                setSelectedColors(result.colors.slice(0, 2));
                setSelectedMaterials(result.materials.slice(0, 1).map(m => m.name));
                setSelectedTags(result.tags.filter(t => t.confidence > 0.5).map(t => t.name));
            } finally {
                setIsAnalyzing(false);
            }
        }
        analyze();
    }, [imageUri, category]);

    const handleColorToggle = useCallback((color: ColorMatch) => {
        setSelectedColors(prev => {
            const exists = prev.some(c => c.hex === color.hex);
            if (exists) {
                return prev.filter(c => c.hex !== color.hex);
            }
            return [...prev, color];
        });
    }, []);

    const handleMaterialToggle = useCallback((material: string) => {
        setSelectedMaterials(prev => {
            if (prev.includes(material)) {
                return prev.filter(m => m !== material);
            }
            return [...prev, material];
        });
    }, []);

    const handleTagToggle = useCallback((tag: string) => {
        setSelectedTags(prev => {
            if (prev.includes(tag)) {
                return prev.filter(t => t !== tag);
            }
            return [...prev, tag];
        });
    }, []);

    const handleConfirm = useCallback(() => {
        onComplete({
            selectedColors,
            selectedMaterials,
            selectedTags,
        });
    }, [selectedColors, selectedMaterials, selectedTags, onComplete]);

    if (isAnalyzing) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent.primary} />
                    <Text style={styles.loadingText}>Analyzing image...</Text>
                    <Text style={styles.loadingSubtext}>Detecting colors, materials, and style</Text>
                </View>
            </View>
        );
    }

    const allColors = getColorPalette();
    const allMaterials = getMaterialsList();

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Image Analysis</Text>
            <Text style={styles.subtitle}>
                We detected the following properties. Tap to adjust or add more.
            </Text>

            {/* Colors Section */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Colors</Text>
                    <Pressable onPress={() => setShowColorPicker(!showColorPicker)}>
                        <Text style={styles.moreLink}>
                            {showColorPicker ? 'Show less' : 'More colors'}
                        </Text>
                    </Pressable>
                </View>

                <Text style={styles.sectionHint}>
                    Select the colors that best match your item
                </Text>

                {/* Suggested colors */}
                <View style={styles.chipRow}>
                    {(analysisResult?.colors || []).map((color, index) => {
                        const isSelected = selectedColors.some(c => c.hex === color.hex);
                        return (
                            <Pressable
                                key={`${color.hex}-${index}`}
                                style={[styles.colorChip, isSelected && styles.colorChipSelected]}
                                onPress={() => handleColorToggle(color)}
                            >
                                <View
                                    style={[
                                        styles.colorSwatch,
                                        { backgroundColor: color.hex },
                                        color.hex === '#FFFFFF' && styles.colorSwatchBorder,
                                    ]}
                                />
                                <Text style={[styles.colorChipText, isSelected && styles.chipTextSelected]}>
                                    {color.name}
                                </Text>
                                <Text style={styles.confidenceText}>
                                    {Math.round(color.confidence * 100)}%
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* Full color palette */}
                {showColorPicker && (
                    <View style={styles.fullPalette}>
                        {allColors.map((color) => {
                            const isSelected = selectedColors.some(c => c.hex === color.hex);
                            return (
                                <Pressable
                                    key={color.hex}
                                    style={[styles.paletteColor, isSelected && styles.paletteColorSelected]}
                                    onPress={() => handleColorToggle({ ...color, confidence: 1 })}
                                >
                                    <View
                                        style={[
                                            styles.paletteColorSwatch,
                                            { backgroundColor: color.hex },
                                            color.hex === '#FFFFFF' && styles.colorSwatchBorder,
                                        ]}
                                    />
                                    <Text style={styles.paletteColorName} numberOfLines={1}>
                                        {color.name}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                )}
            </View>

            {/* Materials Section */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Material</Text>
                    <Pressable onPress={() => setShowMaterialPicker(!showMaterialPicker)}>
                        <Text style={styles.moreLink}>
                            {showMaterialPicker ? 'Show less' : 'More materials'}
                        </Text>
                    </Pressable>
                </View>

                <Text style={styles.sectionHint}>
                    What fabric is this item made of?
                </Text>

                {/* Suggested materials */}
                <View style={styles.chipRow}>
                    {(analysisResult?.materials || []).map((material) => {
                        const isSelected = selectedMaterials.includes(material.name);
                        return (
                            <Pressable
                                key={material.name}
                                style={[styles.chip, isSelected && styles.chipSelected]}
                                onPress={() => handleMaterialToggle(material.name)}
                            >
                                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                    {material.name}
                                </Text>
                                <Text style={styles.confidenceText}>
                                    {Math.round(material.confidence * 100)}%
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* All materials */}
                {showMaterialPicker && (
                    <View style={styles.chipRow}>
                        {allMaterials
                            .filter(m => !analysisResult?.materials.some(am => am.name === m))
                            .map((material) => {
                                const isSelected = selectedMaterials.includes(material);
                                return (
                                    <Pressable
                                        key={material}
                                        style={[styles.chip, isSelected && styles.chipSelected]}
                                        onPress={() => handleMaterialToggle(material)}
                                    >
                                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                            {material}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                    </View>
                )}
            </View>

            {/* Tags Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Style Tags</Text>
                <Text style={styles.sectionHint}>
                    Add tags to help organize and discover this item
                </Text>

                <View style={styles.chipRow}>
                    {(analysisResult?.tags || []).map((tag) => {
                        const isSelected = selectedTags.includes(tag.name);
                        return (
                            <Pressable
                                key={tag.name}
                                style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                                onPress={() => handleTagToggle(tag.name)}
                            >
                                <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>
                                    {tag.name}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            {/* Summary */}
            <View style={styles.summarySection}>
                <Text style={styles.summaryTitle}>Selected Properties</Text>
                <Text style={styles.summaryText}>
                    Colors: {selectedColors.map(c => c.name).join(', ') || 'None'}
                </Text>
                <Text style={styles.summaryText}>
                    Materials: {selectedMaterials.join(', ') || 'None'}
                </Text>
                <Text style={styles.summaryText}>
                    Tags: {selectedTags.join(', ') || 'None'}
                </Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
                {onSkip && (
                    <Pressable style={styles.skipButton} onPress={onSkip}>
                        <Text style={styles.skipButtonText}>Skip</Text>
                    </Pressable>
                )}
                <Pressable style={styles.confirmButton} onPress={handleConfirm}>
                    <Text style={styles.confirmButtonText}>Confirm Selection</Text>
                </Pressable>
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
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    loadingText: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
        marginTop: spacing.lg,
    },
    loadingSubtext: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
        marginTop: spacing.xs,
    },
    title: {
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.primary,
        marginBottom: spacing.xs,
    },
    subtitle: {
        fontSize: typography.fontSize.md,
        color: colors.text.secondary,
        marginBottom: spacing.xl,
    },
    section: {
        marginBottom: spacing.xl,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    sectionTitle: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
    },
    sectionHint: {
        fontSize: typography.fontSize.sm,
        color: colors.text.tertiary,
        marginBottom: spacing.md,
    },
    moreLink: {
        fontSize: typography.fontSize.sm,
        color: colors.accent.primary,
        fontWeight: typography.fontWeight.medium,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    colorChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 2,
        borderColor: colors.border,
        gap: spacing.sm,
    },
    colorChipSelected: {
        borderColor: colors.accent.primary,
        backgroundColor: colors.accent.primary + '15',
    },
    colorSwatch: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    colorSwatchBorder: {
        borderWidth: 1,
        borderColor: colors.border,
    },
    colorChipText: {
        fontSize: typography.fontSize.sm,
        color: colors.text.primary,
    },
    confidenceText: {
        fontSize: typography.fontSize.xs,
        color: colors.text.tertiary,
    },
    fullPalette: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
        marginTop: spacing.md,
        padding: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
    },
    paletteColor: {
        alignItems: 'center',
        width: 60,
        padding: spacing.xs,
        borderRadius: borderRadius.sm,
    },
    paletteColorSelected: {
        backgroundColor: colors.accent.primary + '20',
    },
    paletteColorSwatch: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginBottom: spacing.xs,
    },
    paletteColorName: {
        fontSize: 10,
        color: colors.text.secondary,
        textAlign: 'center',
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 2,
        borderColor: colors.border,
        gap: spacing.xs,
    },
    chipSelected: {
        borderColor: colors.accent.primary,
        backgroundColor: colors.accent.primary + '15',
    },
    chipText: {
        fontSize: typography.fontSize.sm,
        color: colors.text.primary,
    },
    chipTextSelected: {
        color: colors.accent.primary,
        fontWeight: typography.fontWeight.medium,
    },
    tagChip: {
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tagChipSelected: {
        borderColor: colors.accent.secondary,
        backgroundColor: colors.accent.secondary + '20',
    },
    tagChipText: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
    tagChipTextSelected: {
        color: colors.accent.secondary,
        fontWeight: typography.fontWeight.medium,
    },
    summarySection: {
        backgroundColor: colors.surface,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        marginBottom: spacing.xl,
        borderWidth: 1,
        borderColor: colors.border,
    },
    summaryTitle: {
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
        marginBottom: spacing.sm,
    },
    summaryText: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
        marginBottom: spacing.xs,
    },
    actions: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    skipButton: {
        flex: 1,
        paddingVertical: spacing.md,
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    skipButtonText: {
        fontSize: typography.fontSize.md,
        color: colors.text.secondary,
        fontWeight: typography.fontWeight.medium,
    },
    confirmButton: {
        flex: 2,
        paddingVertical: spacing.md,
        alignItems: 'center',
        backgroundColor: colors.accent.primary,
        borderRadius: borderRadius.md,
    },
    confirmButtonText: {
        fontSize: typography.fontSize.md,
        color: colors.text.inverse,
        fontWeight: typography.fontWeight.semibold,
    },
});
