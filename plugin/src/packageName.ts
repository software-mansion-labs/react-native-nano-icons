import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

let cached: { name: string; root: string } | null = null;

/**
 * Resolve the package root (directory containing package.json) for this package.
 * Uses the plugin's location: plugin/build/*.js → two levels up → package root.
 */
function getPackageRoot(): string {
  if (cached) return cached.root;
  const currentFile = fileURLToPath(import.meta.url);
  const pluginBuildDir = path.dirname(currentFile);
  const root = path.resolve(pluginBuildDir, "..", "..");
  cached = { name: readPackageName(root), root };
  return root;
}

function readPackageName(root: string): string {
  const pkgPath = path.join(root, "package.json");
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { name?: string };
  if (typeof pkg.name !== "string") {
    throw new Error(`Missing or invalid "name" in ${pkgPath}`);
  }
  return pkg.name;
}

/**
 * Package name from this repo's package.json (e.g. "react-native-nano-icons").
 * Use this for require.resolve(), log messages, or any reference to the package.
 */
export function getPackageName(): string {
  if (cached) return cached.name;
  getPackageRoot();
  return cached!.name;
}

/**
 * Absolute path to the package root (where package.json lives).
 * Use this to resolve build paths (e.g. build/core/pipeline/index.js).
 */
export function getPackageRootPath(): string {
  return getPackageRoot();
}
