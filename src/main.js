import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Simulation, COMPONENT_FOR, FAULT_TYPES, MACHINES } from './sim.js';
import { buildWorld, SPAWN, ROOM, sensorWorldPos } from './world.js';
import { HMI } from './hmi.js';
import { Player } from './player.js';
import { Bridge } from './bridge.js';
import { Sound } from './audio.js';

const params = new URLSearchParams(location.search);
const LOW = params.get('quality') === 'low';
const AUTOSTART = params.has('autostart');
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ render
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.FogExp2(0x1d242b, 0.011);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 140);

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.92);
if (!LOW) composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ mundo
const sim = new Simulation();
if (params.get('hints') === '0') sim.hints = false;
if (params.get('machine') || params.get('fault')) {
  try {
    sim.setScenario({ machineId: params.get('machine') || 'F2', faultType: params.get('fault') || 'sensor_broken' }, { silent: true });
  } catch (e) {
    console.warn(e);
  }
}
const world = buildWorld(scene);
const cctvTarget = new THREE.WebGLRenderTarget(768, 456, { type: THREE.HalfFloatType });
const hmi = new HMI(sim, world.screens, cctvTarget, world.getCctvIndex);
world.applyScenario(sim);

const player = new Player(camera, renderer.domElement, world.colliders);
player.teleport(SPAWN.position, SPAWN.yaw, SPAWN.pitch);
const sound = new Sound();

// --------------------------------------------------------------- HUD utils
function toast(msg, kind = '') {
  if (sim.immersive) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
}

// --------------------------------------------------------------- comandos
function teleport(to) {
  if (to === 'control_room' || to === 'start') player.teleport(SPAWN.position, SPAWN.yaw, SPAWN.pitch);
  else if (to === 'door') player.teleport(new THREE.Vector3(4.8, 0, 7.6), 0);
  else if (to === 'hall') {
    player.teleport(new THREE.Vector3(4.8, 0, 3.6), Math.PI / 2.2);
  } else if (to === 'component' || /^F[1-4]$/.test(to)) {
    // 'component' = transdutor realmente defeituoso (ensaio); 'F1'..'F4' = transdutor daquela cadeira
    const s = sensorWorldPos(to === 'component' ? sim.machineId : to);
    player.teleport(new THREE.Vector3(s.x + 0.25, 0, 0.35));
    player.lookAt(s);
  } else if (typeof to === 'object' && to) {
    player.teleport(new THREE.Vector3(to.x, 0, to.z), to.yaw ?? player.yaw);
  } else throw new Error('Destino inválido. Use control_room, door, hall, F1..F4, component ou {x,z,yaw}.');
}

function setImmersive(on) {
  sim.immersive = !!on;
  sim.version++;
  document.body.classList.toggle('immersive', sim.immersive);
  $('real').firstChild.textContent = sim.immersive ? 'Sair do modo vida real' : 'Modo vida real';
}
function resetScenario({ teleportPlayer = true } = {}) {
  sim.reset();
  world.applyScenario(sim);
  if (teleportPlayer) teleport('control_room');
  toast('Cenário reiniciado', 'warn');
}

/** Intervenção física no transdutor de uma cadeira (o mesmo gesto em qualquer uma). */
function doIntervene(machineId, source = 'player') {
  const res = sim.intervene(machineId, source);
  if (res.changed) {
    world.playFix(sim.machineId);
    sound.connectSnap();
    setTimeout(() => sound.success(), 250);
    toast(`Transdutor ${res.componentId} substituído`, 'good');
    setTimeout(() => toast('Alarmes normalizados · partida da linha em andamento', 'good'), 1200);
  } else {
    sound.click();
    toast(`${res.componentId} substituído — nada mudou, a linha continua parada`);
  }
  return res;
}

async function execute(cmd) {
  switch (cmd.type) {
    case 'reset':
      resetScenario({ teleportPlayer: cmd.teleport !== false });
      return {};
    case 'start':
      resetScenario({ teleportPlayer: !!cmd.teleport });
      return {};
    case 'set_scenario': {
      sim.setScenario({ machineId: cmd.machineId || sim.machineId, faultType: cmd.faultType || sim.faultType });
      world.applyScenario(sim);
      if (cmd.teleport !== false) teleport('control_room');
      toast('Cenário alterado', 'warn');
      return {};
    }
    case 'ack_alarm':
      return { result: sim.ackAlarm(cmd.source || 'api') };
    case 'intervene':
      if (!/^F[1-4]$/.test(cmd.machineId || '')) throw new Error('machineId obrigatório (F1..F4)');
      return { result: doIntervene(cmd.machineId, cmd.source || 'api') };
    case 'fix':
      return { result: sim.faultActive ? doIntervene(sim.machineId, cmd.source || 'api') : null };
    case 'teleport':
      teleport(cmd.to);
      return {};
    case 'set_immersive':
      setImmersive(cmd.enabled !== false);
      return {};
    case 'set_hints':
      sim.hints = cmd.enabled !== false;
      sim.version++;
      return {};
    case 'snapshot':
      return { image: await captureFrame(cmd.width || 1280) };
    case 'get_state':
      return {};
    default:
      throw new Error(`Comando desconhecido: ${cmd.type}`);
  }
}

