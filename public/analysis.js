/* ================= Análise, lançamento de batalhas e jogadores ================= */

let battles = [];
let battlesLoaded = false;
const flt = {period: 'all', map: '', alliance: '', player: ''};   // player: 'w:nick' (nosso) ou 'e:nick' (adversário)
let charSide = 'rivais';       // 'rivais' | 'nossos' | 'todos'
let charSort = 'uso';          // 'uso' | 'melhor' | 'pior'
let showAllChars = false;
let showAllHist = false;
const MIN_RATE = 3;            // mínimo de batalhas para entrar no ranking por aproveitamento
const LOW_N = 5;               // abaixo disso o percentual aparece apagado (amostra pequena)

/* ---------- ligações com o resto do app ---------- */

function onAuthed(){
  battlesLoaded = false;
  if(typeof resetPvp === 'function') resetPvp();
  if(currentTab === 'pvp') send({t:'pvp_get'}, true);
  if(currentTab === 'analise') send({t:'get_battles'}, true);
}
function enterAnalysis(){
  if(!battlesLoaded) send({t:'get_battles'}, true);
  renderAnalysis();
}
// desempenho de um membro por personagem nas batalhas de GVG (só as batalhas We Sink em que o nick dele foi lançado)
function memberCharStats(nick){
  const n = String(nick).toLowerCase(), m = new Map();
  battles.filter(isWe).forEach(b => {
    const seen = new Set();
    (b.our || []).forEach(s => {
      if(!s.p || !s.c || s.p.toLowerCase() !== n || seen.has(s.c)) return;
      seen.add(s.c);
      const e = m.get(s.c) || {n: 0, w: 0, l: 0};
      e.n++; if(b.result === 'w') e.w++; else e.l++;
      m.set(s.c, e);
    });
  });
  return m;
}
function onBattles(list){
  battles = list;
  battlesLoaded = true;
  if(typeof refreshCounters === 'function') refreshCounters();
  if(typeof profViewNick !== 'undefined' && profViewNick && $('pvClose')) openMemberProfile(profViewNick);
  if(currentTab === 'analise') renderAnalysis();
  if(currentTab === 'personagens') renderCharacters();
}
function onBattlesDirty(){ send({t:'get_battles'}, true); }
function onAdminChanged(){
  if(currentTab === 'analise') renderAnalysis();
  if(currentTab === 'alianca') renderAlliance();
}
function onRosterChanged(){
  if(currentTab === 'alianca') renderAlliance();
  if(currentTab === 'equipes') renderTeams();
  if(currentTab === 'personagens') renderCharacters();
  renderMyTeamCard();
}
function onLiveStateChanged(){}

/* ---------- utilidades ---------- */

