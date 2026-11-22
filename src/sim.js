// Máquina de estados do cenário. Não conhece Three.js: só dados e eventos.
//
// Filosofia (realismo): numa parada de emergência real, os sistemas da planta NÃO dizem
// exatamente onde está o problema. O estado "observável" (HMI, alarmes, CLP) é ambíguo:
// uma enxurrada de alarmes quase simultâneos e um diagnóstico coletivo de módulo de E/S.
// A causa raiz só é identificável olhando o equipamento (câmera do capacete).
// O gabarito fica em `groundTruth` (a API pública não o expõe por padrão).

export const MACHINES = [
  { id: 'F1', name: 'Cadeira F1 — Trem acabador', x: -10.5 },
  { id: 'F2', name: 'Cadeira F2 — Trem acabador', x: -3.5 },
  { id: 'F3', name: 'Cadeira F3 — Trem acabador', x: 3.5 },
  { id: 'F4', name: 'Cadeira F4 — Trem acabador', x: 10.5 },
];

export const FAULT_TYPES = {
  sensor_broken: {
    description: 'Transdutor de posição danificado por impacto: carcaça da cabeça eletrônica trincada, com lasca faltando e eletrônica exposta. Sem alimentação/saída — loop 4–20 mA em 0 mA. Cabo e conector intactos.',
    visualEvidence: [
      'Cabeça do transdutor trincada, com uma lasca faltando no canto superior (placa eletrônica verde exposta)',
      'Cabeça do transdutor levemente torta em relação ao cilindro (marca de pancada)',
      'LEDs de status apagados — nos transdutores das outras cadeiras o LED verde está aceso',
      'Fragmentos da carcaça no chão, logo abaixo do transdutor',
      'Cabo laranja e conector M12 intactos e encaixados (não é problema de cabeamento)',
    ],
    fixAction: 'Substituir o transdutor de posição (cabeça eletrônica) e recalibrar a posição da guia',
    groupAlarm: 'GUIAS LATERAIS ENTRADA F1–F4 — PERMISSIVO DE POSIÇÃO AUSENTE',
  },
};

export const COMPONENT_FOR = (machineId) => ({
  id: `ZT-${machineId.slice(1)}101`,
  type: 'position_transducer',
  name: 'Transdutor de posição magnetostritivo — cilindro da guia lateral de entrada',
  location: `${machineId} — lado operador, entrada da cadeira, na ponta do cilindro da guia lateral (altura ~1,5 m)`,
  signalTag: `${machineId}.GUIA_ENT.POS_FB`,
});

const SP = 812.0;

export class Simulation {
  constructor() {
    this.listeners = new Set();
    this.events = [];
    this.version = 0;
    this.hints = true;
    this.immersive = false;
    this.player = { zone: 'control_room', position: { x: 0, y: 0, z: 0 }, headingDeg: 0, nearMachine: null, lookingAt: null };
    this.setScenario({ machineId: 'F2', faultType: 'sensor_broken' }, { silent: true });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, data = {}) {
    const ev = { type, at: new Date().toISOString(), ...data };
    this.events.push(ev);
    if (this.events.length > 60) this.events.shift();
    this.version++;
    for (const fn of this.listeners) fn(ev);
    return ev;
  }

  get fault() {
    return this.faultType === 'none' ? null : FAULT_TYPES[this.faultType];
  }
  get faultActive() {
    return this.faultType !== 'none' && !this.fixed;
  }

  setScenario({ machineId = this.machineId, faultType = this.faultType } = {}, { silent = false } = {}) {
    if (!MACHINES.find((m) => m.id === machineId)) throw new Error(`machineId inválido: ${machineId}. Use F1, F2, F3 ou F4.`);
    if (faultType !== 'none' && !FAULT_TYPES[faultType]) throw new Error(`faultType inválido: ${faultType}. Use ${Object.keys(FAULT_TYPES).join(', ')} ou none.`);
    this.machineId = machineId;
    this.faultType = faultType;
    this.startedAt = Date.now();
    this.fixed = faultType === 'none';
    this.fixedAt = null;
    this.recoverUntil = 0;
    this.lineState = faultType === 'none' ? 'RUNNING' : 'TRIPPED';
    this.lineStateSince = Date.now();
    this.interventions = [];
    this.alarmHistory = this.buildHistory();
    this.alarms = faultType === 'none' ? [] : this.buildFlood();
    if (!silent) {
      this.emit('scenario_started', {});
      if (this.alarms.length) this.emit('alarm_raised', { codes: this.alarms.map((a) => a.code) });
    } else this.version++;
  }

