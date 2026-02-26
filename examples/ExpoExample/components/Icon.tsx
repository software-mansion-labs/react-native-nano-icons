import { createNanoIconSet } from "react-native-nano-icons";
import nanoGlyphMap from "../assets/nanoicons/Testicons.glyphmap.json";
import materialIconGlyphMap from "@/assets/test_icons/material_icons/nanoicons/MaterialIconsTwotone.glyphmap.json";
import swmIconGlyphMap from "@/assets/test_icons/swm_icons/nanoicons/SWMIconsBroken.glyphmap.json";

export const Icon = createNanoIconSet(nanoGlyphMap);

export const MaterialIcon = createNanoIconSet(materialIconGlyphMap);

export const SWMIconsBroken = createNanoIconSet(swmIconGlyphMap);
