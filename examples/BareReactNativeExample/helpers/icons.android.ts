import type { Icon } from '@react-navigation/elements';

export const nano = (
  _sfSymbolName: string,
  drawableName: string,
  tinted: boolean = true,
  width?: number,
  height?: number,
): Icon => ({
  type: 'image',
  source: { uri: drawableName },
  tinted,
  width,
  height,
});

export const system = (_sfName: string, materialName: string): Icon =>
  ({ type: 'materialSymbol', name: materialName }) as Icon;
