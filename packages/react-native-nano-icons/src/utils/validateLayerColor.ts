import { processColor } from 'react-native';
import type { ColorValue } from 'react-native';
import { errorRuntime } from './runtimeLog';

const validityByString = new Map<string, boolean>();
const reportedInvalid = new Set<string>();

export function validateLayerColor(
  value: ColorValue | undefined,
  iconName: string,
  layerIndex: number
): ColorValue {
  if (value === undefined || value === 'currentColor') return 'black';
  if (typeof value !== 'string') return value;
  let valid = validityByString.get(value);
  if (valid === undefined) {
    valid = processColor(value) != null;
    validityByString.set(value, valid);
  }
  if (valid) return value;
  if (__DEV__) {
    const key = `${iconName}\u0000${value}`;
    if (!reportedInvalid.has(key)) {
      reportedInvalid.add(key);
      errorRuntime(
        `Invalid color "${value}" for icon "${iconName}" (layer ${layerIndex}). Falling back to black.`
      );
    }
  }
  return 'black';
}
