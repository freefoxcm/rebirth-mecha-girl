#!/usr/bin/env node
/**
 * 竖版模式交互冒烟：特技、解限、暂停、一次重生、二次死亡失败结算。
 */
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
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text()}`);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://127.0.0.1:5173/?screen=mission&mission=m1&skipCutin=1&test=1&quality=low', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mission-screen', { timeout: 60000 });
await wait(600);

const neutral = {
  x: 0, z: 0, fire: false, missile: false, special: false, overdrive: false, focus: false,
};

const abilities = await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  r.player.specialCd = 0;
  r.useSpecial();
  const special = { cd: r.player.specialCd, kind: r.girl.special.kind };
  r.player.overdrive = 100;
  const overdrive = r.player.startOverdrive();
  return { special, overdrive, active: r.player.overdriveActive };
});
console.log('abilities:', JSON.stringify(abilities));

await page.keyboard.press('Escape');
await wait(500);
const paused = await page.evaluate(() => ({ paused: window.__REBIRTH__.app.current.paused, top: Boolean(document.querySelector('.pause-overlay')) }));
await page.screenshot({ path: 'D:/workspace/games/combat-go/artifacts/qa/40-pause.png' });
await page.keyboard.press('Escape');
await wait(300);

const revive = await page.evaluate((n) => {
  const r = window.__REBIRTH__.app.current.runner;
  r.player.invuln = 0;
  r.player.hp = 10;
  const first = r.player.damage(100);
  const hpAfter = r.player.hp;
  r.update(1 / 60, n);
  r.player.invuln = 0;
  r.player.hp = 10;
  const second = r.player.damage(100);
  r.update(1 / 60, n);
  return { first, hpAfter, second, state: r.state, dead: r.player.dead };
}, neutral);
console.log('revive:', JSON.stringify(revive));
await page.evaluate(() => window.__REBIRTH__.advance(2));
await wait(1500);
await page.screenshot({ path: 'D:/workspace/games/combat-go/artifacts/qa/41-fail.png' });
const screen = await page.evaluate(() => window.__REBIRTH__.state().screen);
console.log('screen after fail:', screen);

await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
if (!paused.paused || !paused.top || revive.first !== 'revive' || revive.second !== 'dead' || screen !== 'results') {
  console.error('交互断言失败');
  process.exit(1);
}
console.log('OK');
