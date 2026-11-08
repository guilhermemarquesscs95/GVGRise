/* ================= Análise, lançamento de batalhas e jogadores ================= */

let battles = [];
let battlesLoaded = false;
const flt = {period: 'all', map: '', alliance: ''};
let charSide = 'rivais';       // 'rivais' | 'nossos'
let charSort = 'uso';          // 'uso' | 'melhor' | 'pior'
let showAllChars = false;
let showAllHist = false;
const MIN_RATE = 3;            // mínimo de batalhas para entrar no ranking por aproveitamento
const LOW_N = 5;               // abaixo disso o percentual aparece apagado (amostra pequena)

/* ---------- ligações com o resto do app ---------- */

function onAuthed(){
  battlesLoaded = false;
  if(currentTab === 'analise') send({t:'get_battles'}, true);
}
function enterAnalysis(){
  if(!battlesLoaded) send({t:'get_battles'}, true);
  renderAnalysis();
}
function onBattles(list){
  battles = list;
  battlesLoaded = true;
  if(currentTab === 'analise') renderAnalysis();
}
function onBattlesDirty(){ send({t:'get_battles'}, true); }
function onAdminChanged(){
  if(currentTab === 'analise') renderAnalysis();
  if(currentTab === 'alianca') renderAlliance();
}
function onRosterChanged(){
  if(currentTab === 'alianca') renderAlliance();
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
  if(flt.alliance) list = list.filter(b => b.alliance === flt.alliance);
  return list;
}

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

// personagens de um lado da batalha
const sideChars = (b, side) => side === 'nossos' ? uniq((b.our || []).map(s => s.c)) : uniq(b.enemy || []);

function charsCard(list){
  const withData = list.filter(b => sideChars(b, charSide).length);
  const map = new Map();
  withData.forEach(b => sideChars(b, charSide).forEach(c => { if(!map.has(c)) map.set(c, []); map.get(c).push(b); }));
  let rows = [...map].map(([id, arr]) => ({id, ...tally(arr), pres: arr.length / withData.length}));
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
  const sub = charSide === 'rivais'
    ? 'Personagens que o adversário colocou. "%" = quanto NÓS vencemos quando ele estava no time deles.'
    : 'Personagens que a We Sink usou. "%" = quanto vencemos com ele no time.';
  const body = rows.length
    ? `<table class="tbl"><thead><tr><th>Personagem</th><th class="num">Batalhas (presença)</th><th></th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${trs}</tbody></table>
       ${total > 12 ? `<div style="margin-top:10px"><button class="mini-btn" data-act="allchars">${showAllChars ? 'Mostrar menos' : `Mostrar todos (${total})`}</button></div>` : ''}
       <p class="note-low">Percentual apagado = menos de ${LOW_N} batalhas com o personagem (amostra pequena, não tire conclusões ainda).</p>`
    : `<div class="empty-box">${charSort === 'uso' ? 'Ainda não há personagens lançados deste lado.' : `Nenhum personagem com pelo menos ${MIN_RATE} batalhas ainda.`}</div>`;
  return `<div class="an-card full"><h3>Personagens</h3><p class="sub">${sub}</p>
    <div class="card-tools">
      <div class="seg"><button data-act="side" data-v="rivais" aria-pressed="${charSide === 'rivais'}">Rivais</button><button data-act="side" data-v="nossos" aria-pressed="${charSide === 'nossos'}">Nossos</button></div>
      <select data-act="sort">
        <option value="uso"${charSort === 'uso' ? ' selected' : ''}>Mais usados</option>
        <option value="melhor"${charSort === 'melhor' ? ' selected' : ''}>Melhor aproveitamento (mín. ${MIN_RATE})</option>
        <option value="pior"${charSort === 'pior' ? ' selected' : ''}>Pior aproveitamento (mín. ${MIN_RATE})</option>
      </select>
    </div>${body}</div>`;
}

