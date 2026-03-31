import { createNanoIconSet } from "react-native-nano-icons";
import nanoGlyphMap from "../assets/nanoicons/Testicons.glyphmap.json";
import materialIconGlyphMap from "@/assets/nanoicons/MaterialIconsTwotone.glyphmap.json";
import swmIconGlyphMap from "@/assets/nanoicons/SWMIconsOutline.glyphmap.json";

export const Icon = createNanoIconSet(nanoGlyphMap);

export const MaterialIcon = createNanoIconSet(materialIconGlyphMap);

export const SWMIconsOutline = createNanoIconSet(swmIconGlyphMap);
