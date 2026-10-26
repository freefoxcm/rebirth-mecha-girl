#!/usr/bin/env node
/** 战机 GLB 集成冒烟：机库高模、任务低模、控制台错误、模型状态。 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'jets', 'qa');
mkdirSync(OUT, { recursive: true });
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--disable-gpu', '--mute-audio', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text()}`);
});
page.on('requestfailed', (req) => {
  if (req.url().includes('.glb') || req.url().includes('draco')) {
    errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
  }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForShowcase(id) {
  for (let i = 0; i < 80; i++) {
    const ready = await page.evaluate((gid) => {
      const api = window.__REBIRTH__;
      if (!api) return false;
      const status = api.jetStatus();
      return Boolean(status?.find((s) => s.id === gid && s.lod === 'showcase' && s.ready));
    }, id);
    if (ready) return true;
    await wait(100);
  }
  return false;
}

const procedural = process.argv.includes('--procedural');
const url = `http://127.0.0.1:5173/?screen=hangar&view=top&test=1${procedural ? '&jets=procedural' : ''}`;
await page.goto(url, {
  waitUntil: 'domcontentloaded', timeout: 60000,
});
await page.waitForSelector('.hangar-screen', { timeout: 60000 });
await page.evaluate(() => window.__REBIRTH__.unlockAll());
await wait(1500);
console.log('BOOT', JSON.stringify(await page.evaluate(() => window.__REBIRTH__.jetStatus())));

const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const girls = onlyArg
  ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean)
  : ['qingluan', 'akari', 'haneul', 'astra', 'snega'];
for (const id of girls) {
  await page.evaluate((gid) => {
    const app = window.__REBIRTH__.app;
    app.save.selectGirl(gid);
    app.show('hangar', { view: 'top' });
  }, id);
  const ready = await waitForShowcase(id);
  await wait(1200);
  await page.screenshot({ path: join(OUT, `glb-top-${id}.png`) });
  await page.evaluate(() => window.__REBIRTH__.app.show('hangar', { view: 'showcase' }));
  await wait(900);
  await page.screenshot({ path: join(OUT, `glb-showcase-${id}.png`) });
  console.log(id, 'showcaseReady=', ready);
}
console.log('STATUS', JSON.stringify(await page.evaluate(() => window.__REBIRTH__.jetStatus())));

// 任务内 game LOD 截图
await page.evaluate(() => window.__REBIRTH__.startMission('m1', 'qingluan'));
await wait(2500);
await page.screenshot({ path: join(OUT, 'glb-mission-qingluan.png') });
console.log('MISSION', JSON.stringify(await page.evaluate(() => window.__REBIRTH__.state().viewport)));

console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
