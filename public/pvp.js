/* ================= Análise PvP: 1x1, 2x2 e 3x3 (casual ou ranked) ================= */
// Aqui não se identifica jogador, só os personagens. "Meu time" = o time de quem lançou o match.
// No ranked, quem lança pode informar os banimentos (até 4, opcional).

let pvp = [];
let pvpLoaded = false;
const pf = {mode: '', kind: '', period: 'all'};     // filtros: modalidade, casual/ranked, período
let pvSide = 'nossos';                               // 'nossos' | 'rivais' | 'todos'
let pvSort = 'uso';
let pvShowAllChars = false, pvShowAllHist = false;
let pvMatchSort = 'vantagem';                        // 'vantagem' | 'jogados'
let pvLookup = '';                                   // personagem consultado em "Counters"
const PV_MODES = ['1v1', '2v2', '3v3'];
const pvModeLabel = (m) => m.replace('v', 'x');
const PV_MATCH_MIN = 2;                              // mínimo de partidas para um confronto aparecer no ranking

function resetPvp(){ pvpLoaded = false; pvp = []; }
function enterPvp(){
  if(!pvpLoaded) send({t: 'pvp_get'}, true);
  renderPvp();
}
function onPvp(list){ pvp = list; pvpLoaded = true; if(currentTab === 'pvp') renderPvp(); }
function onPvpDirty(){ send({t: 'pvp_get'}, true); }

const canEditPvp = (m) => isAdmin || can('batalhas') || (m.by && nickname && String(m.by).toLowerCase() === nickname.toLowerCase());
const pvN = (m) => Number(m.mode[0]);
// Espelhado: os dois lados com os mesmos personagens. Nesse caso vale a habilidade do jogador, não o personagem,
// então o match fica no histórico mas NÃO entra nas taxas de vitória/derrota nem nos confrontos.
const isMirror = (m) => m.mine.length === m.theirs.length && m.mine.every(c => m.theirs.includes(c));

function filteredPvp(){
  let list = pvp;
  if(pf.period !== 'all'){
    const cut = new Date(Date.now() - Number(pf.period) * 864e5).toLocaleDateString('en-CA');
    list = list.filter(m => m.date >= cut);
  }
  if(pf.mode) list = list.filter(m => m.mode === pf.mode);
  if(pf.kind) list = list.filter(m => pf.kind === 'ranked' ? m.ranked : !m.ranked);
  return list;
}
const tallyPv = (list) => { const w = list.filter(m => m.result === 'w').length; return {n: list.length, w, l: list.length - w}; };

// "entrada" = um time num match; w = conta como vitória no percentual do quadro
// (personagem que aparece nos dois lados do mesmo match, em 2x2/3x3, também não conta: é espelho dele)
function entriesPv(list, side){
  const mi = (m) => m.mine.filter(c => !m.theirs.includes(c)), th = (m) => m.theirs.filter(c => !m.mine.includes(c));
  if(side === 'todos') return list.flatMap(m => [{chars: mi(m), w: m.result === 'w'}, {chars: th(m), w: m.result === 'l'}]);
  return list.map(m => ({chars: side === 'nossos' ? mi(m) : th(m), w: m.result === 'w'}));
}

/* ---------- confrontos (quem ganha de quem) ---------- */
function matchups(list){
  const map = new Map();
  const add = (x, y, won) => {
    const k = x + '|' + y;
    const e = map.get(k) || {x, y, n: 0, w: 0};
    e.n++; if(won) e.w++;
    map.set(k, e);
  };
  list.forEach(m => m.mine.forEach(a => m.theirs.forEach(b => { if(a === b) return; add(a, b, m.result === 'w'); add(b, a, m.result === 'l'); })));
  return [...map.values()];
}
const laplace = (e) => (e.w + 1) / (e.n + 2);

