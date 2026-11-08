/* ================= Aliança: membros, funções e cargos ================= */

const ROLES = [
  {id: 'tank',    label: 'Tank',       color: '#2FB8F5'},
  {id: 'melee',   label: 'DPS Melee',  color: '#FF8A3D'},
  {id: 'ranged',  label: 'DPS Ranged', color: '#FF5C7A'},
  {id: 'bruiser', label: 'Bruiser',    color: '#E8B339'},
  {id: 'support', label: 'Support',    color: '#35C48C'},
  {id: 'reserva', label: 'Reserva',    color: '#8A99A8'}
];
// ícones das funções (desenhados em traço, herdam a cor da função)
const ROLE_ICON_PATHS = {
  tank:    '<path d="M12 3l7.5 3v5.2c0 4.6-3.1 7.9-7.5 9.8-4.4-1.9-7.5-5.2-7.5-9.8V6z"/>',
  melee:   '<path d="M17.5 3H21v3.5L10.5 17 7 13.5z"/><path d="M5.5 14.5l4 4"/><path d="M4 20l2.5-2.5"/>',
  ranged:  '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  bruiser: '<path d="M13.5 3.5l7 7-3 3-7-7z"/><path d="M12 9l-7.5 7.5a1.6 1.6 0 0 0 2.3 2.3L14.3 11"/>',
  support: '<path d="M12 20.5s-7.5-4.6-7.5-10.3a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/>',
  reserva: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5c0-3.7 2.9-6.1 6.5-6.1s6.5 2.4 6.5 6.1"/><path d="M17.5 11h4.5"/>'
};
function roleIcon(id, size){
  const d = ROLE_ICON_PATHS[id];
  if(!d) return '';
  const s = size || 14;
  return `<svg class="ricon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r]));

const alFilter = {q: '', role: '', cargo: ''};
let alAddRoles = [];
let alAddCargo = '';

function roleBadge(id){
  const r = ROLE_BY_ID[id];
  return r ? `<span class="rbadge" style="--c:${r.color}">${roleIcon(id, 14)}${r.label}</span>` : '';
}
// selos de função de um nick (usado também na análise)
function roleBadges(nick){
  const p = roster.find(x => x.nick.toLowerCase() === String(nick).toLowerCase());
  return p && p.roles && p.roles.length ? `<span class="rbadges">${p.roles.map(roleBadge).join('')}</span>` : '';
}

function pushAlliance(newRoster, newCargos){
  roster = newRoster;
  cargos = newCargos;
  publicRoster = roster.map(p => p.nick);
  send({t: 'alliance_set', players: roster, cargos});
  renderAlliance();
}
const byNick = (a, b) => a.nick.localeCompare(b.nick, 'pt-BR', {sensitivity: 'base'});

function visibleMembers(){
  const q = normText(alFilter.q).trim();
  return roster.filter(p =>
    (!q || normText(p.nick).includes(q)) &&
    (!alFilter.role || (p.roles || []).includes(alFilter.role)) &&
    (!alFilter.cargo || (alFilter.cargo === '_none' ? !p.cargo : p.cargo === alFilter.cargo)));
}

function memberRow(p){
  const roles = p.roles || [];
  if(!isAdmin){
    return `<div class="mem"><b class="mem-nick">${esc(p.nick)}</b><span class="rbadges">${roles.map(roleBadge).join('') || '<span class="small-dim">sem função</span>'}</span></div>`;
  }
  return `<div class="mem edit">
    <b class="mem-nick">${esc(p.nick)}</b>
    <span class="rbadges">${ROLES.map(r => `<button type="button" class="rchip" data-act="role" data-nick="${esc(p.nick)}" data-role="${r.id}" data-on="${roles.includes(r.id)}" style="--c:${r.color}">${roleIcon(r.id, 13)}${r.label}</button>`).join('')}</span>
    <select class="mem-sel" data-act="cargo" data-nick="${esc(p.nick)}" aria-label="Cargo de ${esc(p.nick)}">
      <option value="">Sem cargo</option>${cargos.map(c => `<option value="${esc(c)}"${p.cargo === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
    </select>
    <button type="button" class="x" data-act="del" data-nick="${esc(p.nick)}" title="Remover da aliança">&#10005;</button>
  </div>`;
}

function allianceListHTML(){
  const list = visibleMembers();
  if(!roster.length){
    return `<div class="an-card"><div class="empty-box">Nenhum membro cadastrado ainda.${isAdmin ? '<br>Use o quadro acima para adicionar os nicks da We Sink.' : '<br>O admin cadastra os membros e as funções.'}</div></div>`;
  }
  if(!list.length) return '<div class="an-card"><div class="empty-box">Ninguém com esse filtro.</div></div>';
  const groups = cargos.map(c => ({name: c, items: list.filter(p => p.cargo === c)}));
  groups.push({name: 'Sem cargo', items: list.filter(p => !p.cargo || !cargos.includes(p.cargo))});
  return groups.filter(g => g.items.length).map(g => `
    <div class="an-card">
      <h3>${esc(g.name)} <span class="cnt">${g.items.length}</span></h3>
      <div class="mem-list">${g.items.sort(byNick).map(memberRow).join('')}</div>
    </div>`).join('');
}

function allianceSummaryHTML(){
  const reservas = roster.filter(p => (p.roles || []).includes('reserva')).length;
  const counts = ROLES.filter(r => r.id !== 'reserva').map(r => ({r, n: roster.filter(p => (p.roles || []).includes(r.id)).length}));
  return `<div class="al-hero">
    <img src="logo.webp?v=1" alt="Bandeira da We Sink" width="112" height="80">
    <div class="al-hero-txt">
      <h2>Aliança We Sink</h2>
      <p class="small-dim"><b style="color:var(--text)">${roster.length}</b> membro${roster.length === 1 ? '' : 's'} · ${roster.length - reservas} ativo${roster.length - reservas === 1 ? '' : 's'} · ${reservas} reserva${reservas === 1 ? '' : 's'}</p>
      <div class="rbadges">${counts.map(c => `<span class="rbadge" style="--c:${c.r.color}">${roleIcon(c.r.id, 14)}${c.r.label} · ${c.n}</span>`).join('')}</div>
    </div>
  </div>`;
}

function addCardHTML(){
  return `<div class="an-card">
    <h3>Adicionar membros</h3>
    <p class="sub">Escreva um nick (ou vários separados por vírgula ou linha), marque as funções e o cargo. Quem é reserva leva a marca "Reserva" além da função. Depois dá para mudar tudo direto na lista.</p>
    <div class="roster-add"><input class="nick-input" id="alNew" type="text" maxlength="600" placeholder="nick (ou vários separados por vírgula)" autocomplete="off">
      <select class="mem-sel" id="alNewCargo" aria-label="Cargo"><option value="">Sem cargo</option>${cargos.map(c => `<option value="${esc(c)}"${alAddCargo === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <button class="primary-btn" id="alAdd" type="button">Adicionar</button></div>
    <div class="rbadges" id="alNewRoles">${ROLES.map(r => `<button type="button" class="rchip" data-act="newrole" data-role="${r.id}" data-on="${alAddRoles.includes(r.id)}" style="--c:${r.color}">${roleIcon(r.id, 13)}${r.label}</button>`).join('')}</div>
  </div>`;
}

function cargosCardHTML(){
  return `<div class="an-card">
    <h3>Cargos da aliança</h3>
    <p class="sub">Crie, renomeie, mude a ordem ou apague cargos. Apagar um cargo deixa seus membros "sem cargo". A ordem aqui é a ordem da lista de membros.</p>
    <div class="cargo-list">${cargos.map((c, i) => `
      <div class="cargo-row">
        <input class="nick-input" type="text" maxlength="24" value="${esc(c)}" data-act="rename" data-old="${esc(c)}" aria-label="Nome do cargo">
        <span class="small-dim cargo-n">${roster.filter(p => p.cargo === c).length}</span>
        <button type="button" class="mini-btn" data-act="up" data-i="${i}"${i === 0 ? ' disabled' : ''} aria-label="Subir">&#9650;</button>
        <button type="button" class="mini-btn" data-act="down" data-i="${i}"${i === cargos.length - 1 ? ' disabled' : ''} aria-label="Descer">&#9660;</button>
        <button type="button" class="x" data-act="delcargo" data-i="${i}" title="Apagar cargo">&#10005;</button>
      </div>`).join('') || '<div class="small-dim">Nenhum cargo criado.</div>'}</div>
    <div class="roster-add" style="margin-top:12px"><input class="nick-input" id="alNewCargoName" type="text" maxlength="24" placeholder="novo cargo (ex.: Estrategista)" autocomplete="off"><button class="primary-btn" id="alAddCargo" type="button">Criar cargo</button></div>
  </div>`;
}

function filtersHTML(){
  const o = (v, label, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(label)}</option>`;
  return `<div class="filters" style="margin-bottom:14px">
    <input class="nick-input" id="alSearch" type="search" placeholder="Buscar nick…" value="${esc(alFilter.q)}" style="max-width:220px;padding:8px 10px" autocomplete="off">
    <select data-act="frole" class="${alFilter.role ? 'active' : ''}">${o('', 'Todas as funções', alFilter.role)}${ROLES.map(r => o(r.id, r.label, alFilter.role)).join('')}</select>
    <select data-act="fcargo" class="${alFilter.cargo ? 'active' : ''}">${o('', 'Todos os cargos', alFilter.cargo)}${cargos.map(c => o(c, c, alFilter.cargo)).join('')}${o('_none', 'Sem cargo', alFilter.cargo)}</select>
  </div>`;
}

function renderAlliance(){
  if(uiMode !== 'app' || !tabAlianca) return;
  const focusId = document.activeElement && tabAlianca.contains(document.activeElement) ? document.activeElement.id : '';
  tabAlianca.innerHTML = `<div class="narrow-wide">
    ${allianceSummaryHTML()}
    ${isAdmin ? addCardHTML() : ''}
    ${filtersHTML()}
    <div id="alList">${allianceListHTML()}</div>
    ${isAdmin ? cargosCardHTML() : ''}
  </div>`;
  if(focusId === 'alSearch'){ const el = $('alSearch'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
}
function renderAllianceList(){
  const el = $('alList');
  if(el) el.innerHTML = allianceListHTML();
}

function addMembers(){
  const input = $('alNew');
  const names = input.value.split(/[,;\n]/).map(s => s.replace(/[<>]/g, '').trim().slice(0, 20)).filter(s => s.length >= 2);
  if(!names.length) return;
  const cur = [...roster];
  names.forEach(n => {
    if(!cur.some(p => p.nick.toLowerCase() === n.toLowerCase())) cur.push({nick: n, roles: [...alAddRoles], cargo: alAddCargo});
  });
  alAddRoles = [];
  pushAlliance(cur, cargos);
  const again = $('alNew'); if(again) again.focus();
}

tabAlianca.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], #alAdd, #alAddCargo');
  if(!el) return;
  if(el.id === 'alAdd'){ if(isAdmin) addMembers(); return; }
  if(el.id === 'alAddCargo'){
    if(!isAdmin) return;
    const name = $('alNewCargoName').value.replace(/[<>]/g, '').trim().slice(0, 24);
    if(!name || cargos.some(c => c.toLowerCase() === name.toLowerCase())) return;
    pushAlliance(roster, [...cargos, name]);
    return;
  }
  if(!isAdmin) return;
  const act = el.dataset.act, nick = el.dataset.nick;
  if(act === 'newrole'){
    const r = el.dataset.role;
    alAddRoles = alAddRoles.includes(r) ? alAddRoles.filter(x => x !== r) : [...alAddRoles, r];
    el.dataset.on = String(alAddRoles.includes(r));
  } else if(act === 'role'){
    const r = el.dataset.role;
    pushAlliance(roster.map(p => p.nick !== nick ? p : {...p, roles: ROLES.map(x => x.id).filter(id => id === r ? !(p.roles || []).includes(id) : (p.roles || []).includes(id))}), cargos);
  } else if(act === 'del'){
    if(confirm(`Remover ${nick} da aliança? (As batalhas já lançadas continuam com o nome dele.)`)) pushAlliance(roster.filter(p => p.nick !== nick), cargos);
  } else if(act === 'up' || act === 'down'){
    const i = Number(el.dataset.i), j = act === 'up' ? i - 1 : i + 1;
    if(j < 0 || j >= cargos.length) return;
    const c = [...cargos]; [c[i], c[j]] = [c[j], c[i]];
    pushAlliance(roster, c);
  } else if(act === 'delcargo'){
    const c = cargos[Number(el.dataset.i)];
    const n = roster.filter(p => p.cargo === c).length;
    if(confirm(n ? `Apagar o cargo "${c}"? ${n} membro(s) ficarão sem cargo.` : `Apagar o cargo "${c}"?`)){
      pushAlliance(roster.map(p => p.cargo === c ? {...p, cargo: ''} : p), cargos.filter(x => x !== c));
    }
  }
});

tabAlianca.addEventListener('change', (e) => {
  const el = e.target;
  const act = el.dataset && el.dataset.act;
  if(el.id === 'alNewCargo'){ alAddCargo = el.value; return; }
  if(act === 'frole'){ alFilter.role = el.value; renderAlliance(); return; }
  if(act === 'fcargo'){ alFilter.cargo = el.value; renderAlliance(); return; }
  if(!isAdmin) return;
  if(act === 'cargo'){
    pushAlliance(roster.map(p => p.nick === el.dataset.nick ? {...p, cargo: el.value} : p), cargos);
  } else if(act === 'rename'){
    const old = el.dataset.old, name = el.value.replace(/[<>]/g, '').trim().slice(0, 24);
    if(!name || name === old){ el.value = old; return; }
    if(cargos.some(c => c !== old && c.toLowerCase() === name.toLowerCase())){ showBanner('Já existe um cargo com esse nome.', true); el.value = old; return; }
    pushAlliance(roster.map(p => p.cargo === old ? {...p, cargo: name} : p), cargos.map(c => c === old ? name : c));
  }
});

tabAlianca.addEventListener('input', (e) => {
  if(e.target.id === 'alSearch'){ alFilter.q = e.target.value; renderAllianceList(); }
});
tabAlianca.addEventListener('keydown', (e) => {
  if(e.key !== 'Enter') return;
  if(e.target.id === 'alNew' && isAdmin) addMembers();
  if(e.target.id === 'alNewCargoName' && isAdmin) $('alAddCargo').click();
});
