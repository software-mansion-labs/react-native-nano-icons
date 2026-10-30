import { createNanoIconSet } from 'react-native-nano-icons';
import glyphMap from '../public/nanoicons/NextIcons.glyphmap.json';

export { glyphMap };

export const Icon = createNanoIconSet(glyphMap, '/nanoicons/NextIcons.woff2');
