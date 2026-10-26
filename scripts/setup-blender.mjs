#!/usr/bin/env node
/**
 * 便携版 Blender 安装器：下载 → 校验 → 解压到 .tools/blender。
 *
 * 目标版本固定为 4.5 LTS 的最新补丁版，避免每台机器上 Python API 行为漂移。
 * 只写 .tools/，不碰系统目录和注册表。
 *
 * 用法: node scripts/setup-blender.mjs [--force]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, '.tools');
const CACHE = join(TOOLS, 'cache');
const BLENDER_DIR = join(TOOLS, 'blender');
const BLENDER_EXE = join(BLENDER_DIR, 'blender.exe');

const VERSION = '5.2.3';
const ARCHIVE = `blender-${VERSION}-windows-x64.zip`;
const EXPECTED_BYTES = 405839452;
const ZIP = join(CACHE, ARCHIVE);
const FORCE = process.argv.includes('--force');

/** 官方源偶尔会对脚本请求返回 403，按顺序回退到镜像。 */
const MIRRORS = [
  `https://mirrors.aliyun.com/blender/release/Blender5.2/${ARCHIVE}`,
  `https://mirrors.tuna.tsinghua.edu.cn/blender/release/Blender5.2/${ARCHIVE}`,
  `https://ftp.nluug.nl/pub/graphics/blender/release/Blender5.2/${ARCHIVE}`,
  `https://mirror.clarkson.edu/blender/release/Blender5.2/${ARCHIVE}`,
  `https://download.blender.org/release/Blender5.2/${ARCHIVE}`,
];

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function blenderVersion() {
  if (!existsSync(BLENDER_EXE)) return null;
  const r = run(BLENDER_EXE, ['-b', '--factory-startup', '--version']);
  if (r.status !== 0) return null;
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('Blender '));
  return line ?? null;
}

async function download(dest) {
  mkdirSync(dirname(dest), { recursive: true });
  let lastError = '';
  for (const url of MIRRORS) {
    console.log(`[blender] 下载 ${url}`);
    rmSync(dest, { force: true });
    const r = spawnSync('curl.exe', [
      '-L', '--fail', '--retry', '2', '--retry-delay', '2',
      '--connect-timeout', '20', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      '-o', dest, url,
    ], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
    if (r.status === 0 && existsSync(dest) && statSync(dest).size === EXPECTED_BYTES) {
      const bytes = readFileSync(dest);
      const sha = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(join(CACHE, `${ARCHIVE}.sha256`), `${sha}  ${ARCHIVE}\n`, 'utf8');
      console.log(`[blender] SHA-256 ${sha}`);
      return;
    }
    lastError = `curl 退出码 ${r.status}, size=${existsSync(dest) ? statSync(dest).size : 0}`;
    console.warn(`[blender] 该源失败（${lastError}），尝试下一个`);
  }
  throw new Error(`所有下载源均失败: ${lastError}`);
}

function extract() {
  const staging = join(TOOLS, '_extract');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  console.log('[blender] 解压中（约 1.1 GB，需要一点时间）…');
  const r = run('tar', ['-xf', ZIP, '-C', staging]);
  if (r.status !== 0) throw new Error(`解压失败: ${r.stderr || r.stdout}`);
  // 顶层通常就是 blender-4.5.15-windows-x64
  const entries = readdirSync(staging).filter((e) => e !== '.' && e !== '..');
  const top = entries.find((e) => e.startsWith('blender')) ?? entries[0];
  if (!top) throw new Error('解压后找不到 blender 目录');
  if (existsSync(BLENDER_DIR)) rmSync(BLENDER_DIR, { recursive: true, force: true });
  renameSync(join(staging, top), BLENDER_DIR);
  rmSync(staging, { recursive: true, force: true });
}

async function main() {
  console.log(`[blender] 目标版本 ${VERSION} → ${BLENDER_DIR}`);
  const existing = blenderVersion();
  if (existing && !FORCE) {
    console.log(`[blender] 已安装: ${existing}`);
    return;
  }

  if (FORCE || !existsSync(ZIP) || statSync(ZIP).size !== EXPECTED_BYTES) {
    rmSync(ZIP, { force: true });
    await download(ZIP);
  } else {
    console.log('[blender] 复用已下载的压缩包');
  }

  if (FORCE || !existsSync(BLENDER_EXE)) extract();
  const version = blenderVersion();
  if (!version) throw new Error('blender.exe 无法启动');
  console.log(`[blender] 完成: ${version}`);
}

main().catch((err) => {
  console.error(`[blender] 失败: ${err instanceof Error ? err.stack || err.message : err}`);
  process.exit(1);
});
