#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ROOT_README = path.join(ROOT, 'README.md');
const PKG_DIR = path.join(ROOT, 'packages/react-native-nano-icons');
const PKG_README = path.join(PKG_DIR, 'README.md');
const BACKUP = path.join(PKG_DIR, 'README.md.bak');

const REPO = 'software-mansion-labs/react-native-nano-icons';
const BRANCH = 'main';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const BLOB = `https://github.com/${REPO}/blob/${BRANCH}`;

const mode = process.argv[2];

if (mode === '--restore') {
  if (fs.existsSync(BACKUP)) {
    fs.renameSync(BACKUP, PKG_README);
    console.log('[sync-readme] restored original package README');
  } else {
    console.log('[sync-readme] no backup found, nothing to restore');
  }
  process.exit(0);
}

if (fs.existsSync(PKG_README)) {
  fs.copyFileSync(PKG_README, BACKUP);
}

let content = fs.readFileSync(ROOT_README, 'utf8');

content = content.replace(
  /packages\/react-native-nano-icons\/docs\/img\//g,
  `${RAW}/packages/react-native-nano-icons/docs/img/`,
);

content = content.replace(
  /\]\(packages\/react-native-nano-icons\/docs\/BENCHMARKS\.md\)/g,
  `](${BLOB}/packages/react-native-nano-icons/docs/BENCHMARKS.md)`,
);

content = content.replace(
  /\[`packages\/react-native-nano-icons\/`\]\(packages\/react-native-nano-icons\/\)/g,
  `[\`packages/react-native-nano-icons/\`](${BLOB}/packages/react-native-nano-icons/)`,
);

content = content.replace(
  /\]\(examples\/([^)]+)\)/g,
  `](${BLOB}/examples/$1)`,
);

content = content.replace(
  /\]\(CODE_OF_CONDUCT\.md\)/g,
  `](${BLOB}/CODE_OF_CONDUCT.md)`,
);

fs.writeFileSync(PKG_README, content);
console.log('[sync-readme] wrote root README into package with rewritten links');
