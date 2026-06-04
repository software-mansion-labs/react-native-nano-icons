import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  NativeTabs,
  Icon,
  Label,
  VectorIcon,
} from 'expo-router/unstable-native-tabs';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <NativeTabs tintColor={Colors[colorScheme ?? 'light'].tint}>
      <NativeTabs.Trigger name="index">
        <Label>Nano Icons</Label>
        <Icon
          sf="chevron.left.forwardslash.chevron.right"
          androidSrc={<VectorIcon family={FontAwesome} name="code" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="two">
        <Label>(Nano) SWM Icons</Label>
        <Icon
          sf="chevron.left.forwardslash.chevron.right"
          androidSrc={<VectorIcon family={FontAwesome} name="code" />}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="material">
        <Label>(Nano)Material TwoTone Icons</Label>
        <Icon
          sf="chevron.left.forwardslash.chevron.right"
          androidSrc={<VectorIcon family={FontAwesome} name="code" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
