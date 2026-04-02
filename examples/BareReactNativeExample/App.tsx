import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import React from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon, SWMIconsOutline } from './Icon';

export default function App() {
  <SafeAreaProvider>
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text style={styles.subtitle}>
            Inline <Icon name="SWM_logo" size={22} /> multicolor font icon
          </Text>

          <Text style={styles.subtitle}>Standalone icon:</Text>
          <Icon name="react-logo" size={80} />
          <Pressable style={styles.button}>
            <SWMIconsOutline name="ZoomIn" size={28} color={'#007AFF'} />
            <Text style={styles.buttonText}>Go to 1k icons screen</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Icon name="person-walking" size={150} />
            <Text style={styles.caption}>
              "person-walking" font icon original
            </Text>
          </View>
          <View style={styles.rowItem}>
            <Icon
              name="person-walking"
              size={150}
              color={[
                '#FCC9A7',
                '#1F252A',
                '#FCC9A7',
                '#1F252A',
                '#092330',
                '#0C2C40',
                '#FCC9A7',
                '#FCC9A7',
                '#1C2226',
                '#123036',
                '#123036',
                '#FCF3F0',
                '#FCC9A7',
                '#F4BE9A',
                '#FCC9A7',
                '#FCC9A7',
                '#1C2226',
                '#FCC9A7',
                'red',
                '#0C2C40',
                '#FCF3F0',
                '#EADDD8',
                '#AFAFAF',
                '#D1D1D1',
                '#FCC9A7',
                '#FCC9A7',
                '#123036',
                '#EADDD8',
                '#EADDD8',
                '#1C2226',
              ]}
            />
            <Text style={styles.caption}>
              "person-walking" font icon shirt color override via color prop
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
  },
  subtitle: {
    fontSize: 22,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#007AFF',
    textAlignVertical: 'center',
    fontSize: 25,
  },
  row: {
    flexDirection: 'row',
    marginTop: 40,
  },
  rowItem: {
    alignItems: 'center',
    width: '50%',
  },
  caption: {
    textAlign: 'center',
  },
});
