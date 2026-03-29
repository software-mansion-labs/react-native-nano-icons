import { createNanoIconSet } from 'react-native-nano-icons';
import glyphMap from './assets/nanoicons/MaterialIconsTwotone.glyphmap.json';
import testGlyphMap from './assets/nanoicons/Testicons.glyphmap.json';

export const NanoMaterialIcon = createNanoIconSet(glyphMap);

export const NanoTestIcons = createNanoIconSet(testGlyphMap);
