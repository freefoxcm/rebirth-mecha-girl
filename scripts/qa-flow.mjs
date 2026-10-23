#!/usr/bin/env node
/**
 * 全流程冒烟：新游戏 → 序章 → 母舰 → 简报 → 关卡 → 结算 → 战后剧情 → 母舰。
 * 通过调试 API 跳过冗长战斗，验证界面跳转与存档。
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
const screen = () => page.evaluate(() => window.__REBIRTH__?.state()?.screen ?? null);
const state = () => page.evaluate(() => window.__REBIRTH__.state());
const clickText = (selector, text) => page.evaluate((sel, t) => {
  const el = [...document.querySelectorAll(sel)].find((n) => n.textContent?.includes(t));
  if (el) el.click();
  return Boolean(el);
}, selector, text);
const skipDialogue = () => clickText('.dlg-control', '跳过');

await page.goto('http://127.0.0.1:5173/?screen=title&test=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.evaluate(() => window.__REBIRTH__.app.save.resetProgress());
await wait(400);

// 新游戏
console.log('click new game:', await clickText('.menu-item', '新的开始'));
await page.waitForSelector('.dialogue-screen', { timeout: 20000 });
await wait(400);
await page.screenshot({ path: join(OUT, '10-prologue.png') });
console.log('prologue screen:', await screen());
await skipDialogue();
await page.waitForSelector('.hub-screen', { timeout: 20000 });
await wait(500);
await page.screenshot({ path: join(OUT, '11-hub-fresh.png') });
console.log('hub:', await screen(), JSON.stringify((await state()).save.progress));

// 简报
console.log('launch:', await clickText('.launch-btn', '出击'));
await page.waitForSelector('.briefing-screen', { timeout: 20000 });
await wait(500);
await page.screenshot({ path: join(OUT, '12-briefing.png') });
console.log('briefing:', await screen());
console.log('brief launch:', await clickText('.brief-launch', '出击'));
await page.waitForSelector('.dialogue-screen', { timeout: 20000 });
await wait(300);
console.log('pre-story:', await screen());
await skipDialogue();
await page.waitForSelector('.mission-screen', { timeout: 30000 });
await wait(700);
await page.screenshot({ path: join(OUT, '13-launch-cutin.png') });
console.log('mission:', await screen());
await page.evaluate(() => document.querySelector('.launch-skip')?.click());
await wait(800);
await page.screenshot({ path: join(OUT, '14-mission.png') });
await page.evaluate(() => {
  window.__REBIRTH__.winMission();
  window.__REBIRTH__.advance(2.2);
});
await wait(2200);
await page.screenshot({ path: join(OUT, '15-results.png') });
console.log('results:', await screen(), JSON.stringify((await state()).save.progress));
await page.click('.results-next');
await page.waitForSelector('.dialogue-screen', { timeout: 20000 });
await wait(400);
await page.screenshot({ path: join(OUT, '16-after-story.png') });
console.log('after story:', await screen());
await skipDialogue();
await page.waitForSelector('.hub-screen', { timeout: 20000 });
await wait(1200);
await page.screenshot({ path: join(OUT, '17-hub-cleared.png') });
const final = await state();
console.log('final hub:', final.screen, JSON.stringify(final.save.progress), JSON.stringify(final.save.unlocks));

await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