let snapshotWaiters = [];
function captureFrame(width = 1280) {
  return new Promise((resolve) => snapshotWaiters.push({ resolve, width }));
}

// API para uso direto no navegador (console / outro script na página)
window.sim = {
  getState: () => sim.snapshot(),
  on: (fn) => sim.on(fn),
  reset: () => execute({ type: 'reset' }),
  start: () => execute({ type: 'start' }),
  setScenario: (machineId, faultType) => execute({ type: 'set_scenario', machineId, faultType }),
  ackAlarm: () => execute({ type: 'ack_alarm' }),
  intervene: (machineId) => execute({ type: 'intervene', machineId }),
  fix: () => execute({ type: 'fix' }),
  teleport: (to) => execute({ type: 'teleport', to }),
  setHints: (enabled) => execute({ type: 'set_hints', enabled }),
  setImmersive: (enabled) => execute({ type: 'set_immersive', enabled }),
  snapshot: (w) => captureFrame(w),
  faultTypes: Object.keys(FAULT_TYPES),
  _debug: { player, camera, world, renderer, scene, sound },
};
new Bridge(sim, execute);

// --------------------------------------------------------------- entrada
let started = false;
function enter() {
  sound.init();
  const p = renderer.domElement.requestPointerLock?.();
  if (p && p.catch) p.catch(() => {});
  $('overlay').classList.add('hidden');
  player.enabled = true;
  if (!started) {
    started = true;
    toast('Alarme ativo na linha — verifique os monitores', 'warn');
  }
}
$('overlay').addEventListener('click', enter);
// o navegador só libera áudio após um gesto do usuário: qualquer clique/tecla inicia ou retoma o som
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => sound.init(), { capture: true });
$('real').addEventListener('click', (e) => {
  e.stopPropagation();
  setImmersive(!sim.immersive);
  enter();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && !AUTOSTART) {
    player.enabled = false;
    $('overlay').classList.remove('hidden');
    $('go').textContent = 'Continuar';
  }
});
// arrastar para olhar quando o pointer lock não estiver disponível
renderer.domElement.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement || !(e.buttons & 1) || !player.enabled) return;
  player.yaw -= e.movementX * 0.004;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.004));
});

let lastR = 0;
let holding = null;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!player.enabled && !AUTOSTART) return;
  if (e.code === 'KeyE') onInteractDown();
  if (e.code === 'KeyR') {
    const now = performance.now();
    if (now - lastR < 1500) {
      resetScenario();
      lastR = 0;
    } else {
      lastR = now;
      toast('Pressione R novamente para reiniciar a demo', 'warn');
    }
  }
  if (e.code === 'KeyH') {
    sim.hints = !sim.hints;
    sim.version++;
    toast(sim.hints ? 'Dicas ativadas' : 'Dicas ocultas');
  }
  if (e.code === 'KeyV') setImmersive(!sim.immersive);
  if (e.code === 'KeyM') {
    sound.setMuted(!sound.muted);
    toast(sound.muted ? 'Som desligado' : 'Som ligado');
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') holding = null;
});

// --------------------------------------------------------------- interação
const ray = new THREE.Raycaster();
ray.far = 9;
let target = null; // {kind, machineId, dist}

function currentAction() {
  if (!target) return null;
  if (target.kind === 'alarm_console') {
    if (target.dist > 2.8) return null;
    const n = sim.unackCount;
    if (n) return { key: 'E', text: `Reconhecer alarmes (${n})`, sub: 'Monitor de alarmes', run: () => sim.ackAlarm('player') && (sound.click(), toast('Alarmes reconhecidos', 'warn')) };
    return { info: true, text: sim.activeAlarms.length ? `${sim.activeAlarms.length} alarmes ativos — reconhecidos` : 'Sem alarmes ativos' };
  }
  if (target.kind === 'component') {
    if (target.dist > 2.4) return null;
    const id = COMPONENT_FOR(target.machineId).id;
    // Mesmo gesto para todos os transdutores: a simulação não revela qual está com defeito.
    return { key: 'E', hold: true, machineId: target.machineId, text: `Segure: substituir transdutor`, sub: `Transdutor ${id} · guia lateral de entrada ${target.machineId}` };
  }
  return null;
}

function onInteractDown() {
  const a = currentAction();
  if (!a || a.info) return;
  if (a.hold) holding = { t: 0, dur: 1.3 };
  else a.run();
}

function updateInteraction(dt) {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = ray.intersectObjects(world.hitboxes, false)[0];
  target = hit ? { ...hit.object.userData, dist: hit.distance } : null;
  const a = currentAction();
  const pr = $('prompt');
  if (a) {
    pr.style.display = 'block';
    pr.innerHTML = (a.key ? `<kbd>${a.key}</kbd>` : '') + a.text + (a.sub ? `<span class="sub">${a.sub}</span>` : '');
  } else pr.style.display = 'none';
  $('crosshair').classList.toggle('active', !!(a && !a.info));

  if (holding) {
    if (!a || !a.hold) holding = null;
    else {
      holding.t += dt;
      const k = Math.min(1, holding.t / holding.dur);
      $('hold').style.display = 'block';
      $('holdArc').setAttribute('stroke-dashoffset', String(163.4 * (1 - k)));
      if (k >= 1) {
        holding = null;
        doIntervene(a.machineId, 'player');
      }
    }
  }
  if (!holding) $('hold').style.display = 'none';

}