const pad2 = (n) => String(n).padStart(2, '0');
function fmtDate(d){ const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y.slice(2)}`; }
function todayStr(){ return new Date().toLocaleDateString('en-CA'); }
function tally(list){
  let w = 0;
  list.forEach(b => { if(b.result === 'w') w++; });
  return {n: list.length, w, l: list.length - w};
}
const pctOf = (w, n) => n ? Math.round(w / n * 100) : 0;
function pctCell(w, n){
  const p = pctOf(w, n);
  const cls = n < LOW_N ? 'low' : p >= 60 ? 'hi' : p <= 40 ? 'lo' : '';
  return `<span class="pct ${cls}">${p}%</span>`;
}
function wlBar(w, l){
  const n = w + l;
  return `<div class="wl" title="${w} vitórias · ${l} derrotas"><i class="w" style="width:${n ? w / n * 100 : 0}%"></i><i class="l" style="width:${n ? l / n * 100 : 0}%"></i></div>`;
}
function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }
function facesInline(ids, size){ return `<span class="faces-inline">${ids.map(id => faceHTML(id, size)).join('')}</span>`; }
function groupBy(list, keyFn){
  const m = new Map();
  list.forEach(b => { const k = keyFn(b); if(!m.has(k)) m.set(k, []); m.get(k).push(b); });
  return m;
}

function filteredBattles(){
  let list = battles;
  if(flt.period !== 'all'){
    const cut = new Date(Date.now() - Number(flt.period) * 864e5).toLocaleDateString('en-CA');
    list = list.filter(b => b.date >= cut);
  }
  if(flt.map) list = list.filter(b => b.map === flt.map);
  if(flt.alliance) list = list.filter(b => b.alliance === flt.alliance || b.alliance2 === flt.alliance);
  if(flt.player) list = list.filter(b => isWe(b) && playerChars(b, flt.player) !== null);
  return list;
}

/* Jogador no filtro: 'w:nick' = membro da We Sink, 'e:nick' = adversário. Devolve os personagens que ele usou na batalha (ou null se não jogou). */
function playerChars(b, key){
  if(!key) return null;
  const side = key[0], nick = key.slice(2).toLowerCase();
  if(side === 'w'){
    const hit = (b.our || []).filter(s => s.p && s.p.toLowerCase() === nick);
    return hit.length ? hit.map(s => s.c).filter(Boolean) : null;
  }
  const ps = b.enemyP || [], out = [];
  let found = false;
  ps.forEach((p, i) => { if(p && p.toLowerCase() === nick){ found = true; if(b.enemy[i]) out.push(b.enemy[i]); } });
  return found ? out : null;
}
// nicks conhecidos (um por pessoa, ignorando maiúsculas)
function knownNicks(pick){
  const m = new Map();
  battles.filter(isWe).forEach(b => pick(b).forEach(n => { if(n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), n); }));
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', {sensitivity: 'base'}));
}

/* Batalhas "We Sink x aliança" e batalhas "outra aliança x outra aliança" (kind 'third').
   Nas de outras alianças: alliance = lado A, alliance2 = lado B, our = composição de A, enemy = composição de B,
   result 'w' = A venceu, 'l' = B venceu. */
const WE_NAME = 'We Sink';
const isWe = (b) => b.kind !== 'third';
function sidesOf(b){
  const A = uniq((b.our || []).map(s => s.c)), B = uniq(b.enemy || []);
  if(!isWe(b)) return [{ally: b.alliance, chars: A, won: b.result === 'w', we: false}, {ally: b.alliance2, chars: B, won: b.result === 'l', we: false}];
  return [{ally: WE_NAME, chars: A, won: b.result === 'w', we: true}, {ally: b.alliance, chars: B, won: b.result === 'l', we: false}];
}
const allianceNames = (b) => isWe(b) ? [b.alliance] : [b.alliance, b.alliance2];

/* ---------- blocos da análise ---------- */

function kpiHTML(t){
  const p = pctOf(t.w, t.n);
  return `<div class="kpis">
    <div class="kpi"><div class="v">${t.n}</div><div class="k">Batalhas</div></div>
    <div class="kpi"><div class="v win">${t.w}</div><div class="k">Vitórias</div></div>
    <div class="kpi"><div class="v loss">${t.l}</div><div class="k">Derrotas</div></div>
    <div class="kpi"><div class="v">${p}%</div><div class="k">Aproveitamento</div></div>
  </div>`;
}

function mapsCard(list){
  const groups = [...groupBy(list, b => b.map)].map(([id, arr]) => ({id, ...tally(arr)})).sort((a, b) => b.n - a.n);
  const rows = groups.map(g => `
    <tr class="clickable${flt.map === g.id ? ' sel' : ''}" data-act="fmap" data-v="${g.id}">
      <td><div class="name"><span>${esc(mapName(g.id))}</span></div></td>
      <td>${wlBar(g.w, g.l)}</td>
      <td class="num">${g.w}-${g.l}</td>
      <td class="num">${pctCell(g.w, g.n)}</td>
    </tr>`).join('');
  return `<div class="an-card"><h3>Por mapa</h3><p class="sub">Clique num mapa para filtrar a análise inteira.</p>
    <table class="tbl"><thead><tr><th>Mapa</th><th></th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function alliancesCard(list){
  const groups = [...groupBy(list, b => b.alliance)].map(([name, arr]) => ({name, ...tally(arr), last: arr.map(b => b.date).sort().pop()})).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const rows = groups.map(g => `
    <tr class="clickable${flt.alliance === g.name ? ' sel' : ''}" data-act="falliance" data-v="${esc(g.name)}">
      <td><div class="name"><span>${esc(g.name)}</span></div></td>
      <td class="num">${g.w}-${g.l}</td>
      <td class="num">${pctCell(g.w, g.n)}</td>
      <td class="num">${fmtDate(g.last)}</td>
    </tr>`).join('');
  return `<div class="an-card"><h3>Alianças enfrentadas</h3><p class="sub">Placar contra cada aliança. Clique para ver só os confrontos dela.</p>
    <table class="tbl"><thead><tr><th>Aliança</th><th class="num">V-D</th><th class="num">%</th><th class="num">Último</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// cada "entrada" = uma composição numa batalha: {chars, w}. w = conta como vitória no percentual do quadro
// pl (opcional) = filtro de jogador: com ele, o lado do jogador conta só os personagens dele
function entriesFor(list, side, pl){
  if(side === 'todos') return list.flatMap(b => sidesOf(b).map(x => ({chars: x.chars, w: x.won})));
  const we = list.filter(isWe);
  const mine = (b) => pl && pl[0] === 'w' ? uniq(playerChars(b, pl) || []) : uniq((b.our || []).map(s => s.c));
  const theirs = (b) => pl && pl[0] === 'e' ? uniq(playerChars(b, pl) || []) : uniq(b.enemy || []);
  return side === 'nossos'
    ? we.map(b => ({chars: mine(b), w: b.result === 'w'}))
    : we.map(b => ({chars: theirs(b), w: b.result === 'w'}));
}
const tallyE = (arr) => { const w = arr.filter(e => e.w).length; return {n: arr.length, w, l: arr.length - w}; };

function charsCard(list){
  const withData = entriesFor(list, charSide, flt.player).filter(e => e.chars.length);
  const map = new Map();
  withData.forEach(e => e.chars.forEach(c => { if(!map.has(c)) map.set(c, []); map.get(c).push(e); }));
  let rows = [...map].map(([id, arr]) => ({id, ...tallyE(arr), pres: arr.length / withData.length}));
  if(charSort === 'uso') rows.sort((a, b) => b.n - a.n || b.w - a.w);
  else {
    rows = rows.filter(r => r.n >= MIN_RATE);
    rows.sort((a, b) => charSort === 'melhor' ? (b.w / b.n - a.w / a.n) || (b.n - a.n) : (a.w / a.n - b.w / b.n) || (b.n - a.n));
  }
  const total = rows.length;
  const shown = showAllChars ? rows : rows.slice(0, 12);
  const trs = shown.map(r => `
    <tr>
      <td><div class="name">${faceHTML(r.id, 32)}<span>${esc(charName(r.id))}</span></div></td>
      <td class="num">${r.n} <span style="color:var(--dimmer)">(${Math.round(r.pres * 100)}%)</span></td>
      <td>${wlBar(r.w, r.l)}</td>
      <td class="num">${r.w}-${r.l}</td>
      <td class="num">${pctCell(r.w, r.n)}</td>
    </tr>`).join('');
  const sub = {
    rivais: 'Personagens que o adversário colocou contra a We Sink. "%" = quanto NÓS vencemos quando ele estava na equipe deles.',
    nossos: 'Personagens que a We Sink usou. "%" = quanto vencemos com ele no time.',
    todos: 'Visão geral: todas as composições lançadas (We Sink, adversários e confrontos entre outras alianças). "%" = quanto a equipe que usou o personagem venceu.'
  }[charSide];
  const body = rows.length
    ? `<table class="tbl"><thead><tr><th>Personagem</th><th class="num">${charSide === 'todos' ? 'Usos' : 'Batalhas'} (presença)</th><th></th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${trs}</tbody></table>
       ${total > 12 ? `<div style="margin-top:10px"><button class="mini-btn" data-act="allchars">${showAllChars ? 'Mostrar menos' : `Mostrar todos (${total})`}</button></div>` : ''}
       <p class="note-low">Percentual apagado = menos de ${LOW_N} usos do personagem (amostra pequena, não tire conclusões ainda).</p>`
    : `<div class="empty-box">${charSort === 'uso' ? 'Ainda não há personagens lançados neste quadro.' : `Nenhum personagem com pelo menos ${MIN_RATE} usos ainda.`}</div>`;
  return `<div class="an-card full"><h3>Personagens</h3><p class="sub">${sub}</p>
    <div class="card-tools">
      <div class="seg"><button data-act="side" data-v="rivais" aria-pressed="${charSide === 'rivais'}">Rivais</button><button data-act="side" data-v="nossos" aria-pressed="${charSide === 'nossos'}">Nossos</button><button data-act="side" data-v="todos" aria-pressed="${charSide === 'todos'}">Todos</button></div>
      <select data-act="sort">
        <option value="uso"${charSort === 'uso' ? ' selected' : ''}>Mais usados</option>
        <option value="melhor"${charSort === 'melhor' ? ' selected' : ''}>Melhor aproveitamento (mín. ${MIN_RATE})</option>
        <option value="pior"${charSort === 'pior' ? ' selected' : ''}>Pior aproveitamento (mín. ${MIN_RATE})</option>
      </select>
    </div>${body}</div>`;
}

function combosCard(list){
  const withData = entriesFor(list, charSide, flt.player).filter(e => e.chars.length >= 2);
  const pairs = new Map(), sets = new Map();
  withData.forEach(e => {
    const ids = [...e.chars].sort();
    for(let i = 0; i < ids.length; i++) for(let j = i + 1; j < ids.length; j++){
      const k = ids[i] + '|' + ids[j];
      if(!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(e);
    }
    if(ids.length >= 3){
      const k = ids.join('|');
      if(!sets.has(k)) sets.set(k, []);
      sets.get(k).push(e);
    }
  });
  const rank = (m, minN) => [...m].map(([k, arr]) => ({ids: k.split('|'), ...tallyE(arr)})).filter(r => r.n >= minN).sort((a, b) => b.n - a.n || b.w - a.w).slice(0, 8);
  const pr = rank(pairs, 2), sr = rank(sets, 2);
  const row = (r, size) => `<tr><td><div class="name">${facesInline(r.ids, size)}</div></td><td class="num">${r.n}x</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td></tr>`;
  const tbl = (rs, size, title) => rs.length
    ? `<h4 style="margin:12px 0 6px;font-size:12px;color:var(--dim);font-weight:600">${title}</h4><table class="tbl"><thead><tr><th>Personagens</th><th class="num">Vezes</th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${rs.map(r => row(r, size)).join('')}</tbody></table>`
    : '';
  const inner = (pr.length || sr.length)
    ? tbl(sr, 30, 'Composições repetidas (3 ou mais personagens iguais)') + tbl(pr, 32, 'Duplas que mais aparecem juntas')
    : '<div class="empty-box">Ainda não há duplas ou composições repetidas. Elas aparecem conforme mais batalhas forem lançadas (a partir de 2 repetições).</div>';
  const who = {rivais: 'rivais', nossos: 'nossas', todos: 'de todos'}[charSide];
  return `<div class="an-card"><h3>Composições · ${who}</h3><p class="sub">Combinações que se repetem e como a equipe que as usou se saiu.</p>${inner}</div>`;
}

function radarCard(list){
  const ents = list.flatMap(b => sidesOf(b).filter(x => !x.we && x.chars.length && (!flt.alliance || x.ally === flt.alliance)).map(x => ({map: b.map, chars: x.chars})));
  const byMap = [...groupBy(ents, e => e.map)].sort((a, b) => b[1].length - a[1].length);
  const items = byMap.map(([id, arr]) => {
    const cnt = new Map();
    arr.forEach(e => e.chars.forEach(c => cnt.set(c, (cnt.get(c) || 0) + 1)));
    const top = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `<div class="radar-item"><h4>${esc(mapName(id))}<small>${arr.length} composiç${arr.length > 1 ? 'ões' : 'ão'}</small></h4>
      <div class="radar-faces">${top.map(([c, n]) => `<div class="rf">${faceHTML(c, 40)}<span>${Math.round(n / arr.length * 100)}%</span></div>`).join('')}</div></div>`;
  }).join('');
  const who = flt.alliance ? `da aliança ${esc(flt.alliance)}` : 'das outras alianças';
  return `<div class="an-card full"><h3>O que as outras alianças usam em cada mapa</h3>
    <p class="sub">Personagens mais frequentes ${who} (contra nós e entre elas), com a % das composições em que apareceram naquele mapa. Escolha uma aliança no filtro para ver o estilo dela.</p>
    ${items ? `<div class="radar">${items}</div>` : '<div class="empty-box">Lance os personagens dos rivais (ou de confrontos entre outras alianças) para ver este quadro.</div>'}</div>`;
}

let showAllAlli = false;
// perfil de cada aliança (exceto a nossa), somando TODAS as batalhas em que ela aparece
function allianceProfilesCard(list){
  const per = new Map();
  list.forEach(b => sidesOf(b).forEach(x => {
    if(x.we) return;
    if(!per.has(x.ally)) per.set(x.ally, {n: 0, w: 0, chars: new Map(), comps: new Map(), last: ''});
    const e = per.get(x.ally);
    e.n++; if(x.won) e.w++;
    if(b.date > e.last) e.last = b.date;
    x.chars.forEach(c => e.chars.set(c, (e.chars.get(c) || 0) + 1));
    if(x.chars.length >= 3){ const k = [...x.chars].sort().join('|'); e.comps.set(k, (e.comps.get(k) || 0) + 1); }
  }));
  const rows = [...per].map(([name, e]) => ({name, ...e, l: e.n - e.w,
    top: [...e.chars].sort((a, b) => b[1] - a[1]).slice(0, 5).map(t => t[0]),
    comp: [...e.comps].sort((a, b) => b[1] - a[1])[0]})).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const shown = showAllAlli ? rows : rows.slice(0, 12);
  const trs = shown.map(r => `<tr class="clickable${flt.alliance === r.name ? ' sel' : ''}" data-act="falliance" data-v="${esc(r.name)}">
      <td><div class="name"><span>${esc(r.name)}</span></div></td>
      <td class="num">${r.n}</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td>
      <td>${r.top.length ? facesInline(r.top, 26) : '<span class="small-dim">—</span>'}</td>
      <td>${r.comp && r.comp[1] >= 2 ? facesInline(r.comp[0].split('|'), 22) + `<span class="small-dim"> ${r.comp[1]}x</span>` : '<span class="small-dim">—</span>'}</td></tr>`).join('');
  return `<div class="an-card full"><h3>Alianças · visão geral</h3>
    <p class="sub">Todas as batalhas em que cada aliança aparece (contra nós ou contra outras). "%" = quanto ELA venceu. Mostra os 5 personagens que mais usa e a composição que mais repete. Clique para filtrar.</p>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Aliança</th><th class="num">Jogos</th><th class="num">V-D</th><th class="num">%</th><th>Mais usa</th><th>Comp. repetida</th></tr></thead><tbody>${trs}</tbody></table>
      ${rows.length > 12 ? `<div style="margin-top:10px"><button class="mini-btn" data-act="allalli">${showAllAlli ? 'Mostrar menos' : `Mostrar todas (${rows.length})`}</button></div>` : ''}`
      : '<div class="empty-box">Ainda não há alianças lançadas.</div>'}</div>`;
}

