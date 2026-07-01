import {
  createBottomTabNavigator,
  createBottomTabScreen,
} from '@react-navigation/bottom-tabs';
import { nativeNanoSymbol } from 'react-native-nano-icons/symbols';

import IconsScreen from '../screens/IconsScreen';
import MulticolorScreen from '../screens/MulticolorScreen';
import SystemScreen from '../screens/SystemScreen';
import type { TabiconsSymbol } from '../assets/nanoicons/tabicons.symbols';
import type { MciconSymbol } from '../assets/nanoicons/mcicon.symbols';
import { system } from '../helpers/icons';

// react-navigation #13166: teach `{ type: 'sfSymbol', name }` about our forged
// asset-catalog symbol names, so nativeNanoSymbol(...) type-checks with no cast.
declare module '@react-navigation/native' {
  interface SFSymbolNames extends Record<TabiconsSymbol | MciconSymbol, true> {}
}

const Tabs = createBottomTabNavigator({
  screenOptions: {
    headerShown: false,
    // Active indicator is bar-wide (android) — set once for the whole bar.
    tabBarActiveIndicatorWidth: 80,
    tabBarActiveIndicatorHeight: 40,
  },
  screens: {
    // Monochrome custom symbol (nano.swm) — tinted by the bar.
    Mono: createBottomTabScreen({
      screen: IconsScreen,
      options: {
        title: 'Mono',
        tabBarIconSize: 44,
        tabBarIcon: () => nativeNanoSymbol('swm'),
      },
    }),
    // Colored multicolor image (.imageset on iOS / untinted drawable on
    // Android) — keeps its own colors when focused (tinted: false).
    Multicolor: createBottomTabScreen({
      screen: MulticolorScreen,
      options: {
        title: 'Multicolor',
        tabBarIconSize: 30,
        tabBarIcon: ({ focused }) => nativeNanoSymbol('walking', !focused),
      },
    }),
    // Built-in system symbol — SF Symbol on iOS, Material Symbol on Android.
    System: createBottomTabScreen({
      screen: SystemScreen,
      options: {
        title: 'System',
        tabBarIcon: ({ focused }: { focused: boolean }) =>
          system(focused ? 'star.fill' : 'star', 'star'),
      },
    }),
  },
});

export default Tabs;
