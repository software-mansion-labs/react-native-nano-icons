import type { NanoGlyphMapInput } from './core/types';
import type { IconComponent } from './types';
import { createJSIconSet } from './createNanoIconsSet.shared';

export type { IconComponent, IconProps } from './types';
export { shallowEqualColor } from './utils/shallowEqualColor';

export function createIconSet<GM extends NanoGlyphMapInput>(
  glyphMap: GM
): IconComponent<GM> {
  return createJSIconSet(glyphMap);
}
