// Gera os prints de referência para o time do agente (sem HUD, como a câmera do capacete vê).
// Uso: com o servidor rodando (npm start):  node scripts/reference-shots.mjs [pasta]
// Padrão: docs/referencia-agente/
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] || 'docs/referencia-agente';
const BASE = process.env.BASE || 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE + '/?autostart&immersive');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.evaluate(() => window.sim.reset());
await page.waitForTimeout(1500);

const view = (x, z, lx, ly, lz, zoom = false) =>
  page.evaluate(
    ([x, z, lx, ly, lz, zoom]) => {
      const p = window.sim._debug.player;
      p.teleport({ x, z });
      p.yaw = Math.atan2(-(lx - x), -(lz - z));
      p.pitch = Math.atan2(ly - 1.7, Math.hypot(lx - x, lz - z));
      p.zoom = zoom;
    },
    [x, z, lx, ly, lz, zoom],
  );
const snap = async (name) => {
  await page.waitForTimeout(1300);
  // mesma imagem do GET /api/snapshot (canvas puro, sem HUD)
  const url = await page.evaluate(() => window.sim.snapshot(1280));
  fs.writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('✔', name);
};

await view(-1.3, 9.6, -1.4, 1.45, 0);
await snap('01-sala-controle');
await view(-3.5, 7.75, -3.57, 1.08, 6.65, true);
await snap('02-monitor-alarmes');
await view(-2.6, 7.75, -2.89, 1.08, 6.65, true);
await snap('03-monitor-guias-laterais');
await view(0.3, 7.75, 0.18, 1.08, 6.65, true);
await snap('04-monitor-clp');
await view(6.5, 2.0, -6, 1.6, -1.5);
await snap('05-galpao-parada-emergencia');
await view(-12.05 + 0.3, 0.3, -12.05, 1.45, -0.63);
await snap('06-transdutor-ok-F1');
await view(-5.05 + 0.3, 0.3, -5.05, 1.45, -0.63);
await snap('07-transdutor-quebrado-F2');
await view(-5.05 + 0.3, 0.3, -5.05, 1.45, -0.63, true);
await snap('08-transdutor-quebrado-F2-zoom');
await view(-4.75, 0.2, -4.95, 0.0, -0.45, true);
await snap('09-fragmentos-no-chao-F2');
await page.evaluate(() => window.sim.intervene('F2'));
await page.waitForTimeout(6000);
await view(-5.05 + 0.3, 0.3, -5.05, 1.45, -0.63);
await snap('10-transdutor-substituido-F2');
await view(-1.0, 1.8, -14, 1.4, -3);
await snap('11-linha-em-producao');
await page.evaluate(() => window.sim.reset());
await browser.close();