function playersCard(list){
  const per = new Map();
  list.forEach(b => {
    const seen = new Set();
    (b.our || []).forEach(s => {
      if(!s.p) return;
      if(!per.has(s.p)) per.set(s.p, {battles: [], chars: new Map()});
      const e = per.get(s.p);
      if(!seen.has(s.p)){ e.battles.push(b); seen.add(s.p); }
      if(s.c) e.chars.set(s.c, (e.chars.get(s.c) || 0) + 1);
    });
  });
  const rows = [...per].map(([nick, e]) => ({nick, ...tally(e.battles), top: [...e.chars].sort((a, b) => b[1] - a[1]).slice(0, 3)})).sort((a, b) => b.n - a.n || a.nick.localeCompare(b.nick));
  const trs = rows.map(r => `<tr class="clickable${flt.player === 'w:' + r.nick ? ' sel' : ''}" data-act="fplayer" data-v="w:${esc(r.nick)}">
      <td><div class="name"><span>${esc(r.nick)}</span>${roleBadges(r.nick)}</div></td>
      <td class="num">${r.n}</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td>
      <td>${facesInline(r.top.map(t => t[0]), 26)}</td></tr>`).join('');
  return `<div class="an-card"><h3>Jogadores</h3><p class="sub">Presença e resultado de cada um, com os 3 personagens que mais usou. Clique num nick para filtrar a análise por ele.</p>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Nick</th><th class="num">Jogos</th><th class="num">V-D</th><th class="num">%</th><th>Mais usa</th></tr></thead><tbody>${trs}</tbody></table>`
      : '<div class="empty-box">Informe os jogadores nas batalhas para ver as estatísticas individuais.</div>'}</div>`;
}

function rivalsCard(list){
  const per = new Map();
  list.filter(isWe).forEach(b => {
    const seen = new Set();
    (b.enemyP || []).forEach((p, i) => {
      if(!p) return;
      const k = p.toLowerCase();
      if(!per.has(k)) per.set(k, {nick: p, ally: new Set(), battles: [], chars: new Map()});
      const e = per.get(k);
      e.ally.add(b.alliance);
      if(!seen.has(k)){ e.battles.push(b); seen.add(k); }
      if(b.enemy[i]) e.chars.set(b.enemy[i], (e.chars.get(b.enemy[i]) || 0) + 1);
    });
  });
  const rows = [...per.values()].map(e => ({nick: e.nick, ally: [...e.ally].join(', '), ...tally(e.battles), top: [...e.chars].sort((a, b) => b[1] - a[1]).slice(0, 3)})).sort((a, b) => b.n - a.n || a.nick.localeCompare(b.nick));
  const trs = rows.slice(0, 25).map(r => `<tr class="clickable${flt.player === 'e:' + r.nick ? ' sel' : ''}" data-act="fplayer" data-v="e:${esc(r.nick)}">
      <td><div class="name"><span>${esc(r.nick)}</span><small style="color:var(--dimmer)">${esc(r.ally)}</small></div></td>
      <td class="num">${r.n}</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td>
      <td>${facesInline(r.top.map(t => t[0]), 26)}</td></tr>`).join('');
  return `<div class="an-card"><h3>Jogadores adversários</h3><p class="sub">Nicks lançados nas composições dos rivais. "%" = quanto NÓS vencemos nas batalhas em que ele jogou. Clique para filtrar.</p>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Nick</th><th class="num">Jogos</th><th class="num">V-D</th><th class="num">%</th><th>Mais usa</th></tr></thead><tbody>${trs}</tbody></table>`
      : '<div class="empty-box">Ao lançar uma batalha, informe o nick de cada rival (opcional) para acompanhar os adversários.</div>'}</div>`;
}

