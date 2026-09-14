/** @jest-environment node */

import fs from 'node:fs';

import { flattenSvg } from '../src/core/flatten/index';
import { parseFlattenedSvg } from '../src/core/glyph/parse';
import { preprocessSvg } from '../src/core/glyph/validate';
import type { PathKitModule } from '../src/core/pathkit/types';
import { loadPathKit, glyphFingerprint } from './helpers/geometry';
import { CURATED } from './helpers/golden';

// freezes flattenSvg

let PathKit: PathKitModule;

beforeAll(async () => {
  PathKit = await loadPathKit();
}, 60_000);

function flatten(abs: string): string {
  const raw = fs.readFileSync(abs, 'utf8');
  return flattenSvg(preprocessSvg(raw), PathKit);
}

describe('flatten seam golden — flattenSvg output', () => {
  test.each(CURATED.map((ic) => [`${ic.feature}/${ic.name}`, ic] as const))(
    '%s: flattened output matches its frozen fingerprint',
    async (_name, ic) => {
      const out = flatten(ic.abs);

      // containers must be resolved away, never passed through
      expect(/<mask[\s>]/i.test(out)).toBe(false);
      expect(/<filter[\s>]/i.test(out)).toBe(false);
      expect(/<use[\s>]/i.test(out)).toBe(false);
      expect(/<clipPath[\s>]/i.test(out)).toBe(false);

      const parsed = parseFlattenedSvg(out);

      expect(parsed.viewBox).toHaveLength(4);
      expect(parsed.viewBox.every(Number.isFinite)).toBe(true);

      for (const p of parsed.paths) {
        expect(/^[Mm]/.test(p.d.trim())).toBe(true);
      }

      const normalized = {
        viewBox: parsed.viewBox,
        paths: parsed.paths.map((p) => ({
          fill: p.fill,
          fillRule: p.fillRule ?? null,
          shape: glyphFingerprint(PathKit, p.d),
        })),
      };

      expect(normalized).toMatchSnapshot();
    },
    180_000
  );
});
