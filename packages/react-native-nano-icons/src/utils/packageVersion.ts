const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'react-native-nano-icons';

const FONT_TOOLCHAIN = [
  '@xmldom/xmldom',
  'cubic2quad',
  'fonteditor-core',
  'pathkit-wasm',
  'svg2ttf',
];

export function packageVersion(): string {
  return installedVersion(PACKAGE_NAME, __dirname);
}

export function fontToolchainVersions(): string[] {
  return FONT_TOOLCHAIN.map(
    (name) =>
      `${name}@${installedVersion(name, path.dirname(require.resolve(name)))}`
  );
}

function installedVersion(name: string, fromDir: string): string {
  let dir = fromDir;
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === name && typeof pkg.version === 'string') {
        return pkg.version;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate the ${name} package.json`);
    }
    dir = parent;
  }
}
