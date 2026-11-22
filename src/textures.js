import * as THREE from 'three';

// Texturas geradas em canvas (sem assets externos).

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function toTex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, w, h, r, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    const s = r() * 2.5 + 0.5;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

function blotches(ctx, w, h, r, n, color, maxR, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = r() * maxR + maxR * 0.2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${color},${alpha * r()})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export function concreteTextures(repeat) {
  const S = 1024;
  const [c, ctx] = canvas(S);
  const r = rand(7);
  ctx.fillStyle = '#7a7b78';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, r, 90, '40,40,38', 160, 0.25);
  blotches(ctx, S, S, r, 60, '150,148,140', 120, 0.18);
  blotches(ctx, S, S, r, 25, '30,25,20', 70, 0.35); // manchas de óleo
  speckle(ctx, S, S, r, 26000, 0.25);
  speckle(ctx, S, S, r, 12000, 0.15, true);
  // juntas de dilatação
  ctx.strokeStyle = 'rgba(30,30,30,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(S, 1);
  ctx.moveTo(1, 0);
  ctx.lineTo(1, S);
  ctx.stroke();
  // rachaduras finas
  ctx.strokeStyle = 'rgba(25,25,25,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = r() * S;
    let y = r() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 40;
      y += (r() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const map = toTex(c, { repeat });

  const [rc, rctx] = canvas(256);
  rctx.drawImage(c, 0, 0, 256, 256);
  const img = rctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i];
    const rough = 255 - (v - 60) * 0.9; // manchas escuras = mais lisas (óleo)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(120, Math.min(255, rough));
  }
  rctx.putImageData(img, 0, 0);
  const roughnessMap = toTex(rc, { repeat, srgb: false });
  return { map, roughnessMap };
}

