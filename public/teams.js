/* ================= Equipes: 4 equipes, 6 titulares + 2 reservas, mapa de cada uma ================= */

// Regras das vagas dos titulares: 1 Tank, 2 Support, 3 DPS Ranged, 4 a 6 DPS Melee ou Bruiser
const SLOT_RULES = [
  {roles: ['tank'],               label: 'Tank'},
  {roles: ['support'],            label: 'Support'},
  {roles: ['ranged'],             label: 'DPS Ranged'},
  {roles: ['melee', 'bruiser'],   label: 'DPS Melee ou Bruiser'},
  {roles: ['melee', 'bruiser'],   label: 'DPS Melee ou Bruiser'},
  {roles: ['melee', 'bruiser'],   label: 'DPS Melee ou Bruiser'}
];
const N_SLOTS = SLOT_RULES.length, N_RESERVES = 2;

function blankTeamPlan(){
  return {map: '', slots: Array(N_SLOTS).fill(''), reserves: Array(N_RESERVES).fill(''), leader: '', confirmed: false};
}
function teamPlan(tid){
  const t = plan && plan.teams && plan.teams[tid];
  return t ? {...blankTeamPlan(), ...t, slots: [...t.slots], reserves: [...t.reserves]} : blankTeamPlan();
}
const memberByNick = (nick) => roster.find(p => p.nick.toLowerCase() === String(nick || '').toLowerCase());
const memberRoles = (nick) => (memberByNick(nick) || {roles: []}).roles || [];
const fitsSlot = (nick, i) => memberRoles(nick).some(r => SLOT_RULES[i].roles.includes(r));

// ícone do cargo na vaga: a função que combina com a vaga, senão a primeira que o membro tem
function slotRoleId(nick, i){
  const rs = memberRoles(nick);
  return rs.find(r => SLOT_RULES[i].roles.includes(r)) || rs.find(r => r !== 'reserva') || rs[0] || '';
}

const isOnline = (nick) => onlineNicks.has(String(nick || '').toLowerCase());
// atualiza as bolinhas na tela sem refazer as equipes (não atrapalha quem está arrastando)
function updateOnlineDots(){
  if(typeof tabEquipes === 'undefined' || !tabEquipes) return;
  tabEquipes.querySelectorAll('.tm-dot').forEach(d => {
    const on = onlineNicks.has(d.dataset.nick);
    d.classList.toggle('on', on);
    d.title = on ? 'online' : 'offline';
  });
}

function setPlan(p){
  plan = p;
  if(uiMode !== 'app') return;
  if(currentTab === 'equipes') renderTeams();
  renderMyTeamCard();
  if(!selectionScreen.classList.contains('hidden') && myTeam) renderMapSection();
}

/* ---------- o que vale para a pessoa logada ---------- */

// a confirmação vale só na semana do GVG: zera na segunda-feira 00:00 (Brasília)
function gvgWeekStart(now){
  const off = 3 * 36e5, d = new Date(now - off), dow = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) + off;
}
function teamConfirmed(tp){ return !!(tp && tp.confirmed && tp.confirmedAt >= gvgWeekStart(Date.now())); }
// só equipes confirmadas valem para os membros
function myPlacement(){
  if(!plan || !nickname) return null;
  const n = nickname.toLowerCase();
  for(const t of TEAMS){
    const tp = plan.teams && plan.teams[t.id];
    if(!teamConfirmed(tp)) continue;
    const i = tp.slots.findIndex(x => x && x.toLowerCase() === n);
    if(i >= 0) return {team: t.id, kind: 'slot', idx: i};
    const j = tp.reserves.findIndex(x => x && x.toLowerCase() === n);
    if(j >= 0) return {team: t.id, kind: 'reserve', idx: j};
  }
  return null;
}
function plannedMapFor(tid){
  const tp = plan && plan.teams && plan.teams[tid];
  return teamConfirmed(tp) && tp.map ? tp.map : null;
}
// ao entrar, já deixa a pessoa na equipe dela
function autoPickMyTeam(){
  const pl = myPlacement();
  if(pl && myTeam !== pl.team) selectTeam(pl.team);
}

