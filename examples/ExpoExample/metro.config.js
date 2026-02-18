const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");

// We want ExpoExample to ignore the Bare example folder entirely.
const bareExampleRoot = path.resolve(
  repoRoot,
  "examples/BareReactNativeExample",
);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const config = getDefaultConfig(projectRoot);

// Metro's default blockList can be RegExp or RegExp[]
const baseBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList].filter(Boolean);

config.resolver.blockList = baseBlockList.concat([
  new RegExp(`^${escapeRegExp(bareExampleRoot)}[/\\\\].*`),
]);

module.exports = config;
