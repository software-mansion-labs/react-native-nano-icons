import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { TabiconsSymbols } from '@/assets/nanoicons/tabicons.symbols';
import { TabiconsDrawables } from '@/assets/nanoicons/tabicons.drawables';
import { MciconsSymbols } from '@/assets/nanoicons/mcicons.symbols';
import { MciconsDrawables } from '@/assets/nanoicons/mcicons.drawables';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      tintColor={palette.tint}
      // Note: expo-router converts xcasset icons to template images only when
      // an icon color is set for the state; setting both normal and selected
      // colors keeps icon/selectedIcon the same native type.
      iconColor={palette.tabIconDefault}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Nano Icons</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          xcasset={TabiconsSymbols.home}
          drawable={TabiconsDrawables.home}
          src={
            <NativeTabs.Trigger.VectorIcon family={FontAwesome} name="home" />
          }
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="two">
        <NativeTabs.Trigger.Label>(Nano) SWM Icons</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          xcasset={{
            default: TabiconsSymbols.heart,
            selected: TabiconsSymbols['heart.fill'],
          }}
          drawable={{
            default: TabiconsDrawables.heart,
            selected: TabiconsDrawables['heart.fill'],
          }}
          src={
            <NativeTabs.Trigger.VectorIcon family={FontAwesome} name="heart" />
          }
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="material">
        <NativeTabs.Trigger.Label>(Nano)Material</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          xcasset={TabiconsSymbols.messages}
          drawable={TabiconsDrawables.messages}
          src={
            <NativeTabs.Trigger.VectorIcon
              family={FontAwesome}
              name="comment"
            />
          }
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="swm">
        <NativeTabs.Trigger.Label>SWM</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          xcasset={TabiconsSymbols.swm}
          drawable={TabiconsDrawables.swm}
          src={
            <NativeTabs.Trigger.VectorIcon family={FontAwesome} name="flag" />
          }
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="colors">
        <NativeTabs.Trigger.Label>Colors</NativeTabs.Trigger.Label>
        {/* Colored imageset (mcicons set, multicolor: true) — renders in
            ORIGINAL colors in the bar, unlike the monochrome symbols above. */}
        <NativeTabs.Trigger.Icon
          xcasset={MciconsSymbols.walker}
          drawable={MciconsDrawables.walker}
          src={
            <NativeTabs.Trigger.VectorIcon
              family={FontAwesome}
              name="paint-brush"
            />
          }
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
