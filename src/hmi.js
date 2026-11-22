import * as THREE from 'three';
import { MACHINES } from './sim.js';

// Telas da sala de controle desenhadas em canvas 2D.
// Mostram SOMENTE o que os sistemas da planta sabem (nunca o gabarito): numa parada de
// emergência real, a HMI não aponta o componente defeituoso.

const C = {
  bg: '#0d141c',
  panel: '#141f2b',
  header: '#1b2a3a',
  line: '#2a3b4f',
  text: '#d9e4ee',
  dim: '#7f93a8',
  cyan: '#3ec7ff',
  green: '#2fd27a',
  red: '#ff3b3b',
  amber: '#ffb020',
  orange: '#ff7a1a',
};
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const MONO = 'Menlo, Consolas, monospace';

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { c, ctx: c.getContext('2d'), tex };
}

function header(ctx, w, title, right) {
  ctx.fillStyle = C.header;
  ctx.fillRect(0, 0, w, 62);
  ctx.fillStyle = C.cyan;
  ctx.fillRect(0, 60, w, 3);
  ctx.fillStyle = C.text;
  ctx.font = `600 30px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(title, 22, 32);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.dim;
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(right, w - 22, 32);
  ctx.textAlign = 'left';
}

/** Escreve texto reduzindo a fonte até caber na largura. */
function fit(ctx, text, x, y, maxW, size, weight = 600, family = FONT) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 11) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

const clock = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });
const fmtT = (iso, ms = false) => {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const s = d.toLocaleTimeString('pt-BR', { hour12: false });
  return ms ? `${s}.${String(d.getMilliseconds()).padStart(3, '0')}` : s;
};
const fmtDur = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const ST = {
  RUNNING: ['OPERANDO', C.green],
  STARTING: ['PARTINDO', C.amber],
  EMERGENCY_STOP: ['PARADA', C.red],
};

function banner(ctx, x, y, w, h, s, blink, big = 34) {
  const line = s.line.state;
  let col;
  let txt;
  if (line === 'RUNNING') [col, txt] = [C.green, 'LINHA EM PRODUÇÃO'];
  else if (line === 'RECOVERING') [col, txt] = [C.amber, 'PARTIDA DA LINHA EM ANDAMENTO'];
  else [col, txt] = [C.red, 'PARADA DE EMERGÊNCIA — TREM ACABADOR'];
  ctx.fillStyle = line === 'TRIPPED' && blink ? '#5a1414' : '#101a24';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = col;
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = col;
  ctx.font = `700 ${big}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = 'left';
}

const sevTxt = (s) => (s === 'HIGH' ? 'ALTA' : s === 'MEDIUM' ? 'MÉDIA' : 'BAIXA');
const sevCol = (s) => (s === 'HIGH' ? C.red : s === 'MEDIUM' ? C.amber : '#c9d36a');

export class HMI {
  constructor(sim, screens, cctvTarget, getCctvIndex = () => 0) {
    this.sim = sim;
    this.getCctvIndex = getCctvIndex;
    this.surfaces = {};
    const defs = { overview: [1024, 608], alarms: [1024, 608], detail: [1024, 608], plc: [1024, 608], kpi: [1024, 608], wall: [1536, 840] };
    for (const [k, [w, h]] of Object.entries(defs)) {
      const s = mkCanvas(w, h);
      this.surfaces[k] = s;
      if (screens[k]) screens[k].material = new THREE.MeshBasicMaterial({ map: s.tex });
    }
    if (screens.cctv && cctvTarget) {
      screens.cctv.material = new THREE.MeshBasicMaterial({ map: cctvTarget.texture });
      const ov = mkCanvas(1024, 608);
      this.surfaces.cctvOverlay = ov;
      const ovMesh = new THREE.Mesh(screens.cctv.geometry, new THREE.MeshBasicMaterial({ map: ov.tex, transparent: true, depthWrite: false }));
      ovMesh.position.z = 0.001;
      screens.cctv.add(ovMesh);
    }
    this.frame = 0;
  }

