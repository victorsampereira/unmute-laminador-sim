// Áudio sintetizado (sem arquivos): ambiente do galpão, zumbido dos motores, bipes de alarme.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.nextBeep = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // ruído marrom (ambiente industrial)
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.noiseFilter = lp;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    src.connect(lp).connect(this.noiseGain).connect(this.master);
    src.start();

    // zumbido elétrico dos acionamentos
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    for (const [f, g] of [
      [60, 0.5],
      [120, 0.3],
      [180, 0.12],
      [347, 0.05],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g * 0.08;
      o.connect(og).connect(this.humGain);
      o.start();
    }
    const hlp = ctx.createBiquadFilter();
    hlp.type = 'lowpass';
    hlp.frequency.value = 900;
    this.humGain.connect(hlp).connect(this.master);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  tone(freq, dur = 0.12, type = 'square', vol = 0.12, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() {
    this.tone(1400, 0.05, 'triangle', 0.08);
  }
  success() {
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.14, i * 0.11));
  }
  connectSnap() {
    this.tone(220, 0.06, 'square', 0.12);
    this.tone(1800, 0.04, 'triangle', 0.08, 0.05);
  }

  update(sim, inRoom) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const run = sim.lineState === 'RUNNING';
    const starting = sim.lineState === 'RECOVERING';
    const room = inRoom ? 0.35 : 1;
    this.noiseGain.gain.setTargetAtTime((run ? 0.32 : starting ? 0.22 : 0.12) * room, t, 0.4);
    this.noiseFilter.frequency.setTargetAtTime(inRoom ? 350 : run ? 900 : 600, t, 0.3);
    this.humGain.gain.setTargetAtTime((run ? 1 : starting ? 0.6 : 0.08) * room, t, starting ? 1.2 : 0.4);
    // bipes de alarme
    const alarmOn = sim.alarm && sim.alarm.active;
    if (alarmOn && performance.now() > this.nextBeep) {
      const unack = !sim.alarm.acknowledged;
      if (inRoom && unack) {
        this.tone(988, 0.16, 'square', 0.07);
        this.tone(988, 0.16, 'square', 0.07, 0.25);
        this.nextBeep = performance.now() + 1600;
      } else {
        this.tone(740, 0.35, 'sawtooth', inRoom ? 0.015 : 0.035);
        this.nextBeep = performance.now() + 2600;
      }
    }
  }
}
