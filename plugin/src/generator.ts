import { loadPyodide, type PyodideInterface } from "pyodide";
import * as fs from "fs";
import * as path from "path";
import { getPackageName } from "./packageName.js";

let pyodide: PyodideInterface | null = null;

export async function generateIcons(fonts: any[], projectRoot: string) {
  const outputBase = path.join(projectRoot, "src/assets/nanoicons");

  for (const font of fonts) {
    const family = font.fontFamily || path.basename(font.sourceDir);
    const ttfPath = path.join(outputBase, `${family}.ttf`);
    const mapPath = path.join(outputBase, `${family}.glyphmap.json`);

    // 1. Requirement: Abort if files exist
    if (fs.existsSync(ttfPath) && fs.existsSync(mapPath)) {
      console.log(`[${getPackageName()}] ✅ ${family} already up to date.`);
      continue;
    }

    // 2. Initialize Pyodide Singleton once
    if (!pyodide) {
      console.log("🐍 Starting Python Engine (Pyodide)...");
      pyodide = await loadPyodide();
      await pyodide.loadPackage("micropip");
      const micropip = pyodide.pyimport("micropip");
      await micropip.install(["picosvg", "fonttools"]);
    }

    await processFont(pyodide, font, projectRoot, outputBase);
  }
}

async function processFont(
  py: PyodideInterface,
  font: any,
  projectRoot: string,
  outputBase: string,
) {
  const family = font.fontFamily || path.basename(font.sourceDir);
  const sourcePath = path.resolve(projectRoot, font.sourceDir);
  const svgFiles = fs.readdirSync(sourcePath).filter((f) => f.endsWith(".svg"));

  // Create virtual directory in Pyodide
  const vfsIn = `/input_${family}`;
  py.FS.mkdir(vfsIn);

  for (const file of svgFiles) {
    const content = fs.readFileSync(path.join(sourcePath, file), "utf8");
    py.FS.writeFile(`${vfsIn}/${file}`, content);
  }

  // Run our "Triangle Fix" and Sequential Mapping logic
  const script = `
import os
from picosvg.svg import SVG
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# [Our Python Engine Logic Goes Here]
# 1. Flatten SVGs via picosvg
# 2. Extract paths and assign sequential Unicode
# 3. Assemble TTF binary via FontBuilder
# 4. Return GlyphMap JSON
    `;

  const glyphMapJson = await py.runPythonAsync(script);

  // Save output to project
  if (!fs.existsSync(outputBase)) fs.mkdirSync(outputBase, { recursive: true });
  fs.writeFileSync(
    path.join(outputBase, `${family}.glyphmap.json`),
    glyphMapJson,
  );

  // Extract binary from Pyodide FS
  const binary = py.FS.readFile(`/output/${family}.ttf`);
  fs.writeFileSync(path.join(outputBase, `${family}.ttf`), binary);

  console.log(`✨ Created ${family} in src/assets/nanoicons`);
}