function renderMyTeamCard(){
  const box = $('myTeamCard');
  if(!box) return;
  const pl = myPlacement();
  if(!pl){ box.innerHTML = ''; return; }
  const team = TEAMS.find(t => t.id === pl.team);
  const tp = teamPlan(pl.team);
  const pos = pl.kind === 'slot' ? `${pl.idx + 1}º · ${SLOT_RULES[pl.idx].label}` : 'Reserva';
  const mapId = tp.map;
  const live = state.maps[pl.team];
  const needsMap = mapId && live !== mapId;
  box.innerHTML = `<div class="myteam" style="--tc:${team.color}">
    <div class="myteam-txt">
      <div class="myteam-k">Sua escala</div>
      <div class="myteam-v"><b>${team.name}</b> · ${esc(pos)}</div>
      <div class="small-dim">${mapId ? 'Mapa: <b style="color:var(--text)">' + esc(mapName(mapId)) + '</b>' : 'Mapa ainda não definido'}</div>
    </div>
    ${needsMap ? `<button class="mini-btn on" id="myTeamMapBtn" type="button">Usar este mapa</button>` : ''}
  </div>`;
  const b = $('myTeamMapBtn');
  if(b) b.addEventListener('click', () => {
    if(myTeam !== pl.team) selectTeam(pl.team);
    selectMap(mapId);
  });
}

/* ---------- aba Equipes ---------- */

function coverage(tp){
  const miss = {};
  SLOT_RULES.forEach((r, i) => {
    const n = tp.slots[i];
    if(!n || !fitsSlot(n, i)) miss[r.label] = (miss[r.label] || 0) + 1;
  });
  return Object.entries(miss).map(([k, v]) => v > 1 ? `${k} (${v})` : k);
}

