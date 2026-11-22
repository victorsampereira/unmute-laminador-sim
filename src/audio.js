// Áudio sintetizado (sem arquivos): ambiente do galpão, auxiliares (hidráulica/ventilação),
// zumbido dos acionamentos, bipes de alarme na sala de controle e buzina de emergência no galpão.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.nextBeep = 0;
    this.nextHorn = 0;
    this.volume = 0.8;
  }

  /** Cria o contexto (precisa de um gesto do usuário) ou o retoma se estiver suspenso. */
  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    if (ctx.state !== 'running') ctx.resume().catch(() => {});

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);

    // ruído marrom (ambiente industrial)
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const noise = () => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start(0, Math.random() * 3);
      return src;
    };
    // camada 1: ambiente do galpão (sempre presente; mais forte com a linha rodando)
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'lowpass';
    this.noiseFilter.frequency.value = 600;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise().connect(this.noiseFilter).connect(this.noiseGain).connect(this.master);

    // camada 2: auxiliares (bombas hidráulicas, ventilação) — continuam ligadas na parada
    this.auxGain = ctx.createGain();
    this.auxGain.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    const auxNoise = ctx.createGain();
    auxNoise.gain.value = 0.35;
    noise().connect(bp).connect(auxNoise).connect(this.auxGain);
    for (const [f, g] of [
      [100, 0.06],
      [200, 0.03],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.auxGain);
      o.start();
    }
    this.auxGain.connect(this.master);

    // camada 3: zumbido elétrico dos acionamentos principais (só com a linha girando)
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
      og.gain.value = g * 0.12;
      o.connect(og).connect(this.humGain);
      o.start();
    }
    const hlp = ctx.createBiquadFilter();
    hlp.type = 'lowpass';
    hlp.frequency.value = 900;
    this.humGain.connect(hlp).connect(this.master);
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** Nível RMS da saída (para testes/diagnóstico). */
  level() {
    if (!this.analyser) return 0;
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    let s = 0;
    for (const v of a) s += v * v;
    return Math.sqrt(s / a.length);
  }

  tone(freq, dur = 0.12, type = 'square', vol = 0.12, when = 0, freqEnd = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.linearRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() {
    this.tone(1400, 0.06, 'triangle', 0.15);
  }
  success() {
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.22, i * 0.12));
  }
  connectSnap() {
    this.tone(180, 0.08, 'square', 0.2);
    this.tone(1800, 0.05, 'triangle', 0.12, 0.06);
  }
  /** Buzina de emergência do galpão (dois tons). */
  horn(vol) {
    this.tone(440, 0.55, 'sawtooth', vol, 0, 470);
    this.tone(554, 0.55, 'sawtooth', vol * 0.8, 0);
  }

  update(sim, inRoom) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const run = sim.lineState === 'RUNNING';
    const starting = sim.lineState === 'RECOVERING';
    const room = inRoom ? 0.45 : 1;
    this.noiseGain.gain.setTargetAtTime((run ? 0.55 : starting ? 0.42 : 0.3) * room, t, 0.5);
    this.noiseFilter.frequency.setTargetAtTime(inRoom ? 380 : run ? 1000 : 650, t, 0.3);
    this.auxGain.gain.setTargetAtTime((inRoom ? 0.12 : 0.45) * (run ? 1 : 0.85), t, 0.5);
    this.humGain.gain.setTargetAtTime((run ? 1 : starting ? 0.65 : 0) * room, t, starting ? 1.2 : 0.4);

    // alarmes
    const active = sim.activeAlarms.length > 0;
    if (!active) return;
    const now = performance.now();
    const unack = sim.unackCount > 0;
    if (inRoom && now > this.nextBeep) {
      // bipe do console: insistente enquanto houver alarme não reconhecido
      if (unack) {
        this.tone(988, 0.16, 'square', 0.16);
        this.tone(988, 0.16, 'square', 0.16, 0.24);
        this.nextBeep = now + 1500;
      } else {
        this.tone(740, 0.12, 'sine', 0.06);
        this.nextBeep = now + 6000;
      }
    }
    if (!inRoom && sim.lineState === 'TRIPPED' && now > this.nextHorn) {
      this.horn(0.09);
      this.nextHorn = now + 4500;
    }
  }
}
