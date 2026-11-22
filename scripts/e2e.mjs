// Teste ponta a ponta da demo: navegador real + teclado + API HTTP.
// Uso: com o servidor rodando (npm start), execute: npm run test:e2e
// Variáveis: BASE (default http://localhost:5173), SHOTS (pasta para screenshots), PW_CHANNEL (chrome|chromium)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) failures++;
};
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, type, data: type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE + '/?autostart=1');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await page.waitForTimeout(2000);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const state = () => page.evaluate(() => window.sim.getState());
const pos = () => page.evaluate(() => ({ x: window.sim._debug.player.pos.x, z: window.sim._debug.player.pos.z }));
const face = (x, z, y = null) =>
  page.evaluate(
    ([x, z, y]) => {
      const p = window.sim._debug.player;
      p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z));
      p.pitch = y !== null ? Math.atan2(y - 1.7, Math.hypot(x - p.pos.x, z - p.pos.z)) : 0;
    },
    [x, z, y],
  );

/** Anda até (x,z) segurando W, reapontando a câmera no caminho (como o mouse faria). */
async function walkTo(x, z, tol = 0.35, timeout = 15000) {
  const t0 = Date.now();
  await face(x, z);
  await page.keyboard.down('w');
  let last = await pos();
  let stuckSince = Date.now();
  while (Date.now() - t0 < timeout) {
    await page.waitForTimeout(120);
    const p = await pos();
    if (Math.hypot(p.x - x, p.z - z) < tol) break;
    await face(x, z);
    if (Math.hypot(p.x - last.x, p.z - last.z) > 0.05) stuckSince = Date.now();
    else if (Date.now() - stuckSince > 1500) break;
    last = p;
  }
  await page.keyboard.up('w');
  await page.waitForTimeout(250);
  const p = await pos();
  return Math.hypot(p.x - x, p.z - z) < tol + 0.2;
}
const SENSOR = (sx) => ({ x: sx - 1.55, y: 1.45, z: -3 + 2.37 });
async function holdE(ms = 1600) {
  await page.keyboard.down('e');
  await page.waitForTimeout(ms);
  await page.keyboard.up('e');
  await page.waitForTimeout(300);
}

console.log('\n== 1. Estado inicial: parada de emergência ambígua');
let s = await state();
ok(s.line.state === 'TRIPPED', `linha em parada de emergência (${s.line.state})`);
ok(s.activeAlarmCount >= 5 && s.alarms.every((a) => !a.acknowledged), `enxurrada de alarmes não reconhecidos (${s.activeAlarmCount})`);
ok(new Set(s.machines.map((m) => m.state)).size === 1, `todas as cadeiras no mesmo estado (${s.machines[0].state})`);
ok(['F1', 'F2', 'F3', 'F4'].every((m) => s.plc[`${m}.GUIA_ENT.POS_FB`].quality !== 'GOOD'), 'feedback das 4 guias BAD (diagnóstico coletivo — não aponta o canal)');
ok(s.player.zone === 'control_room', `técnico começa na sala de controle (${s.player.zone})`);
const fps = await page.evaluate(() => window.__fps);
ok(fps >= 30, `desempenho: ${fps} fps`);
await shot('01-sala-controle');

console.log('\n== 2. API: observável sem gabarito; gabarito separado');
let r = await api('GET', '/api/state');
ok(r.status === 200 && !('groundTruth' in r.data), 'GET /api/state não contém groundTruth');
ok(!r.data.alarms.some((a) => /ZT-2101/.test(a.message) || /\bF2\b/.test(a.message.replace('F2/F3', ''))), 'nenhum alarme aponta a F2 ou o ZT-2101 diretamente');
r = await api('GET', '/api/truth');
ok(r.data.machineId === 'F2' && r.data.componentId === 'ZT-2101' && r.data.fixed === false, `GET /api/truth → ${r.data.machineId} / ${r.data.componentId}`);

console.log('\n== 3. Reconhecer alarmes no console (tecla E)');
await walkTo(-3.5, 7.75, 0.3);
await face(-3.57, 6.65, 1.08);
await page.waitForTimeout(300);
const prompt = await page.locator('#prompt').innerText();
ok(/Reconhecer alarmes/.test(prompt), `prompt: "${prompt.split('\n')[0].replace(/^E/, '')}"`);
await page.keyboard.press('e');
await page.waitForTimeout(300);
s = await state();
ok(s.alarms.every((a) => a.acknowledged), 'todos os alarmes reconhecidos');
await page.evaluate(() => (window.sim._debug.player.zoom = true));
await page.waitForTimeout(700);
await shot('02-alarmes-zoom');
await face(-2.89, 6.65, 1.08);
await page.waitForTimeout(600);
await shot('02b-guias-zoom');
await page.evaluate(() => (window.sim._debug.player.zoom = false));

console.log('\n== 4. Sair para o galpão (WASD + colisão + porta automática)');
ok(await walkTo(4.8, 7.6), 'chegou à porta');
ok(await walkTo(4.8, 3.6), 'atravessou a porta automática');
s = await state();
ok(s.player.zone !== 'control_room', `zona agora: ${s.player.zone}`);
await face(-6, 1.4);
await page.waitForTimeout(400);
await shot('03-galpao');

