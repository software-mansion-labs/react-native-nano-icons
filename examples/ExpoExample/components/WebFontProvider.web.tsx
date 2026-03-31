import React from 'react';
import { useFonts } from 'expo-font';

type Props = { children: React.ReactNode };

const WebFontProvider = ({ children }: Props) => {
  const [loaded, error] = useFonts({
    Testicons: require('../assets/nanoicons/Testicons.ttf'),
    MaterialIconsTwotone: require('../assets/nanoicons/MaterialIconsTwotone.ttf'),
    SWMIconsOutline: require('../assets/nanoicons/SWMIconsOutline.ttf'),
  });

  if (!loaded && !error) {
    return null;
  }
  return <>{children}</>;
};

export default WebFontProvider;
