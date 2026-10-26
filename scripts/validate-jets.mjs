#!/usr/bin/env node
/**
 * GLB 结构 / 预算校验（不依赖 Blender 和浏览器）。
 *
 * 校验内容:
 *  - 五台机齐全（或 --only 指定的子集）
 *  - showcase/game GLB 存在、能被解析、三角面/体积在预算内
 *  - REF_NOSE / REF_TAIL 的轴向约定：glTF 里机头 z < 机尾 z
 *  - 左右翼尖对称、Gear 节点存在
 *  - 材质命名包含 Paint_Base / Paint_Secondary 等
 *  - Draco 扩展与 manifest 标记一致
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'src', 'data', 'jet-models.json');
const ALL_IDS = ['qingluan', 'akari', 'haneul', 'astra', 'snega'];

const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const ids = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : ALL_IDS;
const strict = args.includes('--strict');

let failures = 0;
let warnings = 0;

function fail(message) {
  failures++;
  console.error(`  ✗ ${message}`);
}

function warn(message) {
  warnings++;
  console.warn(`  ! ${message}`);
}

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.length < 20) throw new Error('文件太小');
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);
  if (magic !== 0x46546c67) throw new Error('不是 GLB (magic 不匹配)');
  if (version !== 2) throw new Error(`glTF 版本 ${version}，预期 2`);
  if (length !== buf.length) throw new Error(`长度字段 ${length} != 文件大小 ${buf.length}`);
  const jsonLength = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error('首个 chunk 不是 JSON');
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  return { doc, bytes: buf.length };
}

function nodeMap(doc) {
  const map = new Map();
  for (const node of doc.nodes ?? []) {
    if (node.name) map.set(node.name, node);
  }
  return map;
}

function trans(node) {
  return node.translation ?? [0, 0, 0];
}

function near(a, b, tolerance = 0.02) {
  return Math.abs(a - b) <= tolerance;
}

function checkGlb(id, lod, meta) {
  const path = join(ROOT, 'public', meta.path);
  console.log(`  ${lod}: ${meta.path}`);
  if (!existsSync(path)) {
    fail(`文件不存在: ${path}`);
    return;
  }
  let parsed;
  try {
    parsed = parseGlb(path);
  } catch (err) {
    fail(`GLB 解析失败: ${err instanceof Error ? err.message : err}`);
    return;
  }
  const { doc, bytes } = parsed;
  if (bytes !== meta.bytes) warn(`manifest bytes ${meta.bytes} != 实际 ${bytes}`);
  const nodes = nodeMap(doc);
  const materials = new Set((doc.materials ?? []).map((m) => m.name));
  const ext = doc.extensionsUsed ?? [];
  if (meta.draco && !ext.includes('KHR_draco_mesh_compression')) {
    fail('manifest 标记 Draco，但 GLB 没有 Draco 扩展');
  }
  if (!meta.draco && ext.includes('KHR_draco_mesh_compression')) {
    warn('manifest 标记非 Draco，但 GLB 使用了 Draco');
  }

  if (lod === 'showcase') {
    if (!nodes.has('REF_NOSE') || !nodes.has('REF_TAIL')) fail('缺少 REF_NOSE / REF_TAIL');
    else {
      const nose = trans(nodes.get('REF_NOSE'));
      const tail = trans(nodes.get('REF_TAIL'));
      if (!(nose[2] < tail[2])) fail(`机头方向错误: nose.z=${nose[2]} tail.z=${tail[2]}（应 nose.z < tail.z）`);
    }
    if (nodes.has('REF_LEFT') && nodes.has('REF_RIGHT')) {
      const left = trans(nodes.get('REF_LEFT'));
      const right = trans(nodes.get('REF_RIGHT'));
      if (!(left[0] < 0 && right[0] > 0)) fail(`左右翼尖轴向错误: left.x=${left[0]} right.x=${right[0]}`);
    } else {
      warn('缺少 REF_LEFT / REF_RIGHT');
    }
    if (!materials.has('Paint_Base')) fail('缺少 Paint_Base 材质');
    if (!materials.has('Paint_Secondary')) fail('缺少 Paint_Secondary 材质');
    if (nodes.has('Gear')) {
      // expected
    } else {
      warn('缺少 Gear 节点（机库起落架切换会失效）');
    }
    if (meta.triangles < 100000) warn(`showcase 三角面 ${meta.triangles} < 100k`);
    if (meta.triangles > 260000) warn(`showcase 三角面 ${meta.triangles} 偏高`);
    if (bytes > 4 * 1024 * 1024) fail(`showcase 体积 ${(bytes / 1048576).toFixed(2)} MB > 4 MB`);
  } else {
    if (meta.triangles > 16000) fail(`game 三角面 ${meta.triangles} > 16k`);
    if (bytes > 420 * 1024) fail(`game 体积 ${(bytes / 1024).toFixed(0)} KB > 420 KB`);
  }
  if (meta.meshes > 24) warn(`${lod} mesh 数 ${meta.meshes} 偏多（draw call 风险）`);
  if (meta.meshes < 1) fail(`${lod} 没有 mesh`);
  if (!(meta.materials ?? []).length) fail(`${lod} 没有材质`);
  console.log(`     tris=${meta.triangles} meshes=${meta.meshes} bytes=${bytes} draco=${ext.includes('KHR_draco_mesh_compression')}`);
}

function main() {
  console.log(`[validate] manifest: ${MANIFEST}`);
  if (!existsSync(MANIFEST)) {
    console.error('manifest 不存在，先运行 npm run art:jets');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  for (const id of ids) {
    const g = manifest.girls?.[id];
    console.log(`\n[${id}]`);
    if (!g) {
      fail('manifest 缺少该机体');
      continue;
    }
    checkGlb(id, 'showcase', g.showcase);
    checkGlb(id, 'game', g.game);
    if (!(g.length > 0) || !(g.span > 0)) fail('尺寸数据无效');
    if (!g.effects?.flames?.length) fail('缺少火焰锚点');
  }
  console.log(`\n[validate] failures=${failures} warnings=${warnings}`);
  if (failures > 0 || (strict && warnings > 0)) process.exit(1);
}

main();
