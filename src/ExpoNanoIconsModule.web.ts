import { registerWebModule, NativeModule } from 'expo';

import { ExpoNanoIconsModuleEvents } from './ExpoNanoIcons.types';

class ExpoNanoIconsModule extends NativeModule<ExpoNanoIconsModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoNanoIconsModule, 'ExpoNanoIconsModule');
