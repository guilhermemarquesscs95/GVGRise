// GVG · Painel We Sink — servidor em tempo real (Cloudflare Worker + Durable Object)
//
// Um único "Room" guarda:
//   - o estado ao vivo de cada time (mapa, pontos de cura, inimigos mortos, personagens dos inimigos);
//   - o cadastro de jogadores (nicks);
//   - o histórico de batalhas (vitórias/derrotas) usado na área de Análise.
// Os horários ao vivo são carimbados pelo SERVIDOR, então relógio errado de um aparelho não atrapalha.
//
// LOGIN
//   - Membro: escolhe o nick (da lista cadastrada). No PRIMEIRO acesso entra com a senha padrão do grupo
//     e é obrigado a criar uma senha pessoal; depois disso só vale a senha pessoal.
//   - Admin: usuário + senha de admin. Só o admin define as permissões de cada membro (aba Usuários e Permissões).
//   - Permissões: cura (usar a ferramenta), equipes, alianca, batalhas. Todo membro vê todas as abas.
// Tudo é conferido AQUI no servidor. Para trocar as senhas sem mexer no código, crie *Secrets* no
// painel do Cloudflare (Settings > Variables and Secrets):
//   GVG_PASSWORD, ADMIN_USER, ADMIN_PASSWORD
// Sem eles valem os padrões abaixo.

import { DurableObject } from "cloudflare:workers";

const DEFAULT_PASSWORD = "Kahineterno123@";
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
const MAX_PVP = 10000;
const PVP_MODES = { "1v1": 1, "2v2": 2, "3v3": 3 };
const PERMS = ["cura", "equipes", "alianca", "batalhas"]; // o que um membro pode fazer (o admin faz tudo + gerencia usuários)
const ALL_PERMS = [...PERMS, "usuarios"];
const DEFAULT_PERMS = ["cura"];
const PW_MIN = 8;
const PW_MAX = 64;
const PBKDF2_ITER = 10000;
const MAX_FAVS = 5;
const MAX_AVATAR = 30000; // caracteres do data URL (a tela reduz a foto para 96x96)
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
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

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function hashPw(pw, saltB64) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pw ?? "").slice(0, 200)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: PBKDF2_ITER }, key, 256);
  return toB64(bits);
}
const cleanPerms = (list) => PERMS.filter((p) => Array.isArray(list) && list.includes(p));

function cleanRoles(list, legacyReserve) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (ROLE_IDS.includes(r) && !out.includes(r)) out.push(r);
  }
  if (legacyReserve && !out.includes("reserva")) out.push("reserva");
  return ROLE_IDS.filter((r) => out.includes(r));
}

// posição primária = só uma, e tem que estar entre as funções do membro (Reserva é etiqueta, não posição)
function fixPrimary(roles, wanted) {
  const w = String(wanted ?? "");
  if (w !== "reserva" && roles.includes(w)) return w;
  return roles.find((r) => r !== "reserva") || "";
}
// até 5 personagens preferidos, sem repetir
function cleanFavs(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const id = String(c ?? "");
    if (CHAR_RE.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_FAVS) break;
  }
  return out;
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
function sanitizePlayers(list, cargos, prev = []) {
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
    const roles = cleanRoles(p && p.roles, p && p.reserve);
    const old = prev.find((x) => x.nick.toLowerCase() === key);
    // personagens preferidos só o próprio membro muda (pelo perfil): aqui sempre vale o que já estava salvo
    out.push({ nick, roles, cargo, primary: fixPrimary(roles, (p && p.primary) || (old && old.primary)), favs: old ? old.favs || [] : [] });
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
  // kind "third": confronto entre duas OUTRAS alianças. alliance = lado A, alliance2 = lado B,
  // our = composição do lado A, enemy = composição do lado B, result "w" = A venceu, "l" = B venceu.
  const third = b.kind === "third";
  const alliance2 = third ? cleanText(b.alliance2, 30) : "";
  if (!DATE_RE.test(date) || !ID_RE.test(map) || !result || alliance.length < 1) return null;
  if (third && (alliance2.length < 1 || alliance2.toLowerCase() === alliance.toLowerCase())) return null;
  const our = [];
  for (const s of (Array.isArray(b.our) ? b.our : []).slice(0, 8)) {
    const c = String((s && s.c) ?? "");
    const p = third ? "" : cleanNick(s && s.p);
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
    ...(third ? { kind: "third", alliance2 } : {}),
    date,
    map,
    alliance,
    result,
    team: !third && TEAM_IDS.includes(String(b.team ?? "")) ? String(b.team) : "",
    our,
    enemy,
    note: cleanText(b.note, 200),
  };
}

