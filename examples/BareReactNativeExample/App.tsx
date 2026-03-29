import { Pressable } from 'react-native';

import * as React from 'react';
import { View, Text } from 'react-native';
import {
  createStaticNavigation,
  NavigationProp,
  StaticParamList,
  useNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NanoIconsScreen from './NanoIconsScreen';
import { NanoTestIcons } from './Icon';
// import SVGIconsScreen from './SVGIconsScreen';
// import ExpoImageIconsScreen from './ExpoImageIconsScreen';
// import ExpoVectorIconsScreen from './ExpoVectorIconsScreen';

// import { startProfiling } from 'react-native-release-profiler';

function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handlePress = () => {
    // startProfiling();
    navigation.navigate('Icons');
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={handlePress}>
        <Text style={{ color: 'blue' }}>
          Go to <NanoTestIcons name="AO" size={10} /> Icons
        </Text>
      </Pressable>
    </View>
  );
}

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

type RootStackParamList = StaticParamList<typeof RootStack>;

const Navigation = createStaticNavigation(RootStack);

export default function App() {
  return <Navigation />;
}
