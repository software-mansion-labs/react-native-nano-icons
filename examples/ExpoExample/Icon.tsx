import { createNanoIconSet } from "react-native-nano-icons";
import glyphMap from "./assets/nanoicons/Testicons.glyphmap.json";

// console.log(glyphMap.icons["person-walking"].layers.map(layer => layer.color));
export const Icon = createNanoIconSet(glyphMap);
