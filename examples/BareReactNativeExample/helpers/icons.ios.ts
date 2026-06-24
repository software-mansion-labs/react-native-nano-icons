import type { Icon } from '@react-navigation/elements';

export const nano = (
  sfSymbolName: string,
  _drawableName: string,
  _tintingMode?: 'template' | 'original',
): Icon => ({ type: 'sfSymbolAsset', name: sfSymbolName });

export const system = (sfName: string, _materialName: string): Icon =>
  ({ type: 'sfSymbol', name: sfName }) as Icon;
