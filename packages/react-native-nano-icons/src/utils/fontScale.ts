import { useSyncExternalStore } from 'react';
import { Dimensions, PixelRatio } from 'react-native';

function subscribe(onChange: () => void): () => void {
  const subscription = Dimensions.addEventListener('change', onChange);
  return () => subscription.remove();
}

function getFontScale(): number {
  return PixelRatio.getFontScale();
}

export function useFontScale(enabled: boolean): number {
  const fontScale = useSyncExternalStore(subscribe, getFontScale);
  return enabled ? fontScale : 1;
}