  /** Enxurrada de alarmes de uma parada de emergência: todos no mesmo segundo, primeira causa incerta. */
  buildFlood() {
    const t0 = Date.now() - 95_000;
    const at = (ms) => new Date(t0 + ms).toISOString();
    const f = this.fault;
    const mk = (code, severity, message, ms) => ({ code, severity, message, raisedAt: at(ms), active: true, acknowledged: false, acknowledgedAt: null, clearedAt: null });
    return [
      mk('ALM-0001', 'HIGH', 'PARADA DE EMERGÊNCIA — LAÇO DE SEGURANÇA DO TREM ACABADOR ABERTO', 0),
      mk('ALM-1203', 'HIGH', 'ACIONAMENTOS F1–F4 — HABILITAÇÃO REMOVIDA', 40),
      mk('ALM-0950', 'HIGH', f.groupAlarm, 70),
      mk('ALM-0733', 'MEDIUM', 'LOOPER F2/F3 — TENSÃO DA TIRA FORA DA FAIXA', 110),
      mk('ALM-2210', 'MEDIUM', 'E/S REMOTA ET-2 (LADO OPERADOR) — DIAGNÓSTICO COLETIVO MÓDULO AI-04', 150),
      mk('ALM-0412', 'LOW', 'HPU-02 — PRESSÃO BAIXA (TRANSITÓRIO)', 900),
      mk('ALM-0961', 'LOW', 'SPRAYS INTERCADEIRAS — VAZÃO BAIXA', 1300),
    ];
  }

  buildHistory() {
    const now = Date.now();
    const t = (min) => new Date(now - min * 60_000).toISOString();
    return [
      { code: 'ALM-0412', message: 'HPU-02 — PRESSÃO BAIXA (TRANSITÓRIO)', severity: 'LOW', raisedAt: t(48), clearedAt: t(47) },
      { code: 'ALM-0960', message: 'SPRAY INTERCADEIRAS F3/F4 — VAZÃO BAIXA', severity: 'MEDIUM', raisedAt: t(133), clearedAt: t(129) },
      { code: 'ALM-0031', message: 'TEMPERATURA DE ENTRADA ABAIXO DO ALVO (BARRA 4417)', severity: 'LOW', raisedAt: t(204), clearedAt: t(203) },
    ];
  }

  reset() {
    this.setScenario({ machineId: this.machineId, faultType: this.faultType }, { silent: true });
    this.emit('scenario_reset', {});
    if (this.alarms.length) this.emit('alarm_raised', { codes: this.alarms.map((a) => a.code) });
  }

  get activeAlarms() {
    return this.alarms.filter((a) => a.active);
  }
  get unackCount() {
    return this.alarms.filter((a) => a.active && !a.acknowledged).length;
  }

  ackAlarm(source = 'hmi') {
    const pending = this.alarms.filter((a) => a.active && !a.acknowledged);
    if (!pending.length) return false;
    const now = new Date().toISOString();
    for (const a of pending) {
      a.acknowledged = true;
      a.acknowledgedAt = now;
    }
    this.emit('alarm_acknowledged', { codes: pending.map((a) => a.code), source });
    return true;
  }

  /**
   * Intervenção física no transdutor de uma cadeira (substituir o transdutor).
   * Só resolve se for o componente realmente defeituoso — como na vida real.
   */
  intervene(machineId, source = 'player') {
    const comp = COMPONENT_FOR(machineId);
    const isFault = machineId === this.machineId && this.faultActive;
    const rec = { componentId: comp.id, machineId, at: new Date().toISOString(), source, changed: isFault };
    this.interventions.push(rec);
    this.emit('component_intervention', { componentId: comp.id, machineId, action: 'replace_transducer', changed: isFault, source });
    if (isFault) this.applyFix(source);
    return { componentId: comp.id, machineId, changed: isFault };
  }

  /** Atalho de ensaio: corrige o defeito real, onde quer que esteja. */
  fix(source = 'api') {
    if (!this.faultActive) return false;
    return this.intervene(this.machineId, source).changed;
  }

  applyFix(source) {
    this.fixed = true;
    this.fixedAt = new Date().toISOString();
    this.emit('component_fixed', { componentId: COMPONENT_FOR(this.machineId).id, machineId: this.machineId, source });
    const now = new Date().toISOString();
    for (const a of this.alarms) {
      if (!a.active) continue;
      a.active = false;
      a.clearedAt = now;
      if (!a.acknowledged) {
        a.acknowledged = true;
        a.acknowledgedAt = now;
      }
    }
    this.emit('alarm_cleared', { codes: this.alarms.map((a) => a.code) });
    this.setLineState('RECOVERING');
    this.recoverUntil = Date.now() + 5000;
  }

  setLineState(s) {
    if (this.lineState === s) return;
    const prev = this.lineState;
    this.lineState = s;
    this.lineStateSince = Date.now();
    this.emit('machine_state_changed', { from: prev, to: s });
  }

  update() {
    if (this.lineState === 'RECOVERING' && Date.now() >= this.recoverUntil) this.setLineState('RUNNING');
  }

