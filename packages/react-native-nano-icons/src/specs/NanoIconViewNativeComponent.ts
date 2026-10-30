import { codegenNativeComponent } from 'react-native';
import type { ColorValue, ViewProps } from 'react-native';
import type { Float, Int32, WithDefault } from '../const/codegenPrimitives';

export interface NativeProps extends ViewProps {
  fontFamily: string;
  codepoints: ReadonlyArray<Int32>;
  colors: ReadonlyArray<ColorValue>;
  color?: ColorValue;
  tintLayers: ReadonlyArray<Int32>;
  size: Float;
  fontScale: Float;
  advanceWidth: Int32;
  unitsPerEm: Int32;
  squareGlyphScale?: WithDefault<Float, 0>;
}

export default codegenNativeComponent<NativeProps>('NanoIconView', {
  interfaceOnly: true,
});
