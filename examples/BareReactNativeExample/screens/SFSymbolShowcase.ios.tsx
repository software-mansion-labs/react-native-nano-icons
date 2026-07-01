import * as React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SFSymbol } from '@react-navigation/native';

// Custom asset-catalog symbol names typecheck directly on <SFSymbol> thanks to
// the SFSymbolNames augmentation (see navigation/Tabs.tsx) — react-navigation #13166.
type Effect = React.ComponentProps<typeof SFSymbol>['effect'];

const MODE_SIZE = 60;
const ANIM_SIZE = 46;

const ANIMATIONS: { label: string; effect: Effect }[] = [
  { label: 'bounce', effect: { type: 'bounce', repeat: 'continuous' } },
  { label: 'pulse', effect: { type: 'pulse', repeat: 'continuous' } },
  { label: 'breathe', effect: { type: 'breathe', repeat: 'continuous' } },
  { label: 'wiggle', effect: { type: 'wiggle', repeat: 'continuous' } },
  { label: 'rotate', effect: { type: 'rotate', repeat: 'continuous' } },
];

function ModeRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.modeBlock}>
      <Text style={styles.mode}>{label}</Text>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

function AnimCell({ label, effect }: { label: string; effect: Effect }) {
  return (
    <View style={styles.cell}>
      <SFSymbol
        name={'nano.folder'}
        size={ANIM_SIZE}
        color="#001A72"
        effect={effect}
      />
      <Text style={styles.cap}>{label}</Text>
    </View>
  );
}

export default function SFSymbolShowcase() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>SF Symbol rendering modes</Text>
      <Text style={styles.line}>
        Modes a tab icon can't show — rendered via {'<SFSymbol>'} (our 2-layer
        custom symbols + a built-in one).
      </Text>

      <ModeRow label="palette">
        <SFSymbol
          name={'nano.folder'}
          size={MODE_SIZE}
          renderingMode="palette"
          colors={{ primary: '#E5572B', secondary: '#001A72' }}
        />
        <SFSymbol
          name={'nano.cloud'}
          size={MODE_SIZE}
          renderingMode="palette"
          colors={{ primary: '#0A84FF', secondary: '#34C759' }}
        />
        <SFSymbol
          name="cloud.sun.fill"
          size={MODE_SIZE}
          renderingMode="palette"
          colors={{ primary: '#FF9500', secondary: '#FFD60A' }}
        />
      </ModeRow>

      <ModeRow label="hierarchical">
        <SFSymbol
          name={'nano.folder'}
          size={MODE_SIZE}
          renderingMode="hierarchical"
          color="#001A72"
        />
        <SFSymbol
          name={'nano.cloud'}
          size={MODE_SIZE}
          renderingMode="hierarchical"
          color="#0A84FF"
        />
        <SFSymbol
          name="cloud.sun.fill"
          size={MODE_SIZE}
          renderingMode="hierarchical"
          color="#FF9500"
        />
      </ModeRow>

      <Text style={[styles.title, styles.section]}>Animations</Text>
      <Text style={styles.line}>
        Continuous {'<SFSymbol>'} effects on our custom folder symbol.
      </Text>
      <View style={styles.grid}>
        {ANIMATIONS.map(a => (
          <AnimCell key={a.label} label={a.label} effect={a.effect} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    gap: 14,
  },
  title: { fontSize: 22, fontWeight: '600' },
  section: { marginTop: 18 },
  line: { fontSize: 15, color: '#666', textAlign: 'center' },
  modeBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  mode: { fontSize: 13, fontWeight: '600', color: '#444' },
  row: { flexDirection: 'row', gap: 28, alignItems: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 22,
  },
  cell: { alignItems: 'center', gap: 8, width: 92 },
  cap: { fontSize: 12, color: '#444' },
});
