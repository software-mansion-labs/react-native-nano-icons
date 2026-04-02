import { Text, Pressable, StyleSheet } from 'react-native';
import React from 'react';
import {
  NavigationProp,
  useNavigation,
} from '@react-navigation/native';
import { RootStackParamList } from '../App';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// import { startProfiling } from 'react-native-release-profiler';

function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handlePress = () => {
    // startProfiling();
    navigation.navigate('Icons');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top']} style={styles.container}>
        <Pressable style={styles.button} onPress={handlePress}>
          <Text style={styles.buttonText}>Go to 1k icons screen</Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default HomeScreen;

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
