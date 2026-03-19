const navigatorRef =
  typeof global.navigator === 'object' && global.navigator !== null ? global.navigator : {};

if (navigatorRef !== global.navigator) {
  global.navigator = navigatorRef;
}

if (!('product' in navigatorRef)) {
  Object.defineProperty(navigatorRef, 'product', {
    value: 'ReactNative',
    configurable: true,
    writable: true,
  });
}

if (!('userAgent' in navigatorRef)) {
  Object.defineProperty(navigatorRef, 'userAgent', {
    value: 'ReactNative',
    configurable: true,
    writable: true,
  });
}
