// GVG · Painel We Sink — servidor em tempo real (Cloudflare Worker + Durable Object)
//
// Um único "Room" guarda:
//   - o estado ao vivo de cada time (mapa, pontos de cura, inimigos mortos, personagens dos inimigos);
//   - o cadastro de jogadores (nicks);
//   - o histórico de batalhas (vitórias/derrotas) usado na área de Análise.
// Os horários ao vivo são carimbados pelo SERVIDOR, então relógio errado de um aparelho não atrapalha.
//
// LOGIN
//   - Membro: escolhe o nick (da lista cadastrada) + senha do grupo.
//   - Admin: usuário + senha de admin. Só o admin cadastra jogadores e lança/edita/apaga batalhas.
// Tudo é conferido AQUI no servidor. Para trocar as senhas sem mexer no código, crie *Secrets* no
// painel do Cloudflare (Settings > Variables and Secrets):
//   GVG_PASSWORD, ADMIN_USER, ADMIN_PASSWORD
// Sem eles valem os padrões abaixo.

import { DurableObject } from "cloudflare:workers";

const DEFAULT_PASSWORD = "Risewin123";
const DEFAULT_ADMIN_USER = "tiopatinhas";
const DEFAULT_ADMIN_PASSWORD = "admin123";

const CYCLE_MS = 60_000; // tempo de renascimento (cura e inimigos)
const POINT_DEBOUNCE_MS = 5_000; // ignora duplo clique de dois jogadores no mesmo ponto
const TEAM_IDS = ["1", "2", "3", "4"]; // o jogo só permite 4 equipes
const ENEMY_SLOTS = ["tank", "sup", "p1", "p2", "p3", "p4"];
const ID_RE = /^[a-z0-9_]{1,24}$/;
const CHAR_RE = /^[a-z0-9_]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_POINTS_PER_TEAM = 32;
const MAX_PLAYERS = 80;
const MAX_CARGOS = 20;
const MAIN_SLOTS = 6; // titulares de cada equipe: Tank, Suporte, DPS Ranged + 3 (DPS Melee ou Bruiser)
const RESERVE_SLOTS = 2;
const ROLE_IDS = ["tank", "melee", "ranged", "bruiser", "support", "reserva"];
const DEFAULT_CARGOS = ["Líder", "Vice-líder", "Oficial", "Membro"];
const MAX_BATTLES = 5000;
const MAX_FAILS = 8; // erros de senha por IP...
const BLOCK_MS = 60_000; // ...antes de esperar 1 minuto

function cleanText(v, max) {
  return String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
const cleanNick = (v) => cleanText(v, 20);

// compara textos sem vazar informação pelo tempo de resposta
async function same(given, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(given ?? "").slice(0, 200))),
    crypto.subtle.digest("SHA-256", enc.encode(String(expected))),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function cleanRoles(list, legacyReserve) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (ROLE_IDS.includes(r) && !out.includes(r)) out.push(r);
  }
  if (legacyReserve && !out.includes("reserva")) out.push("reserva");
  return ROLE_IDS.filter((r) => out.includes(r));
}

function sanitizeCargos(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const c of list.slice(0, MAX_CARGOS)) {
    const name = cleanText(c, 24);
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

// membros: nick + funções (várias) + cargo (um, tem que existir na lista de cargos)
function sanitizePlayers(list, cargos) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const p of list.slice(0, MAX_PLAYERS)) {
    const nick = cleanNick(p && p.nick);
    if (nick.length < 2) continue;
    const key = nick.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const asked = cleanText(p && p.cargo, 24);
    const cargo = cargos.find((c) => c.toLowerCase() === asked.toLowerCase()) || "";
    out.push({ nick, roles: cleanRoles(p && p.roles, p && p.reserve), cargo });
  }
  return out;
}

