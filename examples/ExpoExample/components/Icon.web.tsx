import { createNanoIconSet } from 'react-native-nano-icons';
import nanoGlyphMap from '../assets/nanoicons/Testicons.glyphmap.json';
import materialIconGlyphMap from '@/assets/nanoicons/MaterialIconsTwotone.glyphmap.json';
import swmIconGlyphMap from '@/assets/nanoicons/SWMIconsOutline.glyphmap.json';

export const Icon = createNanoIconSet(
  nanoGlyphMap,
  require('../assets/nanoicons/Testicons.woff2')
);

export const MaterialIcon = createNanoIconSet(materialIconGlyphMap);

export const SWMIconsOutline = createNanoIconSet(
  swmIconGlyphMap,
  require('../assets/nanoicons/SWMIconsOutline.ttf')
);
