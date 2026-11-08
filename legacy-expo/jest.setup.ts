import '@testing-library/jest-native/extend-expect';
import 'react-native-gesture-handler/jestSetup';
import { NativeModules } from 'react-native';

// Ensure required NativeModules exist for jest-expo mocks
if (!NativeModules.UIManager) {
  NativeModules.UIManager = {};
}

if (!NativeModules.NativeUnimoduleProxy) {
  NativeModules.NativeUnimoduleProxy = {
    viewManagersMetadata: {},
    modulesConstants: {
      mockDefinition: {
        ExponentConstants: {
          experienceUrl: { mock: 'exp://127.0.0.1:8081' },
        },
      },
    },
  };
} else {
  NativeModules.NativeUnimoduleProxy.viewManagersMetadata =
    NativeModules.NativeUnimoduleProxy.viewManagersMetadata ?? {};
  NativeModules.NativeUnimoduleProxy.modulesConstants =
    NativeModules.NativeUnimoduleProxy.modulesConstants ?? {
      mockDefinition: {
        ExponentConstants: {
          experienceUrl: { mock: 'exp://127.0.0.1:8081' },
        },
      },
    };
}

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-font', () => ({
  loadAsync: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');

  mock.default.call = () => {};

  return mock;
});