// escala das equipes: { "1": { map, slots[6], reserves[2], leader, confirmed }, ... }
function emptyTeamPlan() {
  return { map: "", slots: Array(MAIN_SLOTS).fill(""), reserves: Array(RESERVE_SLOTS).fill(""), leader: "", confirmed: false };
}
function emptyPlan() {
  const teams = {};
  for (const t of TEAM_IDS) teams[t] = emptyTeamPlan();
  return { teams };
}
function sanitizeTeamPlan(raw, roster) {
  const canon = (n) => {
    const q = cleanNick(n).toLowerCase();
    const hit = q && roster.find((p) => p.nick.toLowerCase() === q);
    return hit ? hit.nick : "";
  };
  const used = new Set();
  const pickOne = (n) => {
    const c = canon(n);
    if (!c || used.has(c)) return "";
    used.add(c);
    return c;
  };
  const r = raw && typeof raw === "object" ? raw : {};
  const slots = Array.from({ length: MAIN_SLOTS }, (_, i) => pickOne((r.slots || [])[i]));
  const reserves = Array.from({ length: RESERVE_SLOTS }, (_, i) => pickOne((r.reserves || [])[i]));
  const leader = [...slots, ...reserves].includes(canon(r.leader)) ? canon(r.leader) : "";
  const map = ID_RE.test(String(r.map ?? "")) ? String(r.map) : "";
  return { map, slots, reserves, leader, confirmed: !!r.confirmed };
}

