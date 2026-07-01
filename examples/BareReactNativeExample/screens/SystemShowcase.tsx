import * as React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Button, HeaderBackButton } from '@react-navigation/elements';

import { nativeNanoSymbol } from 'react-native-nano-icons/symbols';
import SFSymbolShowcase from './SFSymbolShowcase';

// Default-size icon for the header (sfSymbol iOS / image drawable Android).
const HEADER_ICON = () => nativeNanoSymbol('swm', false);

// Sized variant — spread the descriptor and add width/height, which the image
// (Android) honors so the wide logo renders at its intended size.
const SIZED_ICON = () => ({
  ...nativeNanoSymbol('swm', false),
  width: 40,
  height: 20,
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
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  body: { fontSize: 15, color: '#666', textAlign: 'center' },
});
