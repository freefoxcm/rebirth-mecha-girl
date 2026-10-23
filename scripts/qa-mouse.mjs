import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader','--disable-gpu','--mute-audio'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?screen=mission&mission=m1&test=1&quality=low', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mission-screen', { timeout: 60000 });
await page.waitForSelector('.launch-skip', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 300));
await page.click('.launch-skip');
await new Promise((r) => setTimeout(r, 600));
const started = await page.evaluate(() => window.__REBIRTH__.app.current.started);

await page.mouse.move(900, 500);
await page.mouse.down({ button: 'left' });
const left = await page.evaluate(() => window.__REBIRTH__.app.input.pointerDown);
await page.mouse.up({ button: 'left' });
await page.mouse.down({ button: 'right' });
const right = await page.evaluate(() => window.__REBIRTH__.app.input.rightDown);
await page.mouse.up({ button: 'right' });

await page.click('.hud-pause');
await new Promise((r) => setTimeout(r, 400));
const paused = await page.evaluate(() => ({ paused: window.__REBIRTH__.app.current.paused, top: Boolean(document.querySelector('.pause-overlay')), cursor: document.body.style.cursor }));
await page.evaluate(() => [...document.querySelectorAll('.pause-actions button')].find((n) => n.textContent.includes('继续'))?.click());
await new Promise((r) => setTimeout(r, 300));
const resumed = await page.evaluate(() => ({ paused: window.__REBIRTH__.app.current.paused, cursor: document.body.style.cursor }));

await page.evaluate(() => window.__REBIRTH__.advance(1.5));
const stats = await page.evaluate(() => {
  const r = window.__REBIRTH__.app.current.runner;
  return { shots: r.scoring.shots, hits: r.scoring.hits, missiles: r.player.missiles };
});
console.log(JSON.stringify({ started, left, right, paused, resumed, stats, errors }));
await browser.close();
if (!started || !left || !right || !paused.paused || resumed.paused || errors.length) process.exit(1);
