import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    FlatList,
    Pressable,
    Animated,
    ViewToken,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    emoji: string;
    gradient: string[];
}

const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to Tidless',
        description: 'Your personal digital wardrobe. Organize, plan, and discover outfits with ease.',
        emoji: '👗',
        gradient: ['#667eea', '#764ba2'],
    },
    {
        id: 'capture',
        title: 'Capture Your Clothes',
        description: 'Take photos of your garments. Our AI removes backgrounds automatically for a clean catalog look.',
        emoji: '📸',
        gradient: ['#f093fb', '#f5576c'],
    },
    {
        id: 'organize',
        title: 'Organize by Category',
        description: 'Sort items into tops, bottoms, shoes, and more. Tag by season for smart outfit suggestions.',
        emoji: '🏷️',
        gradient: ['#4facfe', '#00f2fe'],
    },
    {
        id: 'outfits',
        title: 'Create Perfect Outfits',
        description: 'Mix and match your wardrobe. Save favorite combinations for any occasion.',
        emoji: '✨',
        gradient: ['#43e97b', '#38f9d7'],
    },
    {
        id: 'ready',
        title: "You're Ready!",
        description: 'Start building your digital closet today. Your style journey begins now.',
        emoji: '🚀',
        gradient: ['#fa709a', '#fee140'],
    },
];

interface OnboardingScreenProps {
    onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef<FlatList>(null);
    const scrollX = useRef(new Animated.Value(0)).current;

    const handleViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems.length > 0 && viewableItems[0].index !== null) {
                setCurrentIndex(viewableItems[0].index);
            }
        }
    ).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    const handleNext = () => {
        if (currentIndex < ONBOARDING_STEPS.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
        } else {
            onComplete();
        }
    };

    const handleSkip = () => {
        onComplete();
    };

    const renderItem = ({ item, index }: { item: OnboardingStep; index: number }) => {
        const inputRange = [
            (index - 1) * SCREEN_WIDTH,
            index * SCREEN_WIDTH,
            (index + 1) * SCREEN_WIDTH,
        ];

        const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1, 0.8],
            extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.5, 1, 0.5],
            extrapolate: 'clamp',
        });

        return (
            <View style={styles.slide}>
                <Animated.View style={[styles.emojiContainer, { transform: [{ scale }], opacity }]}>
                    <Text style={styles.emoji}>{item.emoji}</Text>
                </Animated.View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.description}>{item.description}</Text>
            </View>
        );
    };

    const renderPagination = () => {
        return (
            <View style={styles.pagination}>
                {ONBOARDING_STEPS.map((_, index) => {
                    const inputRange = [
                        (index - 1) * SCREEN_WIDTH,
                        index * SCREEN_WIDTH,
                        (index + 1) * SCREEN_WIDTH,
                    ];

                    const dotWidth = scrollX.interpolate({
                        inputRange,
                        outputRange: [8, 24, 8],
                        extrapolate: 'clamp',
                    });

                    const dotOpacity = scrollX.interpolate({
                        inputRange,
                        outputRange: [0.4, 1, 0.4],
                        extrapolate: 'clamp',
                    });

                    return (
                        <Animated.View
                            key={index}
                            style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
                        />
                    );
                })}
            </View>
        );
    };

    const isLastStep = currentIndex === ONBOARDING_STEPS.length - 1;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                {!isLastStep && (
                    <Pressable onPress={handleSkip} style={styles.skipButton}>
                        <Text style={styles.skipText}>Skip</Text>
                    </Pressable>
                )}
            </View>

            <Animated.FlatList
                ref={flatListRef}
                data={ONBOARDING_STEPS}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={handleViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false }
                )}
                scrollEventThrottle={16}
            />

            {renderPagination()}

            <View style={styles.footer}>
                <Pressable
                    style={[styles.nextButton, isLastStep && styles.getStartedButton]}
                    onPress={handleNext}
                >
                    <Text style={styles.nextButtonText}>
                        {isLastStep ? 'Get Started' : 'Next'}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: spacing.md,
    },
    skipButton: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    skipText: {
        fontSize: typography.fontSize.md,
        color: colors.text.secondary,
        fontWeight: typography.fontWeight.medium,
    },
    slide: {
        width: SCREEN_WIDTH,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    emojiContainer: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xl,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 8,
    },
    emoji: {
        fontSize: 80,
    },
    title: {
        fontSize: typography.fontSize.xxl,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.primary,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    description: {
        fontSize: typography.fontSize.md,
        color: colors.text.secondary,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 300,
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: spacing.lg,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.accent.primary,
        marginHorizontal: 4,
    },
    footer: {
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.xxl,
    },
    nextButton: {
        backgroundColor: colors.accent.primary,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.lg,
        alignItems: 'center',
    },
    getStartedButton: {
        backgroundColor: colors.status.success,
    },
    nextButtonText: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.inverse,
    },
});
