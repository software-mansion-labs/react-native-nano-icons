import { codegenNativeComponent } from 'react-native';
import type { ViewProps } from 'react-native';
import type { Float, Int32 } from '../const/codegenPrimitives';

export interface NativeProps extends ViewProps {
  fontFamily: string;
  codepoints: ReadonlyArray<Int32>;
  colors: ReadonlyArray<Int32>;
  fontSize: Float;
  advanceWidth: Int32;
  unitsPerEm: Int32;
  iconWidth: Float;
  iconHeight: Float;
}

export default codegenNativeComponent<NativeProps>('NanoIconView');