/* ---------- blocos ---------- */
function pvKpis(list, mirrors){
  const t = tallyPv(list);
  return `<div class="kpis">
    <div class="kpi"><div class="v">${t.n}</div><div class="k">Matches</div></div>
    <div class="kpi"><div class="v win">${t.w}</div><div class="k">Vitórias</div></div>
    <div class="kpi"><div class="v loss">${t.l}</div><div class="k">Derrotas</div></div>
    <div class="kpi"><div class="v">${pctOf(t.w, t.n)}%</div><div class="k">Aproveitamento</div></div>
  </div>${mirrors ? `<p class="small-dim" style="margin:-6px 0 12px">${mirrors} match${mirrors > 1 ? 'es' : ''} espelhado${mirrors > 1 ? 's' : ''} (mesmos personagens dos dois lados) ${mirrors > 1 ? 'ficam' : 'fica'} só no histórico e não entra${mirrors > 1 ? 'm' : ''} nas taxas, porque ali vale a habilidade do jogador.</p>` : ''}`;
}

function pvModesCard(list){
  const rows = [];
  PV_MODES.forEach(md => [false, true].forEach(rk => {
    const arr = list.filter(m => m.mode === md && m.ranked === rk);
    if(!arr.length) return;
    const t = tallyPv(arr);
    rows.push(`<tr><td><div class="name"><span>${pvModeLabel(md)}</span><span class="tag-sm ${rk ? 'rk' : ''}">${rk ? 'Ranked' : 'Casual'}</span></div></td>
      <td>${wlBar(t.w, t.l)}</td><td class="num">${t.w}-${t.l}</td><td class="num">${pctCell(t.w, t.n)}</td></tr>`);
  }));
  return `<div class="an-card"><h3>Por modalidade</h3><p class="sub">Resultado em cada tipo de PvP.</p>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Modalidade</th><th></th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<div class="empty-box">Sem matches neste filtro.</div>'}</div>`;
}

function pvCharsCard(list){
  const withData = entriesPv(list, pvSide);
  const map = new Map();
  withData.forEach(e => e.chars.forEach(c => { if(!map.has(c)) map.set(c, []); map.get(c).push(e); }));
  let rows = [...map].map(([id, arr]) => ({id, ...tallyE(arr), pres: arr.length / withData.length}));
  if(pvSort === 'uso') rows.sort((a, b) => b.n - a.n || b.w - a.w);
  else {
    rows = rows.filter(r => r.n >= MIN_RATE);
    rows.sort((a, b) => pvSort === 'melhor' ? (b.w / b.n - a.w / a.n) || (b.n - a.n) : (a.w / a.n - b.w / b.n) || (b.n - a.n));
  }
  const total = rows.length;
  const shown = pvShowAllChars ? rows : rows.slice(0, 12);
  const trs = shown.map(r => `<tr>
      <td><div class="name">${faceHTML(r.id, 32)}<span>${esc(charName(r.id))}</span></div></td>
      <td class="num">${r.n} <span style="color:var(--dimmer)">(${Math.round(r.pres * 100)}%)</span></td>
      <td>${wlBar(r.w, r.l)}</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td></tr>`).join('');
  const sub = {
    nossos: 'Personagens que os nossos players usaram. "%" = quanto vencemos com ele.',
    rivais: 'Personagens do adversário. "%" = quanto NÓS vencemos contra ele.',
    todos: 'Os dois lados juntos. "%" = quanto o lado que usou o personagem venceu.'
  }[pvSide];
  const body = rows.length
    ? `<table class="tbl"><thead><tr><th>Personagem</th><th class="num">Usos (presença)</th><th></th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${trs}</tbody></table>
       ${total > 12 ? `<div style="margin-top:10px"><button class="mini-btn" data-act="allchars">${pvShowAllChars ? 'Mostrar menos' : `Mostrar todos (${total})`}</button></div>` : ''}
       <p class="note-low">Percentual apagado = menos de ${LOW_N} usos (amostra pequena).</p>`
    : `<div class="empty-box">${pvSort === 'uso' ? 'Ainda não há personagens neste filtro.' : `Nenhum personagem com pelo menos ${MIN_RATE} usos ainda.`}</div>`;
  return `<div class="an-card full"><h3>Personagens</h3><p class="sub">${sub}</p>
    <div class="card-tools">
      <div class="seg"><button data-act="side" data-v="nossos" aria-pressed="${pvSide === 'nossos'}">Nossos</button><button data-act="side" data-v="rivais" aria-pressed="${pvSide === 'rivais'}">Rivais</button><button data-act="side" data-v="todos" aria-pressed="${pvSide === 'todos'}">Todos</button></div>
      <select data-act="sort">
        <option value="uso"${pvSort === 'uso' ? ' selected' : ''}>Mais usados</option>
        <option value="melhor"${pvSort === 'melhor' ? ' selected' : ''}>Melhor aproveitamento (mín. ${MIN_RATE})</option>
        <option value="pior"${pvSort === 'pior' ? ' selected' : ''}>Pior aproveitamento (mín. ${MIN_RATE})</option>
      </select>
    </div>${body}</div>`;
}

