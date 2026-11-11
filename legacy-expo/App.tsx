import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCachedResources } from './src/hooks/useCachedResources';
import { Navigation } from './src/navigation';
import { SplashScreen as CustomSplashScreen } from './src/screens';
import { colors } from './src/theme/tokens';
import { initializeDraftSync, shutdownDraftSync } from './src/services/draftSyncCoordinator';
import { initializeCameraProcessing, shutdownCameraProcessing } from './src/services/cameraCoordinator';
import { adService } from './src/services/adService';

export default function App() {
  const isLoadingComplete = useCachedResources();
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  useEffect(() => {
    console.log('[App] isLoadingComplete changed:', isLoadingComplete);
    if (isLoadingComplete) {
      // Immediately hide splash for debugging - reduce to 100ms
      console.log('[App] Resources loaded, hiding splash in 100ms');
      const timer = setTimeout(() => {
        console.log('[App] Hiding custom splash now');
        setShowCustomSplash(false);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isLoadingComplete]);

  const onLayoutRootView = useCallback(async () => {
    if (isLoadingComplete && !showCustomSplash && Platform.OS !== 'web') {
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        console.warn('Error hiding splash screen:', error);
      }
    }
  }, [isLoadingComplete, showCustomSplash]);

  useEffect(() => {
    if (!isLoadingComplete) {
      return;
    }

    let isMounted = true;

    const bootstrapAsync = async () => {
      try {
        await initializeDraftSync();
        await initializeCameraProcessing();
        await adService.initialize();
      } catch (error) {
        if (isMounted) {
          console.error('[App] Failed to initialize background services', error);
        }
      }
    };

    bootstrapAsync();

    return () => {
      isMounted = false;
      shutdownDraftSync();
      shutdownCameraProcessing();
    };
  }, [isLoadingComplete]);

  if (!isLoadingComplete || showCustomSplash) {
    return <CustomSplashScreen />;
  }

  return (
    <GestureHandlerRootView style={styles.container} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <View style={styles.container}>
          <Navigation />
          <StatusBar style="dark" />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
