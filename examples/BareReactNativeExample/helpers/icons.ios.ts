import type { Icon } from '@react-navigation/elements';

export const nano = (
  sfSymbolName: string,
  _drawableName: string,
  _tinted?: boolean,
  _width?: number,
  _height?: number,
): Icon => ({ type: 'sfSymbol', name: sfSymbolName }) as Icon;

export const system = (sfName: string, _materialName: string): Icon =>
  ({ type: 'sfSymbol', name: sfName }) as Icon;
