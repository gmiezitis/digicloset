const expoPreset = require('jest-expo/jest-preset');

const expoSetupFiles = expoPreset.setupFiles ?? [];
const expoSetupFilesAfterEnv = expoPreset.setupFilesAfterEnv ?? [];
const expoSetupWithoutCore = expoSetupFiles.filter(
  file => file !== require.resolve('jest-expo/src/preset/setup.js')
);

module.exports = {
  ...expoPreset,
  testEnvironment: '<rootDir>/jest.environment.js',
  testMatch: ['**/__tests__/**/*.test.[tj]s?(x)'],
  setupFiles: [
    '<rootDir>/jest.setupEnv.js',
    ...expoSetupWithoutCore,
    require.resolve('jest-expo/src/preset/setup.js'),
  ],
  setupFilesAfterEnv: [...expoSetupFilesAfterEnv, '<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    ...expoPreset.moduleNameMapper,
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@theme$': '<rootDir>/src/theme/tokens',
    '^@constants$': '<rootDir>/src/constants',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@navigation/(.*)$': '<rootDir>/src/navigation/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^react-native/Libraries/BatchedBridge/NativeModules$':
      '<rootDir>/jest.nativeModulesMock.js',
    '^expo/build/winter$': '<rootDir>/node_modules/expo/src/winter',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/theme/**',
    '!src/navigation/**',
    '!src/screens/**',
    '!src/services/storageFileSystemDriver.ts',
    '!**/index.ts',
    '!**/index.tsx',
  ],
  coverageDirectory: 'coverage',
  resetMocks: true,
};


