/* ================= Perfil: foto, funções e senha (cada um edita só o seu) ================= */
let avatars = {};            // nick em minúsculo -> foto (data URL pequena)
let myProfileSet = true;     // false até a pessoa preencher o perfil pela primeira vez
let profRoles = [];          // funções marcadas no pop-up de perfil

const avatarOf = (nick) => avatars[String(nick || '').toLowerCase()] || '';
function avatarHTML(nick, size){
  const src = avatarOf(nick);
  const s = size || 28;
  if(src) return `<img class="av" src="${src}" alt="" width="${s}" height="${s}" style="--s:${s}px">`;
  let h = 0; for(const ch of String(nick || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="av av-ini" style="--s:${s}px;--h:${h}">${esc(String(nick || '?').trim().charAt(0).toUpperCase())}</span>`;
}
const myMember = () => (nickname && nickname !== 'Admin') ? roster.find(p => p.nick.toLowerCase() === nickname.toLowerCase()) : null;

function updateProfileBtn(){
  const b = $('profileBtn');
  if(!b) return;
  const me = uiMode === 'app' ? myMember() : null;
  b.classList.toggle('hidden', !me);
  if(me) b.innerHTML = `${avatarHTML(me.nick, 20)}<span>Meu perfil</span>`;
}
function refreshProfileUI(){
  updateProfileBtn();
  if(uiMode !== 'app') return;
  if(typeof onRosterChanged === 'function') onRosterChanged();
  if(currentTab === 'usuarios') renderUsers();
  const pv = $('profAvatar'); if(pv && myMember()) pv.innerHTML = avatarHTML(myMember().nick, 72);
}
function setAvatars(map){ avatars = map || {}; refreshProfileUI(); }
function setAvatar(nick, data){
  const k = String(nick).toLowerCase();
  if(data) avatars[k] = data; else delete avatars[k];
  refreshProfileUI();
}

// foto escolhida -> quadrado 96x96 (corta o excesso), pequena o bastante para ir junto com os dados
function fileToAvatar(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      const m = Math.min(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, 96, 96);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    img.src = url;
  });
}

const SELF_ROLES = ROLES.filter(r => r.id !== 'reserva');
function rolesChipsHTML(){
  return SELF_ROLES.map(r => `<button type="button" class="rchip" data-role="${r.id}" data-on="${profRoles.includes(r.id)}" style="--c:${r.color}">${roleIcon(r.id, 13)}${r.label}</button>`).join('');
}

function openProfile(first){
  const me = myMember();
  if(!me) return;
  profRoles = (me.roles || []).filter(r => r !== 'reserva');
  openModal(`
    <h3>${first ? 'Complete o seu perfil' : 'Meu perfil'}</h3>
    <p class="small-dim" style="margin:6px 0 14px">${first ? 'Escolha as funções que você joga e, se quiser, coloque uma foto. Você pode mudar tudo depois em "Meu perfil".' : 'Só você edita o seu perfil.'}</p>
    <div class="prof-top">
      <div id="profAvatar">${avatarHTML(me.nick, 72)}</div>
      <div class="prof-who"><b>${esc(me.nick)}</b>${me.cargo ? `<span class="small-dim">${esc(me.cargo)}</span>` : ''}
        <div class="prof-btns">
          <button type="button" class="mini-btn" id="profPick">Escolher foto</button>
          <button type="button" class="mini-btn" id="profRemove"${avatarOf(me.nick) ? '' : ' disabled'}>Remover</button>
        </div>
        <input type="file" id="profFile" accept="image/*" hidden>
      </div>
    </div>
    <label class="f" style="display:block;margin:16px 0 8px">Minhas funções <span class="small-dim">(marque todas que você joga)</span></label>
    <div class="rbadges" id="profRoles">${rolesChipsHTML()}</div>
    <p class="login-error hidden" id="profErr" style="margin-top:10px"></p>
    ${first ? '' : `
    <details class="prof-pw"><summary>Trocar minha senha</summary>
      <label class="f" for="pwOld" style="display:block;margin:10px 0 4px">Senha atual</label>
      <input class="nick-input" id="pwOld" type="password" autocomplete="current-password" maxlength="64">
      <label class="f" for="pwNew" style="display:block;margin:10px 0 4px">Nova senha (8 ou mais caracteres)</label>
      <input class="nick-input" id="pwNew" type="password" autocomplete="new-password" maxlength="64">
      <label class="f" for="pwNew2" style="display:block;margin:10px 0 4px">Repita a nova senha</label>
      <input class="nick-input" id="pwNew2" type="password" autocomplete="new-password" maxlength="64">
      <p class="small-dim hidden" id="pwMsg" style="margin-top:8px"></p>
      <button type="button" class="ghost-btn" id="pwGo" style="margin-top:10px">Trocar senha</button>
    </details>`}
    <div class="modal-actions">
      <button class="primary-btn" id="profSave" type="button">${first ? 'Salvar' : 'Salvar funções'}</button>
      <button class="ghost-btn" id="profClose" type="button">${first ? 'Pular por agora' : 'Fechar'}</button>
    </div>`);
  const err = (t) => { const e = $('profErr'); e.textContent = t; e.classList.toggle('hidden', !t); };
  $('profRoles').addEventListener('click', (e) => {
    const b = e.target.closest('.rchip'); if(!b) return;
    const id = b.dataset.role;
    profRoles = profRoles.includes(id) ? profRoles.filter(x => x !== id) : [...profRoles, id];
    b.dataset.on = String(profRoles.includes(id));
    err('');
  });
  $('profPick').addEventListener('click', () => $('profFile').click());
  $('profFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    try{
      const data = await fileToAvatar(f);
      send({t: 'avatar_set', avatar: data});
      avatars[nickname.toLowerCase()] = data; refreshProfileUI();
      const r = $('profRemove'); if(r) r.disabled = false;
    }catch(x){ err('Não consegui ler essa imagem. Tente outra foto.'); }
    e.target.value = '';
  });
  $('profRemove').addEventListener('click', () => { send({t: 'avatar_set', avatar: ''}); delete avatars[nickname.toLowerCase()]; refreshProfileUI(); $('profRemove').disabled = true; });
  $('profSave').addEventListener('click', () => {
    if(!profRoles.length){ err('Marque pelo menos uma função.'); return; }
    send({t: 'profile_set', roles: profRoles});
  });
  $('profClose').addEventListener('click', closeModal);
  if(!first){
    const msg = (t, ok) => { const m = $('pwMsg'); m.textContent = t; m.classList.remove('hidden'); m.style.color = ok ? '#35C48C' : '#FF8A8A'; };
    $('pwGo').addEventListener('click', () => {
      const o = $('pwOld').value, n = $('pwNew').value, n2 = $('pwNew2').value;
      if(!o){ msg('Digite a senha atual.'); return; }
      if(n.length < 8){ msg('A nova senha precisa ter pelo menos 8 caracteres.'); return; }
      if(n !== n2){ msg('As duas senhas novas não são iguais.'); return; }
      pendingPwChange = n;
      send({t: 'pw_change', old: o, pass: n});
    });
  }
}
let pendingPwChange = '';
const pwcMsg = (t, ok) => { const m = $('pwMsg'); if(!m) return; m.textContent = t; m.classList.remove('hidden'); m.style.color = ok ? '#35C48C' : '#FF8A8A'; };
function onPwChanged(ok, reason){
  if(ok){
    if(pendingPwChange){ password = pendingPwChange; savePrefs(); }
    pendingPwChange = '';
    ['pwOld', 'pwNew', 'pwNew2'].forEach(id => { const e = $(id); if(e) e.value = ''; });
    pwcMsg('Senha trocada. Use a nova no próximo acesso.', true);
    return;
  }
  pendingPwChange = '';
  pwcMsg({
    atual: 'A senha atual está errada.',
    curta: 'A nova senha precisa ter de 8 a 64 caracteres.',
    igual: 'Escolha uma senha diferente da senha padrão do grupo.',
    semsenha: 'Esta conta ainda não tem senha pessoal. Saia e entre de novo para criar.',
    bloqueado: 'Muitas tentativas erradas. Espere 1 minuto.'
  }[reason] || 'Não foi possível trocar a senha.');
}
function onProfileSaved(){
  myProfileSet = true;
  closeModal();
  showBanner('Perfil salvo.');
}
function maybePromptProfile(){
  if(!myProfileSet && myMember()) openProfile(true);
}

$('profileBtn').addEventListener('click', () => openProfile(false));

/* ---------- admin: definir a senha de um membro (as senhas ficam guardadas só como hash: dá para trocar, não para ver) ---------- */
function genPassword(){
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(r, x => al[x % al.length]).join('');
}
function openSetPassword(nick){
  openModal(`
    <h3>Nova senha de ${esc(nick)}</h3>
    <p class="small-dim" style="margin:6px 0 12px">Defina uma senha e passe para a pessoa (ela pode trocar depois em "Meu perfil"). As senhas ficam guardadas de forma protegida: não dá para ver a antiga, só trocar.</p>
    <div class="pw-row"><input class="nick-input" id="spPass" type="text" autocomplete="off" maxlength="64" placeholder="mínimo 8 caracteres"><button type="button" class="mini-btn" id="spGen">Gerar</button></div>
    <p class="login-error hidden" id="spErr" style="margin-top:10px"></p>
    <div class="modal-actions">
      <button class="primary-btn" id="spGo" type="button">Definir senha</button>
      <button class="ghost-btn" id="spCancel" type="button">Cancelar</button>
    </div>`);
  $('spGen').addEventListener('click', () => { $('spPass').value = genPassword(); });
  $('spCancel').addEventListener('click', closeModal);
  $('spGo').addEventListener('click', () => {
    const v = $('spPass').value;
    if(v.length < 8){ const e = $('spErr'); e.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; e.classList.remove('hidden'); return; }
    send({t: 'pw_admin_set', nick, pass: v});
  });
  $('spPass').focus();
}
