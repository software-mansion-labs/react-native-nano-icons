// e.g. u0041.svg -> 65
export function parseCodepointFromFilename(filename: string): number {
  const m = /^u([0-9a-fA-F]+)\.svg$/.exec(filename);
  if (!m) throw new Error(`Unexpected glyph filename: ${filename}`);
  return parseInt(m[1]!, 16);
}
