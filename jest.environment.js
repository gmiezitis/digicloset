if (typeof global.navigator !== 'object' || global.navigator === null) {
  Object.defineProperty(global, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  });
}

if (!global.navigator.product) {
  Object.defineProperty(global.navigator, 'product', {
    value: 'ReactNative',
    configurable: true,
  });
}

const NodeEnvironmentModule = require('jest-environment-node');
const BaseEnvironment =
  NodeEnvironmentModule.TestEnvironment ??
  NodeEnvironmentModule.default ??
  NodeEnvironmentModule;

class DigiclosetEnvironment extends BaseEnvironment {
  async setup() {
    if (!this.global.navigator || typeof this.global.navigator !== 'object') {
      Object.defineProperty(this.global, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
    }

    if (!this.global.navigator.product) {
      Object.defineProperty(this.global.navigator, 'product', {
        value: 'ReactNative',
        configurable: true,
      });
    }

    await super.setup();
  }
}

module.exports = DigiclosetEnvironment;