  update(t) {
    const keys = Object.keys(this.surfaces);
    const k = keys[this.frame++ % keys.length];
    const s = this.sim.snapshot();
    s.unackHint = s.ui.hints && !s.ui.immersive && s.alarms.some((x) => x.active && !x.acknowledged);
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    const surf = this.surfaces[k];
    this['draw_' + k](surf.ctx, surf.c.width, surf.c.height, s, blink, t);
    surf.tex.needsUpdate = true;
  }

  draw_overview(ctx, w, h, s, blink) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    header(ctx, w, 'FM-01 · TREM ACABADOR · VISÃO GERAL', clock());
    banner(ctx, 20, 80, w - 40, 70, s, blink, 32);
    const y = 330;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    for (let x = 30; x < w - 30; x += 22) {
      ctx.beginPath();
      ctx.arc(x, y + 22, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    const running = s.line.state === 'RUNNING';
    ctx.strokeStyle = running ? C.orange : '#8a3a12';
    ctx.lineWidth = 8;
    ctx.setLineDash(running ? [30, 12] : []);
    ctx.lineDashOffset = running ? -performance.now() / 20 : 0;
    ctx.beginPath();
    ctx.moveTo(20, y + 10);
    ctx.lineTo(w - 20, y + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.dim;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText('◀ DESBASTADOR', 22, y - 120);
    ctx.textAlign = 'right';
    ctx.fillText('BOBINADEIRA ▶', w - 22, y - 120);
    ctx.textAlign = 'left';
    MACHINES.forEach((m, i) => {
      const cx = 170 + i * 228;
      const [txt, col] = ST[s.machines[i].state];
      ctx.fillStyle = '#1a2836';
      ctx.fillRect(cx - 60, y - 95, 120, 190);
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 60, y - 95, 120, 190);
      ctx.fillStyle = C.text;
      ctx.font = `700 40px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(m.id, cx, y - 55);
      ctx.fillStyle = col;
      ctx.font = `700 21px ${FONT}`;
      ctx.fillText(txt, cx, y + 70);
      ctx.fillStyle = C.dim;
      ctx.font = `500 21px ${FONT}`;
      ctx.fillText(`${s.plc[m.id + '.ACION.VEL'].value.toFixed(2)} m/s`, cx, y + 130);
      ctx.fillText(`${s.plc[m.id + '.FORCA_LAM'].value.toFixed(1)} MN`, cx, y + 158);
      ctx.textAlign = 'left';
    });
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, h - 70, w, 70);
    ctx.fillStyle = C.dim;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText('Barra 4418 · SAE 1010 · alvo 2,85 × 1250 mm · T entrada ' + (s.plc['LINHA.TEMP_ENTRADA'].value || '---') + ' °C', 22, h - 35);
  }

  draw_alarms(ctx, w, h, s, blink) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    header(ctx, w, `ALARMES · ATIVOS (${s.activeAlarmCount})`, clock());
    const cols = [16, 186, 312, 400];
    ctx.fillStyle = C.dim;
    ctx.font = `600 19px ${FONT}`;
    ['HORA', 'CÓDIGO', 'PRIOR.', 'DESCRIÇÃO'].forEach((t, i) => ctx.fillText(t, cols[i], 88));
    ctx.fillStyle = C.line;
    ctx.fillRect(0, 104, w, 2);
    let y = 110;
    const active = s.alarms.filter((a) => a.active);
    for (const a of active) {
      const unack = !a.acknowledged;
      ctx.fillStyle = unack ? (blink ? '#6e1616' : '#2e0e0e') : '#1e1414';
      ctx.fillRect(0, y, w, 50);
      ctx.fillStyle = unack ? '#fff' : C.text;
      ctx.font = `600 18px ${MONO}`;
      ctx.fillText(fmtT(a.raisedAt, true), cols[0], y + 26);
      ctx.font = `700 19px ${FONT}`;
      ctx.fillText(a.code, cols[1], y + 26);
      ctx.fillStyle = sevCol(a.severity);
      ctx.fillText(sevTxt(a.severity), cols[2], y + 26);
      ctx.fillStyle = unack ? '#fff' : C.text;
      fit(ctx, a.message, cols[3], y + 26, w - cols[3] - 14, 18, 600);
      y += 54;
    }
    if (active.length) {
      ctx.fillStyle = C.dim;
      ctx.font = `500 18px ${FONT}`;
      ctx.fillText(active.some((a) => !a.acknowledged) ? `${s.alarms.filter((a) => a.active && !a.acknowledged).length} NÃO RECONHECIDO(S)` : `RECONHECIDOS ${fmtT(active[0].acknowledgedAt)}`, cols[0], y + 22);
      y += 34;
    }
    ctx.fillStyle = C.dim;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText('HISTÓRICO', cols[0], y + 24);
    y += 36;
    const hist = [...s.alarms.filter((a) => !a.active).map((a) => ({ ...a, message: a.message })), ...s.alarmHistory];
    for (const a of hist) {
      if (y > h - 70) break;
      ctx.fillStyle = '#111a24';
      ctx.fillRect(0, y, w, 40);
      ctx.fillStyle = C.dim;
      ctx.font = `500 17px ${MONO}`;
      ctx.fillText(fmtT(a.raisedAt), cols[0], y + 21);
      ctx.font = `600 17px ${FONT}`;
      ctx.fillText(a.code, cols[1], y + 21);
      ctx.fillText(sevTxt(a.severity), cols[2], y + 21);
      fit(ctx, a.message + (a.clearedAt ? '  (NORMALIZADO)' : ''), cols[3], y + 21, w - cols[3] - 14, 16, 500);
      y += 44;
    }
    if (s.unackHint) {
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, h - 52, w, 52);
      ctx.fillStyle = C.amber;
      ctx.font = `600 21px ${FONT}`;
      ctx.fillText('Aproxime-se e pressione [E] para reconhecer os alarmes', 16, h - 25);
    }
  }

  draw_detail(ctx, w, h, s, blink) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    header(ctx, w, 'GUIAS LATERAIS DE ENTRADA · F1–F4', clock());
    const diag = s.plc['ET2.AI04.DIAG_COLETIVO'].value;
    MACHINES.forEach((m, i) => {
      const x = 16 + i * 252;
      const y = 82;
      const fb = s.plc[`${m.id}.GUIA_ENT.POS_FB`];
      const bad = fb.quality !== 'GOOD';
      ctx.fillStyle = C.panel;
      ctx.fillRect(x, y, 240, 300);
      ctx.fillStyle = bad ? (blink ? C.red : '#8a2020') : C.green;
      ctx.fillRect(x, y, 240, 8);
      ctx.fillStyle = C.text;
      ctx.font = `800 44px ${FONT}`;
      ctx.fillText(m.id, x + 16, y + 58);
      ctx.fillStyle = C.dim;
      ctx.font = `600 16px ${FONT}`;
      ctx.fillText('SETPOINT', x + 16, y + 104);
      ctx.fillText('FEEDBACK', x + 16, y + 170);
      ctx.fillText('QUALIDADE', x + 16, y + 236);
      ctx.fillStyle = C.cyan;
      ctx.font = `700 30px ${FONT}`;
      ctx.fillText('812,0 mm', x + 16, y + 138);
      ctx.fillStyle = bad ? C.red : C.green;
      ctx.fillText(bad ? '####' : `${fb.value.toFixed(1)} mm`, x + 16, y + 204);
      fit(ctx, bad ? 'BAD · DIAG. MÓDULO' : 'GOOD', x + 16, y + 270, 210, 24, 700);
    });
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, h - 200, w, 200);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = diag ? C.amber : C.green;
    ctx.fillText(diag ? 'Permissivo de posição das guias: AUSENTE → partida bloqueada' : 'Permissivo de posição das guias: OK', 16, h - 160);
    ctx.fillStyle = C.text;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText('Origem dos sinais: E/S remota ET-2 (lado operador) · módulo AI-04 · canais 0–3 = F1–F4', 16, h - 122);
    ctx.fillStyle = diag ? C.red : C.dim;
    ctx.fillText(diag ? 'Módulo AI-04 em DIAGNÓSTICO COLETIVO: todos os canais com valor substituto.' : 'Módulo AI-04 sem diagnóstico.', 16, h - 86);
    ctx.fillStyle = C.dim;
    ctx.fillText(diag ? 'Canal de origem não informado pelo módulo — verificar em campo.' : '', 16, h - 52);
  }

  draw_plc(ctx, w, h, s, blink) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    header(ctx, w, 'CLP-FM01 · E/S REMOTA ET-2 · DIAGNÓSTICO', clock());
    const mods = ['IM', 'DI-01', 'DI-02', 'DO-01', 'AI-03', 'AI-04', 'AO-01', 'PS'];
    const diag = s.plc['ET2.AI04.DIAG_COLETIVO'].value;
    mods.forEach((m, i) => {
      const x = 22 + i * 124;
      const isBad = diag && (m === 'AI-04' || m === 'IM');
      ctx.fillStyle = '#1c2a38';
      ctx.fillRect(x, 82, 112, 180);
      ctx.strokeStyle = isBad ? C.red : C.line;
      ctx.lineWidth = isBad ? 4 : 2;
      ctx.strokeRect(x, 82, 112, 180);
      ctx.fillStyle = C.text;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(m, x + 12, 112);
      // LEDs de status do módulo (RUN / ERR) — não por canal
      ctx.fillStyle = C.green;
      ctx.beginPath();
      ctx.arc(x + 24, 150, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isBad ? (blink ? C.red : '#401010') : '#2a1a1a';
      ctx.beginPath();
      ctx.arc(x + 56, 150, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.dim;
      ctx.font = `500 14px ${FONT}`;
      ctx.fillText('RUN', x + 12, 180);
      ctx.fillText('ERR', x + 44, 180);
      ctx.font = `600 15px ${FONT}`;
      ctx.fillStyle = isBad ? C.red : C.dim;
      ctx.fillText(isBad ? (m === 'IM' ? 'DIAG ATIVO' : 'DIAG COLET.') : 'OK', x + 12, 245);
    });
    const rows = ['LINHA.PARADA_EMERGENCIA', 'LINHA.PERMISSIVO_GUIAS', 'ET2.AI04.DIAG_COLETIVO', ...MACHINES.map((m) => `${m.id}.GUIA_ENT.POS_FB`)];
    let y = 290;
    ctx.fillStyle = C.dim;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('TAG', 22, y);
    ctx.fillText('VALOR', 560, y);
    ctx.fillText('QUALIDADE', 780, y);
    y += 10;
    for (const name of rows) {
      const tag = s.plc[name];
      ctx.fillStyle = '#111a24';
      ctx.fillRect(14, y, w - 28, 38);
      let v = tag.value;
      let col = C.text;
      if (v === null) {
        v = '####';
        col = C.red;
      } else if (typeof v === 'boolean') {
        const good = name.includes('PERMISSIVO') ? v : !v;
        col = good ? C.green : C.red;
        v = v ? 'TRUE' : 'FALSE';
      } else v = `${v} ${tag.unit || ''}`;
      ctx.fillStyle = C.text;
      ctx.font = `600 19px ${MONO}`;
      ctx.fillText(name, 26, y + 25);
      ctx.fillStyle = col;
      ctx.fillText(String(v), 560, y + 25);
      const q = tag.quality || 'GOOD';
      ctx.fillStyle = q === 'GOOD' ? C.green : C.red;
      ctx.fillText(q, 780, y + 25);
      y += 42;
    }
  }

  draw_kpi(ctx, w, h, s) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    header(ctx, w, 'PRODUÇÃO · TURNO B', clock());
    const run = s.line.state === 'RUNNING';
    const down = s.line.downtimeSeconds;
    const tiles = [
      ['TEMPO PARADO', run ? '00:00:00' : fmtDur(down), run ? C.green : C.red],
      ['PRODUÇÃO (t/h)', run ? '612' : '0', run ? C.green : C.amber],
      ['BOBINAS NO TURNO', '37', C.text],
      ['PERDA ESTIMADA', run ? '—' : `${Math.round(down * 0.17)} t`, run ? C.dim : C.amber],
    ];
    tiles.forEach(([l, v, c], i) => {
      const x = 22 + (i % 2) * 496;
      const y = 84 + Math.floor(i / 2) * 150;
      ctx.fillStyle = C.panel;
      ctx.fillRect(x, y, 482, 136);
      ctx.fillStyle = C.dim;
      ctx.font = `600 22px ${FONT}`;
      ctx.fillText(l, x + 18, y + 34);
      ctx.fillStyle = c;
      ctx.font = `800 56px ${FONT}`;
      ctx.fillText(v, x + 18, y + 102);
    });
    const bx = 22;
    const by = 396;
    ctx.fillStyle = C.dim;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText('t/h — últimas 8 h', bx, by);
    const vals = [598, 605, 611, 590, 620, 608, 602, run ? 612 : 240];
    vals.forEach((v, i) => {
      const x = bx + i * 124;
      const bh = (v / 650) * 170;
      ctx.fillStyle = i === 7 && !run ? C.red : '#2a6f9e';
      ctx.fillRect(x, by + 190 - bh, 96, bh);
    });
  }

  draw_wall(ctx, w, h, s, blink) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    header(ctx, w, 'SITUAÇÃO DA LINHA — LAMINADOR DE TIRAS A QUENTE', clock());
    banner(ctx, 30, 90, w - 60, 120, s, blink, 52);
    MACHINES.forEach((m, i) => {
      const x = 30 + i * ((w - 60) / 4);
      const bw = (w - 60) / 4 - 20;
      const [txt, col] = ST[s.machines[i].state];
      ctx.fillStyle = C.panel;
      ctx.fillRect(x, 240, bw, 200);
      ctx.fillStyle = col;
      ctx.fillRect(x, 240, bw, 14);
      ctx.fillStyle = C.text;
      ctx.font = `800 80px ${FONT}`;
      ctx.fillText(m.id, x + 24, 345);
      ctx.fillStyle = col;
      ctx.font = `700 34px ${FONT}`;
      ctx.fillText(txt, x + 24, 410);
    });
    ctx.fillStyle = C.panel;
    ctx.fillRect(30, 470, w - 60, 340);
    const active = s.alarms.filter((a) => a.active);
    if (active.length) {
      ctx.fillStyle = C.red;
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText(`${active.length} ALARMES ATIVOS  ·  TEMPO PARADO ${fmtDur(s.line.downtimeSeconds)}`, 60, 530);
      ctx.fillStyle = C.text;
      active.slice(0, 5).forEach((a, i) => {
        fit(ctx, `${a.code}  ${a.message}`, 60, 590 + i * 46, w - 120, 30, 600);
      });
    } else {
      ctx.fillStyle = C.green;
      ctx.font = `800 44px ${FONT}`;
      ctx.fillText('SEM ALARMES ATIVOS', 60, 550);
      ctx.fillStyle = C.dim;
      ctx.font = `600 32px ${FONT}`;
      ctx.fillText(`Linha: ${s.line.state === 'RUNNING' ? 'em produção' : 'partida em andamento'}`, 60, 620);
    }
  }

  draw_cctvOverlay(ctx, w, h, s, blink) {
    ctx.clearRect(0, 0, w, h);
    const i = this.getCctvIndex();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, 50);
    ctx.fillStyle = '#fff';
    ctx.font = `600 26px ${MONO}`;
    ctx.fillText(`CAM-0${i + 1}  ${MACHINES[i].id} · LADO OPERADOR`, 16, 34);
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleString('pt-BR', { hour12: false }), w - 16, h - 18);
    ctx.textAlign = 'left';
    ctx.fillText('RODÍZIO 6 s', 16, h - 18);
    if (blink) {
      ctx.fillStyle = C.red;
      ctx.beginPath();
      ctx.arc(w - 90, 26, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.fillText('REC', w - 72, 34);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 50; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }
}
