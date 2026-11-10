/* ================= Aba Personagens: galeria, desempenho e quem joga com cada um ================= */
let chSearch = '';
let chMember = '';      // filtro por membro da aliança ('' = todos)

function charFans(){
  const m = new Map();
  roster.forEach(p => (p.favs || []).forEach(id => { if(!m.has(id)) m.set(id, []); m.get(id).push(p); }));
  return m;
}
function charTilesHTML(){
  const q = normText(chSearch).trim();
  const fans = charFans();
  const list = CHARS.map(c => ({id: c[0], name: c[1]}))
    .filter(c => !q || q.split(/\s+/).every(w => normText(c.name).includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {sensitivity: 'base'}));
  if(!list.length) return '<div class="empty-box">Nenhum personagem com esse nome.</div>';
  return `<div class="ch-grid">${list.map(c => {
    const n = (fans.get(c.id) || []).length;
    return `<button type="button" class="ch-tile" data-id="${c.id}" title="${esc(c.name)}">${faceHTML(c.id, 60)}<span>${esc(c.name)}</span>${n ? `<i class="ch-star" title="${n} membro(s) com este personagem entre os preferidos">&#9733; ${n}</i>` : ''}</button>`;
  }).join('')}</div>`;
}

// personagens que um membro joga: os usados nos GVGs (com taxa de vitória) + os preferidos ainda sem registro
function memberTableHTML(){
  const p = roster.find(x => x.nick.toLowerCase() === chMember.toLowerCase());
  if(!p) return charTilesHTML();
  if(!battlesLoaded) return '<div class="small-dim">Carregando batalhas…</div>';
  const q = normText(chSearch).trim();
  const stats = memberCharStats(p.nick), favs = p.favs || [];
  const ids = [...new Set([...stats.keys(), ...favs])].filter(id => !q || q.split(/\s+/).every(w => normText(charName(id)).includes(w)));
  const rows = ids.map(id => ({id, ...(stats.get(id) || {n: 0, w: 0, l: 0})})).sort((a, b) => b.n - a.n || (favs.includes(b.id) - favs.includes(a.id)) || charName(a.id).localeCompare(charName(b.id), 'pt-BR'));
  const tot = [...stats.values()].reduce((t, e) => ({n: t.n + e.n, w: t.w + e.w, l: t.l + e.l}), {n: 0, w: 0, l: 0});
  const trs = rows.map(r => `<tr class="clickable" data-id="${r.id}">
      <td><div class="name">${faceHTML(r.id, 32)}<span>${esc(charName(r.id))}</span>${favs.includes(r.id) ? '<i class="ch-star" title="Personagem preferido">&#9733;</i>' : ''}</div></td>
      ${r.n ? `<td class="num">${r.n}</td><td>${wlBar(r.w, r.l)}</td><td class="num">${r.w}-${r.l}</td><td class="num">${pctCell(r.w, r.n)}</td>` : '<td class="num" colspan="4"><span class="small-dim">sem GVG lançado</span></td>'}</tr>`).join('');
  return `<div class="an-card full"><h3>Personagens de ${esc(p.nick)}</h3>
    <p class="sub">${tot.n ? `${tot.n} uso${tot.n > 1 ? 's' : ''} nos GVGs lançados · ${tot.w}-${tot.l} · ${Math.round(tot.w / tot.n * 100)}% de vitórias.` : 'Ainda não há GVG lançado com o nick dele.'} Só contam batalhas da We Sink em que o nick foi informado. A estrela marca os preferidos.</p>
    ${rows.length ? `<table class="tbl"><thead><tr><th>Personagem</th><th class="num">Usos</th><th></th><th class="num">V-D</th><th class="num">%</th></tr></thead><tbody>${trs}</tbody></table><p class="note-low">Percentual apagado = menos de ${LOW_N} usos (amostra pequena).</p>`
      : '<div class="empty-box">Nenhum personagem para mostrar.</div>'}</div>`;
}
const chListHTML = () => chMember ? memberTableHTML() : charTilesHTML();

