import React from 'react';
import { ScrollView, View, TextInput } from 'react-native';
import { NanoMaterialIcon } from './Icon';
import glyphMap from './assets/nanoicons/MaterialIconsTwotone.glyphmap.json';
import { useStopProfiling } from 'useStopProfiling';

// `true` to save the trace to the phone's downloads folder, `false` otherwise

const materialIcons = Object.keys(glyphMap.icons);

const Icons = materialIcons.map(name => (
  <NanoMaterialIcon
    key={name}
    name={name as keyof typeof glyphMap.icons}
    size={52}
  />
));

export default function NanoIconsScreen() {
  // const path = useStopProfiling();

  return (
    <View>
      {/* <TextInput value={path} /> */}
      <ScrollView>{Icons}</ScrollView>
    </View>
  );
}
