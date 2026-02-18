import { createNanoIconSet } from 'react-native-nano-icons';
import glyphMap from './assets/nanoicons/Testicons.glyphmap.json';

const FONT_FAMILY = 'Testicons';

export const Icon = createNanoIconSet(glyphMap, {
  postScriptName: FONT_FAMILY,
  fontFileName: `${FONT_FAMILY}.ttf`,
});
