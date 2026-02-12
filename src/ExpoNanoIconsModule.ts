import { NativeModule, requireNativeModule } from 'expo';

import { ExpoNanoIconsModuleEvents } from './ExpoNanoIcons.types';

declare class ExpoNanoIconsModule extends NativeModule<ExpoNanoIconsModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoNanoIconsModule>('ExpoNanoIcons');
