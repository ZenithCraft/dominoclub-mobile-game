const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the root node_modules (monorepo hoisted deps)
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force all React-related packages to resolve to the single copy in
// apps/mobile/node_modules, preventing the "multiple copies of React" crash
// that occurs because the root node_modules has a different React version
// (18.3.1 from admin) vs mobile's React (18.2.0).
const FORCE_LOCAL = ['react', 'react-dom', 'react-native', 'react/jsx-runtime', 'react/jsx-dev-runtime'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (FORCE_LOCAL.includes(moduleName)) {
    const resolved = path.resolve(projectRoot, 'node_modules', moduleName);
    return { filePath: require.resolve(resolved), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
