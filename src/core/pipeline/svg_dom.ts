import { JSDOM } from "jsdom";

export type ParsedFlatSvg = {
  viewBox: [number, number, number, number];
  paths: Array<{ d: string; fill: string | null }>;
};

export function parseFlattenedSvg(flattenedSvg: string): ParsedFlatSvg {
  const dom = new JSDOM(flattenedSvg);
  const doc = dom.window.document;

  const svgEl = doc.querySelector("svg");
  const viewBoxRaw = svgEl
    ?.getAttribute("viewBox")
    ?.split(/\s+/)
    .map(Number) ?? [0, 0, 100, 100];

  const viewBox: [number, number, number, number] =
    viewBoxRaw.length === 4 && viewBoxRaw.every((n) => Number.isFinite(n))
      ? [viewBoxRaw[0]!, viewBoxRaw[1]!, viewBoxRaw[2]!, viewBoxRaw[3]!]
      : [0, 0, 100, 100];

  const pathEls = Array.from(doc.querySelectorAll("path"));
  const paths = pathEls
    .map((p) => ({
      d: p.getAttribute("d") ?? "",
      fill: p.getAttribute("fill"),
    }))
    .filter((p) => p.d.trim() !== "");

  return { viewBox, paths };
}

export function shouldSkipPath(d: string, fill: string | null): boolean {
  if (!d || d.trim() === "") return true;
  const f = (fill ?? "").trim().toLowerCase();
  return f === "transparent" || f === "none";
}
