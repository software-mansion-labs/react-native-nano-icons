import { codegenNativeComponent } from 'react-native';
import type { ColorValue, ViewProps } from 'react-native';
import type { Float, Int32 } from '../const/codegenPrimitives';

export interface NativeProps extends ViewProps {
  fontFamily: string;
  codepoints: ReadonlyArray<Int32>;
  colors: ReadonlyArray<ColorValue>;
  size: Float;
  allowFontScaling: boolean;
  advanceWidth: Int32;
  unitsPerEm: Int32;
}

export default codegenNativeComponent<NativeProps>('NanoIconView', {
  interfaceOnly: true,
});
