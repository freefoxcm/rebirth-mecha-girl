#!/usr/bin/env node
/**
 * Boss 战 + 结局冒烟：
 * 进入 M4 → 截图 Boss → 打到二阶段 → 拆发生器 → 三阶段 → 强制通关 → 结算 → 结局。
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
const shot = (name) => page.screenshot({ path: join(OUT, name) });

await page.goto('http://127.0.0.1:5173/?screen=mission&mission=m4&skipCutin=1&test=1&quality=low', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.mission-screen', { timeout: 60000 });
await wait(700);
await page.evaluate(() => window.__REBIRTH__.advance(1));
await wait(700);
await shot('20-boss-p1.png');
console.log('phase1:', JSON.stringify(await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  return { hp: r.boss.hp, phase: r.boss.phase, shield: r.boss.shieldActive, enemies: r.enemies.length };
})));

await page.evaluate(() => window.__REBIRTH__.damageBoss(1200));
await page.evaluate(() => window.__REBIRTH__.advance(0.5));
await wait(700);
await shot('21-boss-p2.png');
console.log('phase2:', JSON.stringify(await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  return { hp: r.boss.hp, phase: r.boss.phase, shield: r.boss.shieldActive, generators: r.boss.generatorsAlive, enemies: r.enemies.length };
})));

await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  r.enemies.filter((e) => e.tags.includes('generator')).forEach((e) => r.damageTarget(e, 999));
});
await page.evaluate(() => window.__REBIRTH__.damageBoss(1300));
await page.evaluate(() => window.__REBIRTH__.advance(0.3));
await wait(700);
await shot('22-boss-p3.png');
console.log('phase3:', JSON.stringify(await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  return { hp: r.boss.hp, phase: r.boss.phase, shield: r.boss.shieldActive, generators: r.boss.generatorsAlive, enemies: r.enemies.length };
})));

await page.evaluate(() => {
  window.__REBIRTH__.winMission();
  window.__REBIRTH__.advance(2);
});
await wait(1800);
await shot('23-boss-results.png');
console.log('results:', await page.evaluate(() => window.__REBIRTH__.state().screen));
await page.click('.results-next');
await page.waitForSelector('.dialogue-screen', { timeout: 20000 });
await wait(500);
console.log('ending dialogue:', await page.evaluate(() => window.__REBIRTH__.state().screen));
await page.evaluate(() => [...document.querySelectorAll('.dlg-control')].find((n) => n.textContent.includes('跳过'))?.click());
await page.waitForSelector('.ending-screen', { timeout: 20000 });
await wait(800);
await shot('24-ending.png');
console.log('ending screen:', await page.evaluate(() => window.__REBIRTH__.state().screen));

await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
