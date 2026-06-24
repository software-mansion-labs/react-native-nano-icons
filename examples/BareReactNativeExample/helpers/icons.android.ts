import type { Icon } from '@react-navigation/elements';

type TintingMode = 'template' | 'original';

export const nano = (
  _sfSymbolName: string,
  drawableName: string,
  tintingMode: TintingMode = 'template',
): Icon => ({ type: 'drawableResource', name: drawableName, tintingMode });

export const system = (_sfName: string, materialName: string): Icon =>
  ({ type: 'materialSymbol', name: materialName }) as Icon;
