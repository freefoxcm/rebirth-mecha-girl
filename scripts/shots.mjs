#!/usr/bin/env node
/**
 * 无头 Chrome 视觉验收：
 *   npm run shots                  # 依次截取已注册界面
 *   npm run shots -- --only=title
 *   npm run shots -- --base=http://127.0.0.1:5173
 *
 * 截图写入 artifacts/screens/，console error 会以非零退出码汇报。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'screens');
const args = process.argv.slice(2);
const baseArg = args.find((a) => a.startsWith('--base='));
const onlyArg = args.find((a) => a.startsWith('--only='));
const BASE = baseArg ? baseArg.slice('--base='.length) : 'http://127.0.0.1:5173';
const ONLY = onlyArg ? onlyArg.slice('--only='.length).split(',') : null;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('找不到 Chrome / Edge 可执行文件');
  process.exit(1);
}

const states = [
  { name: 'title', url: '/?screen=title&test=1', wait: '.title-screen' },
  { name: 'hub', url: '/?screen=hub&test=1', wait: '.hub-screen' },
  { name: 'hangar', url: '/?screen=hangar&test=1', wait: '.hangar-screen' },
  { name: 'briefing', url: '/?screen=briefing&mission=m1&test=1', wait: '.briefing-screen' },
  { name: 'dialogue', url: '/?screen=dialogue&scene=m1_before&test=1', wait: '.dialogue-screen' },
  { name: 'mission', url: '/?screen=mission&mission=m1&skipCutin=1&test=1&quality=medium', wait: '.mission-screen', delay: 3500 },
  { name: 'results', url: '/?screen=results&mission=m1&test=1', wait: '.results-screen' },
  { name: 'settings', url: '/?screen=settings&test=1', wait: '.settings-screen' },
  { name: 'codex', url: '/?screen=codex&test=1', wait: '.codex-screen' },
  { name: 'ending', url: '/?screen=ending&test=1', wait: '.ending-screen' },
];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: [
    '--enable-unsafe-swiftshader',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--force-device-scale-factor=1',
  ],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});

const errors = [];
const logs = [];
let taken = 0;

for (const state of states) {
  if (ONLY && !ONLY.includes(state.name)) continue;
  const page = await browser.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${state.name}] ${msg.type()}: ${text}`);
    if (msg.type() === 'error' && !text.includes('favicon')) errors.push(`[${state.name}] ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`[${state.name}] pageerror: ${err.message}`));

  const url = `${BASE}${state.url}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('Boolean(window.__REBIRTH__)', { timeout: 60000 });
    await page.waitForSelector(state.wait, { timeout: 30000 });
    if (state.name === 'mission') {
      await page.evaluate(() => window.__REBIRTH__.advance(2.2, true));
      await page.mouse.move(800, 700);
      await page.mouse.down({ button: 'left' });
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: join(OUT, `${state.name}.png`) });
      await page.mouse.up({ button: 'left' });
    } else {
      await new Promise((r) => setTimeout(r, state.delay ?? 1300));
      await page.screenshot({ path: join(OUT, `${state.name}.png`) });
    }
    taken++;
    console.log(`✓ ${state.name}  ${url}`);
  } catch (err) {
    errors.push(`[${state.name}] ${err.message}`);
    console.log(`✗ ${state.name}  ${err.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(`\n${taken}/${ONLY ? ONLY.length : states.length} screenshots → artifacts/screens/`);
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  if (process.env.SHOTS_VERBOSE) console.error(logs.join('\n'));
  process.exit(1);
}
