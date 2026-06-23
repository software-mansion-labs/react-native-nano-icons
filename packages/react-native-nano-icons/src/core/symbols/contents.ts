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

/**
 * Contents.json for a colored symbol (the multicolor variant), shipped as an
 * `.imageset` so its original colors survive. `original` render intent makes
 * `UIImage(named:)` return `.alwaysOriginal` (full color in the bar);
 * `preserves-vector-representation` keeps the vector scalable.
 */
export function imagesetContentsJson(svgFilename: string): string {
  return JSON.stringify(
    {
      images: [{ filename: svgFilename, idiom: 'universal' }],
      info: { author: 'xcode', version: 1 },
      properties: {
        'preserves-vector-representation': true,
        'template-rendering-intent': 'original',
      },
    },
    null,
    2
  );
}

export function catalogRootContentsJson(): string {
  return JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2);
}
