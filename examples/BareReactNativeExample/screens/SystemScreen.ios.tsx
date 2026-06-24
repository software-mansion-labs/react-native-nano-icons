import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SFSymbol } from '@react-navigation/native';

import { TabiconsSymbols } from '../assets/nanoicons/tabicons.symbols';

const customName = (n: string): never => n as never;

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

export default function SystemScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Text style={styles.title}>SF Symbol rendering modes</Text>
      <Text style={styles.line}>
        Modes that can't render as a tab icon — shown here via {'<SFSymbol>'}{' '}
        (our 2-layer custom symbols + a built-in one).
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
}

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
  modeBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  mode: { fontSize: 13, fontWeight: '600', color: '#444' },
  row: { flexDirection: 'row', gap: 28, alignItems: 'center' },
});
