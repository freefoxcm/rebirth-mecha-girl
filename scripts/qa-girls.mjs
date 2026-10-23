#!/usr/bin/env node
/**
 * 五机娘 + 特技冒烟：逐个切换机娘，进入关卡触发特技，并截机库展示图。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'qa');
mkdirSync(OUT, { recursive: true });
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--disable-gpu', '--mute-audio', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text()}`); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const girls = ['qingluan', 'akari', 'haneul', 'astra', 'snega'];

await page.goto('http://127.0.0.1:5173/?screen=title&test=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.evaluate(() => window.__REBIRTH__.unlockAll());
await wait(300);

for (const girl of girls) {
  await page.evaluate((id) => {
    const app = window.__REBIRTH__.app;
    app.save.selectGirl(id);
    app.show('hangar', { from: 'title' });
  }, girl);
  await wait(900);
  await page.screenshot({ path: join(OUT, `30-hangar-${girl}.png`) });
  console.log('hangar', girl, await page.evaluate(() => window.__REBIRTH__.state().screen));
}

for (const girl of girls) {
  await page.evaluate((id) => window.__REBIRTH__.startMission('m1', id), girl);
  await page.waitForSelector('.mission-screen', { timeout: 30000 });
  await wait(500);
  await page.evaluate(() => window.__REBIRTH__.advance(0.7));
  const special = await page.evaluate(() => {
    const r = window.__REBIRTH__.app.current.runner;
    r.useSpecial();
    return { cd: r.player.specialCd, kind: r.girl.special.kind, girl: r.girl.name };
  });
  await page.evaluate(() => window.__REBIRTH__.advance(0.5));
  await wait(300);
  console.log('special', JSON.stringify(special));
}

// 港湾与金融区
await page.evaluate(() => window.__REBIRTH__.startMission('m2', 'akari'));
await page.waitForSelector('.mission-screen', { timeout: 30000 });
await page.evaluate(() => window.__REBIRTH__.advance(1.2));
await wait(900);
await page.screenshot({ path: join(OUT, '31-m2-harbor.png') });

await page.evaluate(() => window.__REBIRTH__.startMission('m3', 'astra'));
await page.waitForSelector('.mission-screen', { timeout: 30000 });
await page.evaluate(() => window.__REBIRTH__.advance(1.2));
await wait(900);
await page.screenshot({ path: join(OUT, '32-m3-downtown.png') });

await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