function sanitizeBattle(b) {
  if (!b || typeof b !== "object") return null;
  const date = String(b.date ?? "");
  const map = String(b.map ?? "");
  const result = b.result === "w" ? "w" : b.result === "l" ? "l" : null;
  const alliance = cleanText(b.alliance, 30);
  if (!DATE_RE.test(date) || !ID_RE.test(map) || !result || alliance.length < 1) return null;
  const our = [];
  for (const s of (Array.isArray(b.our) ? b.our : []).slice(0, 8)) {
    const c = String((s && s.c) ?? "");
    const p = cleanNick(s && s.p);
    if (!p && !c) continue;
    if (c && !CHAR_RE.test(c)) return null;
    our.push({ p, c });
  }
  const enemy = [];
  for (const c of (Array.isArray(b.enemy) ? b.enemy : []).slice(0, 8)) {
    const s = String(c ?? "");
    if (!CHAR_RE.test(s)) return null;
    enemy.push(s);
  }
  return {
    date,
    map,
    alliance,
    result,
    team: TEAM_IDS.includes(String(b.team ?? "")) ? String(b.team) : "",
    our,
    enemy,
    note: cleanText(b.note, 200),
  };
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.data = null;
    this.roster = null;
    this.cargos = null;
    this.plan = null;
    this.fails = new Map(); // ip -> { n, until }
    // "ping" -> "pong" sem acordar o objeto (mantém a conexão viva sem custo)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async getData() {
    if (!this.data) {
      const saved = await this.ctx.storage.get("data");
      this.data = saved || { maps: {}, points: {}, enemies: {} };
      this.data.chars ||= {};
    }
    return this.data;
  }

  async save() {
    await this.ctx.storage.put("data", this.data);
  }

  async getRoster() {
    if (!this.roster) {
      const saved = (await this.ctx.storage.get("roster")) || [];
      // versão antiga guardava só { nick, reserve }
      this.roster = saved.map((p) => ({ nick: p.nick, roles: cleanRoles(p.roles, p.reserve), cargo: p.cargo || "" }));
    }
    return this.roster;
  }

  async getPlan() {
    if (!this.plan) this.plan = (await this.ctx.storage.get("plan")) || emptyPlan();
    for (const t of TEAM_IDS) this.plan.teams[t] ||= emptyTeamPlan();
    return this.plan;
  }

  async getCargos() {
    if (!this.cargos) this.cargos = (await this.ctx.storage.get("cargos")) || [...DEFAULT_CARGOS];
    return this.cargos;
  }

  async getBattles() {
    const map = await this.ctx.storage.list({ prefix: "b:", limit: MAX_BATTLES + 10 });
    return [...map.values()].sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1));
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
    const url = new URL(request.url);
    if (url.pathname === "/roster") {
      const roster = await this.getRoster();
      return new Response(JSON.stringify({ players: roster.map((p) => ({ nick: p.nick })) }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
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
      admin: false,
      nick: "",
      team: null,
    });
    // não envia nada aqui: o estado só vai depois do login
    return new Response(null, { status: 101, webSocket: client });
  }

  async checkAdmin(adm) {
    if (!adm || typeof adm !== "object") return false;
    const u = this.env.ADMIN_USER || DEFAULT_ADMIN_USER;
    const p = this.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const [a, b] = await Promise.all([same(String(adm.user ?? "").trim().toLowerCase(), u.toLowerCase()), same(adm.pass, p)]);
    return a && b;
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 12000) return;
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
      const wantsAdmin = !!msg.admin;
      let isAdmin = false;
      if (wantsAdmin) {
        isAdmin = await this.checkAdmin(msg.admin);
        if (!isAdmin) {
          this.registerFail(a.ip);
          return fail("admin");
        }
      } else if (!(await same(msg.pass, this.env.GVG_PASSWORD || DEFAULT_PASSWORD))) {
        this.registerFail(a.ip);
        return fail("senha");
      }
      let nick = cleanNick(msg.nick);
      const roster = await this.getRoster();
      if (roster.length && nick) {
        const hit = roster.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
        if (hit) nick = hit.nick;
        else if (!isAdmin) return fail("roster");
      }
      if (!isAdmin && nick.length < 2) return fail("nick");
      if (isAdmin && nick.length < 2) nick = "Admin";
      this.fails.delete(a.ip);
      a.auth = true;
      a.admin = isAdmin;
      a.nick = nick;
      a.team = TEAM_IDS.includes(String(msg.team ?? "")) ? String(msg.team) : null;
      ws.serializeAttachment(a);
      const data = await this.getData();
      const cargos = await this.getCargos();
      const plan = await this.getPlan();
      ws.send(JSON.stringify({ t: "login_ok", you: a.id, nick, admin: isAdmin }));
      ws.send(
        JSON.stringify({ t: "state", now: Date.now(), data, presence: this.presence(), you: a.id, roster, cargos, plan }),
      );
      this.broadcast({ t: "presence", presence: this.presence() }, ws);
      return;
    }

    if (!a.auth) return; // sem login, nada funciona

    // ---------- admin (já logado como membro) ----------
    if (msg.t === "admin_login") {
      if (this.isBlocked(a.ip)) return ws.send(JSON.stringify({ t: "admin_fail", reason: "bloqueado" }));
      if (await this.checkAdmin(msg)) {
        this.fails.delete(a.ip);
        a.admin = true;
        ws.serializeAttachment(a);
        ws.send(JSON.stringify({ t: "admin_state", admin: true }));
      } else {
        this.registerFail(a.ip);
        ws.send(JSON.stringify({ t: "admin_fail", reason: "admin" }));
      }
      return;
    }
    if (msg.t === "admin_logout") {
      a.admin = false;
      ws.serializeAttachment(a);
      ws.send(JSON.stringify({ t: "admin_state", admin: false }));
      return;
    }

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
          // mapa novo = partida nova: zera cura, inimigos e rostos desse time
          data.points[team] = {};
          data.enemies[team] = {};
          data.chars[team] = {};
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

      // rosto do inimigo em cada bolinha (qualquer membro pode trocar, o jogo é dinâmico)
      case "echar": {
        const slot = String(msg.slot ?? "");
        const ch = String(msg.char ?? "");
        if (!TEAM_IDS.includes(team) || !ENEMY_SLOTS.includes(slot)) return;
        if (ch && !CHAR_RE.test(ch)) return;
        const cs = (data.chars[team] ||= {});
        if (ch) cs[slot] = ch;
        else delete cs[slot];
        await this.save();
        this.broadcast({ t: "state", now, data });
        return;
      }

      case "echar_clear": {
        if (!TEAM_IDS.includes(team)) return;
        data.chars[team] = {};
        await this.save();
        this.broadcast({ t: "state", now, data });
        return;
      }

      // ---------- análise ----------
      case "get_battles": {
        ws.send(JSON.stringify({ t: "battles", list: await this.getBattles() }));
        return;
      }

      // cadastro da aliança: membros (nick, funções, cargo) e a lista de cargos
      case "alliance_set": {
        if (!a.admin) return ws.send(JSON.stringify({ t: "denied" }));
        const cargos = sanitizeCargos(msg.cargos);
        if (!cargos) return;
        const players = sanitizePlayers(msg.players, cargos);
        if (!players) return;
        this.roster = players;
        this.cargos = cargos;
        await this.ctx.storage.put({ roster: players, cargos });
        this.broadcast({ t: "alliance", roster: players, cargos });
        // quem saiu da aliança sai também das equipes
        const plan = await this.getPlan();
        let changed = false;
        for (const t of TEAM_IDS) {
          const clean = sanitizeTeamPlan(plan.teams[t], players);
          if (JSON.stringify(clean) !== JSON.stringify(plan.teams[t])) {
            plan.teams[t] = { ...clean, confirmed: false };
            changed = true;
          }
        }
        if (changed) {
          await this.ctx.storage.put("plan", plan);
          this.broadcast({ t: "plan", plan });
        }
        return;
      }

      // escala de uma equipe (admin). Quem for colocado aqui sai das outras equipes.
      case "plan_set": {
        if (!a.admin) return ws.send(JSON.stringify({ t: "denied" }));
        if (!TEAM_IDS.includes(team)) return;
        const roster = await this.getRoster();
        const plan = await this.getPlan();
        const mine = sanitizeTeamPlan(msg.plan, roster);
        const taken = new Set([...mine.slots, ...mine.reserves].filter(Boolean));
        plan.teams[team] = mine;
        for (const t of TEAM_IDS) {
          if (t === team) continue;
          const o = plan.teams[t];
          const hit = [...o.slots, ...o.reserves].some((n) => taken.has(n));
          if (!hit) continue;
          const rm = (n) => (taken.has(n) ? "" : n);
          plan.teams[t] = sanitizeTeamPlan({ ...o, slots: o.slots.map(rm), reserves: o.reserves.map(rm), confirmed: false }, roster);
        }
        await this.ctx.storage.put("plan", plan);
        this.broadcast({ t: "plan", plan });
        return;
      }

      case "battle_save": {
        if (!a.admin) return ws.send(JSON.stringify({ t: "denied" }));
        const clean = sanitizeBattle(msg.battle);
        if (!clean) return ws.send(JSON.stringify({ t: "battle_error" }));
        let id = String((msg.battle && msg.battle.id) ?? "");
        let rec;
        if (id && /^[a-z0-9]{4,20}$/.test(id)) {
          const prev = await this.ctx.storage.get("b:" + id);
          if (!prev) return ws.send(JSON.stringify({ t: "battle_error" }));
          rec = { ...prev, ...clean, id, edited: now, editedBy: a.nick };
        } else {
          const count = (await this.ctx.storage.list({ prefix: "b:", limit: MAX_BATTLES + 1 })).size;
          if (count >= MAX_BATTLES) return ws.send(JSON.stringify({ t: "battle_error" }));
          id = now.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
          rec = { ...clean, id, ts: now, by: a.nick };
        }
        await this.ctx.storage.put("b:" + id, rec);
        ws.send(JSON.stringify({ t: "battle_saved", id }));
        this.broadcast({ t: "battles_dirty" });
        return;
      }

      case "battle_del": {
        if (!a.admin) return ws.send(JSON.stringify({ t: "denied" }));
        const id = String(msg.id ?? "");
        if (!/^[a-z0-9]{4,20}$/.test(id)) return;
        await this.ctx.storage.delete("b:" + id);
        this.broadcast({ t: "battles_dirty" });
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

function roomStub(env, url) {
  // sala única "gvg" (dá pra testar com ?room=teste sem mexer na sala real)
  const room =
    (url.searchParams.get("room") || "gvg").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "gvg";
  return env.ROOM.get(env.ROOM.idFromName(room));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Use WebSocket", { status: 426 });
      }
      return roomStub(env, url).fetch(request);
    }

    // lista pública só com os nicks (para a tela de login mostrar as opções)
    if (url.pathname === "/api/roster") {
      return roomStub(env, url).fetch(new Request(new URL("/roster", url.origin)));
    }

    return new Response("Not found", { status: 404 });
  },
};
