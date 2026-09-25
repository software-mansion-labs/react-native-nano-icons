import type { ExpoConfig } from 'expo/config';

const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;
const EAS_OWNER = process.env.EAS_OWNER;
const EAS_SLUG = process.env.EAS_SLUG;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;

const otaConfig: Partial<ExpoConfig> = EAS_PROJECT_ID
  ? {
      ...(EAS_OWNER ? { owner: EAS_OWNER } : {}),
      ...(EAS_SLUG ? { slug: EAS_SLUG } : {}),
      runtimeVersion: { policy: 'appVersion' },
      updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
      extra: { eas: { projectId: EAS_PROJECT_ID } },
    }
  : {};

const config: ExpoConfig = {
  name: 'react-native-nano-icons-example',
  slug: 'react-native-nano-icons-example',
  scheme: 'nanoicons',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.rn.nanoicons.example',
    ...(APPLE_TEAM_ID ? { appleTeamId: APPLE_TEAM_ID } : {}),
    icon: './assets/app-icon.icon',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    predictiveBackGestureEnabled: false,
    package: 'com.rn.nanoicons.example',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    ['expo-font', { fonts: [] }],
    [
      'react-native-nano-icons',
      {
        iconSets: [
          {
            inputDir: './assets/testicons',
            fontFamily: 'Testicons',
            outputDir: './assets/nanoicons',
            web: true,
          },
          {
            inputDir:
              '../../packages/react-native-nano-icons/test_icons/material_icons/twotone',
            fontFamily: 'MaterialIconsTwotone',
            outputDir: './assets/nanoicons',
            web: true,
          },
          {
            inputDir:
              '../../packages/react-native-nano-icons/test_icons/swm_icons/outline',
            fontFamily: 'SWMIconsOutline',
            outputDir: './assets/nanoicons',
            linking: 'dynamic',
            web: true,
          },
        ],
      },
    ],
    'expo-router',
  ],
  ...otaConfig,
};

export default config;