function historyCard(list){
  const sorted = [...list].sort((a, b) => a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1);
  const shown = showAllHist ? sorted : sorted.slice(0, 20);
  const items = shown.map(b => {
    const our = (b.our || []).filter(s => s.c).map(s => s.c);
    const enemy = b.enemy || [];
    const t = b.team ? TEAMS.find(x => x.id === b.team) : null;
    const head = isWe(b)
      ? `<span class="chip-sm ${b.result}">${b.result === 'w' ? 'VITÓRIA' : 'DERROTA'}</span>
          <b>${esc(mapName(b.map))}</b><span class="dim">vs</span><b>${esc(b.alliance)}</b>`
      : `<span class="chip-sm o">OUTRAS</span><b>${esc(mapName(b.map))}</b>
          <b class="${b.result === 'w' ? 'winner' : ''}">${esc(b.alliance)}</b><span class="dim">vs</span><b class="${b.result === 'l' ? 'winner' : ''}">${esc(b.alliance2)}</b>`;
    return `<div class="hist-item">
      <div class="hist-main">
        <div class="hist-line">
          ${head}
          <span class="dim">· ${fmtDate(b.date)}${t ? ' · ' + t.name : ''}${isWe(b) ? '' : ' · venceu ' + esc(b.result === 'w' ? b.alliance : b.alliance2)}</span>
        </div>
        <div>${our.length ? facesInline(our, 30) : '<span class="small-dim">' + (isWe(b) ? 'nossa comp. não informada' : 'comp. não informada') + '</span>'}<span class="vs">VS</span>${enemy.length ? facesInline(enemy, 30) : '<span class="small-dim">' + (isWe(b) ? 'rivais não informados' : 'comp. não informada') + '</span>'}</div>
        ${(b.our || []).some(s => s.p) ? `<div class="hist-note">${(b.our || []).filter(s => s.p).map(s => esc(s.p)).join(', ')}</div>` : ''}
        ${(b.enemyP || []).some(Boolean) ? `<div class="hist-note">Rivais: ${b.enemyP.filter(Boolean).map(esc).join(', ')}</div>` : ''}
        ${b.note ? `<div class="hist-note">“${esc(b.note)}”</div>` : ''}
      </div>
      ${can('batalhas') ? `<div class="hist-tools"><button class="mini-btn" data-act="edit" data-v="${b.id}">Editar</button><button class="mini-btn" data-act="del" data-v="${b.id}">Apagar</button></div>` : ''}
    </div>`;
  }).join('');
  return `<div class="an-card full"><h3>Histórico</h3><p class="sub">Batalhas lançadas, da mais recente para a mais antiga.</p>
    <div class="hist">${items || '<div class="empty-box">Nenhuma batalha neste filtro.</div>'}</div>
    ${sorted.length > 20 ? `<div style="margin-top:10px"><button class="mini-btn" data-act="allhist">${showAllHist ? 'Mostrar menos' : `Mostrar todas (${sorted.length})`}</button></div>` : ''}</div>`;
}

