#!/usr/bin/env node
/**
 * 渲染战机三视图 / 效果图。
 *
 * 用法:
 *   node scripts/render-jets.mjs --only qingluan
 *   node scripts/render-jets.mjs --only qingluan --views hero,top,side,front --samples 96
 *   node scripts/render-jets.mjs --publish        # 转 WebP 到 docs/screens/jets/
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'jets', 'renders');
const DOCS = join(ROOT, 'docs', 'screens', 'jets');
const BLENDER = process.env.BLENDER || join(ROOT, '.tools', 'blender', 'blender.exe');
const ALL_IDS = ['qingluan', 'akari', 'haneul', 'astra', 'snega'];

const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const ids = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : ALL_IDS;
const views = args.includes('--views') ? args[args.indexOf('--views') + 1] : 'hero,top,side,front';
const samples = args.includes('--samples') ? args[args.indexOf('--samples') + 1] : '64';
const resolution = args.includes('--resolution') ? args[args.indexOf('--resolution') + 1] : '1100x800';
const publish = args.includes('--publish');

if (!existsSync(BLENDER)) {
  console.error(`[render] 找不到 Blender: ${BLENDER}`);
  process.exit(1);
}

function ffmpegWebp(input, output) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6', output], {
    cwd: ROOT, windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`ffmpeg 转换失败: ${output}`);
}

for (const id of ids) {
  const blend = join(ROOT, 'art', 'blender', 'source', `${id}.blend`);
  if (!existsSync(blend)) {
    console.warn(`[render] 跳过 ${id}: 缺少 ${blend}`);
    continue;
  }
  const outDir = join(OUT, id);
  mkdirSync(outDir, { recursive: true });
  console.log(`[render] ${id} → ${outDir}`);
  const r = spawnSync(BLENDER, [
    '-b', blend,
    '--python', join(ROOT, 'art', 'blender', 'render_jets.py'),
    '--', '--out', outDir, '--views', views, '--samples', samples, '--resolution', resolution,
  ], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) {
    console.error(`[render] ${id} 渲染失败 (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

if (publish) {
  mkdirSync(DOCS, { recursive: true });
  for (const id of ids) {
    const dir = join(OUT, id);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
      ffmpegWebp(join(dir, file), join(DOCS, `${id}-${file.replace(/\.png$/, '.webp')}`));
    }
  }
  console.log(`[render] 已发布 WebP → ${DOCS}`);
}
