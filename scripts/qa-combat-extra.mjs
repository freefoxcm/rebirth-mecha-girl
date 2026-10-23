#!/usr/bin/env node
/**
 * 交互冒烟：锁定/导弹、解限、重生、失败结算、暂停。
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader','--disable-gpu','--mute-audio','--hide-scrollbars'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/?screen=mission&mission=m1&skipCutin=1&test=1&quality=low', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mission-screen', { timeout: 60000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600);

const lock = await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  const input = {
    fire: false, lock: true, boost: false, throttleUp: false, throttleDown: false,
    special: false, overdrive: false,
    pointer: r.player.pos.clone().addScaledVector(r.player.forward, 500),
    arrows: { left: false, right: false, up: false, down: false },
  };
  for (let i = 0; i < 120; i++) r.update(1 / 60, input);
  const locked = r.locks.map((t) => t.name || t.type);
  input.lock = false;
  r.update(1 / 60, input);
  return { locked, missilesActive: r.missiles.filter((m) => m.active).length, charges: r.player.missiles };
});
console.log('lock:', JSON.stringify(lock));

const overdrive = await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  r.player.overdrive = 100;
  const ok = r.player.startOverdrive();
  return { ok, active: r.player.overdriveActive, timer: r.player.overdriveTimer };
});
console.log('overdrive:', JSON.stringify(overdrive));

await page.keyboard.press('Escape');
await wait(500);
await page.screenshot({ path: 'D:/workspace/games/combat-go/artifacts/qa/40-pause.png' });
console.log('pause overlay:', Boolean(await page.$('.pause-overlay')));
await page.keyboard.press('Escape');
await wait(300);

const revive = await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  r.player.invuln = 0;
  r.player.hp = 10;
  const first = r.player.damage(100);
  const hpAfter = r.player.hp;
  const event = r.player.lastEvent;
  r.update(1 / 60, {
    fire: false, lock: false, boost: false, throttleUp: false, throttleDown: false,
    special: false, overdrive: false,
    pointer: r.player.pos.clone().addScaledVector(r.player.forward, 500),
    arrows: { left: false, right: false, up: false, down: false },
  });
  r.player.invuln = 0;
  r.player.hp = 10;
  const second = r.player.damage(100);
  r.update(1 / 60, {
    fire: false, lock: false, boost: false, throttleUp: false, throttleDown: false,
    special: false, overdrive: false,
    pointer: r.player.pos.clone().addScaledVector(r.player.forward, 500),
    arrows: { left: false, right: false, up: false, down: false },
  });
  return { first, hpAfter, event, second, state: r.state, dead: r.player.dead };
});
console.log('revive:', JSON.stringify(revive));
await page.evaluate(() => window.__REBIRTH__.advance(2));
await wait(1600);
await page.screenshot({ path: 'D:/workspace/games/combat-go/artifacts/qa/41-fail.png' });
console.log('screen after fail:', await page.evaluate(() => window.__REBIRTH__.state().screen));
await browser.close();
if (errors.length) {
  console.error('ERRORS:', errors.join('\n'));
  process.exit(1);
}
console.log('OK');
