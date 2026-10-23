#!/usr/bin/env node
/** 爆炸特效截图 + 相机震动衰减验证。 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--disable-gpu', '--mute-audio', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/?screen=mission&mission=m1&skipCutin=1&test=1&quality=low', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mission-screen', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => window.__REBIRTH__.advance(4, true));
await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  const p = r.player.pos.clone();
  p.z -= 36;
  r.effects.explosion(p, 2.4, 0xffa050, { surface: 'air' });
  r.effects.muzzle(p, 6, 0xffe0b0);
  window.__REBIRTH__.app.current.cameraShake.add(0.85);
  window.__REBIRTH__.advance(0.045);
});
await new Promise((r) => setTimeout(r, 80));
await page.screenshot({ path: 'D:/workspace/games/combat-go/artifacts/qa/60-explosion.png' });
const shake = await page.evaluate(() => {
  const s = window.__REBIRTH__.app.current.cameraShake;
  return { value: s.value };
});
await page.evaluate(() => window.__REBIRTH__.advance(2));
const after = await page.evaluate(() => window.__REBIRTH__.app.current.cameraShake.value);
console.log('shake:', JSON.stringify({ ...shake, after }));
await browser.close();
if (errors.length || shake.value <= 0 || after > 0.05) {
  console.error('ERRORS:', errors.join('\n'));
  process.exit(1);
}
console.log('OK');