  updatePlayer(p) {
    const prevZone = this.player.zone;
    const prevNear = this.player.nearMachine;
    this.player = p;
    if (p.zone !== prevZone) this.emit('zone_changed', { from: prevZone, to: p.zone });
    if (p.nearMachine && p.nearMachine !== prevNear) this.emit('player_near_machine', { machineId: p.nearMachine });
  }

  machineState() {
    if (this.lineState === 'RUNNING') return 'RUNNING';
    if (this.lineState === 'RECOVERING') return 'STARTING';
    return 'EMERGENCY_STOP';
  }

  /** Sinal REAL do transdutor defeituoso (gabarito). */
  signal(t = performance.now() / 1000) {
    if (!this.faultActive) return { valueMm: +(SP + Math.sin(t * 1.3) * 0.6).toFixed(1), currentMa: +(12.37 + Math.sin(t * 1.3) * 0.02).toFixed(2), quality: 'GOOD' };
    return { valueMm: null, currentMa: 0.0, quality: 'BAD_NO_SIGNAL' };
  }

  /** Tags que o CLP/SCADA enxerga. Com o diagnóstico coletivo do módulo, os 4 canais ficam BAD — sem apontar qual. */
  plcTags(t) {
    const run = this.lineState === 'RUNNING';
    const starting = this.lineState === 'RECOVERING';
    const ramp = starting ? Math.min(1, (Date.now() - this.lineStateSince) / 5000) : run ? 1 : 0;
    const diag = this.faultActive;
    const tags = {};
    MACHINES.forEach((m, i) => {
      tags[`${m.id}.GUIA_ENT.POS_SP`] = { value: SP, unit: 'mm' };
      tags[`${m.id}.GUIA_ENT.POS_FB`] = diag ? { value: null, unit: 'mm', quality: 'BAD_MODULE_DIAG' } : { value: +(SP + Math.sin(t * 1.1 + i) * 0.5).toFixed(1), unit: 'mm', quality: 'GOOD' };
      tags[`${m.id}.ACION.VEL`] = { value: +(6.8 * (1 + i * 0.18) * ramp).toFixed(2), unit: 'm/s' };
      tags[`${m.id}.FORCA_LAM`] = { value: run ? +(18.4 - i * 2.1 + Math.sin(t * 2 + i) * 0.2).toFixed(1) : 0, unit: 'MN' };
    });
    tags['ET2.AI04.DIAG_COLETIVO'] = { value: diag };
    tags['LINHA.PARADA_EMERGENCIA'] = { value: this.lineState === 'TRIPPED' };
    tags['LINHA.PERMISSIVO_GUIAS'] = { value: !diag };
    tags['LINHA.PRONTA'] = { value: run };
    tags['LINHA.TEMP_ENTRADA'] = { value: run ? +(985 + Math.sin(t * 0.7) * 4).toFixed(0) : 0, unit: '°C' };
    return tags;
  }

  snapshot() {
    const t = performance.now() / 1000;
    const comp = COMPONENT_FOR(this.machineId);
    const m = MACHINES.find((x) => x.id === this.machineId);
    const f = this.fault;
    const primary = this.alarms[0] || null;
    return {
      version: this.version,
      updatedAt: new Date().toISOString(),
      ui: { hints: this.hints, immersive: this.immersive },
      scenario: {
        status: this.faultType === 'none' ? 'no_fault' : this.fixed ? 'resolved' : 'active',
        startedAt: new Date(this.startedAt).toISOString(),
      },
      line: {
        id: 'FM-01',
        name: 'Trem acabador — Laminador de tiras a quente',
        state: this.lineState, // TRIPPED | RECOVERING | RUNNING
        stateSince: new Date(this.lineStateSince).toISOString(),
        downtimeSeconds: this.lineState === 'RUNNING' ? 0 : Math.round((Date.now() - this.startedAt) / 1000) + 95,
      },
      machines: MACHINES.map((x) => ({ id: x.id, name: x.name, state: this.machineState(), componentIds: [COMPONENT_FOR(x.id).id] })),
      alarm: primary ? { ...primary } : null,
      alarms: this.alarms.map((a) => ({ ...a })),
      activeAlarmCount: this.activeAlarms.length,
      alarmHistory: this.alarmHistory,
      plc: this.plcTags(t),
      player: this.player,
      interventions: this.interventions.slice(-10),
      recentEvents: this.events.slice(-20),
      // ---- GABARITO: removido de /api/state pelo servidor; disponível em /api/truth ----
      groundTruth:
        this.faultType === 'none'
          ? { faultType: 'none' }
          : {
              machineId: m.id,
              machineName: m.name,
              componentId: comp.id,
              componentName: comp.name,
              location: comp.location,
              faultType: this.faultType,
              description: f.description,
              visualEvidence: f.visualEvidence,
              recommendedAction: f.fixAction,
              fixed: this.fixed,
              fixedAt: this.fixedAt,
              signal: { tag: comp.signalTag, ...this.signal(t) },
            },
    };
  }
}