function combosCard(list){
  const withData = list.filter(b => sideChars(b, charSide).length >= 2);
  const pairs = new Map(), sets = new Map();
  withData.forEach(b => {
    const ids = sideChars(b, charSide).sort();
    for(let i = 0; i < ids.length; i++) for(let j = i + 1; j < ids.length; j++){
      const k = ids[i] + '|' + ids[j];
      if(!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(b);
    }
    if(ids.length >= 3){
      const k = ids.join('|');
      if(!sets.has(k)) sets.set(k, []);
      sets.get(k).push(b);
    }
  });
  const rank = (m, minN) => [...m].map(([k, arr]) => ({ids: k.split('|'), ...tally(arr)})).filter(r => r.n >= minN).sort((a, b) => b.n - a.n || b.w - a.w).slice(0, 8);
  const pr = rank(pairs, 2), sr = rank(sets, 2);
  const row = (r, size) => `<tr><td><div class="name">${facesInline(r.ids, size)}</div></td><td class="num">${r.n}x</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td></tr>`;
  const tbl = (rs, size, title) => rs.length
    ? `<h4 style="margin:12px 0 6px;font-size:12px;color:var(--dim);font-weight:600">${title}</h4><table class="tbl"><thead><tr><th>Personagens</th><th class="num">Vezes</th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${rs.map(r => row(r, size)).join('')}</tbody></table>` : '';
  const inner = (pr.length || sr.length)
    ? tbl(sr, 30, 'Composições repetidas (3 ou mais personagens iguais)') + tbl(pr, 32, 'Duplas que mais aparecem juntas')
    : '<div class="empty-box">Ainda não há duplas ou composições repetidas. Elas aparecem conforme mais batalhas forem lançadas (a partir de 2 repetições).</div>';
  return `<div class="an-card"><h3>Composições · ${charSide === 'rivais' ? 'rivais' : 'nossas'}</h3><p class="sub">Combinações que se repetem e como nos saímos nelas.</p>${inner}</div>`;
}

function radarCard(list){
  const byMap = [...groupBy(list.filter(b => (b.enemy || []).length), b => b.map)].sort((a, b) => b[1].length - a[1].length);
  const items = byMap.map(([id, arr]) => {
    const cnt = new Map();
    arr.forEach(b => uniq(b.enemy).forEach(c => cnt.set(c, (cnt.get(c) || 0) + 1)));
    const top = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `<div class="radar-item"><h4>${esc(mapName(id))}<small>${arr.length} batalha${arr.length > 1 ? 's' : ''}</small></h4>
      <div class="radar-faces">${top.map(([c, n]) => `<div class="rf">${faceHTML(c, 40)}<span>${Math.round(n / arr.length * 100)}%</span></div>`).join('')}</div></div>`;
  }).join('');
  const who = flt.alliance ? `da aliança ${esc(flt.alliance)}` : 'dos adversários';
  return `<div class="an-card full"><h3>O que o adversário usa em cada mapa</h3>
    <p class="sub">Personagens mais frequentes ${who}, com a % de batalhas em que apareceram naquele mapa. Escolha uma aliança no filtro para ver o estilo dela.</p>
    ${items ? `<div class="radar">${items}</div>` : '<div class="empty-box">Lance os personagens dos rivais nas batalhas para ver este quadro.</div>'}</div>`;
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
  const trs = rows.map(r => `<tr>
      <td><div class="name"><span>${esc(r.nick)}</span>${roleBadges(r.nick)}</div></td>
      <td class="num">${r.n}</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td>
      <td>${facesInline(r.top.map(t => t[0]), 26)}</td></tr>`).join('');
  return `<div class="an-card"><h3>Jogadores</h3><p class="sub">Presença e resultado de cada um, com os 3 personagens que mais usou.</p>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Nick</th><th class="num">Jogos</th><th class="num">V-D</th><th class="num">%</th><th>Mais usa</th></tr></thead><tbody>${trs}</tbody></table>`
      : '<div class="empty-box">Informe os jogadores nas batalhas para ver as estatísticas individuais.</div>'}</div>`;
}

function historyCard(list){
  const sorted = [...list].sort((a, b) => a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1);
  const shown = showAllHist ? sorted : sorted.slice(0, 20);
  const items = shown.map(b => {
    const our = (b.our || []).filter(s => s.c).map(s => s.c);
    const enemy = b.enemy || [];
    const t = b.team ? TEAMS.find(x => x.id === b.team) : null;
    return `<div class="hist-item">
      <div class="hist-main">
        <div class="hist-line">
          <span class="chip-sm ${b.result}">${b.result === 'w' ? 'VITÓRIA' : 'DERROTA'}</span>
          <b>${esc(mapName(b.map))}</b><span class="dim">vs</span><b>${esc(b.alliance)}</b>
          <span class="dim">· ${fmtDate(b.date)}${t ? ' · ' + t.name : ''}</span>
        </div>
        <div>${our.length ? facesInline(our, 30) : '<span class="small-dim">nossa comp. não informada</span>'}<span class="vs">VS</span>${enemy.length ? facesInline(enemy, 30) : '<span class="small-dim">rivais não informados</span>'}</div>
        ${(b.our || []).some(s => s.p) ? `<div class="hist-note">${(b.our || []).filter(s => s.p).map(s => esc(s.p)).join(', ')}</div>` : ''}
        ${b.note ? `<div class="hist-note">“${esc(b.note)}”</div>` : ''}
      </div>
      ${isAdmin ? `<div class="hist-tools"><button class="mini-btn" data-act="edit" data-v="${b.id}">Editar</button><button class="mini-btn" data-act="del" data-v="${b.id}">Apagar</button></div>` : ''}
    </div>`;
  }).join('');
  return `<div class="an-card full"><h3>Histórico</h3><p class="sub">Batalhas lançadas, da mais recente para a mais antiga.</p>
    <div class="hist">${items || '<div class="empty-box">Nenhuma batalha neste filtro.</div>'}</div>
    ${sorted.length > 20 ? `<div style="margin-top:10px"><button class="mini-btn" data-act="allhist">${showAllHist ? 'Mostrar menos' : `Mostrar todas (${sorted.length})`}</button></div>` : ''}</div>`;
}

function renderAnalysis(){
  if(uiMode !== 'app') return;
  const all = battles;
  const alliances = uniq(all.map(b => b.alliance)).sort((a, b) => a.localeCompare(b));
  const maps = uniq(all.map(b => b.map));
  if(flt.alliance && !alliances.includes(flt.alliance)) flt.alliance = '';
  const list = filteredBattles();
  const sel = (id, v, label) => `<option value="${esc(v)}"${String(flt[id]) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  const hasFilter = flt.period !== 'all' || flt.map || flt.alliance;

  let html = `<div class="an-top">
    <div class="filters">
      <select data-act="fperiod" class="${flt.period !== 'all' ? 'active' : ''}">${sel('period', 'all', 'Todo o período')}${sel('period', '30', 'Últimos 30 dias')}${sel('period', '90', 'Últimos 90 dias')}</select>
      <select data-act="fmapsel" class="${flt.map ? 'active' : ''}">${sel('map', '', 'Todos os mapas')}${maps.map(m => sel('map', m, mapName(m))).join('')}</select>
      <select data-act="fallsel" class="${flt.alliance ? 'active' : ''}">${sel('alliance', '', 'Todas as alianças')}${alliances.map(a => sel('alliance', a, a)).join('')}</select>
      ${hasFilter ? '<button class="mini-btn" data-act="clearf">Limpar filtros</button>' : ''}
    </div>
    <div class="filters">
      ${isAdmin ? '<button class="mini-btn on" data-act="new">+ Lançar batalha</button>' : ''}
      ${all.length ? '<button class="mini-btn" data-act="csv">Baixar CSV</button>' : ''}
      ${isAdmin && all.length ? '<button class="mini-btn" data-act="backup">Backup</button>' : ''}
    </div>
  </div>`;

  if(!battlesLoaded){
    html += '<div class="placeholder">Carregando batalhas...</div>';
  } else if(!all.length){
    html += `<div class="an-card"><div class="empty-box">Nenhuma batalha lançada ainda.<br>${isAdmin
      ? 'Clique em <b>+ Lançar batalha</b> para registrar a primeira.'
      : 'O admin lança as vitórias e derrotas depois de cada GVG. Para lançar, entre como admin (botão no canto superior direito).'}</div></div>`;
  } else if(!list.length){
    html += '<div class="an-card"><div class="empty-box">Nenhuma batalha neste filtro.</div></div>';
  } else {
    html += kpiHTML(tally(list));
    html += `<div class="an-grid">${mapsCard(list)}${alliancesCard(list)}${charsCard(list)}${combosCard(list)}${playersCard(list)}${radarCard(list)}${historyCard(list)}</div>`;
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
    case 'clearf': flt.period = 'all'; flt.map = ''; flt.alliance = ''; break;
    case 'side': charSide = v; showAllChars = false; break;
    case 'allchars': showAllChars = !showAllChars; break;
    case 'allhist': showAllHist = !showAllHist; break;
    case 'new': openBattleModal(null); return;
    case 'edit': openBattleModal(battles.find(b => b.id === v)); return;
    case 'del': {
      const b = battles.find(x => x.id === v);
      if(b && confirm(`Apagar a batalha ${fmtDate(b.date)} contra ${b.alliance} (${mapName(b.map)})?`)) send({t: 'battle_del', id: v});
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
  const head = ['data', 'mapa', 'alianca', 'time', 'resultado', 'nossa_composicao', 'rivais', 'observacao'];
  const rows = battles.map(b => [
    b.date, mapName(b.map), b.alliance, b.team ? 'Time ' + b.team : '', b.result === 'w' ? 'Vitoria' : 'Derrota',
    (b.our || []).map(s => (s.p ? s.p + ': ' : '') + (s.c ? charName(s.c) : '?')).join(' | '),
    (b.enemy || []).map(charName).join(' | '), b.note || ''
  ].map(q).join(';'));
  download('gvg-batalhas.csv', '﻿' + head.join(';') + '\r\n' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}
function downloadBackup(){
  download(`gvg-backup-${todayStr()}.json`, JSON.stringify({exportado: new Date().toISOString(), jogadores: roster, batalhas: battles}, null, 1), 'application/json');
}

/* ---------- lançar / editar batalha (admin) ---------- */

let form = null;
let formSavingNext = false;
let lastKept = {date: '', alliance: ''};       // lembra data e aliança para lançar várias batalhas seguidas
const SLOT_TAGS = ['Tank', 'Sup', '1', '2', '3', '4'];

function blankForm(){
  return {id: '', date: lastKept.date || todayStr(), map: '', alliance: lastKept.alliance || '', team: '', result: '',
    our: SLOT_TAGS.map(() => ({p: '', c: ''})), enemy: SLOT_TAGS.map(() => ''), note: ''};
}
function formFrom(b){
  const f = blankForm();
  f.id = b.id; f.date = b.date; f.map = b.map; f.alliance = b.alliance; f.team = b.team || ''; f.result = b.result; f.note = b.note || '';
  (b.our || []).slice(0, 6).forEach((s, i) => { f.our[i] = {p: s.p || '', c: s.c || ''}; });
  (b.enemy || []).slice(0, 6).forEach((c, i) => { f.enemy[i] = c; });
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
  if(!isAdmin) return;
  if(!battlesLoaded) send({t: 'get_battles'}, true);
  form = b ? formFrom(b) : blankForm();
  formSavingNext = false;
  const allies = uniq(battles.map(x => x.alliance)).sort();
  openModal(`
    <h3>${form.id ? 'Editar batalha' : 'Lançar batalha'}</h3>
    <div class="row3">
      <div><label class="f" for="fDate">Data</label><input class="nick-input" id="fDate" type="date" value="${form.date}"></div>
      <div><label class="f" for="fMap">Mapa</label><select class="nick-input" id="fMap"><option value="">Escolha…</option>${MAPS.map(m => `<option value="${m.id}"${m.id === form.map ? ' selected' : ''}>${m.name}</option>`).join('')}</select></div>
      <div><label class="f" for="fTeam">Time (opcional)</label><select class="nick-input" id="fTeam"><option value="">—</option>${TEAMS.map(t => `<option value="${t.id}"${t.id === form.team ? ' selected' : ''}>${t.name}</option>`).join('')}</select></div>
    </div>
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

    <div class="sec-head"><span>Composição do rival</span>
      <span class="filters"><button type="button" class="mini-btn" id="fImport">Importar do marcador</button><button type="button" class="mini-btn" id="fSeqEn">&#9654; Preencher seguidos</button></span></div>
    <div class="face-row">${SLOT_TAGS.map((t, i) => `<div class="face-cell">${faceBtnHTML('en', i, form.enemy[i])}<span>${t}</span></div>`).join('')}</div>

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
    else if(t.id === 'fAlliance') form.alliance = t.value;
    else if(t.id === 'fNote') form.note = t.value;
    else if(t.id && t.id.startsWith('fp-')) form.our[Number(t.id.slice(3))].p = t.value;
  });
  box.addEventListener('change', (e) => {
    if(e.target.id === 'fMap') form.map = e.target.value;
    if(e.target.id === 'fTeam') form.team = e.target.value;
  });
  box.addEventListener('click', (e) => {
    const t = e.target;
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
    label: n => (kind === 'our' ? 'Nosso · ' : 'Rival · ') + SLOT_TAGS[n], get: a.get, set: a.set});
}
function seqForm(kind){
  const a = formAccess(kind);
  let start = SLOT_TAGS.findIndex((_, i) => !a.get(i));
  if(start < 0) start = 0;
  runPicker({doc: document, count: SLOT_TAGS.length, start, single: false,
    label: n => (kind === 'our' ? 'Nosso · ' : 'Rival · ') + SLOT_TAGS[n], get: a.get, set: a.set});
}
function importFromTracker(){
  const team = form.team;
  if(!team){ formErr('Escolha o time acima para importar os personagens que foram marcados no marcador de mortes.'); return; }
  const cs = (state.chars && state.chars[team]) || {};
  if(!ENEMY_SLOTS.some(s => cs[s.id])){ formErr(`O marcador do ${TEAMS.find(t => t.id === team).name} está sem personagens agora (ele zera quando o mapa do time muda).`); return; }
  ENEMY_SLOTS.forEach((s, i) => { form.enemy[i] = cs[s.id] || ''; updFaceBtn('en', i); });
  $('formErr').classList.add('hidden');
}
function repeatLast(){
  const pool = [...battles].filter(b => (b.our || []).length).sort((a, b) => b.ts - a.ts);
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
  if(!f.alliance.trim()) return formErr('Informe a aliança adversária.');
  if(!f.result) return formErr('Marque Vitória ou Derrota.');
  const battle = {
    id: f.id || undefined, date: f.date, map: f.map, alliance: f.alliance.trim(), team: f.team, result: f.result,
    our: f.our.filter(s => s.p.trim() || s.c).map(s => ({p: s.p.trim(), c: s.c})),
    enemy: f.enemy.filter(Boolean), note: f.note.trim()
  };
  formSavingNext = next;
  if(!send({t: 'battle_save', battle})) return;
  $('fSave').disabled = true;
  const n = $('fSaveNext'); if(n) n.disabled = true;
}

function onBattleSaved(){
  if(!form){ return; }
  lastKept = {date: form.date, alliance: form.alliance.trim()};
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
