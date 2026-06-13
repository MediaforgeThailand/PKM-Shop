const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const config = getDefaultConfig(__dirname);
const ignoredWorkspaceDirs = ['.codex-figma-captures'].map((directory) => {
  const absolutePath = path.resolve(__dirname, directory);

  return new RegExp(`^${escapeRegex(absolutePath)}[/\\\\].*`);
});

config.resolver.blockList = exclusionList(ignoredWorkspaceDirs);

module.exports = config;