console.log('\n== 5. Palpite errado: verificar o transdutor da F1 não resolve');
ok(await walkTo(1.0, 1.4), 'andou pela passarela');
ok(await walkTo(-2.4, 1.5), 'contornou a botoeira local da F2');
ok(await walkTo(-8.0, 1.5), 'seguiu até a F1');
const s1 = SENSOR(-10.5);
ok(await walkTo(s1.x + 0.3, 0.3, 0.3), 'chegou ao transdutor da F1');
await face(s1.x, s1.z, s1.y);
await page.waitForTimeout(400);
s = await state();
ok(s.player.lookingAt === 'ZT-1101' && s.player.nearMachine === 'F1', `olhando ZT-1101 perto da F1 (${s.player.lookingAt}, ${s.player.nearMachine})`);
await shot('04-f1-transdutor-ok');
await holdE();
s = await state();
ok(s.line.state === 'TRIPPED' && s.interventions.at(-1)?.changed === false, 'intervenção na F1 registrada, sem mudança — linha continua parada');

console.log('\n== 6. Investigar a F2 (modo vida real + foto para o agente)');
await page.keyboard.press('v');
const s2 = SENSOR(-3.5);
ok(await walkTo(-6.6, 1.2), 'voltou pela passarela');
ok(await walkTo(s2.x + 0.3, 0.3, 0.3), 'chegou ao transdutor da F2');
await face(s2.x, s2.z, s2.y);
await page.waitForTimeout(600);
const hudText = await page.evaluate(() => [...document.querySelectorAll('.hud')].filter((e) => getComputedStyle(e).display !== 'none' && e.innerText.trim()).length);
ok(hudText === 0, 'modo vida real: nenhum texto na tela');
r = await api('GET', '/api/snapshot');
ok(r.status === 200 && r.type.includes('jpeg') && r.data.length > 20000, `foto da câmera do capacete → ${r.data.length} bytes`);
if (r.status === 200) fs.writeFileSync(`${SHOTS}/05-foto-capacete-f2.jpg`, r.data);
await shot('05-f2-modo-vida-real');

console.log('\n== 7. Corrigir: segurar E no transdutor certo');
await holdE();
s = await state();
ok(s.line.state === 'RECOVERING' && s.activeAlarmCount === 0, `alarmes normalizados, linha em partida (${s.line.state})`);
await page.waitForTimeout(5500);
s = await state();
ok(s.line.state === 'RUNNING', `linha em produção (${s.line.state})`);
ok(s.plc['LINHA.PERMISSIVO_GUIAS'].value === true && s.plc['F2.GUIA_ENT.POS_FB'].quality === 'GOOD', 'CLP: permissivo das guias OK');
await page.keyboard.press('v');
await face(-12, -3, 1.3);
await page.waitForTimeout(800);
await shot('06-linha-rodando');
r = await api('GET', '/api/truth');
ok(r.data.fixed === true && r.data.lineState === 'RUNNING', 'gabarito confirma correção');
r = await api('GET', '/api/state');
const evTypes = r.data.recentEvents.map((e) => e.type);
ok(['alarm_acknowledged', 'player_near_machine', 'component_intervention', 'component_fixed', 'machine_state_changed'].every((t) => evTypes.includes(t)), `eventos: ${[...new Set(evTypes)].join(', ')}`);

console.log('\n== 8. Reiniciar pela API e pelo teclado');
r = await api('POST', '/api/reset');
ok(r.status === 200 && r.data.state.line.state === 'TRIPPED' && !('groundTruth' in r.data.state), 'POST /api/reset → parada de emergência (sem gabarito na resposta)');
await page.waitForTimeout(400);
ok((await state()).player.zone === 'control_room', 'técnico voltou à sala de controle');
await api('POST', '/api/command', { type: 'teleport', to: 'F2' });
await page.waitForTimeout(400);
await holdE();
ok((await state()).line.state === 'RECOVERING', 'segunda execução: corrigido novamente');
await page.keyboard.press('r');
await page.waitForTimeout(200);
await page.keyboard.press('r');
await page.waitForTimeout(400);
s = await state();
ok(s.line.state === 'TRIPPED' && s.player.zone === 'control_room', 'R R reinicia o cenário');

console.log('\n== 9. Trocar cenário pela API (F3)');
r = await api('POST', '/api/scenario', { machineId: 'F3', faultType: 'sensor_broken' });
ok(r.status === 200 && r.data.state.line.state === 'TRIPPED', 'cenário trocado');
r = await api('GET', '/api/truth');
ok(r.data.componentId === 'ZT-3101' && r.data.faultType === 'sensor_broken', `gabarito → ${r.data.componentId} / ${r.data.faultType}`);
await api('POST', '/api/command', { type: 'teleport', to: 'F3' });
await page.waitForTimeout(1500);
await shot('07-f3-transdutor-quebrado');
r = await api('POST', '/api/command', { type: 'intervene', machineId: 'F2' });
ok(r.data.result.changed === false && r.data.state.line.state === 'TRIPPED', 'intervir na F2 (errada) não resolve');
r = await api('POST', '/api/command', { type: 'intervene', machineId: 'F3' });
ok(r.data.result.changed === true, 'intervir na F3 resolve');
r = await api('POST', '/api/command', { type: 'nada' });
ok(r.status === 400, `comando inválido → ${r.status}`);
r = await api('POST', '/api/scenario', { machineId: 'F9' });
ok(r.status === 400, `máquina inválida → ${r.status}`);
await api('POST', '/api/scenario', { machineId: 'F2', faultType: 'sensor_broken' });

ok(errors.length === 0, `sem erros no console${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(`\n${failures === 0 ? 'TODOS OS TESTES PASSARAM' : failures + ' FALHA(S)'}`);
process.exit(failures ? 1 : 0);
