import * as THREE from 'three';
import { MACHINES } from './sim.js';
import * as TX from './textures.js';

// ---------------------------------------------------------------------------
// Layout (metros). Y para cima. Linha de laminação ao longo de X (fluxo para +X).
// ---------------------------------------------------------------------------
export const LZ = -3; // eixo da linha
export const LY = 1.25; // linha de passe (topo dos rolos)
export const HALL = { x0: -24, x1: 24, z0: -13, z1: 6, h: 12 };
export const ROOM = { x0: -6, x1: 6, z0: 6, z1: 13, h: 3.4 };
export const DOOR = { x0: 4.2, x1: 5.4, h: 2.3 };
export const WALK_Z_MIN = -0.4; // borda da área de circulação (lado operador)
const SENSOR_LOCAL = { x: -1.55, y: 1.45, z: 2.37 }; // cabeça do transdutor (local da cadeira)

export const SPAWN = { position: new THREE.Vector3(-1.6, 1.7, 8.75), yaw: 0.12, pitch: -0.12 };

export function standWorldPos(id) {
  const m = MACHINES.find((x) => x.id === id);
  return new THREE.Vector3(m.x, 0, LZ);
}
export function sensorWorldPos(id) {
  const p = standWorldPos(id);
  return new THREE.Vector3(p.x + SENSOR_LOCAL.x, SENSOR_LOCAL.y, p.z + SENSOR_LOCAL.z);
}

