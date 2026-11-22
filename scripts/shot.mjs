// Utilitário de screenshots: node scripts/shot.mjs <outDir> [views...]
// view = nome:x,z,yaw,pitch  ou  nome:@teleport
import { chromium } from 'playwright';
const out = process.argv[2] || '.';
const views = process.argv.slice(3);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/?autostart=1' + (process.env.QS || ''));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.waitForTimeout(2500);
for (const v of views) {
  const [name, spec] = v.split(':');
  await page.evaluate((spec) => {
    const d = window.sim._debug;
    if (spec.startsWith('@')) return window.sim.teleport(spec.slice(1));
    const [x, z, yaw, pitch] = spec.split(',').map(Number);
    d.player.teleport({ x, z }, yaw, pitch || 0);
  }, spec);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  const fps = await page.evaluate(() => window.__fps);
  console.log(name, 'fps', fps);
}
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
