import {
  DynamicColorIOS,
  Platform,
  PlatformColor,
  ScrollView,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Text, useThemeColor } from '@/components/Themed';

const IS_IOS = Platform.OS === 'ios';

// DynamicColorIOS throws off iOS, so it may only be called behind this guard.
const adaptive: ColorValue = IS_IOS
  ? DynamicColorIOS({ light: '#0a3161', dark: '#7aa7ff' })
  : PlatformColor('?android:attr/colorForeground');

const platformColors: { label: string; color: ColorValue }[] = Platform.select({
  ios: [
    {
      label: "PlatformColor('labelColor')",
      color: PlatformColor('labelColor'),
    },
    {
      label: "PlatformColor('systemRedColor')",
      color: PlatformColor('systemRedColor'),
    },
    {
      label: "PlatformColor('systemBlueColor')",
      color: PlatformColor('systemBlueColor'),
    },
  ],
  default: [
    {
      label: "PlatformColor('?attr/colorPrimary')",
      color: PlatformColor('?attr/colorPrimary'),
    },
    {
      label: "PlatformColor('@android:color/holo_red_dark')",
      color: PlatformColor('@android:color/holo_red_dark'),
    },
    {
      label: "PlatformColor('@android:color/holo_blue_dark')",
      color: PlatformColor('@android:color/holo_blue_dark'),
    },
  ],
});

// The same 24-layer palette index.tsx overrides person-walking with, except the
// four shirt layers, which are adaptive — the other 20 stay static hex.
const walkerColors: ColorValue[] = [
  '#FCC9A7',
  '#1F252A',
  '#FCC9A7',
  '#1F252A',
  '#092330',
  '#0C2C40',
  '#FCC9A7',
  '#1C2226',
  adaptive, // shirt
  adaptive, // shirt
  '#FCC9A7',
  '#F4BE9A',
  '#FCC9A7',
  '#045286',
  '#FCC9A7',
  '#ff166f',
  adaptive, // shirt
  '#EADDD8',
  '#AFAFAF',
  '#D1D1D1',
  '#FCC9A7',
  adaptive, // shirt
  '#EADDD8',
  '#1C2226',
];

const Section = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.hint}>{hint}</Text>
    {children}
  </View>
);

// The icon and the label share one ColorValue — if they ever differ, the icon
// resolved it wrong.
const Row = ({ label, color }: { label: string; color: ColorValue }) => (
  <View style={styles.row}>
    <Icon name="star" size={36} color={color} />
    <Text style={[styles.rowLabel, { color }]}>{label}</Text>
  </View>
);

export default function ColorsScreen() {
  const screenBackground = useThemeColor({}, 'screenBackground');

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: screenBackground }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.intro}>
            Every icon below shares its exact ColorValue with the text beside
            it. Toggle light/dark appearance — the two must always match.
          </Text>

          <Section
            title="DynamicColorIOS"
            hint={
              IS_IOS
                ? 'Resolves per user interface style, live, without a re-render.'
                : 'iOS only — DynamicColorIOS throws on this platform.'
            }>
            {IS_IOS ? (
              <Row
                label="DynamicColorIOS({ light: '#0a3161', dark: '#7aa7ff' })"
                color={adaptive}
              />
            ) : null}
          </Section>

          <Section
            title="PlatformColor"
            hint={
              IS_IOS
                ? 'UIColor semantic colors. labelColor is itself trait-dependent.'
                : 'Theme attributes and framework color resources.'
            }>
            {platformColors.map(({ label, color }) => (
              <Row key={label} label={label} color={color} />
            ))}
          </Section>

          <Section
            title="Adaptive layers among static ones"
            hint="Only the shirt is adaptive; the other 20 layers are static hex.">
            <View style={styles.row}>
              <Icon name="person-walking" size={110} color={walkerColors} />
              <Text style={styles.rowLabel}>
                person-walking, shirt layers adaptive
              </Text>
            </View>
          </Section>

          <Section
            title="Inline in <Text>"
            hint="Inline icons draw through a CALayer, which resolves traits separately.">
            <Text style={[styles.rowLabel, { color: adaptive }]}>
              A star <Icon name="star" size={20} color={adaptive} /> inline in a
              sentence.
            </Text>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 28,
  },
  intro: {
    fontSize: 14,
    opacity: 0.7,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
    flexShrink: 1,
  },
});
