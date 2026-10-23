#!/usr/bin/env node
/** 音频运行冒烟：用户手势解锁后触发分层爆炸/命中/引擎，确认无异常。 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--disable-gpu', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/?screen=mission&mission=m1&skipCutin=1&quality=low', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mission-screen', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 700));
await page.mouse.click(800, 450);
const result = await page.evaluate(() => {
  const audio = window.__REBIRTH__.app.audio;
  audio.playExplosion(2, 0.35, 'air');
  audio.playExplosion(1.2, -0.4, 'ground');
  audio.playImpact(0, 'metal');
  audio.playImpact(0.2, 'shield');
  audio.startEngine();
  audio.setEngine(true, true);
  audio.stopEngine();
  return { ready: audio.ready, kind: audio.kind };
});
await new Promise((r) => setTimeout(r, 400));
console.log('audio:', JSON.stringify(result));
await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
if (!result.ready) process.exit(1);
console.log('OK');
