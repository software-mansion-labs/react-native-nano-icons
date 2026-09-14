import { XEl, delAttrs, replaceEl, svgTag } from '../dom';
import type { SvgDocument } from '../document';
import { isDefs, isGradient, isGroup, tryRemoveGroup } from '../element';
import { INHERITABLE_ATTRIB, inheritAttrib } from '../inherit';
import type { Shape } from '../shape';
import {
  absoluteShape,
  applyTransform,
  asPath,
  cloneShape,
  fromElement,
  isShapeTag,
  pathFromCommands,
  resetFields,
  shapeCmdSeq,
  shapeStr,
  shapesEqual,
  toElement,
} from '../shape';
import { Affine2D } from '../transform';
import { addToDefs, removeOrphanedGradients } from './defs';
import { strokeToPaths } from './stroke';

export function collapse(doc: SvgDocument): void {
  doc.syncTree();

  // Reversed: we want leaves first. Materialize BEFORE mutating.
  const toProcess = [...doc.breadthFirst()].reverse();

  const defs = new XEl(svgTag('defs'));
  doc.root.insert(0, defs);

  for (const context of toProcess) {
    if (context.path.includes('clipPath')) {
      context.element.detach();
      continue;
    }

    const el = context.element;
    delAttrs(el, 'clip-path', 'transform'); // handled separately
    inheritAttrib(context.attrib, el);

    if (isShapeTag(el.tag)) {
      if (el.children.length) {
        throw new Error("Shapes shouldn't have children");
      }

      const paths: Shape[] = [absoluteShape(asPath(fromElement(el)))];
      const initialPath = cloneShape(paths[0]!);

      // stroke may introduce multiple paths
      if (shapeStr(paths[0]!, 'stroke') !== 'none') {
        paths.splice(0, paths.length, ...strokeToPaths(doc, paths[0]!));
      }

      // Any remaining stroke attributes don't do anything
      for (const path of paths) {
        resetFields(path, (name) => name.startsWith('stroke'));
      }

      // Apply any transform
      if (!context.transform.equals(Affine2D.identity())) {
        paths.forEach((p, i) => {
          paths[i] = applyTransform(p, context.transform, doc.ops);
        });
      }

      if (context.clips.length) {
        for (const p of paths) {
          // fill-rule for the shape to be clipped, clip-rule for the
          // clipping paths themselves
          const cmds = doc.ops.intersection(
            [shapeCmdSeq(p), ...context.clips.map((c) => shapeCmdSeq(c))],
            [
              shapeStr(p, 'fill_rule'),
              ...context.clips.map((c) => shapeStr(c, 'clip_rule')),
            ]
          );
          p.fields.d = pathFromCommands(cmds).fields.d!;
          // boolean operations always return nonzero winding paths
          p.fields.fill_rule = 'nonzero';
        }
      }

      if (paths.length !== 1 || !shapesEqual(paths[0]!, initialPath)) {
        replaceEl(
          el,
          paths.map((p) => toElement(p))
        );
      }
    } else if (isGradient(el.tag)) {
      el.detach();
      addToDefs(defs, el);
    } else if (isDefs(el.tag)) {
      // children were already processed; move them to master defs
      for (const childEl of [...el.children]) {
        addToDefs(defs, childEl);
      }
      el.detach();
    } else if (isGroup(el.tag)) {
      tryRemoveGroup(el);
    }
  }

  delAttrs(doc.root, ...INHERITABLE_ATTRIB);

  removeOrphanedGradients(doc);

  // After simplification only gradient defs should be referenced
  for (const unusedEl of [...defs.children]) {
    if (!isGradient(unusedEl.tag)) {
      unusedEl.detach();
    }
  }

  doc.invalidateShapes();
}
