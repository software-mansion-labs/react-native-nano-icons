// lxml-like element tree used by the picosvg port (Apache-2.0 heritage,
// Copyright 2020 Google LLC). Tags and attribute names use lxml's
// "{namespace}local" convention so svg.py logic ports 1:1.

import { DOMParser, type Element as XmldomElement } from '@xmldom/xmldom';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const XLINK_NS = 'http://www.w3.org/1999/xlink';

export function svgTag(local: string): string {
  return `{${SVG_NS}}${local}`;
}

export function xlinkHrefAttr(): string {
  return `{${XLINK_NS}}href`;
}

export function splitNs(name: string): [string | null, string] {
  if (name.startsWith('{')) {
    const end = name.indexOf('}');
    return [name.slice(1, end), name.slice(end + 1)];
  }
  return [null, name];
}

export function stripNs(name: string): string {
  return splitNs(name)[1];
}

export class XEl {
  tag: string;
  attrib: Map<string, string>;
  children: XEl[];
  parent: XEl | null = null;

  constructor(tag: string, attrib?: Iterable<[string, string]>) {
    this.tag = tag;
    this.attrib = new Map(attrib ?? []);
    this.children = [];
  }

  append(child: XEl): void {
    child.detach();
    child.parent = this;
    this.children.push(child);
  }

  insert(index: number, child: XEl): void {
    child.detach();
    child.parent = this;
    this.children.splice(index, 0, child);
  }

  detach(): void {
    if (this.parent) {
      const idx = this.parent.children.indexOf(this);
      if (idx !== -1) this.parent.children.splice(idx, 1);
      this.parent = null;
    }
  }

  index(child: XEl): number {
    return this.children.indexOf(child);
  }

  deepClone(): XEl {
    const copy = new XEl(this.tag, this.attrib);
    for (const child of this.children) {
      copy.append(child.deepClone());
    }
    return copy;
  }

  // this element and all descendants, document order
  *iter(): Generator<XEl, void, void> {
    yield this;
    for (const child of this.children) {
      yield* child.iter();
    }
  }
}

export function findAll(root: XEl, pred: (el: XEl) => boolean): XEl[] {
  const out: XEl[] = [];
  for (const el of root.iter()) {
    if (pred(el)) out.push(el);
  }
  return out;
}

export function safeRemove(el: XEl): void {
  el.detach();
}

// replace el with the given elements at the same position
export function replaceEl(el: XEl, replacements: XEl[]): void {
  const parent = el.parent;
  if (!parent) throw new Error('Cannot replace element without parent');
  const idx = parent.index(el);
  el.detach();
  replacements.forEach((child, childIdx) => {
    parent.insert(idx + childIdx, child);
  });
}

export function delAttrs(el: XEl, ...attrNames: string[]): void {
  for (const name of attrNames) {
    el.attrib.delete(name);
  }
}

// ---- parsing ----

function domNsToTag(node: XmldomElement): string {
  const ns = node.namespaceURI;
  return ns ? `{${ns}}${node.localName}` : node.nodeName;
}

function convertElement(node: XmldomElement): XEl {
  const el = new XEl(domNsToTag(node));
  const attrs = node.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs.item(i)!;
    if (attr.prefix === 'xmlns' || attr.nodeName === 'xmlns') {
      continue; // namespace declarations live in tags, not attrib
    }
    const name = attr.namespaceURI
      ? `{${attr.namespaceURI}}${attr.localName}`
      : attr.nodeName;
    el.attrib.set(name, attr.value);
  }
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children.item(i)!;
    // like lxml with remove_comments/remove_blank_text: elements only
    if (child.nodeType === 1) {
      el.append(convertElement(child as XmldomElement));
    }
  }
  return el;
}

export function parseSvgDocument(content: string): XEl {
  let text = content;
  // svgs are fond of not declaring xlink
  if (text.includes('xlink:') && !text.includes('xmlns:xlink')) {
    text = text.replace(
      /<svg([^>]*)>/,
      (_m, attrs: string) => `<svg${attrs} xmlns:xlink="${XLINK_NS}">`
    );
  }

  let parseError: string | null = null;
  const parser = new DOMParser({
    onError: (_level, message) => {
      parseError = parseError ?? message;
    },
  });
  const doc = parser.parseFromString(text, 'text/xml');
  const root = doc.documentElement;
  if (!root || parseError) {
    throw new Error(`Unable to parse SVG: ${parseError ?? 'no root element'}`);
  }
  return convertElement(root);
}

// ---- serialization (lxml-ish pretty print) ----

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrDisplayName(name: string): string {
  const [ns, local] = splitNs(name);
  if (ns === XLINK_NS) return `xlink:${local}`;
  if (ns === SVG_NS || ns === null) return local;
  return local; // non-svg attrs are removed before serialization
}

function tagDisplayName(tag: string): string {
  const [ns, local] = splitNs(tag);
  if (ns === SVG_NS || ns === null) return local;
  throw new Error(`Cannot serialize tag outside svg namespace: ${tag}`);
}

function usesXlink(root: XEl): boolean {
  for (const el of root.iter()) {
    for (const name of el.attrib.keys()) {
      if (splitNs(name)[0] === XLINK_NS) return true;
    }
  }
  return false;
}

function serializeEl(el: XEl, indent: number, out: string[]): void {
  const pad = '  '.repeat(indent);
  const parts = [`${pad}<${tagDisplayName(el.tag)}`];
  for (const [name, value] of el.attrib) {
    parts.push(` ${attrDisplayName(name)}="${escapeAttr(value)}"`);
  }
  if (!el.children.length) {
    parts.push('/>');
    out.push(parts.join(''));
    return;
  }
  parts.push('>');
  out.push(parts.join(''));
  for (const child of el.children) {
    serializeEl(child, indent + 1, out);
  }
  out.push(`${pad}</${tagDisplayName(el.tag)}>`);
}

export function serializeSvg(root: XEl): string {
  const out: string[] = [];
  const attrs = [`xmlns="${SVG_NS}"`];
  if (usesXlink(root)) {
    attrs.push(`xmlns:xlink="${XLINK_NS}"`);
  }
  for (const [name, value] of root.attrib) {
    attrs.push(`${attrDisplayName(name)}="${escapeAttr(value)}"`);
  }
  if (!root.children.length) {
    out.push(`<${tagDisplayName(root.tag)} ${attrs.join(' ')}/>`);
  } else {
    out.push(`<${tagDisplayName(root.tag)} ${attrs.join(' ')}>`);
    for (const child of root.children) {
      serializeEl(child, 1, out);
    }
    out.push(`</${tagDisplayName(root.tag)}>`);
  }
  return out.join('\n') + '\n';
}
