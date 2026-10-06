import * as React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@react-navigation/native';
import {
  Button,
  HeaderBackButton,
  PlatformIcon,
} from '@react-navigation/elements';

import { nativeNanoSymbol } from 'react-native-nano-icons/symbols';
import SFSymbolShowcase from './SFSymbolShowcase';

// Default-size icon for the header (sfSymbol iOS / image drawable Android).
const HEADER_ICON = () => nativeNanoSymbol('swm', 'original');

// Sized variant — spread the descriptor and add aspectRatio, which the image
// (Android) honors so the wide logo renders at its intended proportions.
const SIZED_ICON = () => ({
  ...nativeNanoSymbol('swm', 'original'),
  aspectRatio: 2,
});

function Center({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

function DrawerA() {
  return (
    <Center label="Drawer screen — open the drawer to see DrawerItem icons" />
  );
}
function DrawerB() {
  return <Center label="Archive" />;
}

const Drawer = createDrawerNavigator();
function DrawerDemo() {
  return (
    <Drawer.Navigator>
      <Drawer.Screen
        name="Inbox"
        component={DrawerA}
        options={{ drawerIcon: SIZED_ICON }}
      />
      <Drawer.Screen
        name="Archive"
        component={DrawerB}
        options={{ drawerIcon: SIZED_ICON }}
      />
    </Drawer.Navigator>
  );
}

function TopA() {
  return <Center label="Top tab one" />;
}
function TopB() {
  return <Center label="Top tab two" />;
}

const TopTabs = createMaterialTopTabNavigator();
function TopTabsDemo() {
  return (
    <TopTabs.Navigator screenOptions={{ tabBarShowIcon: true }}>
      <TopTabs.Screen
        name="One"
        component={TopA}
        options={{ tabBarIcon: SIZED_ICON }}
      />
      <TopTabs.Screen
        name="Two"
        component={TopB}
        options={{ tabBarIcon: SIZED_ICON }}
      />
    </TopTabs.Navigator>
  );
}

function NativeStackHome() {
  return <Center label="Native stack header items" />;
}

function NativeStackHeaderIcons() {
  const { colors } = useTheme();
  return (
    <View style={styles.headerIcons}>
      <PlatformIcon
        icon={nativeNanoSymbol('walking')}
        color={colors.text}
        size={24}
      />
      <PlatformIcon
        icon={nativeNanoSymbol('walking', 'original')}
        color={colors.text}
        size={24}
      />
    </View>
  );
}

const NativeStack = createNativeStackNavigator();
function NativeStackDemo() {
  return (
    <NativeStack.Navigator>
      <NativeStack.Screen
        name="NativeStackHome"
        component={NativeStackHome}
        options={{
          title: 'Native stack',
          headerRight: NativeStackHeaderIcons,
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: 'Monochrome',
              icon: nativeNanoSymbol('walking'),
              onPress: () => {},
            },
            {
              type: 'button',
              label: 'Original',
              icon: nativeNanoSymbol('walking', 'original'),
              onPress: () => {},
            },
          ],
        }}
      />
    </NativeStack.Navigator>
  );
}

function ElementsHome({
  navigation,
}: {
  navigation: { navigate: (name: string) => void };
}) {
  return (
    <View style={styles.home}>
      <Text style={styles.section}>elements Button</Text>
      <View style={styles.row}>
        <Button variant="plain" icon={SIZED_ICON} onPress={() => {}}>
          Plain
        </Button>
        <Button variant="tinted" icon={SIZED_ICON} onPress={() => {}}>
          Tinted
        </Button>
        <Button variant="filled" icon={SIZED_ICON} onPress={() => {}}>
          Filled
        </Button>
      </View>

      <Text style={styles.section}>nested consumers</Text>
      <Button
        variant="tinted"
        onPress={() => navigation.navigate('DrawerDemo')}
      >
        Drawer (DrawerItem + toggle)
      </Button>
      <Button
        variant="tinted"
        onPress={() => navigation.navigate('TopTabsDemo')}
      >
        Material top tabs
      </Button>
      <Button
        variant="tinted"
        onPress={() => navigation.navigate('NativeStackDemo')}
      >
        Native stack header
      </Button>
      {Platform.OS === 'ios' ? (
        <Button
          variant="tinted"
          onPress={() => navigation.navigate('SFSymbols')}
        >
          SF Symbol modes
        </Button>
      ) : null}
    </View>
  );
}

const Stack = createStackNavigator();
export default function SystemShowcase() {
  return (
    <Stack.Navigator
      screenOptions={{
        // Custom icon on the right, rendered through elements' HeaderIcon
        // (the default back button is left untouched).
        headerRight: () => (
          <HeaderBackButton icon={HEADER_ICON()} onPress={() => {}} />
        ),
      }}
    >
      <Stack.Screen
        name="ElementsHome"
        component={ElementsHome}
        options={{ title: 'Elements' }}
      />
      <Stack.Screen
        name="DrawerDemo"
        component={DrawerDemo}
        options={{ title: 'Drawer', headerShown: false }}
      />
      <Stack.Screen
        name="TopTabsDemo"
        component={TopTabsDemo}
        options={{ title: 'Material top tabs' }}
      />
      <Stack.Screen
        name="NativeStackDemo"
        component={NativeStackDemo}
        options={{ headerShown: false }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Screen
          name="SFSymbols"
          component={SFSymbolShowcase}
          options={{ title: 'SF Symbol modes' }}
        />
      ) : null}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  home: { flex: 1, backgroundColor: '#fff', padding: 20, gap: 12 },
  section: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  headerIcons: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  body: { fontSize: 15, color: '#666', textAlign: 'center' },
});
