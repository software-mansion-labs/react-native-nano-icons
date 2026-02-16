/**
 * Package name from this repo's package.json (e.g. "react-native-nano-icons").
 * Must be a constant so this module is safe to run in Hermes (no import.meta or fs).
 * Keep in sync with the "name" field in package.json.
 */
const PACKAGE_NAME = "react-native-nano-icons";

let cached: string | null = null;

export function getPackageName(): string {
  if (cached) return cached;
  cached = PACKAGE_NAME;
  return cached;
}
