#!/usr/bin/env node
/**
 * Bare React Native workflow: build icon fonts and link them into the native project.
 *
 * Run from your app root: npx react-native-nano-icons
 *
 * Reads .nanoicons.json (same shape as Expo plugin options) so Expo and bare apps
 * share one config format.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as plist from "plist";

// In CommonJS output, require/__dirname/__filename exist at runtime.
const xcode = require("xcode") as {
  project: (pbxprojPath: string) => XcodeProject;
};

/** Run Script build phase options for xcode.addBuildPhase(..., 'PBXShellScriptBuildPhase', ..., options). */
type ShellScriptOptions = {
  shellPath?: string;
  shellScript: string;
  inputPaths?: string[];
  outputPaths?: string[];
};

type XcodeProject = {
  parseSync: () => XcodeProject;
  getFirstTarget: () => { uuid: string };
  addBuildPhase: (
    filePaths: string[],
    phaseType: string,
    comment: string,
    target: string,
    options?: ShellScriptOptions,
  ) => void;
  writeSync: () => string;
  hash: {
    project: {
      objects: Record<
        string,
        Record<string, { name?: string; shellScript?: string }>
      >;
    };
  };
};

interface BuiltFont {
  fontFamily: string;
  ttfPath: string;
  glyphmapPath: string;
}

const PKG_NAME = "react-native-nano-icons";
const ANDROID_FONTS_DIR = "android/app/src/main/assets/fonts";
/** Staging dir inside ios/ from which the Run Script build phase copies fonts into the app bundle. */
const IOS_NANOICONS_FONTS_DIR = "nanoicons-fonts";
const IOS_RUN_SCRIPT_PHASE_NAME = "Copy nanoicons fonts";

function getPackageRoot(): string {
  // Compiled output is build/scripts/cli.js → package root is ../..
  return path.resolve(__dirname, "..", "..");
}

function loadConfig(projectRoot: string): unknown[] {
  const configPath = path.join(projectRoot, ".nanoicons.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `[${PKG_NAME}] No .nanoicons.json found at project root. Create one with { "iconSets": [...] } (same format as Expo plugin options).`,
    );
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw) as { iconSets?: unknown[] };
  if (!config?.iconSets?.length) {
    throw new Error(
      `[${PKG_NAME}] .nanoicons.json must contain an "iconSets" array with at least one entry.`,
    );
  }
  return config.iconSets;
}

async function linkBare(
  projectRoot: string,
  builtFonts: BuiltFont[],
): Promise<void> {
  if (!builtFonts?.length) return;

  // ---- ANDROID ----
  const androidFontsPath = path.join(projectRoot, ANDROID_FONTS_DIR);
  fs.mkdirSync(androidFontsPath, { recursive: true });

  for (const b of builtFonts) {
    const dest = path.join(androidFontsPath, path.basename(b.ttfPath));
    fs.copyFileSync(b.ttfPath, dest);
  }

  console.log(
    `[${PKG_NAME}] ✅ Android: copied ${builtFonts.length} font(s) to ${ANDROID_FONTS_DIR}`,
  );

  // ---- IOS ----
  const iosDir = path.join(projectRoot, "ios");
  if (!fs.existsSync(iosDir)) return;

  const iosSubdirs = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  const appDir = iosSubdirs.find((d) => {
    const plistPath = path.join(iosDir, d.name, "Info.plist");
    return fs.existsSync(plistPath);
  });

  if (!appDir) {
    console.warn(
      `[${PKG_NAME}] ⚠ iOS: no ios/*/Info.plist found, skipping iOS font linking.`,
    );
    return;
  }

  const fontNames: string[] = [];
  const iosFontsStaging = path.join(iosDir, IOS_NANOICONS_FONTS_DIR);
  fs.mkdirSync(iosFontsStaging, { recursive: true });

  for (const b of builtFonts) {
    const name = path.basename(b.ttfPath);
    fontNames.push(name);
    fs.copyFileSync(b.ttfPath, path.join(iosFontsStaging, name));
  }

  const infoPlistPath = path.join(iosDir, appDir.name, "Info.plist");
  const plistContent = fs.readFileSync(infoPlistPath, "utf8");
  const obj = plist.parse(plistContent) as plist.PlistObject;

  const existing = Array.isArray((obj as any).UIAppFonts)
    ? ((obj as any).UIAppFonts as string[])
    : [];

  const merged = [...new Set([...existing, ...fontNames])];
  const updated: plist.PlistObject = { ...(obj as any), UIAppFonts: merged };
  fs.writeFileSync(infoPlistPath, plist.build(updated), "utf8");

  const xcodeprojDir = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .find((d) => d.name.endsWith(".xcodeproj"));

  if (xcodeprojDir) {
    const pbxprojPath = path.join(iosDir, xcodeprojDir.name, "project.pbxproj");
    const project = xcode.project(pbxprojPath);
    project.parseSync();

    const hasPhase = Object.entries(
      project.hash.project.objects["PBXShellScriptBuildPhase"] ?? {},
    ).some(
      ([, v]) =>
        typeof v === "object" && v?.name?.includes(IOS_RUN_SCRIPT_PHASE_NAME),
    );

    if (!hasPhase) {
      // IMPORTANT: use \${VAR} to keep Xcode variables literal inside a JS template string.
      const script = `NANOICONS_DIR="\\\${PROJECT_DIR}/${IOS_NANOICONS_FONTS_DIR}"
if [ -d "$NANOICONS_DIR" ]; then
  cp "$NANOICONS_DIR"/*.ttf "\\\${BUILT_PRODUCTS_DIR}/\\\${UNLOCALIZED_RESOURCES_FOLDER_PATH}/" 2>/dev/null || true
fi
`;

      project.addBuildPhase(
        [],
        "PBXShellScriptBuildPhase",
        IOS_RUN_SCRIPT_PHASE_NAME,
        project.getFirstTarget().uuid,
        { shellPath: "/bin/sh", shellScript: script },
      );

      fs.writeFileSync(pbxprojPath, project.writeSync(), "utf8");
    }
  }

  console.log(
    `[${PKG_NAME}] ✅ iOS: staged ${builtFonts.length} font(s) in ios/${IOS_NANOICONS_FONTS_DIR}/, updated Info.plist, and ensured "${IOS_RUN_SCRIPT_PHASE_NAME}" build phase.`,
  );
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const packageRoot = getPackageRoot();

  const iconSets = loadConfig(projectRoot);

  const buildFontsPath = path.join(
    packageRoot,
    "plugin",
    "build",
    "buildFonts.js",
  );
  if (!fs.existsSync(buildFontsPath)) {
    throw new Error(
      `[${PKG_NAME}] Plugin build not found at ${buildFontsPath}. Run \`yarn workspace react-native-nano-icons build\` or reinstall.`,
    );
  }

  // Works in Node CommonJS too; Node supports dynamic import().
  const mod: any = await import(pathToFileURL(buildFontsPath).href);

  const built: BuiltFont[] = await mod.buildAllFonts(iconSets, projectRoot);
  await linkBare(projectRoot, built);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
