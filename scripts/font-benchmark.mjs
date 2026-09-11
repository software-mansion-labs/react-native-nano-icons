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
    maxTimeGrowth: Number(opt('--max-time-growth', Infinity)),
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
  let points = 0;
  let glyphs = 0;
  for (const g of data.glyf) {
    if (!g.contours?.length) continue;
    glyphs += 1;
    for (const c of g.contours) points += c.length;
  }
  return { glyphs, points };
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
    '| Set | Icons | TTF bytes | Deflated | Glyphs | Points | Build median ms | Deterministic |'
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|:---:|');
  for (const s of result.sets) {
    console.log(
      `| ${s.name} | ${s.icons} | ${n(s.bytes)} | ${n(s.deflated)} | ${s.glyphs} | ${n(s.points)} | ${n(s.medianMs)} | ${s.deterministic ? 'yes' : 'no'} |`
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
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
}

function printComparison(before, after, limits) {
  const failures = [];
  console.log(`\n### Font pipeline: ${before.label} → ${after.label}\n`);
  console.log(
    '| Set | TTF before | TTF after | Δ | Deflated before | Deflated after | Δ | Points Δ | Build before ms | Build after ms | Δ |'
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const b of before.sets) {
    const a = after.sets.find((s) => s.name === b.name);
    if (!a) continue;
    console.log(
      `| ${b.name} | ${n(b.bytes)} | ${n(a.bytes)} | ${pct(b.bytes, a.bytes)} | ${n(b.deflated)} | ${n(a.deflated)} | ${pct(b.deflated, a.deflated)} | ${pct(b.points, a.points)} | ${n(b.medianMs)} | ${n(a.medianMs)} | ${pct(b.medianMs, a.medianMs)} |`
    );
    if (growth(b.bytes, a.bytes) > limits.maxSizeGrowth) {
      failures.push(
        `${b.name}: TTF grew ${pct(b.bytes, a.bytes)} (limit +${limits.maxSizeGrowth}%)`
      );
    }
    if (growth(b.medianMs, a.medianMs) > limits.maxTimeGrowth) {
      failures.push(
        `${b.name}: build time grew ${pct(b.medianMs, a.medianMs)} (limit +${limits.maxTimeGrowth}%)`
      );
    }
  }
  if (before.tarball && after.tarball) {
    console.log(
      `\nTarball: ${n(before.tarball.bytes)} → ${n(after.tarball.bytes)} bytes (${pct(before.tarball.bytes, after.tarball.bytes)}), ${before.tarball.files} → ${after.tarball.files} files`
    );
    if (
      growth(before.tarball.bytes, after.tarball.bytes) > limits.maxSizeGrowth
    ) {
      failures.push(
        `tarball grew ${pct(before.tarball.bytes, after.tarball.bytes)} (limit +${limits.maxSizeGrowth}%)`
      );
    }
  }
  const det = (r) => r.sets.every((s) => s.deterministic);
  console.log(
    `\nByte-identical rebuilds: ${before.label} ${det(before) ? 'yes' : 'no'}, ${after.label} ${det(after) ? 'yes' : 'no'}.`
  );
  if (!det(after)) failures.push('rebuilds are not byte-identical');
  if (failures.length) {
    console.log(`\n**Failed:**\n${failures.map((f) => `- ${f}`).join('\n')}`);
  }
  return failures.length === 0;
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
