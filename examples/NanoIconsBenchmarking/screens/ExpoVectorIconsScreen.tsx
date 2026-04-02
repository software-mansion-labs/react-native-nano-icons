import React from 'react';
import { ScrollView, View } from 'react-native';
import { createIconSetFromIcoMoon } from '@expo/vector-icons';
import icomoonJson from '../assets/icomoon/materialtest.icomoon.json';

// `true` to save the trace to the phone's downloads folder, `false` otherwise

const IcoMoonMaterialIcon = createIconSetFromIcoMoon(
  icomoonJson,
  'Untitled',
  require('../assets/icomoon/Untitled.ttf'),
);

const materialIcons = (icomoonJson as any).glyphs.map(
  (glyph: any) => glyph.extras.name,
) as string[];

const Icons = materialIcons.map(name => (
  <IcoMoonMaterialIcon key={name} name={name} size={52} />
));

export default function ExpoVectorIconsScreen() {
  // const path = useStopProfiling();

  return (
    <View>
      {/* <TextInput value={path} /> */}
      <ScrollView>{Icons}</ScrollView>
    </View>
  );
}
