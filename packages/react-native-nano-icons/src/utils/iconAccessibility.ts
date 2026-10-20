import type { IconProps } from '../types';

export type IconAccessibilityProps = Pick<
  IconProps<unknown>,
  | 'accessible'
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'accessibilityElementsHidden'
  | 'importantForAccessibility'
>;

export function iconAccessibilityProps({
  accessible,
  accessibilityLabel,
  accessibilityRole,
  accessibilityElementsHidden,
  importantForAccessibility,
}: IconAccessibilityProps): IconAccessibilityProps {
  if (accessibilityLabel || accessible === true) {
    return {
      accessible,
      accessibilityLabel,
      accessibilityRole: accessibilityRole ?? 'image',
      accessibilityElementsHidden,
      importantForAccessibility,
    };
  }
  return {
    accessible: accessible ?? false,
    accessibilityLabel,
    accessibilityRole,
    accessibilityElementsHidden: accessibilityElementsHidden ?? true,
    importantForAccessibility:
      importantForAccessibility ?? 'no-hide-descendants',
  };
}
