import {
  PX_ATTRIBUTE_VALUE,
  PX_STYLE_VALUE,
  SVG_OPEN_TAG,
  XML_FILTER,
  XML_IMAGE,
  XML_MASK,
  XML_XMLNS,
} from '../../utils/svgPatterns';
import { SVG_NS } from '../flatten/dom';

export type SvgValidation = { valid: true } | { valid: false; reason: string };

export function validateSvg(content: string): SvgValidation {
  if (XML_MASK.test(content)) {
    return { valid: false, reason: '<mask> is not supported yet' };
  }
  if (XML_FILTER.test(content)) {
    return { valid: false, reason: '<filter> is not supported yet' };
  }
  if (XML_IMAGE.test(content)) {
    return {
      valid: false,
      reason: 'embedded raster <image> is not supported yet',
    };
  }
  return { valid: true };
}

function stripPxUnits(content: string): string {
  return content
    .replace(PX_ATTRIBUTE_VALUE, '=$1$2$1')
    .replace(PX_STYLE_VALUE, '$1');
}

// ensure the svg has a xmlns attribute
export function preprocessSvg(content: string): string {
  const withUnits = stripPxUnits(content);
  if (XML_XMLNS.test(withUnits)) return withUnits;
  return withUnits.replace(SVG_OPEN_TAG, `<svg xmlns="${SVG_NS}"`);
}
