import * as THREE from 'three';

const EYE = 1.7;
const RADIUS = 0.32;

export class Player {
  constructor(camera, dom, colliders) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.enabled = false;
    this.zoom = false;
    this.bob = 0;
    this.sensitivity = 0.0022;

    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * this.sensitivity * (this.zoom ? 0.45 : 1);
      this.pitch -= e.movementY * this.sensitivity * (this.zoom ? 0.45 : 1);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.zoom = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.zoom = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  teleport(p, yaw = this.yaw, pitch = 0) {
    this.pos.set(p.x, 0, p.z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0, 0);
  }

  lookAt(target) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    this.yaw = Math.atan2(-dx, -dz);
    const dy = target.y - EYE;
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  hits(x, z) {
    for (const c of this.colliders) {
      if (!c.enabled) continue;
      if (x + RADIUS > c.x0 && x - RADIUS < c.x1 && z + RADIUS > c.z0 && z - RADIUS < c.z1) return true;
    }
    return false;
  }

  update(dt) {
    const k = this.keys;
    if (this.enabled) {
      // setas também giram a câmera (alternativa ao mouse)
      if (k.has('ArrowLeft')) this.yaw += dt * 1.8;
      if (k.has('ArrowRight')) this.yaw -= dt * 1.8;
      if (k.has('ArrowUp')) this.pitch = Math.min(1.45, this.pitch + dt * 1.2);
      if (k.has('ArrowDown')) this.pitch = Math.max(-1.45, this.pitch - dt * 1.2);
    }
    const f = (this.enabled && k.has('KeyW') ? 1 : 0) - (this.enabled && k.has('KeyS') ? 1 : 0);
    const s = (this.enabled && k.has('KeyD') ? 1 : 0) - (this.enabled && k.has('KeyA') ? 1 : 0);
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = run ? 5.5 : 3.2;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const a = 1 - Math.exp(-dt * 10);
    this.vel.lerp(wish, a);

    const stuck = this.hits(this.pos.x, this.pos.z);
    const nx = this.pos.x + this.vel.x * dt;
    if (stuck || !this.hits(nx, this.pos.z)) this.pos.x = nx;
    else this.vel.x = 0;
    const nz = this.pos.z + this.vel.z * dt;
    if (stuck || !this.hits(this.pos.x, nz)) this.pos.z = nz;
    else this.vel.z = 0;

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * sp * 2.4;
    const bobY = Math.sin(this.bob) * 0.025 * Math.min(1, sp / 3);

    this.camera.position.set(this.pos.x, EYE + bobY, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    const targetFov = this.zoom ? 32 : 70;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
  }
}
