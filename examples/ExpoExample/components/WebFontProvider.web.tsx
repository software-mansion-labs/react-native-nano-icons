import React from 'react';
import { useFonts } from 'expo-font';

type Props = { children: React.ReactNode };

const WebFontProvider = ({ children }: Props) => {
  const [loaded, error] = useFonts({
    Testicons: require('../assets/nanoicons/Testicons.woff2'),
    MaterialIconsTwotone: require('../assets/nanoicons/MaterialIconsTwotone.woff2'),
    SWMIconsOutline: require('../assets/nanoicons/SWMIconsOutline.woff2'),
  });

  if (!loaded && !error) {
    return null;
  }
  return <>{children}</>;
};

export default WebFontProvider;
