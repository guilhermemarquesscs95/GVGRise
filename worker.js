// GVG · Alerta de Cura — servidor em tempo real (Cloudflare Worker + Durable Object)
//
// Um único "Room" guarda o estado de todos os times (mapa escolhido, pontos de
// cura usados e inimigos mortos) e avisa na hora todo mundo que está conectado.
// Os horários são sempre carimbados pelo SERVIDOR, então relógio errado de um
// aparelho não bagunça a contagem dos outros.
//
// LOGIN: ninguém recebe nem altera nada sem enviar nick + senha certa. A senha é
// conferida aqui no servidor. Para trocar depois, crie um *Secret* chamado
// GVG_PASSWORD no painel do Cloudflare (Settings > Variables and Secrets);
// sem ele vale a senha padrão abaixo.

import { DurableObject } from "cloudflare:workers";

const DEFAULT_PASSWORD = "Risewin123";

const CYCLE_MS = 60_000; // tempo de renascimento (cura e inimigos)
const POINT_DEBOUNCE_MS = 5_000; // ignora duplo clique de dois jogadores no mesmo ponto
const TEAM_IDS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const ENEMY_SLOTS = ["tank", "sup", "p1", "p2", "p3", "p4"];
const ID_RE = /^[a-z0-9_]{1,24}$/;
const MAX_POINTS_PER_TEAM = 32;
const MAX_FAILS = 8; // erros de senha por IP...
const BLOCK_MS = 60_000; // ...antes de esperar 1 minuto

function cleanNick(v) {
  return String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20);
}

// compara senhas sem vazar informação pelo tempo de resposta
async function checkPassword(given, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(given ?? "").slice(0, 200))),
    crypto.subtle.digest("SHA-256", enc.encode(String(expected))),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.data = null;
    this.fails = new Map(); // ip -> { n, until }
    // "ping" -> "pong" sem acordar o objeto (mantém a conexão viva sem custo)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async getData() {
    if (!this.data) {
      const saved = await this.ctx.storage.get("data");
      this.data = saved || { maps: {}, points: {}, enemies: {} };
    }
    return this.data;
  }

  async save() {
    await this.ctx.storage.put("data", this.data);
  }

  isBlocked(ip) {
    const f = this.fails.get(ip);
    return !!f && f.n >= MAX_FAILS && f.until > Date.now();
  }

  registerFail(ip) {
    const now = Date.now();
    let f = this.fails.get(ip) || { n: 0, until: 0 };
    if (f.until && f.until <= now) f = { n: 0, until: 0 };
    f.n++;
    if (f.n >= MAX_FAILS) f.until = now + BLOCK_MS;
    this.fails.set(ip, f);
  }

  presence(exclude) {
    const out = [];
    for (const w of this.ctx.getWebSockets()) {
      if (w === exclude) continue;
      const a = w.deserializeAttachment();
      if (a && a.auth && a.team) out.push({ id: a.id, nick: a.nick || "Sem nick", team: a.team });
    }
    return out;
  }

  // só quem já fez login recebe as atualizações
  broadcast(obj, exclude) {
    const payload = JSON.stringify(obj);
    for (const w of this.ctx.getWebSockets()) {
      if (w === exclude) continue;
      const a = w.deserializeAttachment();
      if (!a || !a.auth) continue;
      try {
        w.send(payload);
      } catch (_) {
        /* conexão já caiu */
      }
    }
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Use WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      id: crypto.randomUUID().slice(0, 8),
      ip: request.headers.get("CF-Connecting-IP") || "local",
      auth: false,
      nick: "",
      team: null,
    });
    // não envia nada aqui: o estado só vai depois do login
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 2000) return;
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (_) {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    const a = ws.deserializeAttachment() || {};
    const now = Date.now();

    // ---------- login ----------
    if (msg.t === "login") {
      if (a.auth) return;
      const fail = (reason) => ws.send(JSON.stringify({ t: "login_fail", reason }));
      if (this.isBlocked(a.ip)) return fail("bloqueado");
      const nick = cleanNick(msg.nick);
      if (nick.length < 2) return fail("nick");
      const expected = this.env.GVG_PASSWORD || DEFAULT_PASSWORD;
      if (!(await checkPassword(msg.pass, expected))) {
        this.registerFail(a.ip);
        return fail("senha");
      }
      this.fails.delete(a.ip);
      a.auth = true;
      a.nick = nick;
      a.team = TEAM_IDS.includes(String(msg.team ?? "")) ? String(msg.team) : null;
      ws.serializeAttachment(a);
      const data = await this.getData();
      ws.send(JSON.stringify({ t: "login_ok", you: a.id, nick }));
      ws.send(JSON.stringify({ t: "state", now: Date.now(), data, presence: this.presence(), you: a.id }));
      this.broadcast({ t: "presence", presence: this.presence() }, ws);
      return;
    }

    if (!a.auth) return; // sem login, nada funciona

    const data = await this.getData();
    const team = String(msg.team ?? "");

    switch (msg.t) {
      case "hello": {
        a.team = TEAM_IDS.includes(team) ? team : null;
        ws.serializeAttachment(a);
        this.broadcast({ t: "presence", presence: this.presence() });
        return;
      }

      case "map": {
        const map = String(msg.map ?? "");
        if (!TEAM_IDS.includes(team) || !ID_RE.test(map)) return;
        if (data.maps[team] !== map) {
          data.maps[team] = map;
          // mapa novo = partida nova: zera cura e inimigos desse time
          data.points[team] = {};
          data.enemies[team] = {};
          await this.save();
        }
        this.broadcast({ t: "state", now, data });
        return;
      }

      case "point": {
        const point = String(msg.point ?? "");
        if (!TEAM_IDS.includes(team) || !ID_RE.test(point)) return;
        const pts = (data.points[team] ||= {});
        if (!(point in pts) && Object.keys(pts).length >= MAX_POINTS_PER_TEAM) return;
        const prev = pts[point];
        if (!prev || now - prev >= POINT_DEBOUNCE_MS) {
          pts[point] = now;
          await this.save();
        }
        this.broadcast({ t: "state", now, data });
        return;
      }

      case "enemy": {
        const slot = String(msg.slot ?? "");
        if (!TEAM_IDS.includes(team) || !ENEMY_SLOTS.includes(slot)) return;
        const en = (data.enemies[team] ||= {});
        const prev = en[slot];
        // trava: só dá pra marcar de novo depois dos 60s completos
        if (!prev || now - prev >= CYCLE_MS) {
          en[slot] = now;
          await this.save();
        }
        this.broadcast({ t: "state", now, data });
        return;
      }
    }
  }

  async webSocketClose(ws) {
    try {
      // sempre responde com 1000: o navegador manda 1005 (sem código) e esse valor não pode ser devolvido
      ws.close(1000, "tchau");
    } catch (_) {
      /* já fechado */
    }
    this.broadcast({ t: "presence", presence: this.presence(ws) }, ws);
  }

  async webSocketError(ws) {
    this.broadcast({ t: "presence", presence: this.presence(ws) }, ws);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Use WebSocket", { status: 426 });
      }
      // sala única "gvg" (dá pra testar com ?room=teste sem mexer na sala real)
      const room =
        (url.searchParams.get("room") || "gvg").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "gvg";
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
