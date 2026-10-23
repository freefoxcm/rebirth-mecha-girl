#!/usr/bin/env node
/**
 * 概念图 → WebP 资产管线
 *
 * 只读取 reference_resources/，所有产物写入 public/assets/ 与 src/data/art-manifest.json。
 * 依赖本机 ffmpeg（已在环境中）。
 *
 * 用法: node scripts/prepare-art.mjs [--force]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'reference_resources');
const OUT = join(ROOT, 'public', 'assets', 'girls');
const MANIFEST = join(ROOT, 'src', 'data', 'art-manifest.json');
const FORCE = process.argv.includes('--force');

const girls = [
  {
    id: 'qingluan',
    name: '青鸾',
    dir: '01_中国_青鸾',
    poster: '05_右侧朝左_高傲姿态游戏海报.png',
    early: '04_早期角色概念图.png',
    transform: '03_六阶段变形设计.png',
    plane: '02_战机三视图.png',
    humanoid: '01_人形三视图.png',
    face: { x: 740, y: 80 },
    bust: { x: 460, y: 40 },
  },
  {
    id: 'akari',
    name: '明璃',
    dir: '02_日本_明璃',
    poster: '06_双臂抱胸_高傲姿态海报.png',
    early: '04_早期角色概念图.png',
    transform: '03_六阶段变形设计.png',
    plane: '02_战机三视图.png',
    humanoid: '01_人形三视图.png',
    face: { x: 760, y: 80 },
    bust: { x: 480, y: 40 },
  },
  {
    id: 'haneul',
    name: '苍穹',
    dir: '03_韩国_苍穹',
    poster: '06_伸臂电子战_高傲姿态海报.png',
    early: '04_早期角色概念图.png',
    transform: '03_六阶段变形设计.png',
    plane: '02_战机三视图.png',
    humanoid: '01_人形三视图.png',
    face: { x: 760, y: 80 },
    bust: { x: 480, y: 40 },
  },
  {
    id: 'astra',
    name: '星隼',
    dir: '04_美国_星隼',
    poster: '05_右侧朝左_高傲姿态游戏海报.png',
    early: null,
    transform: '03_六阶段变形设计.png',
    plane: '02_战机三视图.png',
    humanoid: '01_人形三视图.png',
    face: { x: 740, y: 80 },
    bust: { x: 460, y: 40 },
  },
  {
    id: 'snega',
    name: '霜翼',
    dir: '05_俄罗斯_霜翼',
    poster: '05_右侧朝左_高傲姿态游戏海报.png',
    early: null,
    transform: '03_六阶段变形设计.png',
    plane: '02_战机三视图.png',
    humanoid: '01_人形三视图.png',
    face: { x: 735, y: 80 },
    bust: { x: 455, y: 40 },
  },
];

// 六阶段图的六格裁切（源图 1672x941，3 列 x 2 行）
const STAGE_CROPS = [
  [8, 8, 540, 460],
  [556, 8, 540, 460],
  [1104, 8, 540, 460],
  [8, 478, 540, 460],
  [556, 478, 540, 460],
  [1104, 478, 540, 460],
];

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (${result.status}): ${result.stderr || ''}\n${args.join(' ')}`);
  }
}

function convert(input, output, extraArgs = []) {
  const absIn = join(SRC, input);
  const absOut = join(OUT, output);
  if (!existsSync(absIn)) {
    console.warn(`  !! missing source: ${input}`);
    return false;
  }
  mkdirSync(dirname(absOut), { recursive: true });
  if (!FORCE && existsSync(absOut) && statSync(absOut).mtimeMs >= statSync(absIn).mtimeMs) {
    return true;
  }
  ffmpeg([
    '-i', absIn,
    ...extraArgs,
    '-c:v', 'libwebp',
    '-quality', '86',
    '-compression_level', '6',
    absOut,
  ]);
  return true;
}

const manifest = { generatedAt: new Date().toISOString(), girls: {} };
let count = 0;

for (const g of girls) {
  console.log(`\n[${g.id}] ${g.name}`);
  const base = g.dir;
  const outDir = g.id;
  const entry = {
    poster: `assets/girls/${outDir}/poster.webp`,
    face: `assets/girls/${outDir}/face.webp`,
    bust: `assets/girls/${outDir}/bust.webp`,
    transform: `assets/girls/${outDir}/transform.webp`,
    stages: [],
    plane: `assets/girls/${outDir}/plane.webp`,
    humanoid: `assets/girls/${outDir}/humanoid.webp`,
    early: null,
  };

  // 全身海报：1086 宽，保留原比例
  if (convert(join(base, g.poster), `${outDir}/poster.webp`, ['-vf', 'scale=1086:-1'])) count++;

  // HUD 方头像：400x400，围绕脸部
  {
    const x = Math.max(0, Math.round(g.face.x - 200));
    const y = Math.max(0, Math.round(g.face.y));
    if (convert(join(base, g.poster), `${outDir}/face.webp`,
      ['-vf', `crop=400:400:${x}:${y}`])) count++;
  }

  // 对话胸像：560x800
  {
    const x = Math.max(0, Math.round(g.bust.x));
    const y = Math.max(0, Math.round(g.bust.y));
    if (convert(join(base, g.poster), `${outDir}/bust.webp`,
      ['-vf', `crop=560:800:${x}:${y}`])) count++;
  }

  // 六阶段全图 + 六格分镜
  if (convert(join(base, g.transform), `${outDir}/transform.webp`, ['-vf', 'scale=1600:-1'])) count++;
  STAGE_CROPS.forEach(([x, y, w, h], i) => {
    const file = `${outDir}/stage-${i + 1}.webp`;
    if (convert(join(base, g.transform), file,
      ['-vf', `crop=${w}:${h}:${x}:${y},scale=640:-1`])) {
      entry.stages.push(`assets/girls/${file}`);
      count++;
    }
  });

  // 战机三视图 / 人形三视图
  if (convert(join(base, g.plane), `${outDir}/plane.webp`, ['-vf', 'scale=1400:-1'])) count++;
  if (convert(join(base, g.humanoid), `${outDir}/humanoid.webp`, ['-vf', 'scale=1400:-1'])) count++;

  // 早期概念图（部分角色有）
  if (g.early) {
    const file = `${outDir}/early.webp`;
    if (convert(join(base, g.early), file, ['-vf', 'scale=1400:-1'])) {
      entry.early = `assets/girls/${file}`;
      count++;
    }
  }

  manifest.girls[g.id] = entry;
}

mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// 统计产物体积
let bytes = 0;
for (const g of Object.values(manifest.girls)) {
  const files = [g.poster, g.face, g.bust, g.transform, g.plane, g.humanoid, ...g.stages, ...(g.early ? [g.early] : [])];
  for (const f of files) {
    const p = join(ROOT, 'public', f);
    if (existsSync(p)) bytes += statSync(p).size;
  }
}
console.log(`\n✓ ${count} files → public/assets/girls (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`✓ manifest → ${MANIFEST.slice(ROOT.length + 1)}`);
const manifestRaw = readFileSync(MANIFEST, 'utf8');
if (!manifestRaw.includes('qingluan')) {
  console.error('manifest looks wrong');
  process.exit(1);
}