export function buildWorld(scene) {
  const colliders = [];
  const hitboxes = []; // alvos de interação (raycast)
  const animated = []; // fns (dt, t) => void
  const stands = {};
  const screens = {};

  const collide = (x0, x1, z0, z1, id) => {
    const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), enabled: true, id };
    colliders.push(c);
    return c;
  };

  // ------------------------------------------------------------------ materiais
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const concrete = TX.concreteTextures([12, 5]);
  const M = {
    floor: std({ map: concrete.map, roughnessMap: concrete.roughnessMap, roughness: 1, metalness: 0.0, color: 0xb8b8b2 }),
    wall: std({ map: TX.corrugatedTexture([16, 3]), roughness: 0.75, metalness: 0.35 }),
    wallN: std({ map: TX.corrugatedTexture([16, 3], '#7f8a93'), roughness: 0.75, metalness: 0.35 }),
    wallSide: std({ map: TX.corrugatedTexture([7, 3]), roughness: 0.75, metalness: 0.35 }),
    roof: std({ color: 0x23272b, roughness: 0.9 }),
    housing: std({ color: 0x23507a, roughness: 0.55, metalness: 0.35 }),
    housingDark: std({ color: 0x1b3650, roughness: 0.6, metalness: 0.35 }),
    steel: std({ color: 0x4a5056, roughness: 0.5, metalness: 0.7 }),
    steelDark: std({ color: 0x2b2f33, roughness: 0.55, metalness: 0.6 }),
    beam: std({ color: 0x59626b, roughness: 0.6, metalness: 0.5 }),
    roll: std({ map: TX.rollTexture(), color: 0xbfc5ca, roughness: 0.28, metalness: 1.0 }),
    chrome: std({ color: 0xe2e6ea, roughness: 0.12, metalness: 1.0 }),
    yellow: std({ color: 0xe0ab12, roughness: 0.5, metalness: 0.2 }),
    hazard: std({ map: TX.hazardTexture([8, 1]), roughness: 0.6 }),
    motor: std({ color: 0x51677a, roughness: 0.5, metalness: 0.45 }),
    gearbox: std({ color: 0x3e5d4c, roughness: 0.55, metalness: 0.4 }),
    cabinet: std({ color: 0xc9c6bb, roughness: 0.55, metalness: 0.3 }),
    black: std({ color: 0x111316, roughness: 0.5, metalness: 0.2 }),
    rubber: std({ color: 0x18191b, roughness: 0.85 }),
    cable: std({ color: 0xd86a1a, roughness: 0.55 }),
    cableNew: std({ color: 0xe57a22, roughness: 0.45 }),
    copper: std({ color: 0xd9874a, roughness: 0.3, metalness: 1, emissive: 0x331100 }),
    burnt: std({ color: 0x1c1410, roughness: 0.9 }),
    pipeGreen: std({ color: 0x3d7a4c, roughness: 0.45, metalness: 0.4 }),
    pipeBlue: std({ color: 0x2f5c9c, roughness: 0.45, metalness: 0.4 }),
    pipeOrange: std({ color: 0xc0641e, roughness: 0.45, metalness: 0.4 }),
    pipeGray: std({ color: 0x8b9095, roughness: 0.4, metalness: 0.6 }),
    roomWall: std({ color: 0xc7ced4, roughness: 0.85 }),
    roomTrim: std({ color: 0x3a4046, roughness: 0.6, metalness: 0.3 }),
    carpet: std({ map: TX.carpetTexture([6, 3.5]), roughness: 1 }),
    ceiling: std({ map: TX.ceilingTexture([20, 12]), roughness: 0.9 }),
    desk: std({ color: 0x2c3136, roughness: 0.45, metalness: 0.25 }),
    deskTop: std({ color: 0x5d636a, roughness: 0.35, metalness: 0.1 }),
    plastic: std({ color: 0x202326, roughness: 0.4 }),
    chair: std({ color: 0x1d2a38, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc3d6, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.13, depthWrite: false, envMapIntensity: 1.5, side: THREE.DoubleSide }),
    panelLight: new THREE.MeshBasicMaterial({ color: 0xfff6e8 }),
    lampLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3.4) }),
    skylight: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 2.6) }),
    helmet: std({ color: 0xf2c200, roughness: 0.35 }),
    red: std({ color: 0xb01e1e, roughness: 0.45 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
    pcb: std({ color: 0x1f6b3a, roughness: 0.5, metalness: 0.2 }),
  };

  const crackTex = TX.crackTexture();

  // ---------------------------------------------------------------- helpers
  const box = (parent, size, mat, pos, opt = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    m.position.set(...pos);
    if (opt.rot) m.rotation.set(...opt.rot);
    m.castShadow = opt.cast ?? true;
    m.receiveShadow = opt.receive ?? true;
    parent.add(m);
    return m;
  };
  const cyl = (parent, r, h, mat, pos, opt = {}) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(opt.r2 ?? r, r, h, opt.seg ?? 24, 1, opt.open ?? false), mat);
    m.position.set(...pos);
    if (opt.axis === 'x') m.rotation.z = Math.PI / 2;
    if (opt.axis === 'z') m.rotation.x = Math.PI / 2;
    if (opt.rot) m.rotation.set(...opt.rot);
    m.castShadow = opt.cast ?? true;
    m.receiveShadow = opt.receive ?? true;
    parent.add(m);
    return m;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const between = (parent, a, b, r, mat, opt = {}) => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, opt.seg ?? 14), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, vb.clone().sub(va).normalize());
    m.castShadow = opt.cast ?? true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const pipe = (parent, pts, r, mat, flanges = true) => {
    for (let i = 0; i < pts.length - 1; i++) between(parent, pts[i], pts[i + 1], r, mat);
    for (let i = 1; i < pts.length - 1; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 14, 10), mat);
      s.position.set(...pts[i]);
      parent.add(s);
    }
    if (flanges)
      for (let i = 0; i < pts.length - 1; i++) {
        const a = new THREE.Vector3(...pts[i]);
        const b = new THREE.Vector3(...pts[i + 1]);
        const len = a.distanceTo(b);
        const n = Math.floor(len / 4);
        for (let k = 1; k <= n; k++) {
          const p = a.clone().lerp(b, k / (n + 1));
          const f = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.06, 16), M.steel);
          f.position.copy(p);
          f.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
          parent.add(f);
        }
      }
  };
  const plane = (parent, w, h, mat, pos, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    parent.add(m);
    return m;
  };
  const decal = (w, d, mat, x, z, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, rotY);
    m.position.set(x, 0.006, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const label = (parent, tex, w, h, pos, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.6 }));
    m.position.set(...pos);
    m.rotation.y = rotY;
    parent.add(m);
    return m;
  };
  const railing = (x0, z0, x1, z1, y0 = 0, h = 1.1) => {
    const a = new THREE.Vector2(x0, z0);
    const b = new THREE.Vector2(x1, z1);
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      between(scene, [p.x, y0, p.y], [p.x, y0 + h, p.y], 0.025, M.yellow);
    }
    between(scene, [x0, y0 + h, z0], [x1, y0 + h, z1], 0.028, M.yellow);
    between(scene, [x0, y0 + h * 0.5, z0], [x1, y0 + h * 0.5, z1], 0.02, M.yellow);
    const kick = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.012), M.yellow);
    kick.position.set((x0 + x1) / 2, y0 + 0.07, (z0 + z1) / 2);
    kick.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    scene.add(kick);
  };

  // ------------------------------------------------------------- galpão
  const W = HALL.x1 - HALL.x0;
  const D = HALL.z1 - HALL.z0;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (HALL.z0 + HALL.z1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // paredes (não projetam sombra para a luz entrar pelo telhado)
  const wallPiece = (x0, x1, y0, y1, z, mat, thick = 0.25) => box(scene, [x1 - x0, y1 - y0, thick], mat, [(x0 + x1) / 2, (y0 + y1) / 2, z], { cast: false });
  const wallPieceX = (z0, z1, y0, y1, x, mat, thick = 0.25) => box(scene, [thick, y1 - y0, z1 - z0], mat, [x, (y0 + y1) / 2, (z0 + z1) / 2], { cast: false });
  wallPiece(HALL.x0, HALL.x1, 0, HALL.h, HALL.z0 - 0.12, M.wallN);
  collide(HALL.x0, HALL.x1, HALL.z0 - 1, HALL.z0 + 0.1);
  // oeste / leste com aberturas para a tira
  const op = { z0: LZ - 1.4, z1: LZ + 1.4, y1: 2.6 };
  for (const [x, sgn] of [
    [HALL.x0 - 0.12, -1],
    [HALL.x1 + 0.12, 1],
  ]) {
    wallPieceX(HALL.z0, op.z0, 0, HALL.h, x, M.wallSide);
    wallPieceX(op.z1, HALL.z1, 0, HALL.h, x, M.wallSide);
    wallPieceX(op.z0, op.z1, op.y1, HALL.h, x, M.wallSide);
    collide(x - 1, x + 1, HALL.z0, HALL.z1);
    // túnel escuro atrás da abertura
    box(scene, [3, op.y1, 0.2], M.steelDark, [x + sgn * 1.5, op.y1 / 2, op.z0], { cast: false });
    box(scene, [3, op.y1, 0.2], M.steelDark, [x + sgn * 1.5, op.y1 / 2, op.z1], { cast: false });
    box(scene, [3, 0.2, op.z1 - op.z0], M.steelDark, [x + sgn * 1.5, op.y1, LZ], { cast: false });
    box(scene, [3, 0.1, op.z1 - op.z0], M.steelDark, [x + sgn * 1.5, -0.04, LZ], { cast: false });
  }
  // brilho do forno/desbastador a oeste
  const furnaceGlow = plane(scene, op.z1 - op.z0, op.y1, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.25) }), [HALL.x0 - 2.9, op.y1 / 2, LZ], [0, Math.PI / 2, 0]);
  plane(scene, op.z1 - op.z0, op.y1, new THREE.MeshBasicMaterial({ color: 0x050505 }), [HALL.x1 + 2.9, op.y1 / 2, LZ], [0, -Math.PI / 2, 0]);
  const furnaceLight = new THREE.PointLight(0xff6a1a, 25, 14, 2);
  furnaceLight.position.set(HALL.x0 - 0.5, 1.6, LZ);
  scene.add(furnaceLight);

  // parede sul (com o púlpito/sala de controle)
  wallPiece(HALL.x0, ROOM.x0, 0, HALL.h, HALL.z1 + 0.12, M.wall);
  wallPiece(ROOM.x1, HALL.x1, 0, HALL.h, HALL.z1 + 0.12, M.wall);
  wallPiece(ROOM.x0, ROOM.x1, ROOM.h, HALL.h, HALL.z1 + 0.12, M.wall);
  collide(HALL.x0, DOOR.x0, HALL.z1 - 0.12, HALL.z1 + 0.3);
  collide(DOOR.x1, HALL.x1, HALL.z1 - 0.12, HALL.z1 + 0.3);

  // telhado + claraboias
  const SKY = [-9.5, -2.5, 3.6];
  const SKY_W = 2.2;
  const roofZs = [HALL.z0 - 0.5, ...SKY.flatMap((z) => [z - SKY_W / 2, z + SKY_W / 2]), HALL.z1 + 0.5];
  for (let i = 0; i < roofZs.length; i += 2) {
    const r = box(scene, [W + 1, 0.3, roofZs[i + 1] - roofZs[i]], M.roof, [0, HALL.h + 0.15, (roofZs[i] + roofZs[i + 1]) / 2], { cast: true });
    r.receiveShadow = false;
  }
  for (const z of SKY) {
    const s = plane(scene, W, SKY_W, M.skylight, [0, HALL.h + 0.5, z], [Math.PI / 2, 0, 0]);
    s.castShadow = false;
  }

  // colunas (perfil I) e treliças
  const colXs = [-24, -16, -8, 0, 8, 16, 24];
  const iBeam = (x, z, h, rotY = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    box(g, [0.45, h, 0.04], M.beam, [0, h / 2, 0]);
    box(g, [0.04, h, 0.4], M.beam, [-0.21, h / 2, 0]);
    box(g, [0.04, h, 0.4], M.beam, [0.21, h / 2, 0]);
    box(g, [0.55, 0.06, 0.55], M.steelDark, [0, 0.03, 0]);
    scene.add(g);
    return g;
  };
  for (const x of colXs) {
    const cx = Math.max(HALL.x0 + 0.3, Math.min(HALL.x1 - 0.3, x));
    iBeam(cx, HALL.z0 + 0.3, HALL.h);
    if (x < ROOM.x0 - 0.5 || x > ROOM.x1 + 0.5) {
      iBeam(cx, HALL.z1 - 0.3, HALL.h);
      collide(cx - 0.3, cx + 0.3, HALL.z1 - 0.6, HALL.z1);
    }
    // treliça
    const yb = HALL.h - 1.3;
    const yt = HALL.h - 0.1;
    box(scene, [0.18, 0.18, D], M.beam, [cx, yt, (HALL.z0 + HALL.z1) / 2]);
    box(scene, [0.18, 0.18, D], M.beam, [cx, yb, (HALL.z0 + HALL.z1) / 2]);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const za = HALL.z0 + (i * D) / n;
      const zb = HALL.z0 + ((i + 1) * D) / n;
      between(scene, [cx, yb, za], [cx, yt, zb], 0.05, M.beam, { seg: 6 });
      between(scene, [cx, yb, zb], [cx, yt, zb], 0.04, M.beam, { seg: 6 });
    }
  }
  for (const z of [-11, -6, -1, 4]) box(scene, [W, 0.2, 0.12], M.beam, [0, HALL.h - 0.25, z], { cast: false });

  // ponte rolante
  const crane = new THREE.Group();
  crane.position.set(15, 0, 0);
  scene.add(crane);
  for (const z of [HALL.z0 + 0.6, HALL.z1 - 0.6]) box(scene, [W, 0.6, 0.4], M.beam, [0, 9, z]); // caminhos de rolamento
  for (const dx of [-0.9, 0.9]) {
    box(crane, [0.6, 1.1, D - 1], M.yellow, [dx, 9.85, (HALL.z0 + HALL.z1) / 2]);
    box(crane, [0.62, 0.25, D - 1], M.hazard, [dx, 9.2, (HALL.z0 + HALL.z1) / 2]);
  }
  for (const z of [HALL.z0 + 0.6, HALL.z1 - 0.6]) box(crane, [2.8, 0.8, 0.9], M.yellow, [0, 9.6, z]);
  box(crane, [2.6, 0.7, 2.0], M.steelDark, [0, 10.6, LZ]); // carro
  for (const dx of [-0.25, 0.25]) between(crane, [dx, 10.3, LZ], [dx, 6.8, LZ], 0.02, M.steelDark);
  box(crane, [0.7, 0.8, 0.5], M.yellow, [0, 6.5, LZ]);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 20, Math.PI * 1.5), M.steel);
  hook.position.set(0, 5.85, LZ);
  crane.add(hook);
  label(crane, TX.labelTexture(['50 t'], { w: 256, h: 128, font: 'bold 90px Arial' }), 1.0, 0.5, [0, 9.9, HALL.z1 - 1.15]);

  // ----------------------------------------------------------- linha de rolos
  const rollerPositions = [];
  for (let x = HALL.x0 - 2.5; x <= HALL.x1 + 2.5; x += 0.6) {
    if (MACHINES.some((m) => Math.abs(x - m.x) < 1.75)) continue;
    rollerPositions.push(x);
  }
  const rollerGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.75, 20);
  rollerGeo.rotateX(Math.PI / 2);
  const rollers = new THREE.InstancedMesh(rollerGeo, M.roll, rollerPositions.length);
  rollers.castShadow = true;
  rollers.receiveShadow = true;
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const one = new THREE.Vector3(1, 1, 1);
  let rollerAngle = 0;
  const setRollers = () => {
    tmpQ.setFromAxisAngle(zAxis, -rollerAngle);
    rollerPositions.forEach((x, i) => {
      tmpM.compose(new THREE.Vector3(x, LY - 0.16, LZ), tmpQ, one);
      rollers.setMatrixAt(i, tmpM);
    });
    rollers.instanceMatrix.needsUpdate = true;
  };
  setRollers();
  scene.add(rollers);
  // estrutura da mesa de rolos
  const tableSeg = (xa, xb) => {
    for (const s of [-1, 1]) {
      box(scene, [xb - xa, 0.5, 0.18], M.steelDark, [(xa + xb) / 2, LY - 0.4, LZ + s * 1.0]);
      box(scene, [xb - xa, 0.08, 0.3], M.steel, [(xa + xb) / 2, LY - 0.12, LZ + s * 1.03]);
    }
    for (let x = xa + 0.4; x < xb; x += 2.4) for (const s of [-1, 1]) box(scene, [0.2, LY - 0.6, 0.2], M.steelDark, [x, (LY - 0.6) / 2, LZ + s * 1.0]);
  };
  const xs = [HALL.x0 - 2.5, ...MACHINES.flatMap((m) => [m.x - 1.75, m.x + 1.75]), HALL.x1 + 2.5];
  for (let i = 0; i < xs.length; i += 2) tableSeg(xs[i], xs[i + 1]);
  // fosso sob a linha
  box(scene, [W + 5, 0.02, 2.4], M.black, [0, 0.008, LZ], { cast: false });

  // tira quente
  const stripTex = TX.hotStripTexture();
  const stripMat = std({ color: 0x220800, emissive: 0xffffff, emissiveMap: stripTex, emissiveIntensity: 2.2, roughness: 0.7 });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(W + 5, 0.025, 1.25), stripMat);
  strip.position.set(0, LY + 0.0125, LZ);
  strip.castShadow = false;
  scene.add(strip);
  const stripLights = [-17, -7, 3, 14].map((x) => {
    const l = new THREE.PointLight(0xff6b1f, 6, 9, 1.8);
    l.position.set(x, LY + 0.9, LZ);
    scene.add(l);
    return l;
  });

  // vapor (água de resfriamento entre cadeiras)
  const STEAM_N = 220;
  const steamGeo = new THREE.BufferGeometry();
  const steamPos = new Float32Array(STEAM_N * 3);
  const steamCol = new Float32Array(STEAM_N * 3);
  const steamLife = new Float32Array(STEAM_N);
  const steamSpeed = new Float32Array(STEAM_N);
  const respawnSteam = (i) => {
    const m = MACHINES[i % MACHINES.length];
    steamPos[i * 3] = m.x + 1.9 + Math.random() * 1.2;
    steamPos[i * 3 + 1] = LY + Math.random() * 0.3;
    steamPos[i * 3 + 2] = LZ + (Math.random() - 0.5) * 1.6;
    steamLife[i] = Math.random();
    steamSpeed[i] = 0.5 + Math.random() * 0.7;
  };
  for (let i = 0; i < STEAM_N; i++) {
    respawnSteam(i);
    steamPos[i * 3 + 1] += Math.random() * 4;
  }
  steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
  steamGeo.setAttribute('color', new THREE.BufferAttribute(steamCol, 3));
  const steamMat = new THREE.PointsMaterial({ size: 1.4, map: TX.smokeSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const steam = new THREE.Points(steamGeo, steamMat);
  steam.frustumCulled = false;
  scene.add(steam);

  // ------------------------------------------------------------- cadeiras
  for (const m of MACHINES) stands[m.id] = buildStand(m);

  function buildStand(m) {
    const g = new THREE.Group();
    g.position.set(m.x, 0, LZ);
    scene.add(g);
    const st = { id: m.id, group: g, rolls: [] };

    for (const s of [-1, 1]) {
      const zc = s * 1.5;
      for (const px of [-0.85, 0.85]) box(g, [0.45, 5.3, 0.7], M.housing, [px, 2.65, zc]);
      box(g, [2.15, 0.7, 0.7], M.housing, [0, 4.95, zc]);
      box(g, [2.15, 0.35, 0.72], M.housingDark, [0, 0.175, zc]);
      // calços e cilindro AGC na janela
      box(g, [1.15, 0.33, 0.6], M.steel, [0, 0.52, zc]);
      box(g, [1.15, 0.46, 0.6], M.steelDark, [0, 0.95, zc]);
      box(g, [1.15, 0.46, 0.6], M.steelDark, [0, 1.57, zc]);
      box(g, [1.15, 1.2, 0.6], M.steel, [0, 2.45, zc]);
      cyl(g, 0.42, 1.4, M.chrome, [0, 3.8, zc]);
      box(g, [1.2, 0.12, 0.66], M.yellow, [0, 4.55, zc]);
      // placas de desgaste/faixas
      box(g, [0.47, 0.18, 0.72], M.hazard, [-0.85, 0.55, zc]);
      box(g, [0.47, 0.18, 0.72], M.hazard, [0.85, 0.55, zc]);
    }
    // travessa superior + sistema de ajuste
    box(g, [2.15, 0.5, 3.7], M.housingDark, [0, 5.55, 0]);
    box(g, [1.2, 0.8, 1.2], M.motor, [0, 6.2, -0.8]);
    cyl(g, 0.35, 1.1, M.motor, [0, 6.2, 0.4], { axis: 'z' });
    // cilindros (rolos de trabalho e de encosto)
    const mkRoll = (r, y, mat) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, y, 0);
      g.add(pivot);
      cyl(pivot, r, 2.9, mat, [0, 0, 0], { axis: 'z', seg: 32 });
      st.rolls.push({ pivot, dir: y < LY ? 1 : -1, r });
      return pivot;
    };
    mkRoll(0.62, 0.03, M.roll);
    mkRoll(0.3, 0.95, M.roll);
    mkRoll(0.3, 1.56, M.roll);
    mkRoll(0.62, 2.48, M.roll);
    // guias de entrada (placas) e cilindros
    for (const s of [-1, 1]) {
      box(g, [1.4, 0.28, 0.04], M.steel, [-1.55, LY + 0.14, s * 0.66]);
      cyl(g, 0.1, 1.4, M.steel, [-1.55, SENSOR_LOCAL.y, s * 1.45], { axis: 'z' });
      cyl(g, 0.04, 0.2, M.chrome, [-1.55, SENSOR_LOCAL.y, s * 0.72], { axis: 'z' });
      box(g, [0.28, 0.28, 0.08], M.steelDark, [-1.55, SENSOR_LOCAL.y, s * 2.12]);
      // suporte do cilindro
      box(g, [0.12, SENSOR_LOCAL.y - 0.1, 0.12], M.steelDark, [-1.55, (SENSOR_LOCAL.y - 0.1) / 2, s * 1.7]);
    }
    // eixos de acionamento (lado acionamento, -z)
    for (const y of [0.95, 1.56]) {
      cyl(g, 0.17, 3.4, M.steel, [0, y, -3.5], { axis: 'z' });
      cyl(g, 0.3, 0.35, M.steelDark, [0, y, -1.95], { axis: 'z' });
      cyl(g, 0.3, 0.35, M.steelDark, [0, y, -5.2], { axis: 'z' });
    }
    box(g, [1.9, 2.6, 1.6], M.gearbox, [0, 1.3, -6.2]);
    box(g, [2.0, 0.2, 1.7], M.steelDark, [0, 2.65, -6.2]);
    box(g, [2.6, 0.5, 3.3], M.steelDark, [0, 0.25, -8.6]);
    cyl(g, 1.15, 2.6, M.motor, [0, 1.65, -8.6], { axis: 'z', seg: 32 });
    for (let k = 0; k < 6; k++) cyl(g, 1.2, 0.08, M.steelDark, [0, 1.65, -7.5 - k * 0.42], { axis: 'z', seg: 32 });
    cyl(g, 0.5, 0.5, M.steelDark, [0, 1.65, -10.1], { axis: 'z' });
    box(g, [0.8, 0.7, 0.6], M.cabinet, [1.2, 2.9, -8.6]);
    // placa de identificação
    const tag = TX.labelTexture([m.id], { w: 256, h: 160, font: 'bold 120px Arial', bg: '#f2f2f2', border: '#111' });
    label(g, tag, 1.1, 0.68, [0, 4.95, 1.86]);
    label(g, TX.labelTexture([m.id], { w: 256, h: 160, font: 'bold 120px Arial', bg: '#f2c200' }), 0.36, 0.22, [0.85, 2.3, 1.86]);
    // coluna luminosa (andon)
    const stack = {};
    cyl(g, 0.03, 0.4, M.steelDark, [0.85, 5.5, 1.5]);
    [
      ['green', 0x1fd655, 5.78],
      ['amber', 0xffa41b, 5.92],
      ['red', 0xff2a2a, 6.06],
    ].forEach(([k, c, y]) => {
      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1, transparent: true, opacity: 0.95, roughness: 0.3 });
      stack[k] = cyl(g, 0.075, 0.13, mat, [0.85, y, 1.5], { cast: false });
    });
    cyl(g, 0.075, 0.03, M.black, [0.85, 6.14, 1.5]);
    st.stack = stack;
    // painel local (botoeira)
    box(g, [0.12, 1.0, 0.12], M.steelDark, [2.0, 0.5, 3.55]);
    const pnl = box(g, [0.5, 0.36, 0.22], M.cabinet, [2.0, 1.15, 3.55], { rot: [-0.35, 0, 0] });
    const estop = cyl(g, 0.045, 0.04, M.red, [2.1, 1.22, 3.69], { rot: [Math.PI / 2 - 0.35, 0, 0] });
    cyl(g, 0.06, 0.012, M.yellow, [2.1, 1.215, 3.67], { rot: [Math.PI / 2 - 0.35, 0, 0] });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x1fd655, emissive: 0x1fd655, emissiveIntensity: 1.2 });
    st.panelLamp = cyl(g, 0.022, 0.02, lampMat, [1.9, 1.22, 3.69], { rot: [Math.PI / 2 - 0.35, 0, 0], cast: false });
    void pnl;
    void estop;
    collide(m.x + 1.8, m.x + 2.2, LZ + 3.35, LZ + 3.8);

    // ------------------------------------------- transdutor de posição + cabo
    const S = SENSOR_LOCAL;
    const sensor = new THREE.Group();
    g.add(sensor);
    cyl(sensor, 0.075, 0.17, M.chrome, [S.x, S.y, 2.23], { axis: 'z' });
    // cabeça eletrônica (grupo com pivô no centro: pode ficar torta/quebrada)
    const head = new THREE.Group();
    head.position.set(S.x, S.y, 2.37);
    sensor.add(head);
    box(head, [0.14, 0.13, 0.11], M.cabinet, [0, 0, 0]);
    cyl(head, 0.026, 0.045, M.chrome, [0, 0.087, 0]); // soquete M12
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x1fd655, emissive: 0x1fd655, emissiveIntensity: 2 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), ledMat);
    led.position.set(0.035, 0.02, 0.057);
    head.add(led);
    const led2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffa41b, emissive: 0xffa41b, emissiveIntensity: 1.5 }));
    led2.position.set(-0.035, 0.02, 0.057);
    head.add(led2);
    const ledGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glowSprite(), color: 0x1fd655, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ledGlow.scale.set(0.09, 0.09, 0.09);
    ledGlow.position.copy(led.position).add(new THREE.Vector3(0, 0, 0.01));
    head.add(ledGlow);
    label(head, TX.labelTexture([`ZT-${m.id.slice(1)}101`], { w: 256, h: 96, font: 'bold 64px Arial', bg: '#f2c200' }), 0.12, 0.045, [0, -0.025, 0.0565]);
    // versão quebrada: trincas, lasca faltando no canto com a placa eletrônica exposta
    const broken = new THREE.Group();
    head.add(broken);
    const crackMat = new THREE.MeshStandardMaterial({ map: crackTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    plane(broken, 0.14, 0.13, crackMat, [0, 0, 0.0572]);
    plane(broken, 0.11, 0.13, crackMat, [0.0702, 0, 0], [0, Math.PI / 2, 0]);
    box(broken, [0.06, 0.054, 0.056], M.burnt, [0.045, 0.042, 0.031]);
    box(broken, [0.04, 0.004, 0.036], M.pcb, [0.045, 0.03, 0.034]);
    box(broken, [0.008, 0.008, 0.008], M.black, [0.04, 0.036, 0.04]);
    // fragmentos da carcaça no chão, logo abaixo
    const debris = new THREE.Group();
    sensor.add(debris);
    for (const [dx, dz, sz, ry] of [[0.16, 0.22, 0.07, 0.4], [-0.06, 0.3, 0.05, 1.2], [0.05, 0.12, 0.04, 2.1], [0.26, 0.34, 0.035, 0.9], [0.1, 0.4, 0.03, 2.6]])
      box(debris, [sz, 0.016, sz * 0.75], M.cabinet, [S.x + dx, 0.008, 2.37 + dz], { rot: [0, ry, 0.12] });

    // cabo do transdutor até a caixa de passagem (sempre conectado)
    const jb = new THREE.Vector3(-1.16, 1.98, 1.62);
    box(sensor, [0.16, 0.36, 0.28], M.cabinet, [jb.x, jb.y, jb.z]);
    cyl(sensor, 0.022, 0.05, M.black, [jb.x, jb.y - 0.2, jb.z + 0.04]);
    label(sensor, TX.labelTexture(['JB-' + m.id, 'SENSORES GUIA'], { w: 256, h: 160, font: 'bold 60px Arial', sub: 'bold 30px Arial', bg: '#e9e9e9' }), 0.22, 0.14, [jb.x, jb.y + 0.04, jb.z + 0.141]);
    pipe(sensor, [[jb.x, jb.y + 0.18, jb.z], [jb.x, 4.3, jb.z], [jb.x, 4.3, 2.05]], 0.025, M.steel, false);
    const curve = new THREE.CatmullRomCurve3(
      [
        [jb.x, jb.y - 0.22, jb.z + 0.04],
        [jb.x - 0.02, 1.62, 1.78],
        [-1.3, 1.63, 2.08],
        [-1.47, 1.78, 2.33],
        [S.x, 1.74, 2.37],
        [S.x, 1.645, 2.37],
      ].map((p) => new THREE.Vector3(...p)),
    );
    const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.016, 8, false), M.cable);
    cableMesh.castShadow = true;
    sensor.add(cableMesh);
    cyl(sensor, 0.03, 0.075, M.black, [S.x, 1.6, 2.37], { seg: 16 }); // plugue M12
    cyl(sensor, 0.033, 0.03, M.chrome, [S.x, 1.565, 2.37], { seg: 12 });

    const hit = box(g, [0.75, 1.35, 0.8], M.hit, [-1.4, 1.3, 2.2], { cast: false, receive: false });
    hit.userData = { kind: 'component', machineId: m.id };
    hitboxes.push(hit);

    st.sensor = { head, led, led2, ledGlow, broken, debris, mode: 'ok', pop: 1 };
    return st;
  }

  // colisor da linha inteira (lado operador até lado acionamento)
  collide(HALL.x0, HALL.x1, HALL.z0, WALK_Z_MIN, 'line');

  // guarda-corpo do lado operador (entre as cadeiras)
  const gaps = MACHINES.map((m) => [m.x - 2.4, m.x + 2.4]);
  let cur = HALL.x0 + 0.5;
  for (const [a, b] of gaps) {
    railing(cur, -0.28, a, -0.28);
    cur = b;
  }
  railing(cur, -0.28, HALL.x1 - 0.5, -0.28);
  // faixa de perigo no piso
  const hz = M.hazard.clone();
  hz.map = TX.hazardTexture([96, 1]);
  hz.polygonOffset = true;
  hz.polygonOffsetFactor = -2;
  decal(W, 0.25, hz, 0, WALK_Z_MIN + 0.12);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xd9a800, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  decal(W, 0.1, lineMat, 0, 2.2);
  // rota de pedestres saindo da porta da sala de controle
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x2f9e57, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  decal(1.0, 3.6, greenMat, (DOOR.x0 + DOOR.x1) / 2, 4.1);
  const arrowTex = TX.labelTexture(['▲'], { w: 128, h: 128, bg: '#2f9e57', fg: '#e8f5ec', border: null, font: 'bold 100px Arial' });
  for (const z of [3.2, 5.0]) decal(0.6, 0.6, new THREE.MeshStandardMaterial({ map: arrowTex, polygonOffset: true, polygonOffsetFactor: -3 }), (DOOR.x0 + DOOR.x1) / 2, z, 0);
  decal(30, 0.08, greenMat, -9, 2.0);
  const pathArrow = TX.labelTexture(['◀ F1 · F2     F3 · F4 ▶'], { w: 1024, h: 128, bg: '#2f9e57', fg: '#e8f5ec', border: null, font: 'bold 72px Arial' });
  decal(4.0, 0.5, new THREE.MeshStandardMaterial({ map: pathArrow, polygonOffset: true, polygonOffsetFactor: -3 }), 2.6, 1.3, 0);

  // câmeras de CFTV (uma por cadeira, num poste junto ao guarda-corpo); a tela da sala faz rodízio
  const cctvCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 80);
  scene.add(cctvCam);
  const cctvViews = MACHINES.map((m) => {
    const rig = new THREE.Group();
    rig.position.set(m.x + 3.3, 0, -0.3);
    scene.add(rig);
    between(rig, [0, 0, 0], [0, 4.0, 0], 0.05, M.steel);
    box(rig, [0.3, 0.12, 0.14], M.cabinet, [-0.1, 4.0, 0]);
    cyl(rig, 0.045, 0.02, M.black, [-0.26, 4.0, 0], { axis: 'x' });
    return { pos: new THREE.Vector3(m.x + 3.1, 3.95, -0.25), look: new THREE.Vector3(m.x - 1.2, 1.2, LZ + 1.2) };
  });
  let cctvIndex = 0;
  const setCctv = (i) => {
    cctvIndex = i;
    cctvCam.position.copy(cctvViews[i].pos);
    cctvCam.lookAt(cctvViews[i].look);
  };
  setCctv(0);

  // giroflex de parada de emergência — iguais em todas as cadeiras (não apontam a causa)
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 3, transparent: true, opacity: 0.9 });
  const beacons = MACHINES.map((m, i) => {
    const b = new THREE.Group();
    b.position.set(m.x + 2.0, 1.33, LZ + 3.55);
    scene.add(b);
    cyl(b, 0.07, 0.16, beaconMat, [0, 0.08, 0], { cast: false });
    const spot = new THREE.SpotLight(0xff2a1a, 30, 11, 0.42, 0.5, 1.6);
    spot.position.set(0, 0.1, 0);
    b.add(spot);
    const target = new THREE.Object3D();
    b.add(target);
    spot.target = target;
    return { group: b, target, phase: i * 1.7 };
  });

  // ------------------------------------------------------ periferia do galpão
  // CCM (painéis elétricos) a leste da sala de controle
  const ccmX0 = 7.2;
  for (let i = 0; i < 10; i++) {
    const x = ccmX0 + i * 0.82;
    box(scene, [0.8, 2.2, 0.6], M.cabinet, [x, 1.1, HALL.z1 - 0.45]);
    box(scene, [0.02, 2.1, 0.01], M.steelDark, [x + 0.4, 1.1, HALL.z1 - 0.75]);
    const ledC = [0x1fd655, 0xffffff, 0x1fd655][i % 3];
    const lm = new THREE.MeshStandardMaterial({ color: ledC, emissive: ledC, emissiveIntensity: 1.5 });
    cyl(scene, 0.018, 0.02, lm, [x - 0.2, 1.75, HALL.z1 - 0.76], { axis: 'z', cast: false });
    cyl(scene, 0.018, 0.02, M.red, [x - 0.1, 1.75, HALL.z1 - 0.76], { axis: 'z', cast: false });
    box(scene, [0.06, 0.2, 0.03], M.steelDark, [x + 0.3, 1.1, HALL.z1 - 0.77]);
  }
  box(scene, [8.2, 0.12, 0.62], M.steelDark, [ccmX0 + 3.7, 2.26, HALL.z1 - 0.45]);
  label(scene, TX.labelTexture(['CCM-02', 'TREM ACABADOR'], { w: 512, h: 200, bg: '#1b3650', fg: '#fff', border: null, font: 'bold 90px Arial', sub: 'bold 40px Arial' }), 1.6, 0.62, [ccmX0 + 3.7, 2.62, HALL.z1 - 0.15], Math.PI);
  collide(ccmX0 - 0.45, ccmX0 + 8.2, HALL.z1 - 0.8, HALL.z1);

  // unidade hidráulica a oeste da sala
  const hpu = new THREE.Group();
  hpu.position.set(-11, 0, HALL.z1 - 1.3);
  scene.add(hpu);
  box(hpu, [4.2, 1.3, 1.7], M.gearbox, [0, 0.75, 0]);
  box(hpu, [4.4, 0.1, 1.9], M.steelDark, [0, 0.05, 0]);
  for (const x of [-1.3, 0, 1.3]) {
    cyl(hpu, 0.28, 0.7, M.motor, [x, 1.75, 0.2]);
    cyl(hpu, 0.16, 0.35, M.steel, [x, 1.25, -0.4]);
    pipe(hpu, [[x, 1.4, -0.4], [x, 2.6, -0.4], [x + 0.6, 2.6, -0.4]], 0.05, M.pipeOrange, false);
  }
  pipe(hpu, [[-2.0, 2.6, -0.4], [2.1, 2.6, -0.4], [2.1, 2.6, 0.6], [2.1, 6, 0.6]], 0.07, M.pipeOrange, false);
  box(hpu, [0.5, 0.3, 0.06], M.black, [1.6, 1.2, 0.88]);
  label(hpu, TX.labelTexture(['HPU-02', 'UNIDADE HIDRÁULICA 210 bar'], { w: 512, h: 200, bg: '#f2f2f2', font: 'bold 90px Arial', sub: 'bold 38px Arial' }), 1.3, 0.5, [-0.8, 0.95, 0.86]);
  collide(-13.3, -8.7, HALL.z1 - 2.3, HALL.z1);

  // bobinas acabadas a leste
  const coilGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(0.38, -0.62), new THREE.Vector2(0.95, -0.62), new THREE.Vector2(0.95, 0.62), new THREE.Vector2(0.38, 0.62), new THREE.Vector2(0.38, -0.62)],
    40,
  );
  const coilMat = std({ color: 0x5b5754, roughness: 0.45, metalness: 0.85 });
  [19.0, 21.2].forEach((x, i) => {
    const c = new THREE.Mesh(coilGeo, coilMat);
    c.rotation.z = Math.PI / 2;
    c.position.set(x, 0.98, 3.6 - i * 0.1);
    c.castShadow = true;
    c.receiveShadow = true;
    scene.add(c);
    box(scene, [1.4, 0.15, 1.6], M.steelDark, [x, 0.075, 3.6]);
    collide(x - 0.8, x + 0.8, 2.6, 4.6);
  });

  // carrinho de ferramentas perto de F2
  const cart = new THREE.Group();
  cart.position.set(-0.4, 0, 2.9);
  cart.rotation.y = -0.2;
  scene.add(cart);
  box(cart, [0.9, 0.85, 0.5], M.red, [0, 0.5, 0]);
  for (let i = 0; i < 4; i++) box(cart, [0.86, 0.015, 0.01], M.steelDark, [0, 0.3 + i * 0.17, 0.256]);
  box(cart, [0.4, 0.18, 0.22], M.red, [-0.15, 1.02, 0]);
  box(cart, [0.3, 0.05, 0.05], M.yellow, [0.2, 0.96, 0.05]);
  for (const [x, z] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) cyl(cart, 0.05, 0.04, M.rubber, [x, 0.05, z], { axis: 'x' });
  collide(-0.95, 0.15, 2.55, 3.25);

  // placas de segurança
  label(scene, TX.warningSignTexture('PERIGO', 'MATERIAL INCANDESCENTE — MANTENHA DISTÂNCIA'), 0.8, 0.6, [-13.5, 1.0, -0.25]);
  label(scene, TX.warningSignTexture('ATENÇÃO', 'USO OBRIGATÓRIO DE EPI: CAPACETE, ÓCULOS E PROTETOR'), 0.9, 0.68, [-7.0, 2.0, HALL.z1 - 0.015], Math.PI);
  label(scene, TX.warningSignTexture('PERIGO', 'PARTES MÓVEIS — BLOQUEIE ANTES DA MANUTENÇÃO'), 0.8, 0.6, [7.0, 1.0, -0.25]);
  label(scene, TX.labelTexture(['PÚLPITO DE CONTROLE FM-01'], { w: 1024, h: 128, bg: '#1b3650', fg: '#fff', border: null, font: 'bold 64px Arial' }), 3.6, 0.45, [0, 3.75, HALL.z1 - 0.01], Math.PI);
  label(scene, TX.labelTexture(['TREM ACABADOR  F1 — F4'], { w: 1024, h: 128, bg: '#1b3650', fg: '#fff', border: null, font: 'bold 70px Arial' }), 6, 0.75, [0, 8.0, HALL.z0 + 0.02]);

  // mezanino e passarela no lado norte
  const mz = { y: 4.6, z0: HALL.z0 + 0.1, z1: HALL.z0 + 2.0 };
  box(scene, [W - 1, 0.12, mz.z1 - mz.z0], M.steel, [0, mz.y, (mz.z0 + mz.z1) / 2]);
  for (let x = HALL.x0 + 2; x < HALL.x1; x += 6) box(scene, [0.2, mz.y, 0.2], M.beam, [x, mz.y / 2, mz.z1 - 0.1]);
  railing(HALL.x0 + 0.5, mz.z1, HALL.x1 - 0.5, mz.z1, mz.y + 0.06);
  // escada
  const stair = new THREE.Group();
  scene.add(stair);
  for (let i = 0; i < 20; i++) box(stair, [1.0, 0.05, 0.3], M.steel, [HALL.x1 - 1.2, mz.y - i * 0.23, mz.z1 + 0.15 + i * 0.27]);
  // tubulações ao longo da parede norte
  const pz = HALL.z0 + 0.6;
  pipe(scene, [[HALL.x0, 7.2, pz], [HALL.x1, 7.2, pz]], 0.22, M.pipeGreen);
  pipe(scene, [[HALL.x0, 7.75, pz + 0.1], [HALL.x1, 7.75, pz + 0.1]], 0.16, M.pipeBlue);
  pipe(scene, [[HALL.x0, 6.7, pz + 0.05], [HALL.x1, 6.7, pz + 0.05]], 0.12, M.pipeGray);
  for (let x = HALL.x0 + 1; x < HALL.x1; x += 3) box(scene, [0.08, 1.4, 0.6], M.steelDark, [x, 7.2, pz + 0.05]);
  // descidas de água/hidráulica para cada cadeira
  for (const m of MACHINES) {
    pipe(scene, [[m.x + 1.4, 7.2, pz], [m.x + 1.4, 7.2, LZ - 1.3], [m.x + 1.4, 3.6, LZ - 1.3], [m.x + 1.4, 3.6, LZ - 0.4]], 0.09, M.pipeGreen, false);
    pipe(scene, [[m.x - 1.2, 7.75, pz + 0.1], [m.x - 1.2, 7.75, LZ - 2.2], [m.x - 1.2, 3.2, LZ - 2.2]], 0.07, M.pipeBlue, false);
    // bicos de spray (vapor sai daqui)
    box(scene, [0.1, 0.1, 1.8], M.steelDark, [m.x + 2.3, LY + 0.7, LZ]);
  }
  // bandeja de cabos ao longo da parede sul (lado galpão)
  const tz = HALL.z1 - 0.5;
  box(scene, [W, 0.04, 0.5], M.steel, [0, 5.4, tz]);
  box(scene, [W, 0.12, 0.03], M.steel, [0, 5.46, tz - 0.24]);
  pipe(scene, [[HALL.x0, 6.2, tz], [HALL.x1, 6.2, tz]], 0.12, M.pipeBlue);
  // bandeja de cabos sobre o lado operador (alimenta as caixas de passagem)
  box(scene, [W, 0.04, 0.4], M.steel, [0, 4.33, LZ + 2.1]);
  box(scene, [W, 0.1, 0.02], M.steel, [0, 4.38, LZ + 2.3]);

  // luminárias industriais (high bay)
  const lampGeo = new THREE.CylinderGeometry(0.25, 0.42, 0.35, 20, 1, true);
  const lampDisc = new THREE.CircleGeometry(0.38, 20);
  const spots = [];
  for (const x of [-18, -9, 0, 9, 18])
    for (const z of [-7, 1.5]) {
      const l = new THREE.Mesh(lampGeo, M.steelDark);
      l.position.set(x, 10.2, z);
      scene.add(l);
      const d = new THREE.Mesh(lampDisc, M.lampLight);
      d.rotation.x = Math.PI / 2;
      d.position.set(x, 10.03, z);
      scene.add(d);
      between(scene, [x, 10.4, z], [x, HALL.h - 1.3, z], 0.01, M.steelDark, { cast: false });
      if (z > 0) {
        const s = new THREE.SpotLight(0xfff0dd, 70, 22, 0.9, 0.7, 1.5);
        s.position.set(x, 10, z);
        s.target.position.set(x, 0, z - 1);
        scene.add(s, s.target);
        spots.push(s);
      }
    }

  // feixes de luz das claraboias (efeito volumétrico falso)
  const shaftMat = new THREE.MeshBasicMaterial({ map: TX.shaftTexture(), transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xdfe8ff });
  const sunDir = new THREE.Vector3(-0.35, -1, -0.42).normalize();
  for (const [x, z] of [[-14, -2.5], [-2, -2.5], [10, -2.5], [-20, 3.6], [-6, 3.6], [6, 3.6], [18, 3.6], [16, -9.5]]) {
    const len = 13;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, len), shaftMat);
    s.position.set(x, HALL.h, z).addScaledVector(sunDir, len / 2);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir);
    s.rotateY(Math.PI / 2);
    scene.add(s);
  }

  // ------------------------------------------------------- sala de controle
  buildControlRoom();

  function buildControlRoom() {
    const R = ROOM;
    const cx = (R.x0 + R.x1) / 2;
    const cz = (R.z0 + R.z1) / 2;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), M.carpet);
    f.rotation.x = -Math.PI / 2;
    f.position.set(cx, 0.004, cz);
    f.receiveShadow = true;
    scene.add(f);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), M.ceiling);
    c.rotation.x = Math.PI / 2;
    c.position.set(cx, R.h, cz);
    scene.add(c);
    box(scene, [R.x1 - R.x0 + 0.5, 0.25, R.z1 - R.z0 + 0.3], M.roof, [cx, R.h + 0.14, cz], { cast: true, receive: false });
    // paredes
    wallPieceX(R.z0, R.z1, 0, R.h, R.x0 - 0.1, M.roomWall, 0.2);
    wallPieceX(R.z0, R.z1, 0, R.h, R.x1 + 0.1, M.roomWall, 0.2);
    wallPiece(R.x0, R.x1, 0, R.h, R.z1 + 0.1, M.roomWall, 0.2);
    collide(R.x0 - 0.5, R.x0, R.z0, R.z1 + 0.5);
    collide(R.x1, R.x1 + 0.5, R.z0, R.z1 + 0.5);
    collide(R.x0, R.x1, R.z1, R.z1 + 0.5);
    for (const s of scene.children.slice(-3)) s.castShadow = true;
    // parede frontal com janela panorâmica e porta
    const wy0 = 1.0;
    const wy1 = 2.9;
    const wx0 = -5.5;
    const wx1 = 3.5;
    const fw = (x0, x1, y0, y1) => box(scene, [x1 - x0, y1 - y0, 0.2], M.roomWall, [(x0 + x1) / 2, (y0 + y1) / 2, R.z0], { cast: true });
    fw(R.x0, DOOR.x0, 0, wy0);
    fw(R.x0, wx0, wy0, wy1);
    fw(wx1, DOOR.x0, wy0, wy1);
    fw(R.x0, DOOR.x0, wy1, R.h);
    fw(DOOR.x0, DOOR.x1, DOOR.h, R.h);
    fw(DOOR.x1, R.x1, 0, R.h);
    // vidro e montantes
    plane(scene, wx1 - wx0, wy1 - wy0, M.glass, [(wx0 + wx1) / 2, (wy0 + wy1) / 2, R.z0]);
    for (let x = wx0; x <= wx1 + 0.01; x += (wx1 - wx0) / 6) box(scene, [0.06, wy1 - wy0, 0.12], M.roomTrim, [x, (wy0 + wy1) / 2, R.z0]);
    box(scene, [wx1 - wx0, 0.06, 0.3], M.roomTrim, [(wx0 + wx1) / 2, wy0, R.z0 + 0.05]);
    box(scene, [wx1 - wx0, 0.06, 0.14], M.roomTrim, [(wx0 + wx1) / 2, wy1, R.z0]);
    // batente da porta
    box(scene, [0.06, DOOR.h, 0.24], M.roomTrim, [DOOR.x0, DOOR.h / 2, R.z0]);
    box(scene, [0.06, DOOR.h, 0.24], M.roomTrim, [DOOR.x1, DOOR.h / 2, R.z0]);
    box(scene, [DOOR.x1 - DOOR.x0 + 0.06, 0.06, 0.24], M.roomTrim, [(DOOR.x0 + DOOR.x1) / 2, DOOR.h, R.z0]);
    // rodapé
    box(scene, [R.x1 - R.x0, 0.1, 0.02], M.roomTrim, [cx, 0.05, R.z1 - 0.01], { cast: false });
    box(scene, [0.02, 0.1, R.z1 - R.z0], M.roomTrim, [R.x0 + 0.01, 0.05, cz], { cast: false });
    box(scene, [0.02, 0.1, R.z1 - R.z0], M.roomTrim, [R.x1 - 0.01, 0.05, cz], { cast: false });

    // luminárias de teto
    for (const x of [-3.5, 0, 3.5]) for (const z of [7.8, 10.8]) {
      const p = plane(scene, 1.2, 0.6, M.panelLight, [x, R.h - 0.005, z], [Math.PI / 2, 0, 0]);
      p.castShadow = false;
    }
    const rl1 = new THREE.PointLight(0xfff2e0, 9, 9, 1.6);
    rl1.position.set(-2.5, 3.1, 9.3);
    const rl2 = new THREE.PointLight(0xfff2e0, 7, 9, 1.6);
    rl2.position.set(3.5, 3.1, 10.2);
    scene.add(rl1, rl2);

    // console de operação ao longo da janela
    const dz0 = 6.15;
    const dz1 = 7.25;
    const dx0 = -5.4;
    const dx1 = 2.6;
    box(scene, [dx1 - dx0, 0.7, dz1 - dz0 - 0.25], M.desk, [(dx0 + dx1) / 2, 0.35, dz0 + 0.4]);
    box(scene, [dx1 - dx0 + 0.04, 0.05, dz1 - dz0], M.deskTop, [(dx0 + dx1) / 2, 0.725, (dz0 + dz1) / 2]);
    box(scene, [dx1 - dx0, 0.06, 0.04], M.plastic, [(dx0 + dx1) / 2, 0.73, dz1 + 0.01]);
    collide(dx0 - 0.05, dx1 + 0.05, R.z0, dz1 + 0.05);
    // monitores
    const monitor = (x, ang, key, wide = false) => {
      const g = new THREE.Group();
      g.position.set(x, 0.75, 6.62);
      g.rotation.y = ang;
      scene.add(g);
      const w = wide ? 0.9 : 0.64;
      const h = wide ? 0.4 : 0.38;
      box(g, [0.25, 0.015, 0.18], M.plastic, [0, 0.008, 0]);
      box(g, [0.05, 0.3, 0.04], M.plastic, [0, 0.15, -0.03]);
      const fr = box(g, [w + 0.03, h + 0.03, 0.035], M.plastic, [0, 0.33, 0], { rot: [-0.08, 0, 0] });
      void fr;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      scr.position.set(0, 0.33 + 0.0015, 0.0185);
      scr.rotation.x = -0.08;
      g.add(scr);
      screens[key] = scr;
      return scr;
    };
    monitor(-4.25, 0.18, 'overview');
    monitor(-3.57, 0.0, 'alarms');
    monitor(-2.89, -0.18, 'detail');
    monitor(-0.5, 0.18, 'cctv');
    monitor(0.18, 0.0, 'plc');
    monitor(0.86, -0.18, 'kpi');
    // teclados, mouses, telefone, botão de emergência
    for (const x of [-3.57, 0.18]) {
      box(scene, [0.46, 0.02, 0.16], M.plastic, [x, 0.76, 7.0]);
      box(scene, [0.06, 0.02, 0.1], M.plastic, [x + 0.36, 0.76, 7.02]);
    }
    box(scene, [0.2, 0.06, 0.18], M.plastic, [-1.6, 0.78, 6.9]);
    box(scene, [0.18, 0.05, 0.12], M.cabinet, [2.1, 0.775, 6.85]);
    cyl(scene, 0.04, 0.035, M.red, [2.1, 0.82, 6.85]);
    cyl(scene, 0.052, 0.008, M.yellow, [2.1, 0.805, 6.85]);
    // hitbox para reconhecer alarme: monitor de alarmes
    const ackHit = box(scene, [0.8, 0.55, 0.3], M.hit, [-3.57, 1.08, 6.65], { cast: false, receive: false });
    ackHit.userData = { kind: 'alarm_console' };
    hitboxes.push(ackHit);

    // cadeiras
    const chair = (x, z, ry) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      scene.add(g);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        box(g, [0.32, 0.03, 0.04], M.plastic, [Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15], { rot: [0, -a, 0] });
      }
      cyl(g, 0.03, 0.4, M.chrome, [0, 0.27, 0]);
      box(g, [0.5, 0.08, 0.48], M.chair, [0, 0.5, 0]);
      box(g, [0.48, 0.55, 0.07], M.chair, [0, 0.86, 0.24], { rot: [0.12, 0, 0] });
    };
    chair(-3.5, 7.75, 0.1);
    chair(0.2, 7.8, -0.15);

    // painel de parede (videowall) na parede oeste
    box(scene, [0.08, 1.5, 2.7], M.plastic, [R.x0 + 0.05, 2.05, 9.6]);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.42), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    wall.position.set(R.x0 + 0.095, 2.05, 9.6);
    wall.rotation.y = Math.PI / 2;
    scene.add(wall);
    screens.wall = wall;

    // armários e EPI junto à porta (parede leste)
    for (let i = 0; i < 4; i++) {
      const z = 9.0 + i * 0.62;
      box(scene, [0.5, 1.9, 0.6], M.cabinet, [R.x1 - 0.27, 0.95, z]);
      box(scene, [0.01, 0.3, 0.04], M.steelDark, [R.x1 - 0.53, 1.1, z + 0.22]);
    }
    collide(R.x1 - 0.6, R.x1, 8.65, 11.6);
    box(scene, [0.35, 0.03, 1.8], M.steel, [R.x1 - 0.2, 2.05, 7.6]);
    for (let i = 0; i < 3; i++) {
      const hm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.helmet);
      hm.position.set(R.x1 - 0.22, 2.07, 7.0 + i * 0.55);
      hm.castShadow = true;
      scene.add(hm);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 20), M.helmet);
      brim.position.set(R.x1 - 0.22, 2.075, 7.0 + i * 0.55);
      scene.add(brim);
      if (i === 1) {
        box(scene, [0.05, 0.045, 0.07], M.black, [R.x1 - 0.36, 2.15, 7.55]);
        cyl(scene, 0.015, 0.01, M.chrome, [R.x1 - 0.39, 2.15, 7.55], { axis: 'x' });
      }
    }
    label(scene, TX.labelTexture(['EPI OBRIGATÓRIO', 'NO GALPÃO'], { w: 512, h: 200, bg: '#1f5fa8', fg: '#fff', border: null, font: 'bold 64px Arial', sub: 'bold 52px Arial' }), 0.9, 0.35, [R.x1 - 0.01, 2.5, 7.6], -Math.PI / 2);
    // rack de servidores / CLP no canto
    box(scene, [0.7, 2.0, 0.9], M.black, [R.x0 + 0.45, 1.0, R.z1 - 0.55]);
    const rackLeds = [];
    for (let i = 0; i < 12; i++) {
      const col = i % 4 === 0 ? 0xffa41b : 0x1fd655;
      const lm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 });
      const l = box(scene, [0.015, 0.015, 0.01], lm, [R.x0 + 0.6 + (i % 3) * 0.04, 0.6 + Math.floor(i / 3) * 0.35, R.z1 - 1.005], { cast: false });
      rackLeds.push(l);
    }
    label(scene, TX.labelTexture(['CLP-FM01'], { w: 256, h: 96, bg: '#e9e9e9', font: 'bold 60px Arial' }), 0.3, 0.11, [R.x0 + 0.45, 1.85, R.z1 - 1.005]);
    collide(R.x0, R.x0 + 0.9, R.z1 - 1.1, R.z1);
    animated.push((dt, t) => rackLeds.forEach((l, i) => (l.material.emissiveIntensity = Math.sin(t * (3 + i) + i) > 0.2 ? 2.5 : 0.2)));
    // mesa de reunião com quadro de procedimento
    box(scene, [1.6, 0.05, 0.8], M.deskTop, [-1.0, 0.74, 11.9]);
    for (const [x, z] of [[-1.7, 11.6], [-0.3, 11.6], [-1.7, 12.2], [-0.3, 12.2]]) box(scene, [0.05, 0.72, 0.05], M.steelDark, [x, 0.36, z]);
    collide(-1.85, -0.15, 11.45, 12.35);
    box(scene, [2.2, 1.1, 0.03], M.cabinet, [-1.0, 1.85, R.z1 - 0.02]);
    label(scene, TX.warningSignTexture('LOTO', 'BLOQUEIO E ETIQUETAGEM OBRIGATÓRIOS ANTES DE INTERVIR NA LINHA'), 1.0, 0.75, [-1.5, 1.85, R.z1 - 0.04], Math.PI);
    label(scene, TX.labelTexture(['TURNO B', 'Equipe de manutenção', 'elétrica: ramal 4471'], { w: 512, h: 384, bg: '#fafafa', font: 'bold 70px Arial', sub: 'bold 36px Arial' }), 0.75, 0.56, [-0.35, 1.85, R.z1 - 0.04], Math.PI);
  }

  // porta automática da sala de controle (lado galpão)
  const doorPanel = box(scene, [DOOR.x1 - DOOR.x0, DOOR.h - 0.02, 0.05], M.roomTrim, [(DOOR.x0 + DOOR.x1) / 2, DOOR.h / 2, ROOM.z0 - 0.15]);
  const doorGlass = plane(scene, 0.5, 1.0, M.glass, [0, 0.35, 0.03]);
  doorPanel.add(doorGlass);
  const doorCollider = collide(DOOR.x0, DOOR.x1, ROOM.z0 - 0.2, ROOM.z0 + 0.1, 'door');
  label(doorPanel, TX.labelTexture(['SALA DE CONTROLE'], { w: 512, h: 96, bg: '#1b3650', fg: '#fff', border: null, font: 'bold 50px Arial' }), 0.8, 0.15, [0, 0.95, -0.03], Math.PI);
  const door = { panel: doorPanel, collider: doorCollider, open: 0 };

  // ------------------------------------------------------------- iluminação
  const hemi = new THREE.HemisphereLight(0xb9cde0, 0x403a33, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.copy(sunDir.clone().multiplyScalar(-40));
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -30;
  sc.right = 30;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 1;
  sc.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ------------------------------------------------------ estado → visual
  let faultMachine = null;
  let faultType = null;

  const BROKEN_TILT = [0.06, 0.12, -0.16];
  function applyScenario(sim) {
    for (const m of MACHINES) {
      const s = stands[m.id].sensor;
      const isFault = m.id === sim.machineId && sim.faultType !== 'none' && !sim.fixed;
      s.mode = isFault ? 'broken' : 'ok';
      s.broken.visible = isFault;
      s.debris.visible = isFault;
      s.head.rotation.set(...(isFault ? BROKEN_TILT : [0, 0, 0]));
      s.head.scale.setScalar(1);
      s.pop = 1;
    }
  }

  /** Substituição do transdutor: cabeça nova aparece no lugar da quebrada. */
  function playFix(machineId) {
    const s = stands[machineId].sensor;
    s.mode = 'ok';
    s.broken.visible = false;
    s.debris.visible = false;
    s.head.rotation.set(0, 0, 0);
    s.pop = 0;
  }

  function update(dt, t, sim, playerPos) {
    const line = sim.lineState;
    const running = line === 'RUNNING';
    const starting = line === 'RECOVERING';
    const speedK = running ? 1 : starting ? Math.min(1, (Date.now() - sim.lineStateSince) / 5000) ** 2 : 0;

    // rolos e tira
    rollerAngle += dt * speedK * 22;
    setRollers();
    for (const m of MACHINES) for (const r of stands[m.id].rolls) r.pivot.rotation.z += (dt * speedK * 7 * r.dir * 0.3) / r.r;
    stripTex.offset.x -= dt * speedK * 0.35;
    const heat = running ? 1 : starting ? 0.55 + speedK * 0.45 : 0.42;
    stripMat.emissiveIntensity += (heat * 2.4 - stripMat.emissiveIntensity) * Math.min(1, dt * 1.5);
    stripMat.emissive.setRGB(1, 0.55 + heat * 0.45, 0.35 + heat * 0.65);
    stripLights.forEach((l, i) => (l.intensity = stripMat.emissiveIntensity * 3 * (1 + Math.sin(t * 9 + i) * 0.04)));
    furnaceGlow.material.color.setRGB(3.2 + Math.sin(t * 3) * 0.15, 1.1, 0.25);

    // vapor
    const steamAmt = running ? 1 : starting ? speedK : 0.12;
    for (let i = 0; i < STEAM_N; i++) {
      steamLife[i] += dt * 0.25 * steamSpeed[i];
      steamPos[i * 3 + 1] += dt * steamSpeed[i] * 0.9;
      steamPos[i * 3] += dt * 0.15;
      if (steamLife[i] > 1 || steamPos[i * 3 + 1] > 7) respawnSteam(i);
      const life = steamLife[i];
      const a = Math.sin(Math.min(1, life) * Math.PI) * 0.14 * steamAmt;
      steamCol[i * 3] = steamCol[i * 3 + 1] = steamCol[i * 3 + 2] = a;
    }
    steamGeo.attributes.position.needsUpdate = true;
    steamGeo.attributes.color.needsUpdate = true;

    // colunas luminosas
    const blink = Math.sin(t * 6) > 0;
    for (const m of MACHINES) {
      const st = stands[m.id];
      let red = 0;
      let amber = 0;
      let green = 0;
      if (running) green = 1;
      else if (starting) amber = blink ? 1 : 0.1;
      else red = 1; // parada de emergência: todas as cadeiras iguais
      st.stack.red.material.emissiveIntensity = 0.1 + red * 4;
      st.stack.amber.material.emissiveIntensity = 0.1 + amber * 3;
      st.stack.green.material.emissiveIntensity = 0.1 + green * 3;
      st.panelLamp.material.color.setHex(running ? 0x1fd655 : starting ? 0xffa41b : 0xff2a2a);
      st.panelLamp.material.emissive.copy(st.panelLamp.material.color);

      // sensor: quebrado = LEDs apagados; ok = verde (status) + âmbar (alimentação)
      const s = st.sensor;
      const ok = s.mode === 'ok';
      s.led.material.emissiveIntensity = ok ? 3 : 0;
      s.led.material.color.setHex(ok ? 0x1fd655 : 0x1a2a1f);
      s.led2.material.emissiveIntensity = ok ? 1.5 : 0;
      s.led2.material.color.setHex(ok ? 0xffa41b : 0x2a2217);
      s.ledGlow.material.opacity = ok ? 0.5 : 0;
      if (s.pop < 1) {
        s.pop = Math.min(1, s.pop + dt * 2.5);
        const k = 1 + 2.7 * (s.pop - 1) ** 3 + 1.7 * (s.pop - 1) ** 2; // ease-out-back
        s.head.scale.setScalar(0.6 + 0.4 * k);
      }
    }

    // giroflex
    const beaconOn = line === 'TRIPPED';
    for (const b of beacons) {
      b.group.visible = beaconOn;
      if (beaconOn) {
        const a = t * 4.5 + b.phase;
        b.target.position.set(Math.cos(a) * 4, -1.2, Math.sin(a) * 4);
      }
    }
    // rodízio da CFTV a cada 6 s
    const ci = Math.floor(t / 6) % cctvViews.length;
    if (ci !== cctvIndex) setCctv(ci);

    // porta automática
    if (playerPos) {
      const dcx = (DOOR.x0 + DOOR.x1) / 2;
      const near = Math.hypot(playerPos.x - dcx, playerPos.z - ROOM.z0) < 2.4;
      door.open += ((near ? 1 : 0) - door.open) * Math.min(1, dt * 5);
      door.panel.position.x = dcx + door.open * 1.15;
      door.collider.enabled = door.open < 0.7;
    }
    for (const fn of animated) fn(dt, t);
  }

  return { colliders, hitboxes, stands, screens, cctvCam, getCctvIndex: () => cctvIndex, applyScenario, playFix, update, spots, door };
}