export function corrugatedTexture(repeat, base = '#8b949c') {
  const W = 512;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const r = rand(11);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const ribs = 8;
  for (let i = 0; i < ribs; i++) {
    const x = (i * W) / ribs;
    const g = ctx.createLinearGradient(x, 0, x + W / ribs, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.0)');
    g.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, W / ribs, H);
  }
  // sujeira escorrida
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(40,35,30,0)');
    g.addColorStop(1, `rgba(40,35,30,${r() * 0.25})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, H * r() * 0.5, 3 + r() * 10, H);
  }
  speckle(ctx, W, H, r, 4000, 0.15);
  return toTex(c, { repeat });
}

export function hazardTexture(repeat = [4, 1]) {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#e8b400';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#151515';
  for (let i = -2; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, 64);
    ctx.lineTo(i * 32 + 16, 64);
    ctx.lineTo(i * 32 + 16 + 64, 0);
    ctx.lineTo(i * 32 + 64, 0);
    ctx.fill();
  }
  const r = rand(3);
  speckle(ctx, 256, 64, r, 800, 0.35);
  return toTex(c, { repeat });
}

export function carpetTexture(repeat) {
  const [c, ctx] = canvas(512);
  const r = rand(5);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      const v = 52 + Math.floor(r() * 10);
      ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
      ctx.fillRect(x * 256, y * 256, 256, 256);
    }
  speckle(ctx, 512, 512, r, 30000, 0.25);
  speckle(ctx, 512, 512, r, 8000, 0.08, true);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeRect(256, 256, 256, 256);
  ctx.strokeRect(256, 0, 256, 256);
  ctx.strokeRect(0, 256, 256, 256);
  return toTex(c, { repeat });
}

export function ceilingTexture(repeat) {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#d9dcdc';
  ctx.fillRect(0, 0, 256, 256);
  const r = rand(9);
  speckle(ctx, 256, 256, r, 3000, 0.12);
  ctx.strokeStyle = '#9ea3a6';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 256, 256);
  return toTex(c, { repeat });
}

export function hotStripTexture() {
  const [c, ctx] = canvas(1024, 64);
  const r = rand(21);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#ff7a1a');
  g.addColorStop(0.5, '#ffb347');
  g.addColorStop(1, '#ff7a1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 64);
  // carepa (manchas escuras de óxido)
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(90,20,0,${r() * 0.55})`;
    const w = 4 + r() * 40;
    ctx.fillRect(r() * 1024, r() * 64, w, 1 + r() * 4);
  }
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(255,235,170,${r() * 0.6})`;
    ctx.fillRect(r() * 1024, r() * 64, 2 + r() * 20, 1 + r() * 2);
  }
  const t = toTex(c, { repeat: [24, 1] });
  return t;
}

export function glowSprite(color = '255,255,255') {
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.3, `rgba(${color},0.45)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeSprite() {
  const [c, ctx] = canvas(128);
  const r = rand(33);
  for (let i = 0; i < 14; i++) {
    const x = 40 + r() * 48;
    const y = 40 + r() * 48;
    const rad = 20 + r() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function shaftTexture() {
  const [c, ctx] = canvas(64, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  const g2 = ctx.createLinearGradient(0, 0, 64, 0);
  g2.addColorStop(0, 'rgba(0,0,0,1)');
  g2.addColorStop(0.2, 'rgba(0,0,0,0)');
  g2.addColorStop(0.8, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Placa/etiqueta com texto. */
export function labelTexture(lines, { w = 512, h = 256, bg = '#f2c200', fg = '#111', border = '#111', font = 'bold 110px Arial', sub = 'bold 46px Arial', stripes = false } = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (stripes) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h * 0.16);
    ctx.rect(0, h * 0.84, w, h * 0.16);
    ctx.clip();
    ctx.fillStyle = '#e8b400';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    for (let i = -4; i < w / 20; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 40, h);
      ctx.lineTo(i * 40 + 20, h);
      ctx.lineTo(i * 40 + 20 + h, 0);
      ctx.lineTo(i * 40 + h, 0);
      ctx.fill();
    }
    ctx.restore();
  }
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(4, w * 0.015);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  if (arr.length === 1) {
    ctx.font = font;
    ctx.fillText(arr[0], w / 2, h / 2 + 4);
  } else {
    ctx.font = font;
    ctx.fillText(arr[0], w / 2, h * 0.4);
    ctx.font = sub;
    for (let i = 1; i < arr.length; i++) ctx.fillText(arr[i], w / 2, h * 0.4 + i * h * 0.24);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function warningSignTexture(title, body, color = '#f2c200') {
  const [c, ctx] = canvas(512, 384);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, 512, 384);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 130);
  // triângulo
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(70, 18);
  ctx.lineTo(122, 112);
  ctx.lineTo(18, 112);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(70, 36);
  ctx.lineTo(108, 104);
  ctx.lineTo(32, 104);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 58px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('!', 70, 100);
  ctx.textAlign = 'left';
  ctx.font = 'bold 64px Arial';
  ctx.fillText(title, 145, 90);
  ctx.font = 'bold 40px Arial';
  const words = body.split(' ');
  let line = '';
  let y = 200;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > 460) {
      ctx.fillText(line, 26, y);
      line = w;
      y += 52;
    } else line = test;
  }
  ctx.fillText(line, 26, y);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 376);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function rollTexture() {
  const [c, ctx] = canvas(256, 64);
  const r = rand(44);
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 400; i++) {
    const v = 60 + r() * 120;
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    ctx.fillRect(r() * 256, r() * 64, 1, 1 + r() * 30);
  }
  ctx.fillStyle = 'rgba(30,30,30,0.6)';
  ctx.fillRect(0, 0, 10, 64);
  ctx.fillRect(120, 0, 5, 64);
  return toTex(c, { repeat: [1, 1] });
}

/** Trincas + marcas de impacto (fundo transparente) para a carcaça do transdutor quebrado. */
export function crackTexture() {
  const [c, ctx] = canvas(256);
  const r = rand(77);
  // marcas de arrasto/impacto
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(60,55,50,${0.12 + r() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(150 + r() * 90, 30 + r() * 90, 6 + r() * 26, 2 + r() * 6, -0.6 + r() * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const crack = (x, y, ang, len, w) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    let a = ang;
    for (let s = 0; s < len; s += 8) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 8;
      y += Math.sin(a) * 8;
      ctx.lineTo(x, y);
      if (r() < 0.12 && w > 1.2) {
        ctx.stroke();
        crack(x, y, a + (r() < 0.5 ? 0.9 : -0.9), len * 0.4, w * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(15,12,10,0.95)';
  const ox = 215;
  const oy = 38;
  // cratera do impacto
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 34);
  g.addColorStop(0, 'rgba(25,20,18,0.85)');
  g.addColorStop(1, 'rgba(25,20,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(ox - 40, oy - 40, 80, 80);
  for (const [ang, len, w] of [[2.6, 200, 6], [2.1, 160, 5.5], [1.75, 130, 4.5], [3.0, 120, 4], [1.4, 90, 3.5], [2.35, 70, 3]]) {
    ctx.lineWidth = w;
    crack(ox, oy, ang, len, w);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
