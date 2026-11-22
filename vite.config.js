import { defineConfig } from 'vite';

/**
 * API local da simulação (servida pelo próprio Vite, mesma porta da página).
 *
 * O navegador que roda a simulação é a "fonte da verdade": ele publica o estado
 * em /api/sim/state e recebe comandos por SSE em /api/sim/commands.
 * Outros sistemas (agente, backend) usam apenas os endpoints públicos:
 *
 *   GET  /api                → índice/documentação resumida
 *   GET  /api/state          → estado atual (JSON)
 *   GET  /api/events         → stream SSE de eventos + estado
 *   GET  /api/snapshot       → JPEG da visão atual do técnico ("câmera do capacete")
 *   POST /api/start          → inicia o cenário atual (mesmo que reset sem teleporte)
 *   POST /api/reset          → reinicia o cenário e volta o técnico à sala de controle
 *   POST /api/scenario       → {machineId, faultType} troca o cenário
 *   POST /api/command        → {type, ...payload} comando genérico
 */
function simApi() {
  let state = null;
  let lastStateAt = 0;
  const eventClients = new Set();
  const simClients = new Set();
  const pending = new Map();
  let seq = 0;

  const send = (res, code, body, type = 'application/json') => {
    res.statusCode = code;
    res.setHeader('Content-Type', type);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.end(type === 'application/json' ? JSON.stringify(body, null, 2) : body);
  };

  const readBody = (req) =>
    new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ __invalid: true });
        }
      });
    });

  // O gabarito (groundTruth) nunca sai nas rotas "observáveis" — só em /api/truth ou com ?truth=1.
  const pub = (st, truth = false) => {
    if (!st || truth) return st;
    const { groundTruth, ...rest } = st;
    return rest;
  };

  const broadcast = (event, payload) => {
    const plain = `event: ${event}\ndata: ${JSON.stringify(event === 'state' ? pub(payload) : payload)}\n\n`;
    const full = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of eventClients) c.write(c.truth ? full : plain);
  };

  const dispatch = (cmd, timeoutMs = 5000) =>
    new Promise((resolve) => {
      if (simClients.size === 0) {
        return resolve({ ok: false, status: 503, error: 'A simulação não está aberta em nenhum navegador. Abra http://localhost:5173 primeiro.' });
      }
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, status: 504, error: 'Tempo esgotado aguardando a simulação responder.' });
      }, timeoutMs);
      pending.set(id, (ack) => {
        clearTimeout(timer);
        resolve(ack);
      });
      const msg = `data: ${JSON.stringify({ id, ...cmd })}\n\n`;
      for (const c of simClients) c.write(msg);
    });

  const docs = {
    name: 'Simulação 3D — Laminador a quente (UNMUTE demo)',
    endpoints: {
      'GET /api/state': 'O que os sistemas da planta mostram (linha, alarmes, tags de CLP, posição do técnico, intervenções). NÃO revela o componente defeituoso. ?truth=1 inclui o gabarito.',
      'GET /api/truth': 'Gabarito do cenário: máquina, componente, tipo de falha, evidências visuais, se já foi corrigido. Para validar o agente — não entregue ao agente.',
      'GET /api/events': 'Server-Sent Events. Eventos: "state" (estado observável) e "sim" (alarm_raised, alarm_acknowledged, zone_changed, player_near_machine, component_intervention, component_fixed, alarm_cleared, machine_state_changed, scenario_reset...). ?truth=1 inclui o gabarito no "state".',
      'GET /api/snapshot': 'Imagem JPEG do ponto de vista do técnico (simula a câmera do capacete).',
      'POST /api/start': 'Inicia (ou reinicia sem teletransportar) o cenário atual.',
      'POST /api/reset': 'Reinicia o cenário e leva o técnico de volta à sala de controle.',
      'POST /api/scenario': 'Body {"machineId":"F1|F2|F3|F4","faultType":"sensor_broken|none"}.',
      'POST /api/command': 'Body {"type": "reset|start|set_scenario|ack_alarm|intervene|fix|teleport|set_hints|set_immersive", ...}. Ex.: {"type":"intervene","machineId":"F2"}, {"type":"teleport","to":"F3"}.',
    },
    simulationConnected: simClients.size > 0,
  };

  async function handler(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (!p.startsWith('/api')) return next();

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.statusCode = 204;
      return res.end();
    }

    // ---------- canal interno com o navegador da simulação ----------
    if (p === '/api/sim/commands' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      simClients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        simClients.delete(res);
      });
      return;
    }
    if (p === '/api/sim/state' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.state) {
        state = body.state;
        lastStateAt = Date.now();
        broadcast('state', state);
      }
      if (Array.isArray(body.events)) for (const e of body.events) broadcast('sim', e);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/sim/ack' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.state) {
        state = body.state; // a resposta do comando já traz o estado novo
        lastStateAt = Date.now();
      }
      const cb = pending.get(body.id);
      if (cb) {
        pending.delete(body.id);
        cb(body);
      }
      return send(res, 200, { ok: true });
    }

    // ---------- API pública ----------
    if (p === '/api' || p === '/api/') {
      docs.simulationConnected = simClients.size > 0;
      return send(res, 200, docs);
    }
    if (p === '/api/state' && req.method === 'GET') {
      if (!state) return send(res, 503, { connected: false, error: 'A simulação ainda não publicou estado. Abra http://localhost:5173 no navegador.' });
      return send(res, 200, { ...pub(state, url.searchParams.has('truth')), connected: simClients.size > 0, receivedAt: new Date(lastStateAt).toISOString() });
    }
    if (p === '/api/truth' && req.method === 'GET') {
      if (!state) return send(res, 503, { error: 'A simulação ainda não publicou estado.' });
      return send(res, 200, { ...state.groundTruth, scenarioStatus: state.scenario?.status, lineState: state.line?.state });
    }
    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': connected\n\n');
      res.truth = url.searchParams.has('truth');
      if (state) res.write(`event: state\ndata: ${JSON.stringify(pub(state, res.truth))}\n\n`);
      eventClients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        eventClients.delete(res);
      });
      return;
    }
    if (p === '/api/snapshot' && req.method === 'GET') {
      const ack = await dispatch({ type: 'snapshot' }, 6000);
      if (!ack.ok || !ack.image) return send(res, ack.status || 500, { error: ack.error || 'Falha ao capturar imagem' });
      const b64 = ack.image.replace(/^data:image\/\w+;base64,/, '');
      return send(res, 200, Buffer.from(b64, 'base64'), 'image/jpeg');
    }

    let cmd = null;
    let wantTruth = url.searchParams.has('truth');
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.truth) wantTruth = true;
      if (body.__invalid) return send(res, 400, { error: 'JSON inválido' });
      if (p === '/api/start') cmd = { type: 'start' };
      else if (p === '/api/reset') cmd = { type: 'reset' };
      else if (p === '/api/scenario') cmd = { type: 'set_scenario', ...body };
      else if (p === '/api/command') cmd = body;
    }
    if (!cmd) return send(res, 404, { error: 'Endpoint não encontrado', ...docs });
    if (!cmd.type) return send(res, 400, { error: 'Campo "type" obrigatório' });

    const ack = await dispatch(cmd);
    if (!ack.ok) return send(res, ack.status || 400, { ok: false, error: ack.error });
    return send(res, 200, { ok: true, result: ack.result ?? null, state: pub(ack.state, wantTruth) });
  }

  return {
    name: 'sim-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [simApi()],
  server: { port: 5173, strictPort: true, open: false },
  preview: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
});
