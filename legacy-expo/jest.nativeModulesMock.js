const mockViewManagersMetadata = {};

function createMockFunction() {
  const fn = (...args) => {
    fn.mock.calls.push(args);
  };
  fn.mock = { calls: [] };
  return fn;
}

const nativeModulesMock = {
  NativeUnimoduleProxy: {
    modulesConstants: {
      mockDefinition: {
        ExponentConstants: {
          experienceUrl: { mock: 'exp://127.0.0.1:8081' },
        },
      },
    },
    viewManagersMetadata: mockViewManagersMetadata,
  },
  UIManager: {},
  Linking: {},
  NativeUnimoduleProxyModule: {
    getEnqueuedMessages: createMockFunction(),
  },
};

module.exports = {
  __esModule: true,
  default: nativeModulesMock,
  ...nativeModulesMock,
};

