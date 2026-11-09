/* ================= Usuários e Permissões (só admin) ================= */
// Cada membro da aliança é uma conta. Todos veem todas as abas; aqui o admin escolhe o que cada um pode FAZER.
const PERM_DEFS = [
  {id: 'cura',     label: 'Usar o Controle de Cura',  hint: 'marcar pontos de cura, mortes e personagens, escolher o mapa na ferramenta'},
  {id: 'equipes',  label: 'Gerenciar Equipes',        hint: 'montar equipes, trocar o mapa de cada uma, definir capitão e confirmar'},
  {id: 'alianca',  label: 'Gerenciar Aliança',        hint: 'adicionar e remover membros, mudar funções e cargos'},
  {id: 'batalhas', label: 'Lançar batalhas',          hint: 'criar, editar e excluir batalhas na Análise'}
];
const PERM_PRESETS = [
  {id: 'lider',    label: 'Líder',    perms: ['cura', 'equipes', 'alianca', 'batalhas']},
  {id: 'oficial',  label: 'Oficial',  perms: ['cura', 'equipes', 'batalhas']},
  {id: 'oldsinker', label: 'Oldsinker', perms: ['cura']}
];
let users = [];
let usFilter = '';

function setUsers(list){
  users = list;
  if(uiMode === 'app' && currentTab === 'usuarios') renderUsers();
}

const samePerms = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const presetOf = (u) => PERM_PRESETS.find(p => samePerms(p.perms, u.perms));

function userCardHTML(u){
  const pre = presetOf(u);
  return `<div class="us-card" data-nick="${esc(u.nick)}">
    <div class="us-head">
      <div class="us-who-wrap">${avatarHTML(u.nick, 34)}<div class="us-who"><b>${esc(u.nick)}</b>${u.cargo ? `<span class="small-dim">${esc(u.cargo)}</span>` : ''}</div></div>
      <span class="us-pw ${u.hasPassword ? 'ok' : ''}">${u.hasPassword ? 'Senha pessoal criada' : 'Aguardando 1º acesso'}</span>
    </div>
    <div class="us-presets">${PERM_PRESETS.map(p => `<button type="button" class="us-preset" data-act="preset" data-preset="${p.id}" data-on="${!!pre && pre.id === p.id}">${p.label}</button>`).join('')}
      <span class="small-dim us-custom">${pre ? '' : 'Personalizado'}</span></div>
    <div class="us-perms">${PERM_DEFS.map(d => `<label class="us-perm"><input type="checkbox" data-act="perm" data-perm="${d.id}"${u.perms.includes(d.id) ? ' checked' : ''}><span><b>${d.label}</b><small>${d.hint}</small></span></label>`).join('')}</div>
    <div class="us-foot"><button type="button" class="mini-btn" data-act="setpw">Definir senha</button><button type="button" class="mini-btn" data-act="reset"${u.hasPassword ? '' : ' disabled'}>Resetar senha</button></div>
  </div>`;
}
function usersListHTML(){
  const q = normText(usFilter).trim();
  const list = users.filter(u => !q || normText(u.nick).includes(q));
  if(!users.length) return '<div class="an-card"><div class="empty-box">Nenhum membro cadastrado. Cadastre os membros na aba Aliança: cada um vira uma conta de acesso.</div></div>';
  if(!list.length) return '<div class="an-card"><div class="empty-box">Nenhum membro com esse nome.</div></div>';
  return `<div class="us-grid">${list.map(userCardHTML).join('')}</div>`;
}

function renderUsers(){
  if(uiMode !== 'app' || !tabUsuarios) return;
  if(!isAdmin){ tabUsuarios.innerHTML = ''; return; }
  const waiting = users.filter(u => !u.hasPassword).length;
  const focus = document.activeElement && document.activeElement.id === 'usSearch';
  tabUsuarios.innerHTML = `<div class="narrow-wide">
    <div class="al-hero" style="padding:14px 16px;margin-bottom:12px">
      <div class="small-dim" style="color:var(--text);margin-bottom:4px"><b>${users.length}</b> contas · <b>${users.length - waiting}</b> com senha pessoal · <b>${waiting}</b> aguardando o primeiro acesso</div>
      <div class="small-dim">Todo membro vê todas as abas. Aqui você define o que cada um pode <b>fazer</b>. No primeiro acesso a pessoa entra com a senha padrão do grupo e é obrigada a criar a sua. "Definir senha" cria uma nova senha para o membro (as senhas ficam protegidas: dá para trocar, não para ver). "Resetar senha" apaga a senha pessoal e ele volta ao primeiro acesso.</div>
    </div>
    <input class="nick-input" id="usSearch" type="search" placeholder="Buscar membro…" value="${esc(usFilter)}" style="max-width:240px;padding:8px 10px;margin-bottom:12px" autocomplete="off">
    <div id="usList">${usersListHTML()}</div>
  </div>`;
  if(focus){ const el = $('usSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

function savePerms(nick, perms){
  const u = users.find(x => x.nick === nick);
  if(u) u.perms = perms;                       // mostra já; o servidor confirma em seguida
  send({t: 'perms_set', nick, perms});
  const el = $('usList'); if(el) el.innerHTML = usersListHTML();
}

tabUsuarios.addEventListener('input', (e) => {
  if(e.target.id !== 'usSearch') return;
  usFilter = e.target.value;
  const el = $('usList'); if(el) el.innerHTML = usersListHTML();
});
tabUsuarios.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-act="perm"]');
  if(!cb || !isAdmin) return;
  const nick = cb.closest('.us-card').dataset.nick;
  const u = users.find(x => x.nick === nick);
  if(!u) return;
  const perms = PERM_DEFS.map(d => d.id).filter(id => id === cb.dataset.perm ? cb.checked : u.perms.includes(id));
  savePerms(nick, perms);
});
tabUsuarios.addEventListener('click', (e) => {
  if(!isAdmin) return;
  const b = e.target.closest('button[data-act]');
  if(!b) return;
  const nick = b.closest('.us-card').dataset.nick;
  if(b.dataset.act === 'preset'){
    const p = PERM_PRESETS.find(x => x.id === b.dataset.preset);
    if(p) savePerms(nick, [...p.perms]);
  } else if(b.dataset.act === 'setpw'){
    openSetPassword(nick);
  } else if(b.dataset.act === 'reset'){
    if(confirm(`Resetar a senha de ${nick}? No próximo acesso ela entra com a senha padrão do grupo e cria outra.`)) send({t: 'pw_reset', nick});
  }
});
