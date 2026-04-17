'use strict';
// Shim for react-native/Libraries/Utilities/DevLoadingView
// Expo SDK 55 references this module; it doesn't exist in React Native 0.73.x (renamed to LoadingView).
// The methods are HMR-only dev tools — no-ops are safe for production and local builds.
const noop = function () {};
const DevLoadingView = { showMessage: noop, hide: noop };
module.exports = { default: DevLoadingView };
