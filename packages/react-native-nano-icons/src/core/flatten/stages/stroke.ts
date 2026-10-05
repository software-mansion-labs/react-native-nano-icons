import type { SvgDocument } from '../document';
import type { Shape } from '../shape';
import {
  asPath,
  cloneShape,
  mightPaint,
  pathFromCommands,
  resetFields,
  strokeCommands,
} from '../shape';

// convert stroke to path; returns shapes in draw order
export function strokeToPaths(doc: SvgDocument, shape: Shape): Shape[] {
  const stroke = cloneShape(asPath(shape));
  stroke.fields.d = pathFromCommands(
    strokeCommands(shape, doc.tolerance, doc.ops)
  ).fields.d!;

  // the stroker returns paths with 'nonzero' winding fill rule
  stroke.fields.fill_rule = 'nonzero';
  stroke.fields.clip_rule = 'nonzero';

  // a few attributes move in interesting ways
  stroke.fields.opacity =
    (stroke.fields.opacity as number) *
    (stroke.fields.stroke_opacity as number);
  stroke.fields.fill = stroke.fields.stroke!;
  // fill and stroke are now different (filled) paths; fold fill_opacity
  // into opacity on each
  shape.fields.opacity =
    (shape.fields.opacity as number) * (shape.fields.fill_opacity as number);
  shape.fields.fill_opacity = 1.0;
  stroke.fields.fill_opacity = 1.0;

  // remove all the stroke settings
  for (const cleanmeup of [shape, stroke]) {
    resetFields(cleanmeup, (name) => name.startsWith('stroke'));
  }

  if (!mightPaint(shape, doc.ops)) {
    return [stroke];
  }

  // The original id doesn't correctly refer to either
  shape.fields.id = '';
  stroke.fields.id = '';

  return [shape, stroke];
}