function renderAnalysis(){
  if(uiMode !== 'app') return;
  const all = battles;
  const alliances = uniq(all.flatMap(allianceNames)).sort((a, b) => a.localeCompare(b));
  const maps = uniq(all.map(b => b.map));
  if(flt.alliance && !alliances.includes(flt.alliance)) flt.alliance = '';
  const list = filteredBattles();
  const sel = (id, v, label) => `<option value="${esc(v)}"${String(flt[id]) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  const ours = knownNicks(b => (b.our || []).map(s => s.p)), theirs = knownNicks(b => b.enemyP || []);
  if(flt.player && ![...ours.map(n => 'w:' + n), ...theirs.map(n => 'e:' + n)].includes(flt.player)) flt.player = '';
  const hasFilter = flt.period !== 'all' || flt.map || flt.alliance || flt.player;

  let html = `<div class="an-top">
    <div class="filters">
      <select data-act="fperiod" class="${flt.period !== 'all' ? 'active' : ''}">${sel('period', 'all', 'Todo o período')}${sel('period', '30', 'Últimos 30 dias')}${sel('period', '90', 'Últimos 90 dias')}</select>
      <select data-act="fmapsel" class="${flt.map ? 'active' : ''}">${sel('map', '', 'Todos os mapas')}${maps.map(m => sel('map', m, mapName(m))).join('')}</select>
      <select data-act="fallsel" class="${flt.alliance ? 'active' : ''}">${sel('alliance', '', 'Todas as alianças')}${alliances.map(a => sel('alliance', a, a)).join('')}</select>
      ${(ours.length || theirs.length) ? `<select data-act="fplayersel" class="${flt.player ? 'active' : ''}"><option value="">Todos os jogadores</option>${ours.length ? `<optgroup label="We Sink">${ours.map(n => `<option value="w:${esc(n)}"${flt.player === 'w:' + n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>` : ''}${theirs.length ? `<optgroup label="Adversários">${theirs.map(n => `<option value="e:${esc(n)}"${flt.player === 'e:' + n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>` : ''}</select>` : ''}
      ${hasFilter ? '<button class="mini-btn" data-act="clearf">Limpar filtros</button>' : ''}
    </div>
    <div class="filters">
      ${can('batalhas') ? '<button class="mini-btn on" data-act="new">+ Lançar batalha</button>' : ''}
      ${all.length ? '<button class="mini-btn" data-act="csv">Baixar CSV</button>' : ''}
      ${can('batalhas') && all.length ? '<button class="mini-btn" data-act="backup">Backup</button>' : ''}
    </div>
  </div>`;

  if(!battlesLoaded){
    html += '<div class="placeholder">Carregando batalhas...</div>';
  } else if(!all.length){
    html += `<div class="an-card"><div class="empty-box">Nenhuma batalha lançada ainda.<br>${can('batalhas')
      ? 'Clique em <b>+ Lançar batalha</b> para registrar a primeira.'
      : 'Quem tem permissão lança as vitórias e derrotas depois de cada GVG.'}</div></div>`;
  } else if(!list.length){
    html += '<div class="an-card"><div class="empty-box">Nenhuma batalha neste filtro.</div></div>';
  } else {
    const we = list.filter(isWe), others = list.length - we.length;
    if(!we.length && charSide !== 'todos') charSide = 'todos';
    if(we.length) html += kpiHTML(tally(we));
    if(others) html += `<p class="small-dim" style="margin:${we.length ? '-6px' : '0'} 0 12px">${others} batalha${others > 1 ? 's' : ''} entre outras alianças ${others > 1 ? 'entram' : 'entra'} só nos quadros "Personagens · Todos", "Alianças · visão geral", "O que as outras alianças usam" e no histórico. Os números da We Sink acima não mudam.</p>`;
    html += `<div class="an-grid">${we.length ? mapsCard(we) + alliancesCard(we) : ''}${charsCard(list)}${combosCard(list)}${we.length ? playersCard(we) + rivalsCard(we) : ''}${allianceProfilesCard(list)}${radarCard(list)}${historyCard(list)}</div>`;
  }
  tabAnalise.innerHTML = html;
}

tabAnalise.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if(!el || el.tagName === 'SELECT') return;
  const v = el.dataset.v;
  switch(el.dataset.act){
    case 'fmap': flt.map = flt.map === v ? '' : v; break;
    case 'falliance': flt.alliance = flt.alliance === v ? '' : v; break;
    case 'fplayer': flt.player = flt.player === v ? '' : v; break;
    case 'clearf': flt.period = 'all'; flt.map = ''; flt.alliance = ''; flt.player = ''; break;
    case 'side': charSide = v; showAllChars = false; break;
    case 'allchars': showAllChars = !showAllChars; break;
    case 'allhist': showAllHist = !showAllHist; break;
    case 'allalli': showAllAlli = !showAllAlli; break;
    case 'new': openBattleModal(null); return;
    case 'edit': openBattleModal(battles.find(b => b.id === v)); return;
    case 'del': {
      const b = battles.find(x => x.id === v);
      if(b && confirm(`Apagar a batalha ${fmtDate(b.date)} ${isWe(b) ? 'contra ' + b.alliance : b.alliance + ' x ' + b.alliance2} (${mapName(b.map)})?`)) send({t: 'battle_del', id: v});
      return;
    }
    case 'csv': downloadCSV(); return;
    case 'backup': downloadBackup(); return;
    default: return;
  }
  renderAnalysis();
});
tabAnalise.addEventListener('change', (e) => {
  const el = e.target.closest('select[data-act]');
  if(!el) return;
  switch(el.dataset.act){
    case 'fperiod': flt.period = el.value; break;
    case 'fmapsel': flt.map = el.value; break;
    case 'fallsel': flt.alliance = el.value; break;
    case 'fplayersel': flt.player = el.value; break;
    case 'sort': charSort = el.value; showAllChars = false; break;
  }
  renderAnalysis();
});

/* ---------- exportar ---------- */

function download(name, text, type){
  const blob = new Blob([text], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function downloadCSV(){
  const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const head = ['data', 'mapa', 'tipo', 'alianca', 'alianca2', 'vencedor', 'time', 'resultado', 'nossa_composicao', 'rivais', 'observacao'];
  const rows = battles.map(b => [
    b.date, mapName(b.map), isWe(b) ? 'We Sink x alianca' : 'Outras aliancas', b.alliance, b.alliance2 || '',
    isWe(b) ? (b.result === 'w' ? WE_NAME : b.alliance) : (b.result === 'w' ? b.alliance : b.alliance2),
    b.team ? 'Equipe ' + b.team : '', b.result === 'w' ? 'Vitoria' : 'Derrota',
    (b.our || []).map(s => (s.p ? s.p + ': ' : '') + (s.c ? charName(s.c) : '?')).join(' | '),
    (b.enemy || []).map((c, i) => ((b.enemyP || [])[i] ? b.enemyP[i] + ': ' : '') + charName(c)).join(' | '), b.note || ''
  ].map(q).join(';'));
  download('gvg-batalhas.csv', '﻿' + head.join(';') + '\r\n' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}
function downloadBackup(){
  download(`gvg-backup-${todayStr()}.json`, JSON.stringify({exportado: new Date().toISOString(), jogadores: roster, batalhas: battles}, null, 1), 'application/json');
}

/* ---------- lançar / editar batalha (admin) ---------- */

let form = null;
let formSavingNext = false;
let lastKept = {date: '', alliance: '', alliance2: '', kind: 'we'};       // lembra data e aliança para lançar várias batalhas seguidas
const SLOT_TAGS = ['Tank', 'Sup', '1', '2', '3', '4'];

function blankForm(){
  return {id: '', kind: lastKept.kind || 'we', alliance2: lastKept.alliance2 || '', date: lastKept.date || todayStr(), map: '', alliance: lastKept.alliance || '', team: '', result: '',
    our: SLOT_TAGS.map(() => ({p: '', c: ''})), enemy: SLOT_TAGS.map(() => ''), enemyP: SLOT_TAGS.map(() => ''), note: ''};
}
function formFrom(b){
  const f = blankForm();
  f.id = b.id; f.kind = b.kind === 'third' ? 'third' : 'we'; f.alliance2 = b.alliance2 || ''; f.date = b.date; f.map = b.map; f.alliance = b.alliance; f.team = b.team || ''; f.result = b.result; f.note = b.note || '';
  (b.our || []).slice(0, 6).forEach((s, i) => { f.our[i] = {p: s.p || '', c: s.c || ''}; });
  (b.enemy || []).slice(0, 6).forEach((c, i) => { f.enemy[i] = c; f.enemyP[i] = (b.enemyP || [])[i] || ''; });
  return f;
}

function faceBtnHTML(kind, i, id){
  return `<button type="button" class="face-btn${id ? ' set' : ''}" data-fk="${kind}" data-i="${i}" id="fb-${kind}-${i}" title="${id ? esc(charName(id)) : 'Escolher personagem'}">${id ? faceHTML(id, 42) : '+'}</button>`;
}
function updFaceBtn(kind, i){
  const id = kind === 'our' ? form.our[i].c : form.enemy[i];
  const b = $(`fb-${kind}-${i}`);
  if(b){ b.outerHTML = faceBtnHTML(kind, i, id); }
}
function updResult(){
  document.querySelectorAll('#modalBox .res-btn').forEach(b => b.dataset.on = String(b.dataset.r === form.result));
}

function openBattleModal(b){
  if(!can('batalhas')) return;
  if(!battlesLoaded) send({t: 'get_battles'}, true);
  form = b ? formFrom(b) : blankForm();
  formSavingNext = false;
  renderBattleForm();
}

function renderBattleForm(){
  const allies = uniq(battles.flatMap(allianceNames)).sort();
  const third = form.kind === 'third';
  const faceCells = (kind, arr) => `<div class="face-row">${SLOT_TAGS.map((t, i) => `<div class="face-cell">${faceBtnHTML(kind, i, arr(i))}<span>${t}</span></div>`).join('')}</div>`;
  const nameA = () => (form.alliance.trim() || 'Aliança A'), nameB = () => (form.alliance2.trim() || 'Aliança B');
  openModal(`
    <h3>${form.id ? 'Editar batalha' : 'Lançar batalha'}${third ? ' · outras alianças' : ''}</h3>
    ${form.id ? '' : `<div class="seg" style="margin:2px 0 12px"><button type="button" data-kind="we" aria-pressed="${!third}">We Sink × aliança</button><button type="button" data-kind="third" aria-pressed="${third}">Outras alianças</button></div>`}
    <div class="row3">
      <div><label class="f" for="fDate">Data</label><input class="nick-input" id="fDate" type="date" value="${form.date}"></div>
      <div><label class="f" for="fMap">Mapa</label><select class="nick-input" id="fMap"><option value="">Escolha…</option>${MAPS.map(m => `<option value="${m.id}"${m.id === form.map ? ' selected' : ''}>${m.name}</option>`).join('')}</select></div>
      ${third ? '<div></div>' : `<div><label class="f" for="fTeam">Equipe (opcional)</label><select class="nick-input" id="fTeam"><option value="">—</option>${TEAMS.map(t => `<option value="${t.id}"${t.id === form.team ? ' selected' : ''}>${t.name}</option>`).join('')}</select></div>`}
    </div>
    ${third ? `
    <div class="row2">
      <div><label class="f" for="fAlliance">Aliança A</label><input class="nick-input" id="fAlliance" type="text" list="dlAlliances" maxlength="30" value="${esc(form.alliance)}" placeholder="nome da aliança"></div>
      <div><label class="f" for="fAlliance2">Aliança B</label><input class="nick-input" id="fAlliance2" type="text" list="dlAlliances" maxlength="30" value="${esc(form.alliance2)}" placeholder="nome da aliança"></div>
    </div>
    <datalist id="dlAlliances">${allies.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <label class="f">Quem venceu</label>
    <div class="res-btns">
      <button type="button" class="res-btn w" id="rbA" data-r="w" data-on="${form.result === 'w'}">${esc(nameA())} venceu</button>
      <button type="button" class="res-btn l" id="rbB" data-r="l" data-on="${form.result === 'l'}">${esc(nameB())} venceu</button>
    </div>
    <div class="sec-head"><span>Composição da aliança A</span><span class="filters"><button type="button" class="mini-btn" id="fSeqOur">&#9654; Preencher seguidos</button></span></div>
    ${faceCells('our', i => form.our[i].c)}
    <div class="sec-head"><span>Composição da aliança B</span><span class="filters"><button type="button" class="mini-btn" id="fSeqEn">&#9654; Preencher seguidos</button></span></div>
    ${faceCells('en', i => form.enemy[i])}
    ` : `
    <label class="f" for="fAlliance">Aliança adversária</label>
    <input class="nick-input" id="fAlliance" type="text" list="dlAlliances" maxlength="30" value="${esc(form.alliance)}" placeholder="nome da aliança">
    <datalist id="dlAlliances">${allies.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <label class="f">Resultado</label>
    <div class="res-btns">
      <button type="button" class="res-btn w" data-r="w" data-on="${form.result === 'w'}">Vitória</button>
      <button type="button" class="res-btn l" data-r="l" data-on="${form.result === 'l'}">Derrota</button>
    </div>

    <div class="sec-head"><span>Nossa composição</span>
      <span class="filters"><button type="button" class="mini-btn" id="fRepeat">&#8634; Repetir última</button><button type="button" class="mini-btn" id="fSeqOur">&#9654; Preencher seguidos</button></span></div>
    <datalist id="dlPlayers">${roster.map(p => `<option value="${esc(p.nick)}">`).join('')}</datalist>
    <div class="slot-rows">${SLOT_TAGS.map((t, i) => `
      <div class="slot-row"><span class="tag">${t}</span>
        <input class="nick-input" id="fp-${i}" type="text" list="dlPlayers" maxlength="20" placeholder="jogador" value="${esc(form.our[i].p)}">
        ${faceBtnHTML('our', i, form.our[i].c)}</div>`).join('')}</div>

    <div class="sec-head"><span>Composição do rival <span class="small-dim">(nick opcional)</span></span>
      <span class="filters"><button type="button" class="mini-btn" id="fImport">Importar do marcador</button><button type="button" class="mini-btn" id="fSeqEn">&#9654; Preencher seguidos</button></span></div>
    <datalist id="dlRivals">${knownNicks(b => b.enemyP || []).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="slot-rows">${SLOT_TAGS.map((t, i) => `
      <div class="slot-row"><span class="tag">${t}</span>
        <input class="nick-input" id="fe-${i}" type="text" list="dlRivals" maxlength="20" placeholder="nick do rival" value="${esc(form.enemyP[i])}">
        ${faceBtnHTML('en', i, form.enemy[i])}</div>`).join('')}</div>
    `}

    <label class="f" for="fNote">Observação (opcional)</label>
    <input class="nick-input" id="fNote" type="text" maxlength="200" value="${esc(form.note)}" placeholder="ex.: perdemos o ponto de cura cedo">
    <p class="form-err hidden" id="formErr"></p>
    <div class="modal-actions">
      <button class="primary-btn" id="fSave" type="button">Salvar</button>
      ${form.id ? '' : '<button class="primary-btn" id="fSaveNext" type="button" style="background:#35C48C">Salvar e lançar outra</button>'}
      <button class="ghost-btn" id="fCancel" type="button">Cancelar</button>
    </div>`, true);

  const box = $('modalBox');
  box.addEventListener('input', (e) => {
    const t = e.target;
    if(t.id === 'fDate') form.date = t.value;
    else if(t.id === 'fAlliance'){ form.alliance = t.value; const r = $('rbA'); if(r) r.textContent = (form.alliance.trim() || 'Aliança A') + ' venceu'; }
    else if(t.id === 'fAlliance2'){ form.alliance2 = t.value; const r = $('rbB'); if(r) r.textContent = (form.alliance2.trim() || 'Aliança B') + ' venceu'; }
    else if(t.id === 'fNote') form.note = t.value;
    else if(t.id && t.id.startsWith('fp-')) form.our[Number(t.id.slice(3))].p = t.value;
    else if(t.id && t.id.startsWith('fe-')) form.enemyP[Number(t.id.slice(3))] = t.value;
  });
  box.addEventListener('change', (e) => {
    if(e.target.id === 'fMap') form.map = e.target.value;
    if(e.target.id === 'fTeam') form.team = e.target.value;
  });
  box.addEventListener('click', (e) => {
    const t = e.target;
    const kb = t.closest('[data-kind]');
    if(kb){ form.kind = kb.dataset.kind; renderBattleForm(); return; }
    const rb = t.closest('.res-btn');
    if(rb){ form.result = rb.dataset.r; updResult(); return; }
    const fb = t.closest('.face-btn');
    if(fb){ pickFormFace(fb.dataset.fk, Number(fb.dataset.i)); return; }
    const id = t.closest('button') && t.closest('button').id;
    if(id === 'fCancel') closeModal();
    else if(id === 'fSave') saveForm(false);
    else if(id === 'fSaveNext') saveForm(true);
    else if(id === 'fSeqOur') seqForm('our');
    else if(id === 'fSeqEn') seqForm('en');
    else if(id === 'fImport') importFromTracker();
    else if(id === 'fRepeat') repeatLast();
  });
}

function formErr(t){ const el = $('formErr'); if(el){ el.textContent = t; el.classList.remove('hidden'); } }

function formAccess(kind){
  return {
    get: i => kind === 'our' ? form.our[i].c : form.enemy[i],
    set: (i, id) => { if(kind === 'our') form.our[i].c = id; else form.enemy[i] = id; updFaceBtn(kind, i); },
  };
}
function pickFormFace(kind, i){
  const a = formAccess(kind);
  runPicker({doc: document, count: SLOT_TAGS.length, start: i, single: true,
    label: n => (form.kind === 'third' ? (kind === 'our' ? 'Aliança A · ' : 'Aliança B · ') : (kind === 'our' ? 'Nosso · ' : 'Rival · ')) + SLOT_TAGS[n], get: a.get, set: a.set});
}
function seqForm(kind){
  const a = formAccess(kind);
  let start = SLOT_TAGS.findIndex((_, i) => !a.get(i));
  if(start < 0) start = 0;
  runPicker({doc: document, count: SLOT_TAGS.length, start, single: false,
    label: n => (form.kind === 'third' ? (kind === 'our' ? 'Aliança A · ' : 'Aliança B · ') : (kind === 'our' ? 'Nosso · ' : 'Rival · ')) + SLOT_TAGS[n], get: a.get, set: a.set});
}
function importFromTracker(){
  const team = form.team;
  if(!team){ formErr('Escolha a equipe acima para importar os personagens que foram marcados no marcador de mortes.'); return; }
  const cs = (state.chars && state.chars[team]) || {};
  if(!ENEMY_SLOTS.some(s => cs[s.id])){ formErr(`O marcador do ${TEAMS.find(t => t.id === team).name} está sem personagens agora (ele zera quando o mapa da equipe muda).`); return; }
  ENEMY_SLOTS.forEach((s, i) => { form.enemy[i] = cs[s.id] || ''; updFaceBtn('en', i); });
  $('formErr').classList.add('hidden');
}
function repeatLast(){
  const pool = [...battles].filter(b => isWe(b) && (b.our || []).length).sort((a, b) => b.ts - a.ts);
  const last = (form.team && pool.find(b => b.team === form.team)) || pool[0];
  if(!last){ formErr('Ainda não há nenhuma batalha com composição para repetir.'); return; }
  SLOT_TAGS.forEach((_, i) => {
    const s = (last.our || [])[i] || {p: '', c: ''};
    form.our[i] = {p: s.p || '', c: s.c || ''};
    const inp = $(`fp-${i}`); if(inp) inp.value = form.our[i].p;
    updFaceBtn('our', i);
  });
  $('formErr').classList.add('hidden');
}

function saveForm(next){
  const f = form;
  if(!f.date) return formErr('Informe a data.');
  if(!f.map) return formErr('Escolha o mapa.');
  const third = f.kind === 'third';
  if(!f.alliance.trim()) return formErr(third ? 'Informe a aliança A.' : 'Informe a aliança adversária.');
  if(third){
    if(!f.alliance2.trim()) return formErr('Informe a aliança B.');
    if(f.alliance.trim().toLowerCase() === f.alliance2.trim().toLowerCase()) return formErr('As duas alianças precisam ser diferentes.');
  }
  if(!f.result) return formErr(third ? 'Marque quem venceu.' : 'Marque Vitória ou Derrota.');
  if(!third){ const i = f.enemy.findIndex((c, k) => !c && f.enemyP[k].trim()); if(i >= 0) return formErr(`Escolha o personagem do rival "${f.enemyP[i].trim()}" (slot ${SLOT_TAGS[i]}).`); }
  const battle = {
    id: f.id || undefined, date: f.date, map: f.map, alliance: f.alliance.trim(), team: third ? '' : f.team, result: f.result,
    our: third ? f.our.filter(s => s.c).map(s => ({p: '', c: s.c})) : f.our.filter(s => s.p.trim() || s.c).map(s => ({p: s.p.trim(), c: s.c})),
    enemy: f.enemy.filter(Boolean), note: f.note.trim()
  };
  if(!third){ const idx = f.enemy.map((c, i) => c ? i : -1).filter(i => i >= 0); battle.enemyP = idx.map(i => f.enemyP[i].trim()); }
  if(third){ battle.kind = 'third'; battle.alliance2 = f.alliance2.trim(); }
  formSavingNext = next;
  if(!send({t: 'battle_save', battle})) return;
  $('fSave').disabled = true;
  const n = $('fSaveNext'); if(n) n.disabled = true;
}

function onBattleSaved(){
  if(!form){ return; }
  lastKept = {date: form.date, alliance: form.alliance.trim(), alliance2: form.alliance2.trim(), kind: form.kind};
  closePicker();
  if(formSavingNext){
    showBanner('Batalha salva. Pode lançar a próxima.');
    openBattleModal(null);
  } else {
    showBanner('Batalha salva.');
    closeModal();
    form = null;
  }
}
function onBattleError(){
  const s = $('fSave'); if(s) s.disabled = false;
  const n = $('fSaveNext'); if(n) n.disabled = false;
  formErr('Não foi possível salvar. Confira os campos e tente de novo.');
}
