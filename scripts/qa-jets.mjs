#!/usr/bin/env node
/** 五机娘设计稿俯视对照截图 + draw call 记录。 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'qa');
mkdirSync(OUT, { recursive: true });
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForShowcase(id) {
  for (let i = 0; i < 100; i++) {
    const ready = await page.evaluate((gid) => Boolean(
      window.__REBIRTH__?.jetStatus()?.find((s) => s.id === gid && s.lod === 'showcase' && s.ready),
    ), id);
    if (ready) return true;
    await wait(100);
  }
  return false;
}
await page.goto('http://127.0.0.1:5173/?screen=hangar&view=top&test=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.hangar-screen', { timeout: 60000 });
await page.evaluate(() => window.__REBIRTH__.unlockAll());
const girls = ['qingluan', 'akari', 'haneul', 'astra', 'snega'];
for (const id of girls) {
  await page.evaluate((gid) => {
    const app = window.__REBIRTH__.app;
    app.save.selectGirl(gid);
    app.show('hangar', { view: 'top' });
  }, id);
  const ready = await waitForShowcase(id);
  await wait(800);
  await page.screenshot({ path: join(OUT, `jet-top-${id}.png`) });
  const state = await page.evaluate(() => window.__REBIRTH__.state());
  console.log(id, 'showcaseReady=', ready, JSON.stringify(state.viewport));
}
await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
