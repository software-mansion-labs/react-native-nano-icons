import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes as CT, ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  fontFamily: string;
  codepoints: ReadonlyArray<CT.Int32>;
  colors: ReadonlyArray<CT.Int32>;
  fontSize: CT.Float;
  advanceWidth: CT.Int32;
  unitsPerEm: CT.Int32;
  iconWidth: CT.Float;
  iconHeight: CT.Float;
}

export default codegenNativeComponent<NativeProps>('NanoIconView');
