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
// import NanoIconsScreen from './NanoIconsScreen';
// import SVGIconsScreen from './SVGIconsScreen';
import ExpoImageIconsScreen from './ExpoImageIconsScreen';

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
        <Text style={{ color: 'blue' }}>Go to Icons</Text>
      </Pressable>
    </View>
  );
}

const RootStack = createNativeStackNavigator({
  initialRouteName: 'Home',
  screens: {
    Home: HomeScreen,
    // Icons: NanoIconsScreen,
    // Icons: SVGIconsScreen,
    Icons: ExpoImageIconsScreen,
  },
});

type RootStackParamList = StaticParamList<typeof RootStack>;

const Navigation = createStaticNavigation(RootStack);

export default function App() {
  return <Navigation />;
}
