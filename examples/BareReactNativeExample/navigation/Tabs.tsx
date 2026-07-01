import {
  createBottomTabNavigator,
  createBottomTabScreen,
} from '@react-navigation/bottom-tabs';

import IconsScreen from '../screens/IconsScreen';
import MulticolorScreen from '../screens/MulticolorScreen';
import SystemScreen from '../screens/SystemScreen';
import { TabiconsSymbols } from '../assets/nanoicons/tabicons.symbols';
import { TabiconsDrawables } from '../assets/nanoicons/tabicons.drawables';
import { MciconSymbols } from '../assets/nanoicons/mcicon.symbols';
import { MciconDrawables } from '../assets/nanoicons/mcicon.drawables';
import { nano, system } from '../helpers/icons';

const Tabs = createBottomTabNavigator({
  // implementation: 'custom',
  screenOptions: {
    headerShown: false,
    // Active indicator is bar-wide (android) — set once for the whole bar.
    tabBarActiveIndicatorWidth: 80,
    tabBarActiveIndicatorHeight: 40,
  },
  screens: {
    // Monochrome custom symbol (nano.swm) — screen is the original nano-icons
    // font demo that this example started with.
    Mono: createBottomTabScreen({
      screen: IconsScreen,
      options: {
        title: 'Mono',
        tabBarIconSize: 44,

        tabBarIcon: () => nano(TabiconsSymbols.swm, TabiconsDrawables.swm),
      },
    }),
    // Colored multicolor image (.imageset on iOS / untinted drawable on
    // Android) — keeps its own colors in the bar.
    Multicolor: createBottomTabScreen({
      screen: MulticolorScreen,
      options: {
        title: 'Multicolor',
        tabBarIconSize: 30,
        tabBarIcon: ({ focused }) =>
          nano(MciconSymbols.walking, MciconDrawables.walking, !focused),
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
