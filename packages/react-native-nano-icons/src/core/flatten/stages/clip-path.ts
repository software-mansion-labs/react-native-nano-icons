import type { SvgDocument } from '../document';
import { elementTransform } from '../element';
import type { Shape } from '../shape';
import {
  applyTransform,
  fromElement,
  pathFromCommands,
  shapeCmdSeq,
  shapeStr,
} from '../shape';
import { Affine2D } from '../transform';
import { expandUses } from './use';

export function resolveClipPath(
  doc: SvgDocument,
  clipPathUrl: string,
  transform = Affine2D.identity()
): Shape {
  const clipPathEl = doc.resolveUrl(clipPathUrl, 'clipPath');
  expandUses(doc, clipPathEl);

  const clipTransform = elementTransform(clipPathEl, transform);
  const clipShapes = clipPathEl.children.map((e) =>
    applyTransform(fromElement(e), elementTransform(e, clipTransform), doc.ops)
  );

  let clip = pathFromCommands(
    doc.ops.union(
      clipShapes.map((s) => shapeCmdSeq(s)),
      clipShapes.map((s) => shapeStr(s, 'clip_rule'))
    )
  );

  const nestedClip = clipPathEl.attrib.get('clip-path');
  if (nestedClip !== undefined) {
    const clipClop = resolveClipPath(doc, nestedClip, clipTransform);

    clip = pathFromCommands(
      doc.ops.intersection(
        [shapeCmdSeq(clip), shapeCmdSeq(clipClop)],
        [shapeStr(clip, 'clip_rule'), shapeStr(clipClop, 'clip_rule')]
      )
    );
  }

  return clip;
}
