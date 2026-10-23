#!/usr/bin/env node
/**
 * 战斗/结算冒烟：不开真实输入，用调试推进模拟。
 * 验证：开局、开火推进、强制通关、结算界面、存档写入。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'qa');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:5173';
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome not found');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--disable-gpu', '--mute-audio', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(`console: ${msg.text()}`);
});

const state = () => page.evaluate(() => window.__REBIRTH__.state());
const shot = (name) => page.screenshot({ path: join(OUT, name) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/?screen=mission&mission=m1&skipCutin=1&test=1&quality=low`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForSelector('.mission-screen', { timeout: 60000 });
await wait(600);
await page.evaluate(() => window.__REBIRTH__.advance(0.6));
await wait(700);
await shot('01-mission-start.png');
console.log('start:', JSON.stringify(await state()));

await page.evaluate(() => window.__REBIRTH__.advance(2.2, true));
await wait(900);
await shot('02-combat.png');
console.log('combat:', JSON.stringify(await state()));
console.log('runner:', JSON.stringify(await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  return { time: r.time, score: r.scoring.score, shots: r.scoring.shots, hits: r.scoring.hits, kills: r.scoring.kills, combo: r.scoring.bestCombo, enemies: r.enemies.length, hp: r.player.hp };
})));

await page.evaluate(() => {
  window.__REBIRTH__.winMission();
  window.__REBIRTH__.advance(2);
});
await wait(1800);
await shot('03-results.png');
const after = await state();
console.log('result:', JSON.stringify(after));
const hasResults = await page.$('.results-screen');
console.log('results screen:', Boolean(hasResults));

await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
if (!hasResults) {
  console.error('结算界面没有出现');
  process.exit(1);
}
console.log('OK');
