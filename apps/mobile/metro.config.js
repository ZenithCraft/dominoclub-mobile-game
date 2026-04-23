const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
// On EAS Build servers the project is uploaded standalone — workspaceRoot may not exist
const workspaceExists = fs.existsSync(workspaceRoot);

const config = getDefaultConfig(projectRoot);

// Do NOT set watchFolders to workspaceRoot or its node_modules — doing so causes
// Expo CLI to compute the bundle entry path relative to the workspace root, producing
// /apps/mobile/index.bundle in the HTML instead of /index.bundle.
// nodeModulesPaths below is sufficient for resolving hoisted monorepo deps.

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  ...(workspaceExists ? [path.resolve(workspaceRoot, 'node_modules')] : []),
];

// Force React-related packages to the local copy only when apps/mobile has its own
// node_modules — prevents the "multiple copies of React" crash in the monorepo
// (admin uses React 18.3.1, mobile uses 18.2.0). On EAS, npm install hoists
// everything to the repo root so there is no local copy to force; skip in that case.
const localReact = path.resolve(projectRoot, 'node_modules', 'react', 'package.json');
const hasLocalNodeModules = fs.existsSync(localReact);

const FORCE_LOCAL = ['react', 'react-dom', 'react-native', 'react/jsx-runtime', 'react/jsx-dev-runtime'];
const FORCE_LOCAL_PATHS = {
  zustand: 'zustand/index.js',
  'zustand/vanilla': 'zustand/vanilla.js',
  'zustand/middleware': 'zustand/middleware.js',
  'zustand/middleware/immer': 'zustand/middleware/immer.js',
  'zustand/shallow': 'zustand/shallow.js',
  'zustand/traditional': 'zustand/traditional.js',
  'zustand/context': 'zustand/context.js',
  'zustand/react/shallow': 'zustand/react/shallow.js',
  'zustand/vanilla/shallow': 'zustand/vanilla/shallow.js',
};

// Always intercept: shim DevLoadingView (missing in RN 0.73, required by Expo SDK 55)
// and (when in monorepo dev) force React/Zustand to the local copy.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Expo SDK 55 / React Native 0.73 compatibility shim
  if (moduleName === 'react-native/Libraries/Utilities/DevLoadingView') {
    return { filePath: path.resolve(projectRoot, 'shims', 'DevLoadingView.js'), type: 'sourceFile' };
  }

  // Force zustand to CJS version (avoids import.meta in ESM build)
  const forcedPath = FORCE_LOCAL_PATHS[moduleName];
  if (forcedPath) {
    const localResolved = path.resolve(projectRoot, 'node_modules', forcedPath);
    const rootResolved = path.resolve(workspaceRoot, 'node_modules', forcedPath);
    const target = fs.existsSync(localResolved) ? localResolved : fs.existsSync(rootResolved) ? rootResolved : null;
    if (target) return { filePath: target, type: 'sourceFile' };
  }

  if (hasLocalNodeModules) {
    if (FORCE_LOCAL.includes(moduleName)) {
      const resolved = path.resolve(projectRoot, 'node_modules', moduleName);
      if (fs.existsSync(resolved)) {
        return { filePath: require.resolve(resolved), type: 'sourceFile' };
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
