// Asset-catalog Contents.json emitters for custom SF Symbol sets.

// A symbol drawn in more than one colour prefers multicolor, so it keeps its
// colours wherever it is shown in its original rendering.
export function symbolsetContentsJson(
  svgFilename: string,
  multicolor = false
): string {
  return JSON.stringify(
    {
      info: { author: 'xcode', version: 1 },
      properties: {
        'symbol-rendering-intent': multicolor ? 'multicolor' : 'template',
      },
      symbols: [{ filename: svgFilename, idiom: 'universal' }],
    },
    null,
    2
  );
}

export function catalogRootContentsJson(): string {
  return JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2);
}