function enterCharacters(){
  if(!battlesLoaded) send({t: 'get_battles'}, true);
  renderCharacters();
}
function renderCharacters(){
  if(uiMode !== 'app' || !tabPersonagens) return;
  const focus = document.activeElement && document.activeElement.id === 'chSearch';
  tabPersonagens.innerHTML = `<div class="narrow-wide" style="max-width:1040px">
    <div class="al-hero" style="padding:14px 16px;margin-bottom:12px">
      <div class="small-dim" style="color:var(--text);margin-bottom:4px"><b>${CHARS.length}</b> personagens</div>
      <div class="small-dim">Clique num personagem para ver o desempenho dele nas batalhas lançadas e quem da aliança joga com ele. Aqui também vão entrar winrate, counters e notas de cada personagem. A estrela mostra quantos membros o colocaram entre os preferidos.</div>
    </div>
    <div class="filters" style="margin-bottom:12px">
      <input class="nick-input" id="chSearch" type="search" placeholder="Buscar personagem…" value="${esc(chSearch)}" style="max-width:280px;padding:8px 10px" autocomplete="off">
      <select id="chMember" class="${chMember ? 'active' : ''}"><option value="">Todos os membros</option>${[...roster].sort(byNick).map(p => `<option value="${esc(p.nick)}"${p.nick === chMember ? ' selected' : ''}>${esc(p.nick)}</option>`).join('')}</select>
    </div>
    <div id="chList">${chListHTML()}</div>
  </div>`;
  if(focus){ const el = $('chSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

function charStatRow(label, sub, entries, id){
  const mine = entries.filter(e => e.chars.includes(id));
  const t = tallyE(mine);
  if(!t.n) return `<div class="cs-row"><div><b>${label}</b><small>${sub}</small></div><span class="small-dim">sem registros ainda</span></div>`;
  return `<div class="cs-row"><div><b>${label}</b><small>${sub}</small></div>
    <div class="cs-val"><span class="cs-n">${t.n} uso${t.n > 1 ? 's' : ''}</span>${wlBar(t.w, t.l)}<span class="cs-wl">${t.w}-${t.l}</span>${pctCell(t.w, t.n)}</div></div>`;
}

function openCharacter(id){
  const fans = (charFans().get(id) || []).sort(byNick);
  const stats = !battlesLoaded
    ? '<div class="small-dim">Carregando batalhas…</div>'
    : [charStatRow('Geral', 'todas as batalhas lançadas', entriesFor(battles, 'todos'), id),
       charStatRow('Com a We Sink', 'quando nós usamos', entriesFor(battles, 'nossos'), id),
       charStatRow('Contra a We Sink', '% = quanto NÓS vencemos quando o rival usou', entriesFor(battles, 'rivais'), id)].join('');
  openModal(`
    <div class="prof-top">
      <div>${faceHTML(id, 84)}</div>
      <div class="prof-who"><b style="font-size:20px">${esc(charName(id))}</b><span class="small-dim">${fans.length ? fans.length + ' membro(s) com ele entre os preferidos' : 'ninguém o marcou como preferido ainda'}</span></div>
    </div>
    <div class="pv-sec"><div class="pv-k">Desempenho</div>${stats}
      <p class="note-low">Percentual apagado = menos de ${LOW_N} usos (amostra pequena).</p></div>
    <div class="pv-sec"><div class="pv-k">Quem da aliança joga com ele</div>
      ${fans.length ? `<div class="cf-list">${fans.map(p => `<button type="button" class="cf" data-nick="${esc(p.nick)}">${avatarHTML(p.nick, 26)}<b>${esc(p.nick)}</b>${(p.primary || (p.roles || [])[0]) ? roleBadge(p.primary || p.roles[0], true) : ''}</button>`).join('')}</div>` : '<span class="small-dim">—</span>'}</div>
    <div class="pv-sec"><div class="pv-k">Counters e notas</div><div class="soon">Em breve: winrate detalhado, counters e notas deste personagem.</div></div>
    <div class="modal-actions"><button class="ghost-btn" id="chClose" type="button">Fechar</button></div>`);
  $('chClose').addEventListener('click', closeModal);
  $('modalBox').addEventListener('click', (e) => { const b = e.target.closest('.cf'); if(b) openMemberProfile(b.dataset.nick); });
}

tabPersonagens.addEventListener('input', (e) => {
  if(e.target.id !== 'chSearch') return;
  chSearch = e.target.value;
  const el = $('chList'); if(el) el.innerHTML = chListHTML();
});
tabPersonagens.addEventListener('change', (e) => {
  if(e.target.id !== 'chMember') return;
  chMember = e.target.value;
  renderCharacters();
});
tabPersonagens.addEventListener('click', (e) => {
  const t = e.target.closest('.ch-tile') || e.target.closest('tr[data-id]');
  if(t) openCharacter(t.dataset.id);
});