// --------------------------------------------------------------- HUD
function objectiveText() {
  const z = sim.player.zone;
  if (sim.faultType === 'none') return 'Linha operando normalmente (cenário sem falha).';
  if (sim.lineState === 'RUNNING') return '<b>Linha em produção.</b> Pressione <b>R R</b> para repetir a demo.';
  if (sim.lineState === 'RECOVERING') return 'Intervenção concluída — <b>linha em partida</b>…';
  if (sim.unackCount && z === 'control_room') return 'Parada de emergência: verifique os monitores e <b>reconheça os alarmes</b>';
  if (z === 'control_room') return 'Vá ao galpão (<b>porta à direita</b>) e <b>investigue a causa da parada</b>';
  return 'Percorra a linha <b>F1–F4</b> e encontre a causa da parada';
}

const stateLabel = { TRIPPED: ['PARADA DE EMERGÊNCIA', 'var(--red)'], RECOVERING: ['PARTINDO', 'var(--amber)'], RUNNING: ['EM PRODUÇÃO', 'var(--green)'] };
let hudTimer = 0;
function updateHUD(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.2;
  const [lbl, col] = stateLabel[sim.lineState];
  const blink = sim.lineState === 'TRIPPED' && Math.floor(performance.now() / 500) % 2;
  const n = sim.activeAlarms.length;
  const unack = sim.unackCount;
  $('status').innerHTML =
    `<div class="title">LINHA FM-01 · TREM ACABADOR</div>` +
    `<div class="state"><span class="dot" style="background:${col};opacity:${blink ? 0.3 : 1}"></span>${lbl}</div>` +
    (n ? `<div style="color:var(--red)">${n} alarmes ativos · ${unack ? unack + ' não reconhecidos' : 'reconhecidos'}</div>` : '<div style="color:var(--dim)">Sem alarmes ativos</div>');
  const ob = $('objective');
  ob.style.display = sim.hints ? 'block' : 'none';
  ob.innerHTML = objectiveText();
}

// --------------------------------------------------------------- loop
const clock = new THREE.Clock();
let frameN = 0;
let playerPushT = 0;
let fpsAcc = 0;
let fpsN = 0;
window.__fps = 0;
const snapCanvas = document.createElement('canvas');

function updatePlayerState(dt) {
  playerPushT -= dt;
  if (playerPushT > 0) return;
  playerPushT = 0.25;
  const p = player.pos;
  let zone = 'hall';
  let nearMachine = null;
  if (p.z > ROOM.z0) zone = 'control_room';
  else
    for (const m of MACHINES)
      if (Math.abs(p.x - m.x) < 3.5 && p.z < 3) {
        zone = 'machine_area';
        nearMachine = m.id;
      }
  const lookingAt = target ? (target.kind === 'component' ? COMPONENT_FOR(target.machineId).id : target.kind) : null;
  sim.updatePlayer({
    zone,
    position: { x: +p.x.toFixed(2), y: 1.7, z: +p.z.toFixed(2) },
    headingDeg: Math.round((((-player.yaw * 180) / Math.PI) % 360 + 360) % 360),
    nearMachine,
    lookingAt,
  });
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  sim.update();
  player.update(dt);
  world.update(dt, t, sim, player.pos);
  updateInteraction(dt);
  updatePlayerState(dt);
  hmi.update(t);
  updateHUD(dt);
  sound.update(sim, player.pos.z > ROOM.z0);

  // CFTV: só renderiza quando o jogador está na sala (economia) e a cada 3 quadros
  if (player.pos.z > ROOM.z0 - 1 && frameN % 3 === 0) {
    renderer.setRenderTarget(cctvTarget);
    renderer.render(scene, world.cctvCam);
    renderer.setRenderTarget(null);
  }
  composer.render(dt);
  frameN++;

  if (snapshotWaiters.length) {
    const src = renderer.domElement;
    for (const w of snapshotWaiters.splice(0)) {
      const scale = Math.min(1, w.width / src.width);
      snapCanvas.width = Math.round(src.width * scale);
      snapCanvas.height = Math.round(src.height * scale);
      snapCanvas.getContext('2d').drawImage(src, 0, 0, snapCanvas.width, snapCanvas.height);
      w.resolve(snapCanvas.toDataURL('image/jpeg', 0.82));
    }
  }
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 1) {
    window.__fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(frame);
$('loading').classList.add('hidden');
if (params.has('immersive')) setImmersive(true);
if (AUTOSTART) {
  $('overlay').classList.add('hidden');
  player.enabled = true;
  started = true;
}
window.__ready = true;
