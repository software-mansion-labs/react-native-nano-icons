import { StatusBar, Text, ScrollView, StyleSheet, View } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Icon } from '../Icon';

const INITIAL_FONT_SIZE = 22;
const LINE_HEIGHT_RATIO = 32 / 22;
const LOGO_SIZE_RATIO = 18 / 22;
const NBSP = ' ';

export default function InlineTextScreen() {
  const [fontSize, setFontSize] = useState(INITIAL_FONT_SIZE);

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.controls}>
          <Slider
            style={styles.slider}
            minimumValue={12}
            maximumValue={40}
            value={INITIAL_FONT_SIZE}
            onValueChange={setFontSize}
          />
          <Text style={styles.sizeLabel}>{Math.round(fontSize)}pt</Text>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={{ fontSize, lineHeight: fontSize * LINE_HEIGHT_RATIO }}>
            Lorem ipsum dolor{' '}
            <Icon name="SWM_logo" size={fontSize * LOGO_SIZE_RATIO} />
            {NBSP}sit amet, consectetur adipiscing elit, sed{' '}
            <Icon name="react-logo" size={fontSize} />
            {NBSP}do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            Ut enim <Icon name="person-walking" size={fontSize} />
            {NBSP}ad minim veniam, quis nostrud exercitation ullamco laboris
            nisi <Icon name="usFlag" size={fontSize} />
            {NBSP}ut aliquip ex ea commodo consequat. Duis aute irure dolor{' '}
            <Icon name="AO" size={fontSize} />
            {NBSP}in reprehenderit in voluptate velit esse cillum dolore eu
            fugiat nulla pariatur. Excepteur sint occaecat cupidatat non
            proident, sunt in culpa qui officia deserunt mollit anim id est
            laborum.
          </Text>
          <Text style={{ fontSize, marginTop: 16 }}>
            No lineHeight: Hxg <Icon name="star" size={fontSize} /> dolor
            <Icon name="SWM_logo" size={fontSize * LOGO_SIZE_RATIO} /> sit amet
            consectetur <Icon name="usFlag" size={fontSize} /> adipiscing elit
            sed do eiusmod <Icon name="AO" size={fontSize} /> tempor incididunt
            ut labore <Icon name="person-walking" size={fontSize} /> et dolore
          </Text>
          <Text style={{ fontSize, lineHeight: 40, marginTop: 16 }}>
            <Icon name="AO" size={20} />
            Fixed lineHeight 40, icon 20, font {Math.round(fontSize)}: Hxg
            <Icon name="SWM_logo" size={20} /> dolor
          </Text>
          <Text style={{ fontSize, marginTop: 16 }}>
            Mixed: Hxg <Icon name="star" size={fontSize * 2} /> big and
            <Icon name="star" size={fontSize * 0.5} /> small and{' '}
            <Text style={{ fontSize: fontSize * 1.6 }}>
              large text <Icon name="SWM_logo" size={fontSize * 1.6} /> here
            </Text>{' '}
            back <Icon name="AO" size={fontSize} /> to normal
          </Text>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sizeLabel: {
    width: 44,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
});
