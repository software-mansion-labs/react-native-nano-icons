import * as React from 'react';
import {
  createStaticNavigation,
  StaticParamList,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import NanoIconsScreen from './screens/NanoIconsScreen';
// import SVGIconsScreen from './screens/SVGIconsScreen';
// import ExpoImageIconsScreen from './screens/ExpoImageIconsScreen';
// import ExpoVectorIconsScreen from './screens/ExpoVectorIconsScreen';

const RootStack = createNativeStackNavigator({
  initialRouteName: 'Home',
  screens: {
    Home: HomeScreen,
    Icons: NanoIconsScreen,
    // Icons: SVGIconsScreen,
    // Icons: ExpoImageIconsScreen,
    // Icons: ExpoVectorIconsScreen,
  },
});

export type RootStackParamList = StaticParamList<typeof RootStack>;

const Navigation = createStaticNavigation(RootStack);

export default function App() {
  return <Navigation />;
}
