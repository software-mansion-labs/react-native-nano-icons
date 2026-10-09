import { codegenNativeComponent } from 'react-native';
import type { ColorValue, ViewProps } from 'react-native';
import type { Float, Int32 } from '../const/codegenPrimitives';

export interface NativeProps extends ViewProps {
  fontFamily: string;
  codepoints: ReadonlyArray<Int32>;
  colors: ReadonlyArray<ColorValue>;
  fontSize: Float;
  advanceWidth: Int32;
  unitsPerEm: Int32;
  iconWidth: Float;
  iconHeight: Float;
}

export default codegenNativeComponent<NativeProps>('NanoIconView');
