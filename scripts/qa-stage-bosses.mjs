#!/usr/bin/env node
/** M1/M2/M3/M4 关底 Boss 刷新与截图。 */
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
const cases = [
  { id: 'm1', at: 46 },
  { id: 'm2', at: 52 },
  { id: 'm3', at: 68 },
  { id: 'm4', at: 3 },
];
for (const c of cases) {
  await page.goto(`http://127.0.0.1:5173/?screen=mission&mission=${c.id}&skipCutin=1&test=1&quality=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mission-screen', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));
  const info = await page.evaluate(({ at }) => {
    const r = window.__REBIRTH__.app.current.runner;
    r.player.invuln = 9999;
    let left = at;
    while (left > 0) {
      const step = Math.min(18, left);
      window.__REBIRTH__.advance(step, true);
      left -= step;
    }
    return {
      boss: r.boss ? { name: r.boss.name, kind: r.boss.spec.kind, hp: r.boss.hp, max: r.boss.maxHp, phase: r.boss.phase, x: Math.round(r.boss.x), z: Math.round(r.boss.zRel) } : null,
      time: r.time,
      waves: r.waveIndex,
      stage: r.camZ,
    };
  }, c);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `D:/workspace/games/combat-go/artifacts/qa/boss-${c.id}.png` });
  let phases = null;
  if (c.id !== 'm4') {
    phases = await page.evaluate(() => {
      const r = window.__REBIRTH__.app.current;
      const boss = r.runner.boss;
      r.debugDamageBoss(boss.maxHp * 0.4);
      const second = boss.phase;
      r.debugDamageBoss(boss.maxHp * 0.35);
      const third = boss.phase;
      return { second, third };
    });
  }
  console.log(c.id, JSON.stringify({ ...info, phases }));
}
await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
