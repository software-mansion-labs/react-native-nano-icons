#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PKG = path.join(ROOT, 'packages/react-native-nano-icons');

const args = process.argv.slice(2);
const opt = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
};
const has = (flag) => args.includes(flag);

if (args[0] === '--compare') {
  const before = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  const after = JSON.parse(fs.readFileSync(args[2], 'utf8'));
  const ok = printComparison(before, after, {
    maxSizeGrowth: Number(opt('--max-size-growth', Infinity)),
    beforeSha: opt('--before-sha', ''),
    afterSha: opt('--after-sha', ''),
    repo: opt('--repo', ''),
  });
  process.exit(ok ? 0 : 1);
}

const pkgDir = path.resolve(opt('--pkg', DEFAULT_PKG));
const runs = Number(opt('--runs', 5));
const outFile = opt('--out', null);
const label = opt('--label', path.basename(pkgDir));

const requireFromPkg = createRequire(path.join(pkgDir, 'package.json'));
const { runFontPipeline } = requireFromPkg(
  './lib/commonjs/src/core/pipeline/index.js'
);
const { Font } = requireFromPkg('fonteditor-core');

const ICONS = path.join(pkgDir, 'test_icons');
const SETS = [
  ...['baseline', 'outline', 'round', 'sharp', 'twotone'].map((v) => ({
    name: `MaterialIcons_${v}`,
    inputDir: path.join(ICONS, 'material_icons', v),
  })),
  ...['outline', 'duotone', 'curved'].map((v) => ({
    name: `SWMIcons_${v}`,
    inputDir: path.join(ICONS, 'swm_icons', v),
  })),
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function n(x) {
  return x.toLocaleString('en-US');
}

function fontStats(buf) {
  const data = Font.create(buf, { type: 'ttf', hinting: false }).get();
  let glyphs = 0;
  for (const g of data.glyf) {
    if (g.contours?.length) glyphs += 1;
  }
  return { glyphs };
}

async function benchmarkSet(set, workDir) {
  const icons = fs
    .readdirSync(set.inputDir)
    .filter((f) => f.endsWith('.svg')).length;
  const times = [];
  const hashes = new Set();
  let last;
  for (let i = 0; i < runs; i++) {
    const outputDir = path.join(workDir, set.name, `out${i}`);
    const tempDir = path.join(workDir, set.name, `tmp${i}`);
    const t0 = process.hrtime.bigint();
    const res = await runFontPipeline(
      {
        fontFamily: set.name,
        upm: 1024,
        safeZone: 1020,
        startUnicode: 0xe900,
        linking: 'static',
      },
      { inputDir: set.inputDir, outputDir, tempDir }
    );
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    last = fs.readFileSync(res.ttfPath);
    hashes.add(crypto.createHash('sha256').update(last).digest('hex'));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return {
    name: set.name,
    icons,
    bytes: last.length,
    deflated: zlib.deflateSync(last, { level: 9 }).length,
    ...fontStats(last),
    medianMs: Math.round(median(times)),
    runMs: times.map(Math.round),
    deterministic: hashes.size === 1,
  };
}

function packTarball(workDir) {
  const out = path.join(workDir, 'package.tgz');
  execFileSync('yarn', ['pack', '-o', out], { cwd: pkgDir, stdio: 'ignore' });
  const files = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' })
    .trim()
    .split('\n').length;
  return { bytes: fs.statSync(out).size, files };
}

function printTable(result) {
  console.log(
    `\n### ${result.label} (node ${result.node}, ${result.runs} runs per set)\n`
  );
  console.log(
    '| Set | Icons | TTF bytes | Deflated | Glyphs | Build median ms | Deterministic |'
  );
  console.log('|---|---:|---:|---:|---:|---:|:---:|');
  for (const s of result.sets) {
    console.log(
      `| ${s.name} | ${s.icons} | ${n(s.bytes)} | ${n(s.deflated)} | ${s.glyphs} | ${n(s.medianMs)} | ${s.deterministic ? 'yes' : 'no'} |`
    );
  }
  if (result.tarball) {
    console.log(
      `\nTarball: ${n(result.tarball.bytes)} bytes, ${result.tarball.files} files`
    );
  }
}

function growth(before, after) {
  return ((after - before) / before) * 100;
}

function pct(before, after) {
  const d = growth(before, after);
  if (Math.abs(d) < 0.05) return '0.0%';
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
}

function arrow(before, after) {
  return `${n(before)} → ${n(after)} (${pct(before, after)})`;
}

function refLabel(label, sha, repo) {
  if (!sha) return `**${label}**`;
  const short = sha.slice(0, 7);
  return repo
    ? `**${label}** [\`${short}\`](${repo}/commit/${sha})`
    : `**${label}** \`${short}\``;
}

function printComparison(before, after, limits) {
  const failures = [];
  const rows = [];
  const times = [];
  for (const b of before.sets) {
    const a = after.sets.find((s) => s.name === b.name);
    if (!a) continue;
    const grew = growth(b.bytes, a.bytes) > limits.maxSizeGrowth;
    if (grew) {
      failures.push(
        `${b.name}: TTF grew ${pct(b.bytes, a.bytes)} (limit +${limits.maxSizeGrowth}%)`
      );
    }
    const name = grew ? `**${b.name}** ❌` : b.name;
    rows.push(
      `| ${name} | ${n(b.icons)} | ${arrow(b.bytes, a.bytes)} | ${arrow(b.deflated, a.deflated)} |`
    );
    times.push(
      `| ${b.name} | ${n(b.medianMs)} ms | ${n(a.medianMs)} ms | ${pct(b.medianMs, a.medianMs)} |`
    );
  }
  let tarballRow = '';
  let tarballOk = true;
  if (before.tarball && after.tarball) {
    tarballOk =
      growth(before.tarball.bytes, after.tarball.bytes) <= limits.maxSizeGrowth;
    if (!tarballOk) {
      failures.push(
        `tarball grew ${pct(before.tarball.bytes, after.tarball.bytes)} (limit +${limits.maxSizeGrowth}%)`
      );
    }
    tarballRow = `| **Tarball**${tarballOk ? '' : ' ❌'} | ${before.tarball.files} → ${after.tarball.files} files | ${arrow(before.tarball.bytes, after.tarball.bytes)} | |`;
  }
  const det = (r) => r.sets.every((s) => s.deterministic);
  if (!det(after)) failures.push('rebuilds are not byte-identical');
  const ok = failures.length === 0;
  const mark = (pass) => (pass ? '✅' : '❌');

  console.log(`## Font benchmark: ${ok ? '✅ pass' : '❌ fail'}\n`);
  console.log(
    `${refLabel(before.label, limits.beforeSha, limits.repo)} → ${refLabel(after.label, limits.afterSha, limits.repo)}. ${after.runs} runs per set. Sizes are exact; times come from separate runners.\n`
  );
  if (!ok) {
    console.log(`**Failed:**\n${failures.map((f) => `- ${f}`).join('\n')}\n`);
  }
  console.log('<details>');
  console.log(
    `<summary>${ok ? 'Details' : 'Details and failing sets'}</summary>\n`
  );
  console.log('### Size\n');
  console.log('| Set | Icons | TTF | Deflated |');
  console.log('|---|---:|---:|---:|');
  for (const r of rows) console.log(r);
  if (tarballRow) console.log(tarballRow);
  console.log('\n### Checks\n');
  console.log('| Check | Limit | Result |');
  console.log('|---|---|:---:|');
  console.log(
    `| TTF size growth | ≤ ${limits.maxSizeGrowth}% per set | ${mark(!failures.some((f) => f.includes('TTF grew')))} |`
  );
  if (before.tarball && after.tarball) {
    console.log(
      `| Tarball growth | ≤ ${limits.maxSizeGrowth}% | ${mark(tarballOk)} |`
    );
  }
  console.log(
    `| Byte-identical rebuilds | required | ${mark(det(after))} (${before.label}: ${det(before) ? 'yes' : 'no'}) |`
  );
  console.log('\n<details>');
  console.log(
    `<summary>Build time, median of ${after.runs} runs (not gated)</summary>\n`
  );
  console.log(`| Set | ${before.label} | ${after.label} | Δ |`);
  console.log('|---|---:|---:|---:|');
  for (const t of times) console.log(t);
  console.log('\n</details>');
  console.log('\n</details>');
  return ok;
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-font-benchmark-'));
const result = {
  label,
  node: process.version,
  runs,
  cpu: os.cpus()[0]?.model,
  sets: [],
};
for (const set of SETS) {
  process.stderr.write(`${set.name}…\n`);
  result.sets.push(await benchmarkSet(set, workDir));
}
if (has('--pack')) result.tarball = packTarball(workDir);
fs.rmSync(workDir, { recursive: true, force: true });
printTable(result);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
