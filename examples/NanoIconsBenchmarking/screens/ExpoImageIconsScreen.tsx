import React from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
// import { useStopProfiling } from 'useStopProfiling';

const svgContext = require.context('../assets/material', false, /\.svg$/);
const svgKeys = svgContext.keys();

const Icons = svgKeys.map(key => (
  <Image key={key} source={svgContext(key)} style={{ width: 52, height: 52 }} />
));

export default function ExpoImageIconsScreen() {
  // const path = useStopProfiling();

  return (
    <View>
      {/* <TextInput value={path} /> */}
      <ScrollView>{Icons}</ScrollView>
    </View>
  );
}
