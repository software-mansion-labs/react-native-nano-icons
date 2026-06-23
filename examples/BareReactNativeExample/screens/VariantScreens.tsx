import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SFSymbol } from '@react-navigation/native';

import { TabiconsSymbols } from '../assets/nanoicons/tabicons.symbols';

// Custom catalog symbols resolve at runtime via UIImage(named:) but aren't in
// the built-in SFSymbols name union — cast for the typed `name` prop.
const customName = (n: string): never => n as never;

// Multicolor tab — small implementation notice: this tab icon is an SVG shipped
// as a colored image asset (not a monochrome symbol).
export const MulticolorScreen = () => (
  <SafeAreaView edges={['top']} style={styles.container}>
    <Text style={styles.title}>Colored image</Text>
    <Text style={styles.line}>
      This tab icon is an SVG rendered in its original colors.
    </Text>
    <Text style={styles.note}>
      With <Text style={styles.code}>multicolor: true</Text> the pipeline emits
      a <Text style={styles.code}>.imageset</Text> (Render-As: Original) instead
      of a monochrome <Text style={styles.code}>.symbolset</Text>, so the icon
      keeps its colors in the tab bar instead of being template-tinted.
    </Text>
  </SafeAreaView>
);

// System tab — presents the SF Symbol rendering modes that CAN'T show as a tab
// icon (palette / hierarchical), rendered via <SFSymbol> from our own 2-layer
// custom symbols plus a built-in one.
const MODE_SIZE = 60;
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

export const SystemScreen = () => (
  <SafeAreaView edges={['top']} style={styles.container}>
    <Text style={styles.title}>SF Symbol rendering modes</Text>
    <Text style={styles.line}>
      Modes that can't render as a tab icon — shown here via {'<SFSymbol>'} (our
      2-layer custom symbols + a built-in one).
    </Text>

    <ModeRow label="palette">
      <SFSymbol
        name={customName(TabiconsSymbols.folder)}
        size={MODE_SIZE}
        renderingMode="palette"
        colors={{ primary: '#E5572B', secondary: '#001A72' }}
      />
      <SFSymbol
        name={customName(TabiconsSymbols.cloud)}
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
        name={customName(TabiconsSymbols.folder)}
        size={MODE_SIZE}
        renderingMode="hierarchical"
        color="#001A72"
      />
      <SFSymbol
        name={customName(TabiconsSymbols.cloud)}
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
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  title: { fontSize: 22, fontWeight: '600' },
  line: { fontSize: 15, color: '#666', textAlign: 'center' },
  note: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  code: { fontFamily: 'Menlo', fontSize: 12, color: '#444' },
  modeBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  mode: { fontSize: 13, fontWeight: '600', color: '#444' },
  row: { flexDirection: 'row', gap: 28, alignItems: 'center' },
});
