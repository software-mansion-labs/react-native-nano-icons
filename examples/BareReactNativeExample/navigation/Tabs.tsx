import {
  createBottomTabNavigator,
  createBottomTabScreen,
} from '@react-navigation/bottom-tabs';
import type { Icon } from '@react-navigation/elements';

import IconsScreen from '../screens/IconsScreen';
import { MulticolorScreen, SystemScreen } from '../screens/VariantScreens';
import { TabiconsSymbols } from '../assets/nanoicons/tabicons.symbols';
import { MciconSymbols } from '../assets/nanoicons/mcicon.symbols';

// 3 tabs in the native tab render path:
//   asset(): our custom catalog assets, by name via UIImage(named:)
//            (the `sfSymbolAsset` Icon type — app-provided counterpart to sfSymbol)
//     · .symbolset  -> SF Symbol template, tinted by the bar
//     · .imageset   -> colored image, original colors
//   sf():    a built-in Apple SF Symbol, UIImage(systemName:)
const asset = (name: string): Icon => ({ type: 'sfSymbolAsset', name });

const sf = (name: string): Icon => ({ type: 'sfSymbol', name }) as Icon;

const Tabs = createBottomTabNavigator({
  screenOptions: {
    headerShown: false,
  },
  screens: {
    // Monochrome custom symbol (nano.swm) — screen is the original nano-icons
    // font demo that this example started with.
    Mono: createBottomTabScreen({
      screen: IconsScreen,
      options: {
        title: 'Mono',
        tabBarIcon: () => asset(TabiconsSymbols.swm),
      },
    }),
    // Colored multicolor image (.imageset) — original colors in the bar.
    Multicolor: createBottomTabScreen({
      screen: MulticolorScreen,
      options: {
        title: 'Multicolor',
        tabBarIcon: () => asset(MciconSymbols.walking),
      },
    }),
    // Built-in system SF Symbol — screen presents palette/hierarchical modes.
    System: createBottomTabScreen({
      screen: SystemScreen,
      options: {
        title: 'System',
        tabBarIcon: ({ focused }: { focused: boolean }) =>
          sf(focused ? 'star.fill' : 'star'),
      },
    }),
    // Blob demo: AO is two solid halves (red/black) + a compass emblem, all
    // non-white ink — no white knockout, so monochrome flattening unions it into
    // a solid filled rectangle.
    BlobFlag: createBottomTabScreen({
      screen: IconsScreen,
      options: {
        title: 'BlobFlag',
        tabBarIcon: () => asset(TabiconsSymbols.AO),
      },
    }),
    // Blob demo: a multicolor illustration whose legibility depends on color
    // contrast (off-white/grey details below the knockout threshold) — flattens
    // to a featureless silhouette.
    BlobWalk: createBottomTabScreen({
      screen: IconsScreen,
      options: {
        title: 'BlobWalk',
        tabBarIcon: () => asset(TabiconsSymbols['person-walking']),
      },
    }),
  },
});

export default Tabs;
