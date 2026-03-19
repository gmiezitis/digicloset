import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { colors, spacing, typography } from '@theme';

const { width } = Dimensions.get('window');

export function SplashScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const lineAnim = useRef(new Animated.Value(0)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;
  const loadingDots = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequence of animations
    Animated.sequence([
      // 1. Fade in and scale the logo
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 40,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // 2. Draw the line
      Animated.timing(lineAnim, {
        toValue: 1,
        duration: 600,
        delay: 200,
        useNativeDriver: false,
      }),
      // 3. Fade in tagline
      Animated.timing(taglineFade, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Loading dots animation (loops)
    Animated.loop(
      Animated.sequence([
        Animated.timing(loadingDots, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(loadingDots, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const lineWidth = lineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width * 0.7],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.logoContainer}>
          {/* Main Logo */}
          <Text style={styles.logoText}>Tidless</Text>
          
          {/* Decorative Line */}
          <Animated.View
            style={[
              styles.line,
              {
                width: lineWidth,
              },
            ]}
          />
          
          {/* Tagline */}
          <Animated.View style={{ opacity: taglineFade }}>
            <Text style={styles.tagline}>Every clothe counts</Text>
          </Animated.View>
        </View>

        {/* Loading Indicator */}
        <Animated.View
          style={[
            styles.loadingContainer,
            {
              opacity: taglineFade,
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.loadingDot,
              {
                opacity: loadingDots.interpolate({
                  inputRange: [0, 0.33, 0.66, 1],
                  outputRange: [0.3, 1, 0.3, 0.3],
                }),
              },
            ]}
          >
            •
          </Animated.Text>
          <Animated.Text
            style={[
              styles.loadingDot,
              {
                opacity: loadingDots.interpolate({
                  inputRange: [0, 0.33, 0.66, 1],
                  outputRange: [0.3, 0.3, 1, 0.3],
                }),
              },
            ]}
          >
            •
          </Animated.Text>
          <Animated.Text
            style={[
              styles.loadingDot,
              {
                opacity: loadingDots.interpolate({
                  inputRange: [0, 0.33, 0.66, 1],
                  outputRange: [0.3, 0.3, 0.3, 1],
                }),
              },
            ]}
          >
            •
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C9BDB4', // Matching the beige/taupe from the image
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 56,
    fontWeight: '300', // Light weight for elegant look
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },
  line: {
    height: 2,
    backgroundColor: '#FFFFFF',
    marginVertical: spacing.lg,
    opacity: 0.6,
  },
  tagline: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.regular,
    color: '#2A2A2A',
    letterSpacing: 1,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flexDirection: 'row',
    marginTop: spacing.xxl * 2,
    gap: spacing.sm,
  },
  loadingDot: {
    fontSize: 32,
    color: '#FFFFFF',
    marginHorizontal: spacing.xs,
  },
});

