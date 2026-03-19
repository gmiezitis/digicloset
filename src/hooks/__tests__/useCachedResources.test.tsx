import React, { StrictMode, useEffect } from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { useCachedResources, resetCachedResourcesForTests } from '../useCachedResources';
import { Platform } from 'react-native';

function HookHarness({ onReady }: { onReady?: () => void }) {
  const ready = useCachedResources();

  useEffect(() => {
    if (ready) {
      onReady?.();
    }
  }, [onReady, ready]);

  return <Text testID="status">{ready ? 'ready' : 'loading'}</Text>;
}

describe('useCachedResources', () => {
  beforeEach(() => {
    resetCachedResourcesForTests();
    jest.useFakeTimers();
    (SplashScreen.preventAutoHideAsync as jest.Mock).mockResolvedValue(undefined);
    (Font.loadAsync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('resolves to ready after resources load', async () => {
    const { getByTestId } = render(<HookHarness />);

    await advanceAllTimers();

    expect(getByTestId('status').props.children).toBe('ready');
  });

  it('logs warning and still resolves when fonts fail', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (Font.loadAsync as jest.Mock).mockRejectedValueOnce(new Error('font-error'));

    const { getByTestId } = render(<HookHarness />);

    await advanceAllTimers();

    expect(getByTestId('status').props.children).toBe('ready');

    expect(warnSpy).toHaveBeenCalledWith('Error loading resources:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('logs warning and still resolves when splash screen fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (SplashScreen.preventAutoHideAsync as jest.Mock).mockRejectedValueOnce(new Error('splash-error'));

    const { getByTestId } = render(<HookHarness />);

    await advanceAllTimers();

    expect(getByTestId('status').props.children).toBe('ready');
    expect(warnSpy).toHaveBeenCalledWith('Error loading resources:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('runs resource loading only once across re-renders', async () => {
    const { getByTestId, rerender } = render(<HookHarness />);

    rerender(<HookHarness />);

    await advanceAllTimers();

    expect(getByTestId('status').props.children).toBe('ready');

    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(Font.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('skips splash screen calls on web platform', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });

    const { getByTestId } = render(<HookHarness />);

    await advanceAllTimers();

    expect(getByTestId('status').props.children).toBe('ready');

    expect(SplashScreen.preventAutoHideAsync).not.toHaveBeenCalled();

    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalOS,
    });
  });

  it('guards duplicate effect runs under strict mode', async () => {
    const { getByTestId } = render(
      <StrictMode>
        <HookHarness />
      </StrictMode>
    );

    await advanceAllTimers();

    await waitFor(() => {
      expect(getByTestId('status').props.children).toBe('ready');
    });

    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(Font.loadAsync).toHaveBeenCalledTimes(1);
  });
});

async function advanceAllTimers() {
  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}


