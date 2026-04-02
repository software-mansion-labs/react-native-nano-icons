import React from 'react';
import { ScrollView, View } from 'react-native';
// import { useStopProfiling } from 'useStopProfiling';

const svgContext = require.context('../assets/material', false, /\.svg$/);
const svgKeys = svgContext.keys();

const Icons = svgKeys.map(key => {
  const SvgComponent = svgContext(key).default;
  return <SvgComponent key={key} width={52} height={52} />;
});

export default function SVGIconsScreen() {
  // const path = useStopProfiling();

  return (
    <View>
      {/* <TextInput value={path} /> */}
      <ScrollView>{Icons}</ScrollView>
    </View>
  );
}
