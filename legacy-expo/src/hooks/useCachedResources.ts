import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';

/**
 * Hook to preload fonts and other resources
 * Returns true when resources are loaded
 */
export function useCachedResources() {
  const [isLoadingComplete, setLoadingComplete] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getCachedLoadPromise().finally(() => {
      if (isMounted) {
        setLoadingComplete(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return isLoadingComplete;
}

let cachedLoadPromise: Promise<void> | null = null;

function getCachedLoadPromise() {
  if (!cachedLoadPromise) {
    cachedLoadPromise = loadResourcesAndDataAsync();
  }
  return cachedLoadPromise;
}

async function loadResourcesAndDataAsync() {
  try {
    if (Platform.OS !== 'web') {
      await SplashScreen.preventAutoHideAsync();
    }

    await Font.loadAsync({
      // Add custom fonts here in the future
      // 'CustomFont-Regular': require('../../assets/fonts/CustomFont-Regular.ttf'),
    });

    await new Promise(resolve => setTimeout(resolve, 1500));
  } catch (error) {
    console.warn('Error loading resources:', error);
  }
}

export function resetCachedResourcesForTests() {
  if (process.env.NODE_ENV !== 'production') {
    cachedLoadPromise = null;
  }
}