// match de PvP (1x1, 2x2 ou 3x3). Não identifica jogadores, só personagens. No ranked pode haver até 4 banimentos (opcional).
function sanitizePvp(m) {
  if (!m || typeof m !== "object") return null;
  const mode = String(m.mode ?? "");
  const n = PVP_MODES[mode];
  const date = String(m.date ?? "");
  const result = m.result === "w" ? "w" : m.result === "l" ? "l" : null;
  if (!n || !DATE_RE.test(date) || !result) return null;
  const uniqChars = (arr) => {
    const out = [];
    for (const c of Array.isArray(arr) ? arr : []) {
      const s = String(c ?? "");
      if (!CHAR_RE.test(s) || out.includes(s)) return null;
      out.push(s);
    }
    return out;
  };
  const mine = uniqChars(m.mine);
  const theirs = uniqChars(m.theirs);
  if (!mine || !theirs || mine.length !== n || theirs.length !== n) return null;
  const ranked = !!m.ranked;
  let bans = [];
  if (ranked) {
    bans = uniqChars(m.bans);
    if (!bans || bans.length > 4) return null;
  }
  return { mode, ranked, date, result, mine, theirs, bans, note: cleanText(m.note, 200) };
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.data = null;
    this.roster = null;
    this.cargos = null;
    this.plan = null;
    this.accounts = null; // { nick(minúsculo): { salt, hash, perms[] } }
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
      this.roster = saved.map((p) => {
        const roles = cleanRoles(p.roles, p.reserve);
        return { nick: p.nick, roles, cargo: p.cargo || "", primary: fixPrimary(roles, p.primary), favs: cleanFavs(p.favs) };
      });
    }
    return this.roster;
  }

  async getPlan() {
    if (!this.plan) this.plan = (await this.ctx.storage.get("plan")) || emptyPlan();
    for (const t of TEAM_IDS) this.plan.teams[t] ||= emptyTeamPlan();
    return this.plan;
  }

  async getAccounts() {
    if (!this.accounts) this.accounts = (await this.ctx.storage.get("accounts")) || {};
    return this.accounts;
  }

  async permsOf(nick) {
    const acc = (await this.getAccounts())[String(nick || "").toLowerCase()];
    return acc && acc.perms ? acc.perms : [...DEFAULT_PERMS];
  }

  // lista para a aba Usuários e Permissões (só vai para o admin)
  async userList() {
    const roster = await this.getRoster();
    const acc = await this.getAccounts();
    return roster.map((p) => {
      const a = acc[p.nick.toLowerCase()];
      return { nick: p.nick, cargo: p.cargo, hasPassword: !!(a && a.hash), perms: a && a.perms ? a.perms : [...DEFAULT_PERMS] };
    });
  }

  async avatarMap() {
    const out = {};
    for (const [k, a] of Object.entries(await this.getAccounts())) if (a && a.avatar) out[k] = a.avatar;
    return out;
  }

  async sendUsers(onlyWs) {
    const payload = JSON.stringify({ t: "users", list: await this.userList() });
    for (const w of onlyWs ? [onlyWs] : this.ctx.getWebSockets()) {
      const at = w.deserializeAttachment();
      if (!at || !at.auth || !at.admin) continue;
      try {
        w.send(payload);
      } catch (_) {}
    }
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

  // nicks de todo mundo que está conectado (com ou sem equipe escolhida), para o ponto verde da aba Equipes
  online(exclude) {
    const out = new Set();
    for (const w of this.ctx.getWebSockets()) {
      if (w === exclude) continue;
      const a = w.deserializeAttachment();
      if (a && a.auth && a.nick) out.add(String(a.nick).toLowerCase());
    }
    return [...out];
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
      return new Response(JSON.stringify({ players: roster.map((p) => ({ nick: p.nick, cargo: p.cargo })), cargos: await this.getCargos() }), {
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
      perms: [],
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
    if (typeof message !== "string" || message.length > 40000) return;
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
    // "login" = entrar; "first_password" = primeiro acesso (senha padrão + nova senha pessoal)
    if (msg.t === "login" || msg.t === "first_password") {
      if (a.auth) return;
      const send = (o) => ws.send(JSON.stringify(o));
      const fail = (reason) => send({ t: "login_fail", reason });
      if (this.isBlocked(a.ip)) return fail("bloqueado");
      const first = msg.t === "first_password";
      const group = this.env.GVG_PASSWORD || DEFAULT_PASSWORD;
      const roster = await this.getRoster();
      const accounts = await this.getAccounts();
      let nick = cleanNick(msg.nick);
      let isAdmin = false;
      let perms = [...DEFAULT_PERMS];
      let newAccount = false;

      if (!first && msg.admin) {
        isAdmin = await this.checkAdmin(msg.admin);
        if (!isAdmin) {
          this.registerFail(a.ip);
          return fail("admin");
        }
        const hit = nick && roster.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
        if (hit) nick = hit.nick;
        if (nick.length < 2) nick = "Admin";
        perms = [...ALL_PERMS];
      } else if (roster.length) {
        const hit = nick && roster.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
        if (!hit) return fail("roster");
        nick = hit.nick;
        const key = nick.toLowerCase();
        const acc = accounts[key];
        if (acc && acc.hash) {
          // já tem senha pessoal: a senha padrão não vale mais
          if (first) return fail("senha");
          if (!(await same(await hashPw(msg.pass, acc.salt), acc.hash))) {
            this.registerFail(a.ip);
            return fail("senha");
          }
          perms = acc.perms || [...DEFAULT_PERMS];
        } else {
          if (!(await same(msg.pass, group))) {
            this.registerFail(a.ip);
            return fail("senha");
          }
          if (!first) return send({ t: "login_need_password" }); // senha padrão certa: precisa criar a própria
          const np = String(msg.newpass ?? "");
          if (np.length < PW_MIN || np.length > PW_MAX) return send({ t: "pw_error", reason: "curta" });
          if (await same(np, group)) return send({ t: "pw_error", reason: "igual" });
          const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
          perms = acc && acc.perms ? acc.perms : [...DEFAULT_PERMS];
          accounts[key] = { salt, hash: await hashPw(np, salt), perms };
          await this.ctx.storage.put("accounts", accounts);
          newAccount = true;
        }
      } else {
        // ainda não há membros cadastrados: nick livre + senha do grupo
        if (!(await same(msg.pass, group))) {
          this.registerFail(a.ip);
          return fail("senha");
        }
        if (nick.length < 2) return fail("nick");
      }

      this.fails.delete(a.ip);
      a.auth = true;
      a.admin = isAdmin;
      a.perms = perms;
      a.nick = nick;
      a.team = TEAM_IDS.includes(String(msg.team ?? "")) ? String(msg.team) : null;
      ws.serializeAttachment(a);
      const data = await this.getData();
      const cargos = await this.getCargos();
      const plan = await this.getPlan();
      const mine = accounts[nick.toLowerCase()];
      send({ t: "login_ok", you: a.id, nick, admin: isAdmin, perms, profileSet: !!(mine && mine.profileSet) });
      send({ t: "state", now: Date.now(), data, presence: this.presence(), online: this.online(), you: a.id, roster, cargos, plan, avatars: await this.avatarMap() });
      if (isAdmin) await this.sendUsers(ws);
      if (newAccount) await this.sendUsers();
      this.broadcast({ t: "presence", presence: this.presence(), online: this.online() }, ws);
      return;
    }

    if (!a.auth) return; // sem login, nada funciona

    // ---------- admin (já logado como membro) ----------
    if (msg.t === "admin_login") {
      if (this.isBlocked(a.ip)) return ws.send(JSON.stringify({ t: "admin_fail", reason: "bloqueado" }));
      if (await this.checkAdmin(msg)) {
        this.fails.delete(a.ip);
        a.admin = true;
        a.perms = [...ALL_PERMS];
        ws.serializeAttachment(a);
        ws.send(JSON.stringify({ t: "admin_state", admin: true, perms: a.perms }));
        await this.sendUsers(ws);
      } else {
        this.registerFail(a.ip);
        ws.send(JSON.stringify({ t: "admin_fail", reason: "admin" }));
      }
      return;
    }
    if (msg.t === "admin_logout") {
      a.admin = false;
      a.perms = await this.permsOf(a.nick);
      ws.serializeAttachment(a);
      ws.send(JSON.stringify({ t: "admin_state", admin: false, perms: a.perms }));
      return;
    }

    const data = await this.getData();
    const team = String(msg.team ?? "");
    const can = (p) => a.admin || (a.perms || DEFAULT_PERMS).includes(p);
    const deny = () => ws.send(JSON.stringify({ t: "denied" }));
    if (["map", "point", "enemy", "echar", "echar_clear"].includes(msg.t) && !can("cura")) return deny();

    switch (msg.t) {
      case "hello": {
        a.team = TEAM_IDS.includes(team) ? team : null;
        ws.serializeAttachment(a);
        this.broadcast({ t: "presence", presence: this.presence(), online: this.online() });
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
        if (!can("alianca")) return deny();
        const cargos = sanitizeCargos(msg.cargos);
        if (!cargos) return;
        const players = sanitizePlayers(msg.players, cargos, await this.getRoster());
        if (!players) return;
        this.roster = players;
        this.cargos = cargos;
        await this.ctx.storage.put({ roster: players, cargos });
        this.broadcast({ t: "alliance", roster: players, cargos });
        // quem saiu da aliança perde a conta (senha e permissões)
        const accs = await this.getAccounts();
        const keep = new Set(players.map((p) => p.nick.toLowerCase()));
        let accChanged = false;
        for (const k of Object.keys(accs)) {
          if (!keep.has(k)) {
            delete accs[k];
            accChanged = true;
          }
        }
        if (accChanged) await this.ctx.storage.put("accounts", accs);
        await this.sendUsers();
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
        if (!can("equipes")) return deny();
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

      // ---------- perfil (cada um mexe só no seu: o nick vem da conexão, nunca da mensagem) ----------
      case "profile_set": {
        const roster = await this.getRoster();
        const me = roster.find((p) => p.nick.toLowerCase() === String(a.nick).toLowerCase());
        if (!me) return;
        const primary = String(msg.primary ?? "");
        if (!ROLE_IDS.includes(primary) || primary === "reserva") return; // a posição primária é obrigatória
        const secondary = cleanRoles(msg.secondary).filter((r) => r !== "reserva" && r !== primary);
        // "Reserva" é decisão da liderança: se já tinha, continua
        me.roles = cleanRoles([primary, ...secondary, ...(me.roles.includes("reserva") ? ["reserva"] : [])]);
        me.primary = primary;
        me.favs = cleanFavs(msg.favs);
        const accs = await this.getAccounts();
        const key = me.nick.toLowerCase();
        accs[key] = { ...(accs[key] || { perms: [...DEFAULT_PERMS] }), profileSet: true };
        await this.ctx.storage.put({ roster, accounts: accs });
        this.broadcast({ t: "alliance", roster, cargos: await this.getCargos() });
        ws.send(JSON.stringify({ t: "profile_ok" }));
        await this.sendUsers();
        return;
      }

      case "avatar_set": {
        const roster = await this.getRoster();
        const me = roster.find((p) => p.nick.toLowerCase() === String(a.nick).toLowerCase());
        if (!me) return;
        const av = String(msg.avatar ?? "");
        if (av && (av.length > MAX_AVATAR || !AVATAR_RE.test(av))) return ws.send(JSON.stringify({ t: "avatar_error" }));
        const accs = await this.getAccounts();
        const key = me.nick.toLowerCase();
        accs[key] = { ...(accs[key] || { perms: [...DEFAULT_PERMS] }) };
        if (av) accs[key].avatar = av;
        else delete accs[key].avatar;
        await this.ctx.storage.put("accounts", accs);
        this.broadcast({ t: "avatar", nick: me.nick, avatar: av });
        return;
      }

      // troca da própria senha (precisa da atual)
      case "pw_change": {
        const send = (o) => ws.send(JSON.stringify(o));
        if (this.isBlocked(a.ip)) return send({ t: "pwc_error", reason: "bloqueado" });
        const roster = await this.getRoster();
        const me = roster.find((p) => p.nick.toLowerCase() === String(a.nick).toLowerCase());
        const accs = await this.getAccounts();
        const acc = me && accs[me.nick.toLowerCase()];
        if (!acc || !acc.hash) return send({ t: "pwc_error", reason: "semsenha" });
        if (!(await same(await hashPw(msg.old, acc.salt), acc.hash))) {
          this.registerFail(a.ip);
          return send({ t: "pwc_error", reason: "atual" });
        }
        const np = String(msg.pass ?? "");
        if (np.length < PW_MIN || np.length > PW_MAX) return send({ t: "pwc_error", reason: "curta" });
        if (await same(np, this.env.GVG_PASSWORD || DEFAULT_PASSWORD)) return send({ t: "pwc_error", reason: "igual" });
        const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
        accs[me.nick.toLowerCase()] = { ...acc, salt, hash: await hashPw(np, salt) };
        await this.ctx.storage.put("accounts", accs);
        this.fails.delete(a.ip);
        send({ t: "pwc_ok" });
        return;
      }

      // admin define uma senha nova para qualquer membro (as senhas são guardadas só como hash: dá para trocar, não para ver)
      case "pw_admin_set": {
        if (!a.admin) return deny();
        const roster = await this.getRoster();
        const hit = roster.find((p) => p.nick.toLowerCase() === cleanNick(msg.nick).toLowerCase());
        const np = String(msg.pass ?? "");
        if (!hit) return;
        if (np.length < PW_MIN || np.length > PW_MAX) return ws.send(JSON.stringify({ t: "pwa_error", nick: hit.nick }));
        const accs = await this.getAccounts();
        const key = hit.nick.toLowerCase();
        const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
        accs[key] = { ...(accs[key] || { perms: [...DEFAULT_PERMS] }), salt, hash: await hashPw(np, salt) };
        await this.ctx.storage.put("accounts", accs);
        ws.send(JSON.stringify({ t: "pwa_ok", nick: hit.nick }));
        await this.sendUsers();
        return;
      }

      // ---------- usuários e permissões (só admin) ----------
      case "users_get": {
        if (!a.admin) return deny();
        await this.sendUsers(ws);
        return;
      }

      case "perms_set": {
        if (!a.admin) return deny();
        const roster = await this.getRoster();
        const hit = roster.find((p) => p.nick.toLowerCase() === cleanNick(msg.nick).toLowerCase());
        if (!hit) return;
        const perms = cleanPerms(msg.perms);
        const accs = await this.getAccounts();
        const key = hit.nick.toLowerCase();
        accs[key] = { ...(accs[key] || {}), perms };
        await this.ctx.storage.put("accounts", accs);
        // quem está conectado agora recebe as novas permissões na hora
        for (const w of this.ctx.getWebSockets()) {
          const at = w.deserializeAttachment();
          if (!at || !at.auth || at.admin || String(at.nick).toLowerCase() !== key) continue;
          at.perms = perms;
          w.serializeAttachment(at);
          try {
            w.send(JSON.stringify({ t: "perms", perms }));
          } catch (_) {}
        }
        await this.sendUsers();
        return;
      }

      // apaga a senha pessoal: no próximo acesso a pessoa entra com a senha padrão e cria outra
      case "pw_reset": {
        if (!a.admin) return deny();
        const roster = await this.getRoster();
        const hit = roster.find((p) => p.nick.toLowerCase() === cleanNick(msg.nick).toLowerCase());
        if (!hit) return;
        const accs = await this.getAccounts();
        const key = hit.nick.toLowerCase();
        if (accs[key]) {
          const { salt, hash, ...rest } = accs[key];
          accs[key] = { ...rest, perms: rest.perms || [...DEFAULT_PERMS] };
          await this.ctx.storage.put("accounts", accs);
        }
        await this.sendUsers();
        return;
      }

      case "battle_save": {
        if (!can("batalhas")) return deny();
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

      // ---------- PvP (qualquer membro lança; edita/apaga só o que lançou, a liderança com "batalhas" e o admin mexem em tudo) ----------
      case "pvp_get": {
        const map = await this.ctx.storage.list({ prefix: "p:", limit: MAX_PVP + 10 });
        const list = [...map.values()].sort((x, y) => (x.date === y.date ? x.ts - y.ts : x.date < y.date ? -1 : 1));
        ws.send(JSON.stringify({ t: "pvp", list }));
        return;
      }

      case "pvp_save": {
        const clean = sanitizePvp(msg.match);
        if (!clean) return ws.send(JSON.stringify({ t: "pvp_error" }));
        const id = String((msg.match && msg.match.id) ?? "");
        let rec;
        if (id && /^[a-z0-9]{4,20}$/.test(id)) {
          const prev = await this.ctx.storage.get("p:" + id);
          if (!prev) return ws.send(JSON.stringify({ t: "pvp_error" }));
          if (!(can("batalhas") || String(prev.by).toLowerCase() === String(a.nick).toLowerCase())) return deny();
          rec = { ...prev, ...clean, id, edited: now };
        } else {
          const count = (await this.ctx.storage.list({ prefix: "p:", limit: MAX_PVP + 1 })).size;
          if (count >= MAX_PVP) return ws.send(JSON.stringify({ t: "pvp_error" }));
          const nid = now.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
          rec = { ...clean, id: nid, ts: now, by: a.nick };
        }
        await this.ctx.storage.put("p:" + rec.id, rec);
        ws.send(JSON.stringify({ t: "pvp_saved", id: rec.id }));
        this.broadcast({ t: "pvp_dirty" });
        return;
      }

      case "pvp_del": {
        const id = String(msg.id ?? "");
        if (!/^[a-z0-9]{4,20}$/.test(id)) return;
        const prev = await this.ctx.storage.get("p:" + id);
        if (!prev) return;
        if (!(can("batalhas") || String(prev.by).toLowerCase() === String(a.nick).toLowerCase())) return deny();
        await this.ctx.storage.delete("p:" + id);
        this.broadcast({ t: "pvp_dirty" });
        return;
      }

      case "battle_del": {
        if (!can("batalhas")) return deny();
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
    this.broadcast({ t: "presence", presence: this.presence(ws), online: this.online(ws) }, ws);
  }

  async webSocketError(ws) {
    this.broadcast({ t: "presence", presence: this.presence(ws), online: this.online(ws) }, ws);
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
