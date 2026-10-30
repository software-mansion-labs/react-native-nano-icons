import { useSyncExternalStore } from 'react';
import { Dimensions, PixelRatio } from 'react-native';

function subscribe(onChange: () => void): () => void {
  const subscription = Dimensions.addEventListener('change', onChange);
  return () => subscription.remove();
}

function getFontScale(): number {
  return PixelRatio.getFontScale();
}

function subscribeNever(): () => void {
  return () => {};
}

function noScale(): number {
  return 1;
}

// Icons with font scaling disabled don't subscribe, so they don't add a
// Dimensions listener or re-render on window changes.
export function useFontScale(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribe : subscribeNever,
    enabled ? getFontScale : noScale
  );
}
