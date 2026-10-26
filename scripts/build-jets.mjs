#!/usr/bin/env node
/**
 * Blender 战机资产构建入口。
 *
 * 用法:
 *   node scripts/build-jets.mjs --only qingluan
 *   node scripts/build-jets.mjs                 # 五台全部
 *   node scripts/build-jets.mjs --render        # 构建后渲染三视图/效果图
 *
 * Blender 位置: $env:BLENDER 或 .tools/blender/blender.exe
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(ROOT, 'artifacts', 'jets', 'build');
const MANIFEST = join(ROOT, 'src', 'data', 'jet-models.json');
const BLENDER_CANDIDATES = [
  process.env.BLENDER,
  join(ROOT, '.tools', 'blender', 'blender.exe'),
].filter(Boolean);

function findBlender() {
  for (const candidate of BLENDER_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  console.error('[jets] 找不到 Blender。');
  console.error('  运行 node scripts/setup-blender.mjs，或把 blender.exe 路径放进 $env:BLENDER');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { only: '', noDraco: false, render: false, samples: 64 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--only') out.only = args[++i] ?? '';
    else if (a.startsWith('--only=')) out.only = a.slice(7);
    else if (a === '--no-draco') out.noDraco = true;
    else if (a === '--render') out.render = true;
    else if (a === '--samples') out.samples = Number(args[++i] ?? 64);
  }
  return out;
}

function blenderVersion(blender) {
  const r = spawnSync(blender, ['-b', '--factory-startup', '--version'], {
    encoding: 'utf8', windowsHide: true,
  });
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('Blender '));
  return line ? line.trim() : 'unknown';
}

function gltfBounds(bounds) {
  if (!bounds) return null;
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  return {
    min: [x0, z0, -y1],
    max: [x1, z1, -y0],
    size: [round(x1 - x0), round(z1 - z0), round(y1 - y0)],
  };
}

function round(v, digits = 4) {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

function readSummaries(ids) {
  const result = {};
  for (const id of ids) {
    const file = join(BUILD_DIR, `${id}.json`);
    if (!existsSync(file)) {
      throw new Error(`缺少构建摘要: ${file}`);
    }
    result[id] = JSON.parse(readFileSync(file, 'utf8'));
  }
  return result;
}

function toManifest(summaries) {
  const girls = {};
  for (const [id, s] of Object.entries(summaries)) {
    girls[id] = {
      id,
      name: s.name,
      number: s.number,
      length: s.length,
      span: s.span,
      height: s.height,
      bounds: gltfBounds(s.bounds),
      showcase: {
        path: `assets/jets/${id}/showcase.glb`,
        triangles: s.showcase.triangles,
        meshes: s.showcase.meshes,
        bytes: s.showcase.bytes,
        draco: s.showcase.draco,
        materials: s.showcase.materials,
      },
      game: {
        path: `assets/jets/${id}/game.glb`,
        triangles: s.game.triangles,
        meshes: s.game.meshes,
        bytes: s.game.bytes,
        draco: s.game.draco,
        materials: s.game.materials,
      },
      effects: s.effects,
      blend: relative(ROOT, s.blend).replaceAll('\\', '/'),
    };
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    blender: summaries[Object.keys(summaries)[0]] ? blenderVersion(findBlender()) : '',
    girls,
  };
}

function printTable(girls) {
  console.log('\nid          LOD       tris     meshes    bytes');
  console.log('--------------------------------------------------');
  for (const [id, g] of Object.entries(girls)) {
    for (const lod of ['showcase', 'game']) {
      const m = g[lod];
      console.log(
        `${id.padEnd(12)}${lod.padEnd(10)}${String(m.triangles).padEnd(9)}${String(m.meshes).padEnd(10)}${m.bytes}`,
      );
    }
  }
  console.log('');
}

function main() {
  const args = parseArgs();
  const blender = findBlender();
  mkdirSync(BUILD_DIR, { recursive: true });
  console.log(`[jets] Blender: ${blender}`);
  console.log(`[jets] ${blenderVersion(blender)}`);

  const cmd = [
    '-b', '--factory-startup',
    '--python', join(ROOT, 'art', 'blender', 'build_jets.py'),
    '--', '--summary', BUILD_DIR,
  ];
  if (args.only) cmd.push('--only', args.only);
  if (args.noDraco) cmd.push('--no-draco');
  const r = spawnSync(blender, cmd, { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) {
    console.error(`[jets] Blender 构建失败 (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }

  // Keep previously built jets in the manifest when --only was used.
  const existing = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
    : { girls: {} };
  const allIds = args.only
    ? args.only.split(',').map((s) => s.trim()).filter(Boolean)
    : readdirSync(join(ROOT, 'art', 'blender', 'source'))
        .filter((f) => f.endsWith('.blend'))
        .map((f) => f.replace(/\.blend$/, ''));
  const summaries = readSummaries(allIds);
  const girls = { ...(existing.girls ?? {}), ...toManifest(summaries).girls };
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    blender: blenderVersion(blender),
    girls,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  printTable(manifest.girls);
  console.log(`[jets] manifest → ${relative(ROOT, MANIFEST)}`);

  for (const id of allIds) {
    const g = manifest.girls[id];
    if (!g) continue;
    if (g.showcase.triangles < 100000) {
      console.warn(`[jets] ${id} showcase 只有 ${g.showcase.triangles} tris（目标 ≥100k）`);
    }
    if (g.showcase.bytes > 4 * 1024 * 1024) {
      console.warn(`[jets] ${id} showcase 体积 ${(g.showcase.bytes / 1024 / 1024).toFixed(1)} MB（目标 ≤4 MB）`);
    }
  }

  if (args.render) {
    const render = spawnSync(process.execPath, [join(ROOT, 'scripts', 'render-jets.mjs'), '--only', allIds.join(',')], {
      cwd: ROOT, stdio: 'inherit', windowsHide: true,
    });
    if (render.status !== 0) process.exit(render.status ?? 1);
  }
}

try {
  main();
} catch (err) {
  console.error(`[jets] ${err instanceof Error ? err.stack ?? err.message : err}`);
  process.exit(1);
}