function rowHTML(tid, kind, i, nick, tp){
  const key = `data-t="${tid}" data-k="${kind}" data-i="${i}"`;
  const isSlot = kind === 's';
  const rule = isSlot ? SLOT_RULES[i] : null;
  if(!nick){
    const label = isSlot ? rule.label : `Slot ${i + 1}`;
    const icon = isSlot ? roleIcon(rule.roles[0], 16) : '';
    return `<div class="tm-row empty" ${key}${can('equipes') ? ' tabindex="0" role="button"' : ''}>
      <span class="tm-handle"></span><span class="tm-plus">+</span><span class="tm-nick">${esc(label)}</span>${icon ? `<span class="tm-chip dim">${icon}</span>` : ''}</div>`;
  }
  const rid = isSlot ? slotRoleId(nick, i) : (memberRoles(nick).includes('reserva') ? 'reserva' : slotRoleId(nick, 0));
  const r = ROLE_BY_ID[rid];
  const bad = isSlot && !fitsSlot(nick, i);
  const lead = tp.leader && tp.leader.toLowerCase() === nick.toLowerCase();
  const me = nickname && nick.toLowerCase() === nickname.toLowerCase();
  const chip = r ? `<span class="tm-chip${bad ? ' bad' : ''}" style="--c:${r.color}" title="${esc(r.label)}${bad ? ' (não combina com a vaga)' : ''}">${roleIcon(rid, 16)}</span>` : '<span class="tm-chip dim" title="Sem função cadastrada">?</span>';
  return `<div class="tm-row${lead ? ' lead' : ''}${me ? ' me' : ''}" ${key}${can('equipes') ? ' draggable="true" tabindex="0" role="button"' : ''}>
    <span class="tm-handle">${can('equipes') ? '&#8942;&#8942;' : ''}</span>
    ${can('equipes')
      ? `<button type="button" class="tm-crown${lead ? ' on' : ''}" data-act="leader" ${key} title="${lead ? 'Tirar capitão' : 'Marcar como capitão'}">&#9819;</button>`
      : (lead ? '<span class="tm-crown on static" title="Capitão">&#9819;</span>' : '')}
    <span class="tm-dot${isOnline(nick) ? ' on' : ''}" data-nick="${esc(nick.toLowerCase())}" title="${isOnline(nick) ? 'online' : 'offline'}"></span>${avatarHTML(nick, 24)}<span class="tm-nick">${esc(nick)}${me ? ' <small>você</small>' : ''}</span>${chip}</div>`;
}

function teamCardHTML(t){
  const tp = teamPlan(t.id);
  const miss = coverage(tp);
  const filled = tp.slots.filter(Boolean).length;
  const mapPill = can('equipes')
    ? `<select class="tm-map" data-act="map" data-t="${t.id}" aria-label="Mapa da ${t.name}"><option value="">Mapa a definir</option>${MAPS.map(m => `<option value="${m.id}"${tp.map === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`
    : `<div class="tm-map static">${tp.map ? esc(mapName(tp.map)) : 'Mapa a definir'}</div>`;
  const isConf = teamConfirmed(tp);
  const status = isConf ? '<span class="tm-status ok">Confirmada</span>' : '<span class="tm-status">Em montagem</span>';
  const warn = miss.length
    ? `<div class="tm-warn">&#9888; Falta cobertura: ${esc(miss.join(', '))}</div>`
    : '<div class="tm-warn ok">&#10003; Equipe completa: todas as funções cobertas</div>';
  return `<section class="tm-card${isConf ? ' confirmed' : ''}" style="--tc:${t.color}" data-team="${t.id}">
    <header class="tm-head"><h3>${t.name.toUpperCase()}</h3>${status}</header>
    ${mapPill}
    <div class="tm-list">${tp.slots.map((n, i) => rowHTML(t.id, 's', i, n, tp)).join('')}</div>
    <div class="tm-sep"><span>Reservas</span></div>
    <div class="tm-list res">${tp.reserves.map((n, i) => rowHTML(t.id, 'r', i, n, tp)).join('')}</div>
    ${warn}
    ${can('equipes') ? `<div class="tm-actions">
      ${isConf ? '<button class="primary-btn done" type="button" disabled>&#10003; Equipe confirmada</button>' : `<button class="primary-btn" type="button" data-act="confirm" data-t="${t.id}"${filled ? '' : ' disabled'}>&#10003; Confirmar equipe</button>`}
      <button class="ghost-btn" type="button" data-act="clear" data-t="${t.id}" title="Esvaziar esta equipe">Limpar</button>
    </div>` : ''}
  </section>`;
}

function renderTeams(){
  if(uiMode !== 'app' || !tabEquipes) return;
  const pl = myPlacement();
  const youBox = pl ? `<div class="al-hero" style="padding:12px 16px"><div class="small-dim" style="color:var(--text)">Você está na <b>${TEAMS.find(t => t.id === pl.team).name}</b> como <b>${pl.kind === 'slot' ? SLOT_RULES[pl.idx].label : 'Reserva'}</b>${plannedMapFor(pl.team) ? ' · mapa <b>' + esc(mapName(plannedMapFor(pl.team))) + '</b>' : ''}.</div></div>` : '';
  tabEquipes.innerHTML = `${youBox}
    <p class="small-dim tm-legend">Vagas: <b>1</b> Tank · <b>2</b> Support · <b>3</b> DPS Ranged · <b>4 a 6</b> DPS Melee ou Bruiser · mais 2 reservas.
      ${can('equipes') ? 'Clique numa vaga para escolher o membro da aliança, arraste para trocar de lugar e clique na coroa para marcar o capitão. A equipe só aparece como confirmada (e só vale para o mapa e a escala de cada pessoa) depois de "Confirmar equipe"; qualquer edição volta ela para "Em montagem".' : 'Só equipes confirmadas pela liderança aparecem na sua escala.'}</p>
    <div class="tm-grid">${TEAMS.map(teamCardHTML).join('')}</div>`;
}

/* ---------- edição (admin) ---------- */

function commitTeam(tid, tp, confirmed){
  tp.confirmed = !!confirmed; tp.confirmedAt = confirmed ? Date.now() : 0;
  if(!plan) plan = {teams: {}};
  plan.teams[tid] = tp;
  send({t: 'plan_set', team: tid, plan: tp});
  renderTeams();
  renderMyTeamCard();
}
// tira o nick de qualquer outra vaga (o servidor faz o mesmo)
function unplace(nick, keepTid){
  if(!nick || !plan) return;
  const low = nick.toLowerCase();
  TEAMS.forEach(t => {
    if(t.id === keepTid) return;
    const tp = teamPlan(t.id);
    let hit = false;
    const strip = (arr) => arr.map(x => x && x.toLowerCase() === low ? (hit = true, '') : x);
    tp.slots = strip(tp.slots); tp.reserves = strip(tp.reserves);
    if(hit){ if(tp.leader && tp.leader.toLowerCase() === low) tp.leader = ''; tp.confirmed = false; plan.teams[t.id] = tp; }
  });
}
function setVacancy(tid, kind, i, nick){
  const tp = teamPlan(tid);
  const arr = kind === 's' ? tp.slots : tp.reserves;
  // se o nick já estava nesta equipe, esvazia a vaga antiga
  [tp.slots, tp.reserves].forEach(a => a.forEach((x, k) => { if(nick && x && x.toLowerCase() === nick.toLowerCase() && !(a === arr && k === i)) a[k] = ''; }));
  const prev = arr[i];
  arr[i] = nick || '';
  if(prev && tp.leader && tp.leader.toLowerCase() === prev.toLowerCase() && !(nick && nick.toLowerCase() === prev.toLowerCase())){
    if(![...tp.slots, ...tp.reserves].some(x => x && x.toLowerCase() === prev.toLowerCase())) tp.leader = '';
  }
  unplace(nick, tid);
  commitTeam(tid, tp, false);
}

function openMemberPicker(tid, kind, i){
  const team = TEAMS.find(t => t.id === tid);
  const tp = teamPlan(tid);
  const cur = (kind === 's' ? tp.slots : tp.reserves)[i];
  const where = (nick) => {
    for(const t of TEAMS){
      const x = teamPlan(t.id);
      const s = x.slots.findIndex(n => n && n.toLowerCase() === nick.toLowerCase());
      if(s >= 0) return {tid: t.id, label: `${t.name} · ${SLOT_RULES[s].label}`};
      const r = x.reserves.findIndex(n => n && n.toLowerCase() === nick.toLowerCase());
      if(r >= 0) return {tid: t.id, label: `${t.name} · Reserva`};
    }
    return null;
  };
  const title = kind === 's' ? `${team.name} · vaga ${i + 1} (${SLOT_RULES[i].label})` : `${team.name} · reserva ${i + 1}`;
  const rank = (p) => {
    const w = where(p.nick);
    const fit = kind === 's' ? (fitsSlot(p.nick, i) ? 0 : 2) : ((p.roles || []).includes('reserva') ? 0 : 1);
    return fit * 2 + (w ? 1 : 0);
  };
  const list = [...roster].sort((a, b) => rank(a) - rank(b) || a.nick.localeCompare(b.nick, 'pt-BR', {sensitivity: 'base'}));
  const itemHTML = (p) => {
    const w = where(p.nick);
    const fit = kind === 's' ? fitsSlot(p.nick, i) : true;
    const note = p.nick === cur ? 'nesta vaga' : w ? (w.tid === tid ? 'já na equipe: ' + w.label : 'mover de ' + w.label) : '';
    return `<button type="button" class="pick-item${fit ? '' : ' off'}" data-nick="${esc(p.nick)}">
      <b>${esc(p.nick)}</b><span class="rbadges">${badgesOf(p)}</span>${note ? `<span class="small-dim pick-note">${esc(note)}</span>` : ''}</button>`;
  };
  openModal(`
    <h3>${esc(title)}</h3>
    <p class="small-dim">${kind === 's' ? 'Quem tem a função da vaga aparece primeiro. Dá para escolher outro membro, mas a equipe fica com aviso de cobertura.' : 'Escolha quem fica de reserva nesta equipe.'}</p>
    <input class="nick-input" id="pickSearch" type="search" placeholder="Buscar nick…" autocomplete="off" style="margin:10px 0">
    <div class="pick-list" id="pickList">${list.map(itemHTML).join('') || '<div class="empty-box">Cadastre membros na aba Aliança primeiro.</div>'}</div>
    <div class="modal-actions">
      ${cur ? '<button class="ghost-btn" id="pickRemove" type="button">Esvaziar vaga</button>' : ''}
      <button class="ghost-btn" id="pickCancel" type="button">Cancelar</button>
    </div>`);
  const box = $('modalBox');
  $('pickSearch').addEventListener('input', (e) => {
    const q = normText(e.target.value).trim();
    box.querySelectorAll('.pick-item').forEach(b => { b.hidden = !!q && !normText(b.dataset.nick).includes(q); });
  });
  box.addEventListener('click', (e) => {
    const it = e.target.closest('.pick-item');
    if(it){ closeModal(); setVacancy(tid, kind, i, it.dataset.nick); return; }
    const id = e.target.closest('button') && e.target.closest('button').id;
    if(id === 'pickRemove'){ closeModal(); setVacancy(tid, kind, i, ''); }
    if(id === 'pickCancel') closeModal();
  });
  const s = $('pickSearch'); try{ s.focus(); }catch(e){}
}

tabEquipes.addEventListener('click', (e) => {
  if(!can('equipes')) return;
  const act = e.target.closest('[data-act]');
  if(act && act.dataset.act === 'leader'){
    e.stopPropagation();
    const tp = teamPlan(act.dataset.t);
    const nick = (act.dataset.k === 's' ? tp.slots : tp.reserves)[Number(act.dataset.i)];
    tp.leader = tp.leader && tp.leader.toLowerCase() === String(nick).toLowerCase() ? '' : nick;
    commitTeam(act.dataset.t, tp, false);
    return;
  }
  if(act && act.dataset.act === 'confirm'){
    const tp = teamPlan(act.dataset.t);
    commitTeam(act.dataset.t, tp, true);
    showBanner(`${TEAMS.find(t => t.id === act.dataset.t).name} confirmada.`);
    return;
  }
  if(act && act.dataset.act === 'clear'){
    const t = TEAMS.find(x => x.id === act.dataset.t);
    if(confirm(`Esvaziar a ${t.name}? (mapa e membros)`)) commitTeam(t.id, blankTeamPlan(), false);
    return;
  }
  if(act && act.dataset.act === 'map') return;
  const row = e.target.closest('.tm-row');
  if(row) openMemberPicker(row.dataset.t, row.dataset.k, Number(row.dataset.i));
});
tabEquipes.addEventListener('keydown', (e) => {
  if(!can('equipes') || (e.key !== 'Enter' && e.key !== ' ')) return;
  const row = e.target.closest && e.target.closest('.tm-row');
  if(row && e.target === row){ e.preventDefault(); openMemberPicker(row.dataset.t, row.dataset.k, Number(row.dataset.i)); }
});
tabEquipes.addEventListener('change', (e) => {
  if(!can('equipes')) return;
  const el = e.target;
  if(el.dataset && el.dataset.act === 'map'){
    const tp = teamPlan(el.dataset.t);
    tp.map = el.value;
    commitTeam(el.dataset.t, tp, false);
  }
});

/* arrastar e soltar: troca duas vagas (da mesma equipe ou de equipes diferentes) */
let dragFrom = null;
tabEquipes.addEventListener('dragstart', (e) => {
  const row = e.target.closest && e.target.closest('.tm-row');
  if(!can('equipes') || !row || row.classList.contains('empty')){ e.preventDefault(); return; }
  dragFrom = {t: row.dataset.t, k: row.dataset.k, i: Number(row.dataset.i)};
  e.dataTransfer.effectAllowed = 'move';
  try{ e.dataTransfer.setData('text/plain', 'vaga'); }catch(err){}
  row.classList.add('dragging');
});
tabEquipes.addEventListener('dragend', (e) => {
  dragFrom = null;
  tabEquipes.querySelectorAll('.dragging,.over').forEach(x => x.classList.remove('dragging', 'over'));
});
tabEquipes.addEventListener('dragover', (e) => {
  const row = e.target.closest && e.target.closest('.tm-row');
  if(!can('equipes') || !dragFrom || !row) return;
  e.preventDefault();
  tabEquipes.querySelectorAll('.over').forEach(x => { if(x !== row) x.classList.remove('over'); });
  row.classList.add('over');
});
tabEquipes.addEventListener('drop', (e) => {
  const row = e.target.closest && e.target.closest('.tm-row');
  if(!can('equipes') || !dragFrom || !row) return;
  e.preventDefault();
  const to = {t: row.dataset.t, k: row.dataset.k, i: Number(row.dataset.i)};
  const from = dragFrom;
  dragFrom = null;
  if(from.t === to.t && from.k === to.k && from.i === to.i){ renderTeams(); return; }
  const A = teamPlan(from.t), B = from.t === to.t ? A : teamPlan(to.t);
  const arrA = from.k === 's' ? A.slots : A.reserves, arrB = to.k === 's' ? B.slots : B.reserves;
  const x = arrA[from.i], y = arrB[to.i];
  arrA[from.i] = y;
  arrB[to.i] = x;
  // capitão acompanha o nick só se ele continuar na mesma equipe
  [A, B].forEach(tp => { if(tp.leader && ![...tp.slots, ...tp.reserves].some(n => n && n.toLowerCase() === tp.leader.toLowerCase())) tp.leader = ''; });
  if(!plan) plan = {teams: {}};
  if(A === B){ commitTeam(from.t, A, false); return; }
  // duas equipes: primeiro uma, depois a outra (o servidor tira o nick da equipe antiga)
  A.confirmed = false; B.confirmed = false;
  plan.teams[from.t] = A; plan.teams[to.t] = B;
  send({t: 'plan_set', team: from.t, plan: A});
  send({t: 'plan_set', team: to.t, plan: B});
  renderTeams();
  renderMyTeamCard();
});