function pvMatchupsCard(list){
  let rows = matchups(list).filter(e => e.n >= PV_MATCH_MIN);
  if(pvMatchSort === 'jogados') rows.sort((a, b) => b.n - a.n || laplace(b) - laplace(a));
  else rows.sort((a, b) => laplace(b) - laplace(a) || b.n - a.n);
  rows = rows.slice(0, 15);
  const trs = rows.map(e => `<tr>
      <td><div class="name">${faceHTML(e.x, 30)}<span>${esc(charName(e.x))}</span></div></td>
      <td class="vs-cell">contra</td>
      <td><div class="name">${faceHTML(e.y, 30)}<span>${esc(charName(e.y))}</span></div></td>
      <td class="num">${e.n}</td><td class="num">${e.w}-${e.n - e.w}</td><td class="num">${pctCell(e.w, e.n)}</td></tr>`).join('');
  const multi = list.some(m => pvN(m) > 1);
  return `<div class="an-card full"><h3>Confrontos · quem leva vantagem</h3>
    <p class="sub">Quanto o personagem da esquerda vence quando está no lado oposto ao da direita (em qualquer lado, nossos ou rivais).${multi ? ' Em 2x2 e 3x3 conta cada personagem de um time contra cada um do outro.' : ''} Só aparecem confrontos com pelo menos ${PV_MATCH_MIN} partidas.</p>
    <div class="card-tools"><select data-act="msort">
      <option value="vantagem"${pvMatchSort === 'vantagem' ? ' selected' : ''}>Maior vantagem</option>
      <option value="jogados"${pvMatchSort === 'jogados' ? ' selected' : ''}>Mais jogados</option></select></div>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Personagem</th><th></th><th>Adversário</th><th class="num">Jogos</th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${trs}</tbody></table>
      <p class="note-low">Percentual apagado = menos de ${LOW_N} jogos (amostra pequena).</p>`
      : '<div class="empty-box">Ainda não há confrontos repetidos. Eles aparecem conforme mais matches forem lançados.</div>'}</div>`;
}

function pvCounterCard(list){
  const opts = [...CHARS].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', {sensitivity: 'base'}))
    .map(c => `<option value="${c[0]}"${pvLookup === c[0] ? ' selected' : ''}>${esc(c[1])}</option>`).join('');
  let inner = '<div class="empty-box">Escolha um personagem para ver quem vence ele e contra quem ele vai bem.</div>';
  if(pvLookup){
    const all = matchups(list);
    const vs = all.filter(e => e.y === pvLookup).sort((a, b) => laplace(b) - laplace(a) || b.n - a.n).slice(0, 8);     // quem se dá bem contra ele
    const gets = all.filter(e => e.x === pvLookup).sort((a, b) => laplace(b) - laplace(a) || b.n - a.n).slice(0, 8);   // contra quem ele se dá bem
    const ent = entriesPv(list, 'todos').filter(e => e.chars.includes(pvLookup));
    const t = tallyE(ent);
    const tbl = (rows, key) => rows.length
      ? `<table class="tbl"><thead><tr><th>Personagem</th><th class="num">Jogos</th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${rows.map(e => `<tr>
          <td><div class="name">${faceHTML(e[key], 30)}<span>${esc(charName(e[key]))}</span></div></td>
          <td class="num">${e.n}</td><td class="num">${e.w}-${e.n - e.w}</td><td class="num">${pctCell(e.w, e.n)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="small-dim" style="padding:8px 0">Sem partidas ainda.</div>';
    inner = `<div class="cn-head">${faceHTML(pvLookup, 44)}<div><b>${esc(charName(pvLookup))}</b><div class="small-dim">${t.n ? `${t.n} uso${t.n > 1 ? 's' : ''} · ${t.w}-${t.l} · ${pctOf(t.w, t.n)}%` : 'ainda não apareceu neste filtro'}</div></div></div>
      <div class="cn-cols">
        <div><h4 class="cn-h">Quem se dá bem contra ele</h4>${tbl(vs, 'x')}</div>
        <div><h4 class="cn-h">Contra quem ele se dá bem</h4>${tbl(gets, 'y')}</div>
      </div>`;
  }
  return `<div class="an-card full"><h3>Counters · consultar personagem</h3>
    <p class="sub">Escolha um personagem e veja os confrontos dele (nas partidas lançadas, em qualquer lado). "%" = quanto o personagem da linha venceu no confronto.</p>
    <div class="card-tools"><select data-act="lookup" class="lookup-sel"><option value="">Escolher personagem…</option>${opts}</select></div>${inner}</div>`;
}

function pvCombosCard(list){
  const withData = entriesPv(list, pvSide).filter(e => e.chars.length >= 2);
  const pairs = new Map(), sets = new Map();
  withData.forEach(e => {
    const ids = [...e.chars].sort();
    for(let i = 0; i < ids.length; i++) for(let j = i + 1; j < ids.length; j++){
      const k = ids[i] + '|' + ids[j]; if(!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(e);
    }
    if(ids.length >= 3){ const k = ids.join('|'); if(!sets.has(k)) sets.set(k, []); sets.get(k).push(e); }
  });
  const rank = (m) => [...m].map(([k, arr]) => ({ids: k.split('|'), ...tallyE(arr)})).filter(r => r.n >= 2).sort((a, b) => b.n - a.n || b.w - a.w).slice(0, 8);
  const row = (r, size) => `<tr><td><div class="name">${facesInline(r.ids, size)}</div></td><td class="num">${r.n}x</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td></tr>`;
  const tbl = (rs, size, title) => rs.length ? `<h4 style="margin:12px 0 6px;font-size:12px;color:var(--dim);font-weight:600">${title}</h4><table class="tbl"><thead><tr><th>Personagens</th><th class="num">Vezes</th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${rs.map(r => row(r, size)).join('')}</tbody></table>` : '';
  const sr = rank(sets), pr = rank(pairs);
  const who = {nossos: 'nossas', rivais: 'rivais', todos: 'de todos'}[pvSide];
  return `<div class="an-card"><h3>Duplas e trios · ${who}</h3><p class="sub">Só entram 2x2 e 3x3. Seguem o lado escolhido em "Personagens".</p>
    ${(sr.length || pr.length) ? tbl(sr, 30, 'Trios repetidos') + tbl(pr, 32, 'Duplas que mais aparecem juntas') : '<div class="empty-box">Ainda não há duplas ou trios repetidos.</div>'}</div>`;
}

let pvBanSide = 'todos';        // 'meus' | 'rival' | 'todos'
const bansOf = (m, side) => side === 'meus' ? (m.bans || []) : side === 'rival' ? (m.bansE || []) : [...(m.bans || []), ...(m.bansE || [])];
function pvBansCard(list){
  const ranked = list.filter(m => m.ranked && bansOf(m, pvBanSide).length);
  const map = new Map();
  ranked.forEach(m => bansOf(m, pvBanSide).forEach(c => { if(!map.has(c)) map.set(c, []); map.get(c).push(m); }));
  const rows = [...map].map(([id, arr]) => ({id, ...tallyPv(arr), pres: arr.length / ranked.length})).sort((a, b) => b.n - a.n || b.w - a.w).slice(0, 12);
  const trs = rows.map(r => `<tr><td><div class="name">${faceHTML(r.id, 30)}<span>${esc(charName(r.id))}</span></div></td>
    <td class="num">${r.n} <span style="color:var(--dimmer)">(${Math.round(r.pres * 100)}%)</span></td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td></tr>`).join('');
  return `<div class="an-card"><h3>Banimentos · ranked</h3><p class="sub">${{meus: 'Personagens que NÓS banimos.', rival: 'Personagens que o RIVAL baniu.', todos: 'Banimentos dos dois lados.'}[pvBanSide]} "%" = quanto vencemos nos matches em que ele foi banido.</p>
    <div class="card-tools"><div class="seg"><button data-act="banside" data-v="meus" aria-pressed="${pvBanSide === 'meus'}">Nossos</button><button data-act="banside" data-v="rival" aria-pressed="${pvBanSide === 'rival'}">Do rival</button><button data-act="banside" data-v="todos" aria-pressed="${pvBanSide === 'todos'}">Todos</button></div></div>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Personagem</th><th class="num">Vezes (presença)</th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${trs}</tbody></table>`
      : '<div class="empty-box">Nenhum ranked com banimentos lançado neste filtro. Os banimentos são opcionais.</div>'}</div>`;
}

function pvHistoryCard(list){
  const sorted = [...list].sort((a, b) => a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1);
  const shown = pvShowAllHist ? sorted : sorted.slice(0, 20);
  const items = shown.map(m => `<div class="hist-item">
      <div class="hist-main">
        <div class="hist-line">
          <span class="chip-sm ${m.result}">${m.result === 'w' ? 'VITÓRIA' : 'DERROTA'}</span>
          <b>${pvModeLabel(m.mode)}</b><span class="tag-sm ${m.ranked ? 'rk' : ''}">${m.ranked ? 'Ranked' : 'Casual'}</span>${isMirror(m) ? '<span class="tag-sm" title="Mesmos personagens dos dois lados: não entra nas taxas">Espelhado · fora das taxas</span>' : ''}
          <span class="dim">· ${fmtDate(m.date)}</span>
        </div>
        <div>${facesInline(m.mine, 30)}<span class="vs">VS</span>${facesInline(m.theirs, 30)}</div>
        ${(m.bans || []).length ? `<div class="hist-note">Nossos bans: ${facesInline(m.bans, 20)}</div>` : ''}
        ${(m.bansE || []).length ? `<div class="hist-note">Bans do rival: ${facesInline(m.bansE, 20)}</div>` : ''}
        ${m.note ? `<div class="hist-note">“${esc(m.note)}”</div>` : ''}
      </div>
      ${canEditPvp(m) ? `<div class="hist-tools"><button class="mini-btn" data-act="edit" data-v="${m.id}">Editar</button><button class="mini-btn" data-act="del" data-v="${m.id}">Apagar</button></div>` : ''}
    </div>`).join('');
  return `<div class="an-card full"><h3>Histórico</h3><p class="sub">Matches lançados (inclusive os espelhados), do mais recente para o mais antigo. Cada um edita ou apaga só os que lançou (a liderança com permissão de batalhas e o admin editam todos).</p>
    <div class="hist">${items || '<div class="empty-box">Nenhum match neste filtro.</div>'}</div>
    ${sorted.length > 20 ? `<div style="margin-top:10px"><button class="mini-btn" data-act="allhist">${pvShowAllHist ? 'Mostrar menos' : `Mostrar todos (${sorted.length})`}</button></div>` : ''}</div>`;
}

function renderPvp(){
  if(uiMode !== 'app' || !tabPvp) return;
  const list = filteredPvp();
  const sel = (key, v, label) => `<option value="${esc(v)}"${String(pf[key]) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  const hasFilter = pf.mode || pf.kind || pf.period !== 'all';
  let html = `<div class="an-top">
    <div class="filters">
      <select data-act="fmode" class="${pf.mode ? 'active' : ''}">${sel('mode', '', 'Todas as modalidades')}${PV_MODES.map(m => sel('mode', m, pvModeLabel(m))).join('')}</select>
      <select data-act="fkind" class="${pf.kind ? 'active' : ''}">${sel('kind', '', 'Casual + ranked')}${sel('kind', 'casual', 'Só casual')}${sel('kind', 'ranked', 'Só ranked')}</select>
      <select data-act="fperiod" class="${pf.period !== 'all' ? 'active' : ''}">${sel('period', 'all', 'Todo o período')}${sel('period', '30', 'Últimos 30 dias')}${sel('period', '90', 'Últimos 90 dias')}</select>
      ${hasFilter ? '<button class="mini-btn" data-act="clearf">Limpar filtros</button>' : ''}
    </div>
    <div class="filters">
      <button class="mini-btn on" data-act="new">+ Lançar match</button>
      ${pvp.length ? '<button class="mini-btn" data-act="csv">Baixar CSV</button>' : ''}
    </div>
  </div>`;
  if(!pvpLoaded) html += '<div class="placeholder">Carregando matches...</div>';
  else if(!pvp.length) html += '<div class="an-card"><div class="empty-box">Nenhum match de PvP lançado ainda.<br>Clique em <b>+ Lançar match</b> depois de cada partida (1x1, 2x2 ou 3x3) para montar o histórico.</div></div>';
  else if(!list.length) html += '<div class="an-card"><div class="empty-box">Nenhum match neste filtro.</div></div>';
  else {
    const real = list.filter(m => !isMirror(m));
    html += pvKpis(real, list.length - real.length);
    html += `<div class="an-grid">${pvModesCard(real)}${pvBansCard(real)}${pvCharsCard(real)}${pvMatchupsCard(real)}${pvCounterCard(real)}${real.some(m => pvN(m) > 1) ? pvCombosCard(real) : ''}${pvHistoryCard(list)}</div>`;
  }
  tabPvp.innerHTML = html;
}

tabPvp.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if(!el || el.tagName === 'SELECT') return;
  const v = el.dataset.v;
  switch(el.dataset.act){
    case 'clearf': pf.mode = ''; pf.kind = ''; pf.period = 'all'; break;
    case 'side': pvSide = v; pvShowAllChars = false; break;
    case 'allchars': pvShowAllChars = !pvShowAllChars; break;
    case 'allhist': pvShowAllHist = !pvShowAllHist; break;
    case 'banside': pvBanSide = v; break;
    case 'new': openPvpModal(null); return;
    case 'edit': openPvpModal(pvp.find(m => m.id === v)); return;
    case 'del': { const m = pvp.find(x => x.id === v); if(m && confirm(`Apagar o match ${pvModeLabel(m.mode)} de ${fmtDate(m.date)}?`)) send({t: 'pvp_del', id: v}); return; }
    case 'csv': downloadPvpCsv(); return;
    default: return;
  }
  renderPvp();
});
tabPvp.addEventListener('change', (e) => {
  const el = e.target.closest('select[data-act]');
  if(!el) return;
  switch(el.dataset.act){
    case 'fmode': pf.mode = el.value; break;
    case 'fkind': pf.kind = el.value; break;
    case 'fperiod': pf.period = el.value; break;
    case 'sort': pvSort = el.value; pvShowAllChars = false; break;
    case 'msort': pvMatchSort = el.value; break;
    case 'lookup': pvLookup = el.value; break;
  }
  renderPvp();
});

function downloadPvpCsv(){
  const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const head = ['data', 'modalidade', 'tipo', 'resultado', 'meu_time', 'adversario', 'bans_nossos', 'bans_rival', 'observacao'];
  const rows = pvp.map(m => [m.date, pvModeLabel(m.mode), m.ranked ? 'Ranked' : 'Casual', m.result === 'w' ? 'Vitoria' : 'Derrota',
    m.mine.map(charName).join(' | '), m.theirs.map(charName).join(' | '), (m.bans || []).map(charName).join(' | '), (m.bansE || []).map(charName).join(' | '), m.note || ''].map(q).join(';'));
  download('gvg-pvp.csv', '﻿' + head.join(';') + '\r\n' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

/* ---------- lançar / editar match ---------- */
let pvForm = null;
let pvSavingNext = false;
let pvKept = {mode: '1v1', ranked: false, date: ''};

function pvBlank(){
  const n = Number(pvKept.mode[0]);
  return {id: '', mode: pvKept.mode, ranked: pvKept.ranked, date: pvKept.date || todayStr(), result: '',
    mine: Array(n).fill(''), theirs: Array(n).fill(''), bans: ['', '', '', ''], bansE: ['', '', '', ''], note: ''};
}
function pvFrom(m){
  const f = pvBlank();
  f.id = m.id; f.mode = m.mode; f.ranked = !!m.ranked; f.date = m.date; f.result = m.result; f.note = m.note || '';
  f.mine = [...m.mine]; f.theirs = [...m.theirs];
  (m.bans || []).forEach((c, i) => { f.bans[i] = c; });
  (m.bansE || []).forEach((c, i) => { f.bansE[i] = c; });
  return f;
}
function pvSetMode(mode){
  const n = Number(mode[0]);
  const fit = (arr) => Array.from({length: n}, (_, i) => arr[i] || '');
  pvForm.mode = mode; pvForm.mine = fit(pvForm.mine); pvForm.theirs = fit(pvForm.theirs);
}
function pvFaceBtn(kind, i, id){
  return `<button type="button" class="face-btn${id ? ' set' : ''}" data-pk="${kind}" data-i="${i}" id="pvb-${kind}-${i}" title="${id ? esc(charName(id)) : 'Escolher personagem'}">${id ? faceHTML(id, 42) : '+'}</button>`;
}
function pvUpd(kind, i){ const b = $(`pvb-${kind}-${i}`); if(b) b.outerHTML = pvFaceBtn(kind, i, pvForm[kind][i]); }

function openPvpModal(m){
  pvForm = m ? pvFrom(m) : pvBlank();
  pvSavingNext = false;
  renderPvpForm();
}
function renderPvpForm(){
  const f = pvForm;
  const n = Number(f.mode[0]);
  const cells = (kind, label) => `<div class="face-row">${f[kind].map((id, i) => `<div class="face-cell">${pvFaceBtn(kind, i, id)}<span>${n > 1 ? label + ' ' + (i + 1) : label}</span></div>`).join('')}</div>`;
  openModal(`
    <h3>${f.id ? 'Editar match' : 'Lançar match de PvP'}</h3>
    <div class="row2">
      <div><label class="f">Modalidade</label><div class="seg">${PV_MODES.map(md => `<button type="button" data-mode="${md}" aria-pressed="${f.mode === md}">${pvModeLabel(md)}</button>`).join('')}</div></div>
      <div><label class="f" for="pvDate">Data</label><input class="nick-input" id="pvDate" type="date" value="${f.date}"></div>
    </div>
    <label class="pv-ranked"><input type="checkbox" id="pvRanked"${f.ranked ? ' checked' : ''}><span><b>PvP ranked</b><small>no ranked é possível informar os banimentos</small></span></label>
    <label class="f" style="margin-top:12px">Resultado</label>
    <div class="res-btns">
      <button type="button" class="res-btn w" data-r="w" data-on="${f.result === 'w'}">Vitória</button>
      <button type="button" class="res-btn l" data-r="l" data-on="${f.result === 'l'}">Derrota</button>
    </div>
    <div class="sec-head"><span>Meu time</span><span class="filters"><button type="button" class="mini-btn" data-seq="mine">&#9654; Preencher seguidos</button></span></div>
    ${cells('mine', 'Meu')}
    <div class="sec-head"><span>Time adversário</span><span class="filters"><button type="button" class="mini-btn" data-seq="theirs">&#9654; Preencher seguidos</button></span></div>
    ${cells('theirs', 'Rival')}
    <p class="small-dim" style="margin-top:8px">Espelhado (mesmos personagens dos dois lados) fica no histórico, mas não conta nas taxas de vitória.</p>
    ${f.ranked ? `<div class="sec-head"><span>Banimentos <span class="small-dim">(opcional · no máximo 4 no total, somando os seus e os do rival)</span></span></div>
      <div class="sec-head" style="margin-top:4px"><span class="small-dim">Nossos bans</span><span class="filters"><button type="button" class="mini-btn" data-seq="bans">&#9654; Preencher seguidos</button></span></div>
      <div class="face-row">${f.bans.map((id, i) => `<div class="face-cell">${pvFaceBtn('bans', i, id)}<span>Ban ${i + 1}</span></div>`).join('')}</div>
      <div class="sec-head" style="margin-top:4px"><span class="small-dim">Bans do rival</span><span class="filters"><button type="button" class="mini-btn" data-seq="bansE">&#9654; Preencher seguidos</button></span></div>
      <div class="face-row">${f.bansE.map((id, i) => `<div class="face-cell">${pvFaceBtn('bansE', i, id)}<span>Ban ${i + 1}</span></div>`).join('')}</div>` : ''}
    <label class="f" for="pvNote" style="margin-top:12px">Observação (opcional)</label>
    <input class="nick-input" id="pvNote" type="text" maxlength="200" value="${esc(f.note)}" placeholder="ex.: perdi por causa do primeiro golpe">
    <p class="form-err hidden" id="pvErr"></p>
    <div class="modal-actions">
      <button class="primary-btn" id="pvSave" type="button">Salvar</button>
      ${f.id ? '' : '<button class="primary-btn" id="pvSaveNext" type="button" style="background:#35C48C">Salvar e lançar outro</button>'}
      <button class="ghost-btn" id="pvCancel" type="button">Cancelar</button>
    </div>`, true);
  const box = $('modalBox');
  box.addEventListener('input', (e) => {
    if(e.target.id === 'pvDate') f.date = e.target.value;
    else if(e.target.id === 'pvNote') f.note = e.target.value;
  });
  box.addEventListener('change', (e) => {
    if(e.target.id === 'pvRanked'){ f.ranked = e.target.checked; renderPvpForm(); }
  });
  box.addEventListener('click', (e) => {
    const t = e.target;
    const md = t.closest('[data-mode]');
    if(md){ pvSetMode(md.dataset.mode); renderPvpForm(); return; }
    const rb = t.closest('.res-btn');
    if(rb){ f.result = rb.dataset.r; box.querySelectorAll('.res-btn').forEach(b => b.dataset.on = String(b.dataset.r === f.result)); return; }
    const fb = t.closest('[data-pk]');
    if(fb){ pvPick(fb.dataset.pk, Number(fb.dataset.i), true); return; }
    const sq = t.closest('[data-seq]');
    if(sq){ const k = sq.dataset.seq; const s = f[k].findIndex(x => !x); pvPick(k, s < 0 ? 0 : s, false); return; }
    const id = t.closest('button') && t.closest('button').id;
    if(id === 'pvCancel') closeModal();
    else if(id === 'pvSave') pvSave(false);
    else if(id === 'pvSaveNext') pvSave(true);
  });
}
function pvPick(kind, i, single){
  const tag = {mine: 'Meu time', theirs: 'Rival', bans: 'Nosso ban', bansE: 'Ban do rival'}[kind];
  runPicker({doc: document, count: pvForm[kind].length, start: i, single,
    label: n => `${tag} · ${n + 1}`,
    get: n => pvForm[kind][n],
    set: (n, id) => {
      if(id) pvForm[kind].forEach((x, k) => { if(k !== n && x === id){ pvForm[kind][k] = ''; pvUpd(kind, k); } });   // sem repetir no mesmo lado
      if(id && (kind === 'bans' || kind === 'bansE')){ const o = kind === 'bans' ? 'bansE' : 'bans'; pvForm[o].forEach((x, k) => { if(x === id){ pvForm[o][k] = ''; pvUpd(o, k); } }); }   // nem nos dois lados
      pvForm[kind][n] = id; pvUpd(kind, n);
    }});
}
function pvErr(t){ const el = $('pvErr'); if(el){ el.textContent = t; el.classList.remove('hidden'); } }
function pvSave(next){
  const f = pvForm;
  if(!f.date) return pvErr('Informe a data.');
  if(!f.result) return pvErr('Marque Vitória ou Derrota.');
  if(f.mine.some(x => !x)) return pvErr('Escolha todos os personagens do seu time.');
  if(f.theirs.some(x => !x)) return pvErr('Escolha todos os personagens do time adversário.');
  if(f.ranked && f.bans.filter(Boolean).length + f.bansE.filter(Boolean).length > 4) return pvErr('No total são no máximo 4 banimentos (os seus mais os do rival).');
  const match = {id: f.id || undefined, mode: f.mode, ranked: f.ranked, date: f.date, result: f.result, mine: f.mine, theirs: f.theirs,
    bans: f.ranked ? f.bans.filter(Boolean) : [], bansE: f.ranked ? f.bansE.filter(Boolean) : [], note: f.note.trim()};
  pvSavingNext = next;
  if(!send({t: 'pvp_save', match})) return;
  $('pvSave').disabled = true;
  const nx = $('pvSaveNext'); if(nx) nx.disabled = true;
}
function onPvpSaved(){
  if(!pvForm) return;
  pvKept = {mode: pvForm.mode, ranked: pvForm.ranked, date: pvForm.date};
  closePicker();
  if(pvSavingNext){ showBanner('Match salvo. Pode lançar o próximo.'); openPvpModal(null); }
  else { showBanner('Match salvo.'); closeModal(); pvForm = null; }
}
function onPvpError(){
  const s = $('pvSave'); if(s) s.disabled = false;
  const n = $('pvSaveNext'); if(n) n.disabled = false;
  pvErr('Não foi possível salvar. Confira os campos e tente de novo.');
}
