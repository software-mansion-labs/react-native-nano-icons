// Reexport the native module. On web, it will be resolved to ExpoNanoIconsModule.web.ts
// and on native platforms to ExpoNanoIconsModule.ts
export { default } from './ExpoNanoIconsModule';
export { default as ExpoNanoIconsView } from './ExpoNanoIconsView';
export * from  './ExpoNanoIcons.types';
