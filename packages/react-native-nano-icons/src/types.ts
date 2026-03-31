import type { ComponentRef, Ref } from 'react';
import type {
  AccessibilityRole,
  ColorValue,
  View,
  ViewStyle,
} from 'react-native';
import type { NanoGlyphMapInput } from './core/types';

type ViewRef = ComponentRef<typeof View>;

export type IconProps<Name> = {
  name: Name;
  size?: number;
  color?: ColorValue | ColorValue[];
  allowFontScaling?: boolean;
  style?: ViewStyle;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  ref?: Ref<ViewRef>;
  testID?: string;
};

export type IconComponent<GM extends NanoGlyphMapInput> = React.FC<
  IconProps<keyof GM['i']>
>;
