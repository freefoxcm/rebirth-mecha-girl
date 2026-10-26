#!/usr/bin/env node
/**
 * 把 three 自带的 Draco 解码器复制到 public/assets/draco/。
 * 构建/开发前自动执行，产物不入库。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
const OUT = join(ROOT, 'public', 'assets', 'draco');

if (!existsSync(SRC)) {
  console.error(`[draco] 找不到 three 的 Draco 解码器: ${SRC}`);
  console.error('[draco] 请先运行 npm install');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const file of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  cpSync(join(SRC, file), join(OUT, file));
}
console.log(`[draco] 解码器 → ${OUT}`);
