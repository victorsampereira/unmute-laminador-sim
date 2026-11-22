// Ponte entre a simulação (navegador) e a API HTTP local (vite.config.js).
export class Bridge {
  constructor(sim, execute) {
    this.sim = sim;
    this.execute = execute;
    this.queue = [];
    this.timer = null;
    this.available = true;
    sim.on((ev) => {
      this.queue.push(ev);
      this.schedule(80);
    });
    setInterval(() => this.push(), 1000);
    this.connect();
  }

  connect() {
    if (!window.EventSource) return;
    const es = new EventSource('/api/sim/commands');
    es.onmessage = async (msg) => {
      let cmd;
      try {
        cmd = JSON.parse(msg.data);
      } catch {
        return;
      }
      let ack;
      try {
        const out = (await this.execute(cmd)) || {};
        ack = { id: cmd.id, ok: true, ...out };
      } catch (e) {
        ack = { id: cmd.id, ok: false, status: 400, error: String(e.message || e) };
      }
      if (!ack.image) ack.state = this.sim.snapshot();
      fetch('/api/sim/ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ack) }).catch(() => {});
      this.schedule(0);
    };
    es.onopen = () => this.schedule(0);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), ms);
  }

  push() {
    if (!this.available) return;
    const events = this.queue.splice(0);
    fetch('/api/sim/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: this.sim.snapshot(), events }),
    }).catch(() => {
      // servidor sem API (ex.: build estático) — segue sem integração
    });
  }
}
