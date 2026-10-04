// Asset-catalog Contents.json emitters for custom SF Symbol sets.

export function symbolsetContentsJson(svgFilename: string): string {
  return JSON.stringify(
    {
      info: { author: 'xcode', version: 1 },
      properties: { 'symbol-rendering-intent': 'template' },
      symbols: [{ filename: svgFilename, idiom: 'universal' }],
    },
    null,
    2
  );
}

export function catalogRootContentsJson(): string {
  return JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2);
}
