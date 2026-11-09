/* ---------- dados fixos ---------- */

const TEAMS = [
  {id:"1", name:"Equipe 1", color:"#E5484D"},
  {id:"2", name:"Equipe 2", color:"#3E8EF7"},
  {id:"3", name:"Equipe 3", color:"#35C48C"},
  {id:"4", name:"Equipe 4", color:"#E8B339"}
];

const MAPS = [
  {id:"whisk_peak",   name:"Whisk Peak",          points:[{id:"a",label:"Ponto A"},{id:"c",label:"Ponto C"}]},
  {id:"foosha",       name:"Foosha",              points:[{id:"norte",label:"Norte"},{id:"sul",label:"Sul"}]},
  {id:"shells_town",  name:"Shells Town",         points:[{id:"unico",label:"Único ponto"}]},
  {id:"orange_town",  name:"Orange Town",         points:[{id:"a",label:"Ponto A"},{id:"b",label:"Ponto B"},{id:"c",label:"Ponto C"}]},
  {id:"cocoyasi",     name:"Cocoyasi",            points:[{id:"unico",label:"Único ponto"}]},
  {id:"loguetown",    name:"Loguetown",           points:[]},
  {id:"drum_island",  name:"Drum Island",         points:[{id:"ferreiro",label:"Ferreiro"},{id:"bar1",label:"Bar (1)"},{id:"bar2",label:"Bar (2)"}]},
  {id:"alubarna",     name:"Alubarna",            points:[{id:"norte",label:"Norte"},{id:"sul",label:"Sul"}]},
  {id:"water7",       name:"Water 7",             points:[{id:"leste",label:"Leste"},{id:"oeste",label:"Oeste"}]},
  {id:"enies_lobby",  name:"Enies Lobby",         points:[{id:"unico",label:"Único ponto"}]},
  {id:"amazon_lilly", name:"Amazon Lilly",        points:[]},
  {id:"sabaody",      name:"Sabaody Archipelago", points:[{id:"norte",label:"Norte"},{id:"sudoeste",label:"Sudoeste"},{id:"sudeste",label:"Sudeste"}]}
];
const mapName = (id) => (MAPS.find(m => m.id === id) || {name:id}).name;

const ENEMY_SLOTS = [
  {id:"tank", label:"Tank", color:"#FF5FA8"},
  {id:"sup",  label:"Sup",  color:"#35C48C"},
  {id:"p1",   label:"1",    color:"#EAF1F7"},
  {id:"p2",   label:"2",    color:"#EAF1F7"},
  {id:"p3",   label:"3",    color:"#EAF1F7"},
  {id:"p4",   label:"4",    color:"#EAF1F7"}
];

const CYCLE = 60;
const RADIUS = 38;
const CIRC = 2 * Math.PI * RADIUS;
const LS_PREFS = "gvg_local_prefs";

// nome curto para caber embaixo da bolinha ("Monkey D. Luffy" -> "Luffy")
function shortName(id){
  let n = charName(id).replace(/\s*\(.*?\)\s*/g, ' ').split(' & ')[0].trim();
  const t = n.split(/\s+/);
  if(t.length === 1) return n;
  const last = t[t.length - 1];
  return /^\d+$|^[A-Z]{1,2}\.?$/.test(last) ? t.slice(-2).join(' ') : last;
}

/* ---------- estado ---------- */

function emptyEnemySlots(){
  const o = {};
  ENEMY_SLOTS.forEach(s=>{ o[s.id] = null; });
  return o;
}
function emptyState(){
  const maps = {}, points = {}, enemies = {}, chars = {};
  TEAMS.forEach(t=>{ maps[t.id] = null; points[t.id] = {}; enemies[t.id] = emptyEnemySlots(); chars[t.id] = {}; });
  return {maps, points, enemies, chars};
}
function normalizeState(data){
  const base = emptyState();
  if(data){
    TEAMS.forEach(t=>{
      if(data.maps && data.maps[t.id]) base.maps[t.id] = data.maps[t.id];
      if(data.points && data.points[t.id]) base.points[t.id] = Object.assign({}, data.points[t.id]);
      if(data.enemies && data.enemies[t.id]) Object.assign(base.enemies[t.id], data.enemies[t.id]);
      if(data.chars && data.chars[t.id]) base.chars[t.id] = Object.assign({}, data.chars[t.id]);
    });
  }
  return base;
}

let state = emptyState();     // vem do servidor
let roster = [];              // membros cadastrados (depois do login): [{nick, roles:[], cargo}]
let plan = null;              // escala das equipes: {teams:{'1':{map,slots,reserves,leader,confirmed}}}
let justLoggedIn = false;     // true até chegar o primeiro estado depois do login
let cargos = [];              // cargos da aliança, na ordem de exibição
let publicRoster = [];        // só os nicks, para a tela de login
let presence = [];
let onlineNicks = new Set();   // nicks conectados agora (minúsculos), de qualquer equipe            // quem está conectado: [{id, nick, team}]
let myId = null;              // id do meu socket (o servidor informa)
let myTeam = null;
let nickname = '';
let password = '';            // fica salva neste aparelho para entrar direto da próxima vez
let adminCreds = null;        // {user, pass} quando este aparelho entrou como admin
let isAdmin = false;
let myPerms = ['cura'];       // o que esta conta pode fazer (o servidor confere de novo)
const can = (p) => isAdmin || myPerms.includes(p);
let pendingNewPass = '';      // senha pessoal que está sendo criada no primeiro acesso
let publicCargos = [], publicCargoOf = {};   // para agrupar a lista de nicks do login
let pendingAdmin = null;      // admin digitado, esperando o servidor confirmar
let adminAttempt = false;     // tentando entrar como admin a partir da tela de login
let selectedNick = '';
let authed = false;           // esta conexão já passou pelo login
let authFailed = false;       // senha recusada: não fica tentando de novo sozinho
let uiMode = 'boot';          // 'boot' (entrando) | 'login' | 'app'
let currentTab = 'cura';
let loginTimer = null, bootTimer = null;
let soundOn = true;
let alertedFor = {};
let pipWin = null;
let gotState = false;
let browsing = false;         // true enquanto a pessoa está escolhendo time/mapa de propósito
let faceEdit = false;         // escolhendo personagens dos inimigos
let offset = 0;               // diferença entre o relógio do servidor e o meu
let offsetInit = false;
const serverNow = () => Date.now() + offset;
const canAuto = () => !!((nickname && password) || adminCreds);

const chipRow = $('chipRow'), mapSection = $('mapSection'), mapList = $('mapList');
const placeholder = $('placeholder'), selectionScreen = $('selectionScreen'), pointsScreen = $('pointsScreen');
const topBarInfo = $('topBarInfo'), changeSelectionBtn = $('changeSelectionBtn'), presenceLine = $('presenceLine');
const enemyRow = $('enemyRow'), pointsHolder = $('pointsHolder'), alertBanner = $('alertBanner');
const soundBtn = $('soundBtn'), soundIcon = $('soundIcon'), soundLabel = $('soundLabel');
const pipBtn = $('pipBtn'), pipLabel = $('pipLabel'), pipNote = $('pipNote');
const syncDot = $('syncDot'), syncText = $('syncText');
const loginScreen = $('loginScreen'), bootScreen = $('bootScreen'), loginNick = $('loginNick'), loginPass = $('loginPass');
const loginBtn = $('loginBtn'), loginError = $('loginError'), userName = $('userName'), logoutBtn = $('logoutBtn');
const adminBtn = $('adminBtn'), tabsBar = $('tabsBar'), tabCura = $('tabCura'), tabEquipes = $('tabEquipes'), tabAnalise = $('tabAnalise'), tabAlianca = $('tabAlianca'), tabUsuarios = $('tabUsuarios'), tabPersonagens = $('tabPersonagens');

/* ---------- preferências locais (nick, senha, time e som ficam neste aparelho) ---------- */

function loadPrefs(){
  try{
    const raw = localStorage.getItem(LS_PREFS);
    if(raw){
      const p = JSON.parse(raw);
      myTeam = TEAMS.some(t => t.id === p.myTeam) ? p.myTeam : null;
      soundOn = p.soundOn !== undefined ? p.soundOn : true;
      nickname = p.nickname || '';
      password = p.password || '';
      adminCreds = (p.admin && p.admin.user && p.admin.pass) ? p.admin : null;
    }
  }catch(e){}
}
function savePrefs(){ try{ localStorage.setItem(LS_PREFS, JSON.stringify({myTeam, soundOn, nickname, password, admin: adminCreds})); }catch(e){} }

/* ---------- conexão em tempo real ---------- */

let ws = null, connected = false, lastRx = 0, reconnectDelay = 1000, reconnectTimer = null;
const roomQS = () => { const r = new URLSearchParams(location.search).get('room'); return r ? `?room=${encodeURIComponent(r)}` : ''; };

function setConn(ok){
  connected = ok;
  syncDot.classList.toggle('off', !ok);
  syncText.textContent = ok ? 'conectado em tempo real'
    : (uiMode === 'login' ? 'aguardando login' : (uiMode === 'boot' ? 'conectando...' : 'reconectando...'));
  document.body.classList.toggle('offline', !ok);
}

function connect(){
  if(!canAuto() || authFailed) return;
  if(!location.host){
    syncText.textContent = 'abra pelo link do site (não pelo arquivo baixado)';
    return;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/api/ws` + roomQS();
  let sock;
  try{ sock = new WebSocket(url); }catch(e){ scheduleReconnect(); return; }
  ws = sock;
  sock.onopen = ()=>{ reconnectDelay = 1000; lastRx = Date.now(); sendLogin(); };
  sock.onmessage = onServerMessage;
  sock.onclose = ()=>{ if(ws === sock) dropSocket(); };
  sock.onerror = ()=>{ if(ws === sock) dropSocket(); };
}
// abandona a conexão atual (sem esperar o aperto de mão de fechamento, que pode nunca vir) e tenta de novo
function closeSocketQuiet(){
  const old = ws;
  ws = null;
  authed = false;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if(old){
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try{ old.close(); }catch(e){}
  }
}
function dropSocket(){
  closeSocketQuiet();
  setConn(false);
  scheduleReconnect();
}
function scheduleReconnect(){
  if(authFailed || !canAuto()) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(()=>{ reconnectTimer = null; connect(); }, reconnectDelay);
  reconnectDelay = Math.min(Math.round(reconnectDelay * 1.6), 8000);
}
function keepAlive(){
  if(ws && ws.readyState === 1){
    if(Date.now() - lastRx > 75000){ dropSocket(); return; }   // servidor mudo: reconecta
    try{ ws.send('ping'); }catch(e){}
  } else if(!reconnectTimer && !authFailed && canAuto()){
    connect();
  }
}
function reconnectNow(){
  if(authFailed || !canAuto()) return;
  if(ws && ws.readyState <= 1) return;       // já conectado/conectando
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectDelay = 1000;
  connect();
}
window.addEventListener('online', reconnectNow);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) reconnectNow(); });

function send(obj, quiet){
  if(ws && ws.readyState === 1 && (authed || obj.t === 'login' || obj.t === 'first_password')){ ws.send(JSON.stringify(obj)); return true; }
  if(!quiet) showBanner('Sem conexão com o servidor — tentando reconectar...', true);
  return false;
}
function sendHello(){ send({t:'hello', team:myTeam}, true); }
function sendLogin(){
  const o = {t:'login', nick:nickname, pass:password, team:myTeam};
  if(adminCreds) o.admin = adminCreds;
  send(o, true);
}

function onServerMessage(ev){
  lastRx = Date.now();
  if(typeof ev.data !== 'string' || ev.data === 'pong') return;
  let msg;
  try{ msg = JSON.parse(ev.data); }catch(e){ return; }
  switch(msg.t){
    case 'login_ok':
      authed = true;
      clearTimeout(loginTimer);
      clearTimeout(bootTimer);
      if(msg.nick) nickname = msg.nick;
      isAdmin = !!msg.admin;
      myPerms = Array.isArray(msg.perms) ? msg.perms : ['cura'];
      myProfileSet = msg.profileSet !== false;
      if(pendingNewPass){ password = pendingNewPass; pendingNewPass = ''; closeModal(); }
      justLoggedIn = true;
      if(adminAttempt){ adminAttempt = false; closeModal(); }
      savePrefs();
      setConn(true);
      resetLoginButton();
      updateAdminUI();
      onAuthed();
      return;
    case 'login_need_password':
      clearTimeout(loginTimer); clearTimeout(bootTimer);
      resetLoginButton();
      openFirstPasswordModal();
      return;
    case 'pw_error': showFirstPasswordError(msg.reason === 'igual' ? 'Escolha uma senha diferente da senha padrão do grupo.' : 'A senha precisa ter de 8 a 64 caracteres.'); return;
    case 'perms':
      myPerms = Array.isArray(msg.perms) ? msg.perms : ['cura'];
      updateAdminUI();
      showBanner('Suas permissões foram atualizadas.');
      return;
    case 'avatar': setAvatar(msg.nick, msg.avatar); return;
    case 'avatar_error': showBanner('Foto muito grande ou inválida.', true); return;
    case 'profile_ok': onProfileSaved(); return;
    case 'pwc_ok': onPwChanged(true); return;
    case 'pwc_error': onPwChanged(false, msg.reason); return;
    case 'pwa_ok': closeModal(); showBanner('Senha de ' + msg.nick + ' definida.'); return;
    case 'pwa_error': showBanner('A senha precisa ter de 8 a 64 caracteres.', true); return;
    case 'users': if(typeof setUsers === 'function') setUsers(msg.list || []); return;
    case 'login_fail': onLoginFail(msg.reason); return;
    case 'admin_state':
      isAdmin = !!msg.admin;
      if(Array.isArray(msg.perms)) myPerms = msg.perms;
      if(isAdmin && pendingAdmin){ adminCreds = pendingAdmin; savePrefs(); }
      pendingAdmin = null;
      if(isAdmin) closeModal();
      updateAdminUI();
      return;
    case 'admin_fail':
      pendingAdmin = null;
      showAdminError(msg.reason === 'bloqueado' ? 'Muitas tentativas erradas. Espere 1 minuto.' : 'Usuário ou senha de admin incorretos.');
      return;
    case 'denied':
      showBanner('Você não tem permissão para isso.', true);
      return;
    case 'plan':
      setPlan(msg.plan);
      return;
    case 'alliance':
      setAlliance(msg.roster, msg.cargos);
      return;
    case 'battles': onBattles(msg.list || []); return;
    case 'battles_dirty': onBattlesDirty(); return;
    case 'battle_saved': onBattleSaved(msg.id); return;
    case 'battle_error': onBattleError(); return;
    case 'state': {
      if(msg.now){
        const cand = msg.now - Date.now();
        offset = offsetInit ? offset * 0.8 + cand * 0.2 : cand;
        offsetInit = true;
      }
      if(msg.you) myId = msg.you;
      if(msg.presence) presence = msg.presence;
      if(msg.online){ onlineNicks = new Set(msg.online); if(typeof updateOnlineDots === 'function') updateOnlineDots(); }
      if(msg.avatars) setAvatars(msg.avatars);
      if(msg.roster) setAlliance(msg.roster, msg.cargos);
      if(msg.plan) setPlan(msg.plan);
      const prevMap = currentMapId();
      state = normalizeState(msg.data);
      gotState = true;
      if(justLoggedIn){ justLoggedIn = false; autoPickMyTeam(); setTimeout(maybePromptProfile, 400); }
      if(uiMode !== 'app') setMode('app');
      onStateChanged(prevMap);
      return;
    }
    case 'presence':
      presence = msg.presence || [];
      if(msg.online){ onlineNicks = new Set(msg.online); if(typeof updateOnlineDots === 'function') updateOnlineDots(); }
      renderPresence();
      return;
  }
}

function setAlliance(list, cargoList){
  roster = Array.isArray(list) ? list : [];
  if(Array.isArray(cargoList)) cargos = cargoList;
  publicRoster = roster.map(p => p.nick);
  if(typeof onRosterChanged === 'function') onRosterChanged();
}

function onStateChanged(prevMap){
  const cur = currentMapId();
  if(myTeam){
    if(cur && !browsing && cur !== prevMap){
      alertedFor = {};
      enterPointsScreen();            // alguém da equipe escolheu (ou trocou) o mapa
    } else if(cur && !browsing && pointsScreen.classList.contains('hidden')){
      enterPointsScreen();
    } else if(!cur && !browsing){
      renderMapSection();
    } else {
      if(!selectionScreen.classList.contains('hidden')) renderMapSection();
      renderTimers();
      renderEnemies();
    }
  }
  renderPresence();
  if(typeof onLiveStateChanged === 'function') onLiveStateChanged();
}

/* ---------- telas ---------- */

function setMode(m){
  uiMode = m;
  loginScreen.classList.toggle('hidden', m !== 'login');
  bootScreen.classList.toggle('hidden', m !== 'boot');
  tabsBar.classList.toggle('hidden', m !== 'app');
  if(m === 'app'){
    userName.textContent = nickname;
    if(typeof updateProfileBtn === 'function') updateProfileBtn();
    if(pointsScreen.classList.contains('hidden')) selectionScreen.classList.remove('hidden');
    applyTab();
  } else {
    selectionScreen.classList.add('hidden');
    pointsScreen.classList.add('hidden');
    tabCura.classList.add('hidden'); tabEquipes.classList.add('hidden'); tabAnalise.classList.add('hidden'); tabAlianca.classList.add('hidden'); tabUsuarios.classList.add('hidden'); tabPersonagens.classList.add('hidden');
    closeFloating();
    closePicker();
    if(m === 'boot') bootScreen.textContent = `Entrando como ${nickname || 'Admin'}...`;
  }
  if(!connected) setConn(false);          // atualiza o texto do status
}

function setTab(t){
  currentTab = t;
  applyTab();
}
function applyTab(){
  if(uiMode !== 'app') return;
  tabsBar.querySelector('[data-tab="usuarios"]').hidden = !isAdmin;
  if(currentTab === 'usuarios' && !isAdmin) currentTab = 'cura';
  tabCura.classList.toggle('hidden', currentTab !== 'cura');
  tabEquipes.classList.toggle('hidden', currentTab !== 'equipes');
  tabAnalise.classList.toggle('hidden', currentTab !== 'analise');
  tabAlianca.classList.toggle('hidden', currentTab !== 'alianca');
  tabUsuarios.classList.toggle('hidden', currentTab !== 'usuarios');
  tabPersonagens.classList.toggle('hidden', currentTab !== 'personagens');
  tabsBar.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === currentTab ? 'true' : 'false'));
  if(currentTab === 'analise') enterAnalysis();
  if(currentTab === 'alianca') renderAlliance();
  if(currentTab === 'equipes') renderTeams();
  if(currentTab === 'usuarios') renderUsers();
  if(currentTab === 'personagens') enterCharacters();
  if(currentTab === 'cura') renderMyTeamCard();
}
tabsBar.addEventListener('click', (e)=>{
  const b = e.target.closest('.tab');
  if(b) setTab(b.dataset.tab);
});

function showLoginError(t){ loginError.textContent = t; loginError.classList.remove('hidden'); }
function hideLoginError(){ loginError.classList.add('hidden'); }
function resetLoginButton(){ loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }

// lista de nicks na tela de login (ou campo de texto, se ainda não há jogadores cadastrados)
function renderNickPick(){
  const has = publicRoster.length > 0;
  $('nickPickWrap').classList.toggle('hidden', !has);
  $('nickTypeWrap').classList.toggle('hidden', has);
  $('loginSub').textContent = has ? 'Escolha quem você é e digite a sua senha. No primeiro acesso use a senha padrão do grupo: depois você cria a sua.' : 'Use o seu nick do jogo e a senha do grupo.';
  if(has && !publicRoster.some(n => n.toLowerCase() === selectedNick.toLowerCase())) selectedNick = publicRoster.find(n => n.toLowerCase() === nickname.toLowerCase()) || '';
  if(has){
    const opt = (n) => `<option value="${esc(n)}"${n === selectedNick ? ' selected' : ''}>${esc(n)}</option>`;
    const names = [...publicRoster].sort((a, b) => a.localeCompare(b, 'pt-BR', {sensitivity: 'base'}));
    const groups = [...publicCargos, ''].map(c => ({c, list: names.filter(n => (publicCargoOf[n] || '') === c)}))
      .concat([{c: '_', list: names.filter(n => publicCargoOf[n] && !publicCargos.includes(publicCargoOf[n]))}]).filter(g => g.list.length);
    $('nickSelect').innerHTML = `<option value="">Selecione o seu nick…</option>` +
      groups.map(g => `<optgroup label="${esc(g.c && g.c !== '_' ? g.c : 'Sem cargo')}">${g.list.map(opt).join('')}</optgroup>`).join('');
  }
}
$('nickSelect').addEventListener('change', ()=>{
  selectedNick = $('nickSelect').value;
  if(selectedNick) loginPass.focus();
});
async function fetchPublicRoster(){
  if(!location.host) return;
  try{
    const r = await fetch('/api/roster' + roomQS(), {cache:'no-store'});
    const j = await r.json();
    publicRoster = (j.players || []).map(p => p.nick);
    publicCargos = j.cargos || [];
    publicCargoOf = Object.fromEntries((j.players || []).map(p => [p.nick, p.cargo || '']));
  }catch(e){ /* sem lista: campo de texto */ }
  if(uiMode === 'login') renderNickPick();
}

function showLogin(errorText, clearPass){
  clearTimeout(bootTimer);
  setMode('login');
  loginNick.value = nickname === 'Admin' ? '' : nickname;
  if(!selectedNick) selectedNick = nickname === 'Admin' ? '' : nickname;
  if(clearPass) loginPass.value = '';
  if(errorText) showLoginError(errorText); else hideLoginError();
  resetLoginButton();
  renderNickPick();
  fetchPublicRoster();
}

function startLoginAttempt(){
  authFailed = false;
  closeSocketQuiet();
  reconnectDelay = 1000;
  connect();
  clearTimeout(loginTimer);
  loginTimer = setTimeout(()=>{
    if(!authed){
      closeSocketQuiet();
      authFailed = true;
      resetLoginButton();
      if(adminAttempt) showAdminError('Não consegui falar com o servidor. Tente de novo.');
      else showLoginError('Não consegui falar com o servidor. Confira a internet e tente de novo.');
    }
  }, 9000);
}

function submitLogin(){
  const typed = publicRoster.length ? $('nickSelect').value : loginNick.value.trim();
  const p = loginPass.value;
  if(!location.host){ showLoginError('Abra pelo link do site, não pelo arquivo baixado.'); return; }
  if(publicRoster.length && !typed){ showLoginError('Escolha o seu nick na lista.'); return; }
  if(typed.length < 2){ showLoginError('Digite seu nick (pelo menos 2 letras).'); return; }
  if(!p){ showLoginError('Digite a senha.'); return; }
  hideLoginError();
  nickname = typed; password = p;
  loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';
  startLoginAttempt();
}

function onLoginFail(reason){
  clearTimeout(loginTimer);
  if(pendingNewPass || $('fpGo')){ pendingNewPass = ''; closeModal(); }
  // o admin salvo neste aparelho deixou de valer (senha trocada): entra só como membro
  if(reason === 'admin' && adminCreds && !adminAttempt && password){
    adminCreds = null;
    savePrefs();
    closeSocketQuiet();
    authFailed = false;
    reconnectDelay = 1000;
    connect();
    return;
  }
  const wasLoggedBefore = uiMode !== 'login';      // entrou sozinho com a senha salva e ela não vale mais
  authFailed = true;
  authed = false;
  gotState = false;
  closeSocketQuiet();
  if(reason === 'admin'){
    adminCreds = null;
    savePrefs();
    resetLoginButton();
    if(adminAttempt){ showAdminError('Usuário ou senha de admin incorretos.'); adminAttempt = false; if(uiMode !== 'login') showLogin('', false); return; }
    showLogin('O acesso de admin salvo não vale mais. Entre de novo.', false);
    return;
  }
  if(reason === 'bloqueado' && adminAttempt){ showAdminError('Muitas tentativas erradas. Espere 1 minuto.'); return; }
  if(reason === 'senha'){ password = ''; }
  savePrefs();
  const txt = {
    senha: 'Senha incorreta.',
    nick: 'Nick inválido (use pelo menos 2 letras).',
    roster: 'Este nick não está na lista de jogadores. Peça ao admin para cadastrar você.',
    bloqueado: 'Muitas tentativas erradas. Espere 1 minuto e tente de novo.'
  }[reason] || 'Não foi possível entrar.';
  showLogin(wasLoggedBefore && reason === 'senha' ? 'A senha mudou. Entre de novo.' : txt, wasLoggedBefore);
}

/* ---------- primeiro acesso: criar senha pessoal ---------- */
function showFirstPasswordError(t){ const e = $('fpErr'); if(e){ e.textContent = t; e.classList.remove('hidden'); } const b = $('fpGo'); if(b){ b.disabled = false; } pendingNewPass = ''; }
function openFirstPasswordModal(){
  pendingNewPass = '';
  openModal(`
    <h3>Crie a sua senha pessoal</h3>
    <p class="small-dim" style="margin:6px 0 14px">Este é o primeiro acesso de <b style="color:var(--text)">${esc(nickname)}</b>. Escolha uma senha só sua, com pelo menos 8 caracteres e diferente da senha padrão. Depois disso a senha padrão deixa de valer para você.</p>
    <label class="f" for="fpNew">Nova senha</label>
    <input class="nick-input" id="fpNew" type="password" autocomplete="new-password" maxlength="64">
    <label class="f" for="fpNew2" style="margin-top:10px;display:block">Repita a senha</label>
    <input class="nick-input" id="fpNew2" type="password" autocomplete="new-password" maxlength="64">
    <p class="login-error hidden" id="fpErr" style="margin-top:10px"></p>
    <div class="modal-actions">
      <button class="primary-btn" id="fpGo" type="button">Salvar e entrar</button>
      <button class="ghost-btn" id="fpBack" type="button">Voltar</button>
    </div>`);
  const bg = $('modalBg'); bg.replaceWith(bg.cloneNode(true));      // obrigatório: clicar fora não fecha
  const go = () => {
    const a = $('fpNew').value, b = $('fpNew2').value;
    if(a.length < 8){ showFirstPasswordError('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if(a !== b){ showFirstPasswordError('As duas senhas não são iguais.'); return; }
    $('fpGo').disabled = true;
    pendingNewPass = a;
    send({t:'first_password', nick:nickname, pass:password, newpass:a, team:myTeam}, true);
  };
  $('fpGo').addEventListener('click', go);
  $('fpBack').addEventListener('click', () => { pendingNewPass = ''; closeModal(); logout(); });
  ['fpNew', 'fpNew2'].forEach(id => $(id).addEventListener('keydown', e => { if(e.key === 'Enter') go(); }));
  $('fpNew').focus();
}

function logout(){
  password = '';
  adminCreds = null;
  isAdmin = false;
  myPerms = ['cura'];
  authFailed = true;
  gotState = false;
  savePrefs();
  closeSocketQuiet();
  closeFloating();
  state = emptyState();
  presence = [];
  onlineNicks = new Set();
  myId = null;
  browsing = false;
  currentTab = 'cura';
  setConn(false);
  updateAdminUI();
  showLogin('', true);
}

loginBtn.addEventListener('click', submitLogin);
[loginNick, loginPass].forEach(el => el.addEventListener('keydown', e => { if(e.key === 'Enter') submitLogin(); }));
logoutBtn.addEventListener('click', logout);

/* ---------- admin ---------- */

function updateAdminUI(){
  adminBtn.innerHTML = isAdmin ? '&#128081; Admin &middot; sair' : '&#128273; Admin';
  adminBtn.classList.toggle('admin-on', isAdmin);
  if(uiMode === 'app') applyTab();
  if(typeof onAdminChanged === 'function') onAdminChanged();
}

function openModal(html, wide){
  $('modalHost').innerHTML = `<div class="modal" id="modalBg"><div class="modal-box${wide ? ' wide' : ''}" id="modalBox">${html}</div></div>`;
  $('modalBg').addEventListener('mousedown', (e)=>{ if(e.target.id === 'modalBg' && !wide) closeModal(); });
}
function closeModal(){ $('modalHost').innerHTML = ''; }

function showAdminError(t){
  const el = $('adminErr');
  if(el){ el.textContent = t; el.classList.remove('hidden'); }
  const b = $('adminGo');
  if(b){ b.disabled = false; b.textContent = 'Entrar como admin'; }
  resetLoginButton();
}

function openAdminModal(){
  openModal(`
    <h3>Entrar como admin</h3>
    <p class="small-dim">O admin cadastra jogadores e lança as vitórias/derrotas da área de Análise.</p>
    <label class="f" for="admUser">Usuário</label>
    <input class="nick-input" id="admUser" type="text" autocomplete="username" autocapitalize="off">
    <label class="f" for="admPass">Senha</label>
    <input class="nick-input" id="admPass" type="password" autocomplete="current-password">
    <p class="form-err hidden" id="adminErr"></p>
    <div class="modal-actions">
      <button class="primary-btn" id="adminGo" type="button">Entrar como admin</button>
      <button class="ghost-btn" id="adminCancel" type="button">Cancelar</button>
    </div>`);
  const go = ()=>{
    const user = $('admUser').value.trim(), pass = $('admPass').value;
    if(!user || !pass){ showAdminError('Preencha usuário e senha.'); return; }
    $('adminErr').classList.add('hidden');
    $('adminGo').disabled = true; $('adminGo').textContent = 'Entrando...';
    if(authed){
      pendingAdmin = {user, pass};
      send({t:'admin_login', user, pass});
    } else {
      // ainda sem login de membro: entra direto como admin
      if(!location.host){ showAdminError('Abra pelo link do site, não pelo arquivo baixado.'); return; }
      adminCreds = {user, pass};
      adminAttempt = true;
      if(!nickname) nickname = '';
      startLoginAttempt();
    }
  };
  $('adminGo').addEventListener('click', go);
  $('adminCancel').addEventListener('click', closeModal);
  ['admUser', 'admPass'].forEach(id => $(id).addEventListener('keydown', e => { if(e.key === 'Enter') go(); }));
  $('admUser').focus();
}

adminBtn.addEventListener('click', ()=>{
  if(isAdmin){
    if(!password){ logout(); return; }           // entrou só como admin: sai por completo
    adminCreds = null;
    savePrefs();
    send({t:'admin_logout'}, true);
    return;
  }
  openAdminModal();
});

/* ---------- time / mapa ---------- */

function buildChips(){
  chipRow.innerHTML = TEAMS.map(t=>`<button class="chip" data-team="${t.id}" data-active="false" type="button">${t.name}</button>`).join('');
  chipRow.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>selectTeam(chip.dataset.team));
  });
}

function currentTeamObj(){ return TEAMS.find(t=>t.id===myTeam); }
function currentMapId(){ return myTeam ? state.maps[myTeam] : null; }
function currentMapObj(){ const id = currentMapId(); return MAPS.find(m=>m.id===id) || null; }

function selectTeam(id){
  myTeam = id;
  browsing = false;
  renderChips();
  savePrefs();
  closeFloating();
  sendHello();
  if(currentMapId()){
    enterPointsScreen();
  } else {
    pointsScreen.classList.add('hidden');
    selectionScreen.classList.remove('hidden');
    renderMapSection();
  }
  renderPresence();
}

function renderChips(){
  chipRow.querySelectorAll('.chip').forEach(chip=>{
    const active = chip.dataset.team === myTeam;
    chip.dataset.active = active ? "true" : "false";
    const team = TEAMS.find(t=>t.id===chip.dataset.team);
    chip.style.background = active ? team.color : 'transparent';
    chip.style.borderColor = active ? team.color : '';
  });
}

function renderMapSection(){
  if(!myTeam){
    mapSection.classList.add('hidden');
    placeholder.classList.remove('hidden');
    placeholder.textContent = 'Selecione a sua equipe acima para continuar.';
    return;
  }
  if(!gotState){
    mapSection.classList.add('hidden');
    placeholder.classList.remove('hidden');
    placeholder.textContent = 'Conectando ao servidor...';
    return;
  }
  mapSection.classList.remove('hidden');
  placeholder.classList.remove('hidden');
  placeholder.textContent = 'Selecione o mapa da sua equipe acima.';
  const activeMapId = currentMapId();
  const team = currentTeamObj();
  const planned = plannedMapFor(myTeam);
  mapList.innerHTML = MAPS.map(m=>`
    <button class="map-btn" data-map="${m.id}" data-active="${m.id===activeMapId}" style="--accent:${team.color}" type="button">
      <span class="map-name">${m.name}${m.id === planned ? ' <span class="plan-tag">mapa da equipe</span>' : ''}</span>
      <span class="map-badge">${m.points.length === 0 ? 'sem cura' : m.points.length + ' ponto' + (m.points.length>1?'s':'')}</span>
    </button>
  `).join('');
  mapList.querySelectorAll('.map-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>selectMap(btn.dataset.map));
  });
}

function selectMap(mapId){
  if(!send({t:'map', team:myTeam, map:mapId})) return;
  if(state.maps[myTeam] !== mapId){
    state.maps[myTeam] = mapId;
    state.points[myTeam] = {};
    state.enemies[myTeam] = emptyEnemySlots();
    state.chars[myTeam] = {};
  }
  alertedFor = {};
  enterPointsScreen();
}

function enterPointsScreen(){
  browsing = false;
  const map = currentMapObj();
  const team = currentTeamObj();
  if(!map){
    pointsScreen.classList.add('hidden');
    selectionScreen.classList.remove('hidden');
    renderMapSection();
    return;
  }

  selectionScreen.classList.add('hidden');
  pointsScreen.classList.remove('hidden');
  topBarInfo.innerHTML = `${team.name} <span class="dim">·</span> ${map.name}`;
  buildEnemyRow(document, enemyRow, 0, true);

  if(map.points.length === 0){
    pointsHolder.innerHTML = `<div class="placeholder">${map.name} não tem pontos de cura para monitorar.</div>`;
  } else {
    pointsHolder.innerHTML = map.points.map(p => `
      <div class="card" data-point="${p.id}" id="card-${p.id}">
        <div class="band" style="background:${team.color}"></div>
        <div class="ring-wrap">
          <svg class="ring" width="92" height="92" viewBox="0 0 92 92">
            <circle class="ring-bg" cx="46" cy="46" r="${RADIUS}"></circle>
            <circle class="ring-fg" id="ring-${p.id}" cx="46" cy="46" r="${RADIUS}"
              stroke="${team.color}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"></circle>
          </svg>
          <div class="ring-center">
            <span class="ring-time" id="time-${p.id}">--</span>
            <span class="ring-unit">seg</span>
          </div>
        </div>
        <div class="card-body">
          <div class="point-name">${p.label}</div>
          <div class="status-label" id="status-${p.id}">Aguardando</div>
          <div class="status-sub" id="sub-${p.id}">Ninguém marcou o uso ainda.</div>
          <button class="use-btn" id="btn-${p.id}" style="background:${team.color}" type="button">Usei o ponto</button>
        </div>
      </div>
    `).join('');
    map.points.forEach(p=>{
      $(`btn-${p.id}`).addEventListener('click', ()=>markPointUsed(p.id));
    });
  }
  if(pipWin && !pipWin.closed) buildFloatingDoc(pipWin, map, team);   // mapa mudou com a janela flutuante aberta
  renderTimers();
  renderEnemies();
  renderPresence();
}

changeSelectionBtn.addEventListener('click', ()=>{
  browsing = true;
  pointsScreen.classList.add('hidden');
  selectionScreen.classList.remove('hidden');
  renderChips();
  renderMapSection();
  closeFloating();
});

function renderPresence(){
  if(!myTeam){ presenceLine.textContent = ''; return; }
  const mine = presence.filter(p => p.team === myTeam);
  const me = mine.find(p => p.id === myId);
  const others = [];
  mine.forEach(p=>{
    if(p.id === myId) return;
    if(me && p.nick === me.nick) return;
    if(!others.includes(p.nick)) others.push(p.nick);
  });
  const all = (me ? [`${me.nick} (você)`] : []).concat(others);
  presenceLine.textContent = all.length ? `Online na equipe (${all.length}): ${all.join(', ')}` : '';
}

/* ---------- som e alertas ---------- */

let audioCtx = null;
function getAudio(){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }catch(e){ return null; }
}
document.addEventListener('pointerdown', ()=>{ getAudio(); }, {once:true});

function renderSoundBtn(){
  soundIcon.textContent = soundOn ? '\u{1F50A}' : '\u{1F507}';
  soundLabel.textContent = soundOn ? 'Som ligado' : 'Som desligado';
}
soundBtn.addEventListener('click', ()=>{
  soundOn = !soundOn;
  renderSoundBtn();
  savePrefs();
  if(soundOn) playBeep();
});

function playBeep(){
  const ctx = getAudio();
  if(!ctx) return;
  try{
    [660, 880, 1046].forEach((f, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t0 = ctx.currentTime + i*0.14;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
  }catch(e){}
}

function showBanner(text, warn){
  alertBanner.textContent = text;
  alertBanner.classList.toggle('warn', !!warn);
  alertBanner.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(()=>{ alertBanner.classList.remove('show'); }, warn ? 2500 : 4000);
}

/* ---------- ações (vão pro servidor; a tela atualiza na hora) ---------- */

function markPointUsed(pointId){
  if(!myTeam) return;
  if(!send({t:'point', team:myTeam, point:pointId})) return;
  state.points[myTeam][pointId] = serverNow();
  delete alertedFor[pointId];
  renderTimers();
}

function markEnemyDead(slotId){
  if(!myTeam) return;
  const enemies = state.enemies[myTeam] || (state.enemies[myTeam] = emptyEnemySlots());
  const start = enemies[slotId];
  if(start && (serverNow() - start) / 1000 < CYCLE) return;     // travado até completar 60s
  if(!send({t:'enemy', team:myTeam, slot:slotId})) return;
  enemies[slotId] = serverNow();
  renderEnemies();
}

function setEnemyChar(slotId, charId){
  if(!myTeam) return;
  if(!send({t:'echar', team:myTeam, slot:slotId, char:charId})) return;
  const cs = state.chars[myTeam] || (state.chars[myTeam] = {});
  if(charId) cs[slotId] = charId; else delete cs[slotId];
  renderEnemies();
}

/* ---------- inimigos (bolinhas com rosto) ---------- */

// doc = documento onde está a linha (a página ou a janela flutuante)
function buildEnemyRow(doc, container, size, withLabels){
  if(!container) return;
  container.innerHTML = ENEMY_SLOTS.map(s => `
    <div class="enemy-col">
      <button class="enemy-dot" id="enemy-${s.id}" type="button" style="--ring:${s.color};${size ? `--d:${size}px` : ''}"><i class="face"></i><span class="lbl">${s.label}</span><span class="cd"></span></button>
      ${withLabels ? `<span class="enemy-dot-label" id="ename-${s.id}">${s.label}</span>` : ''}
    </div>
  `).join('');
  ENEMY_SLOTS.forEach(s=>{
    const btn = doc.getElementById(`enemy-${s.id}`);
    if(!btn) return;
    // toque curto = morreu; segurar meio segundo = trocar o personagem desta bolinha
    let timer = null, held = false;
    const stop = ()=>{ clearTimeout(timer); timer = null; };
    btn.addEventListener('pointerdown', ()=>{
      held = false; stop();
      timer = setTimeout(()=>{ held = true; timer = null; startFaceEdit(doc, s.id, true); }, 550);
    });
    ['pointerup','pointerleave','pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('click', ()=>{ if(held){ held = false; return; } markEnemyDead(s.id); });
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });
}

// começa a escolher personagens: em sequência (do 1º vazio) ou só um slot
function startFaceEdit(doc, slotId, single){
  if(!myTeam) return;
  const chars = state.chars[myTeam] || {};
  let start = ENEMY_SLOTS.findIndex(s => s.id === slotId);
  if(!single){
    start = ENEMY_SLOTS.findIndex(s => !chars[s.id]);
    if(start < 0) start = 0;
  }
  faceEdit = true;
  renderEnemies();
  runPicker({
    doc, count: ENEMY_SLOTS.length, start, single,
    label: i => `Inimigo · ${ENEMY_SLOTS[i].id === 'tank' ? 'Tank' : ENEMY_SLOTS[i].id === 'sup' ? 'Sup' : 'Jogador ' + ENEMY_SLOTS[i].label}`,
    get: i => (state.chars[myTeam] || {})[ENEMY_SLOTS[i].id] || '',
    set: (i, id) => setEnemyChar(ENEMY_SLOTS[i].id, id),
    onEnd: () => { faceEdit = false; renderEnemies(); }
  });
}
function toggleFaceEdit(doc){
  if(faceEdit){ closePicker(); faceEdit = false; renderEnemies(); return; }
  startFaceEdit(doc, null, false);
}
$('faceEditBtn').addEventListener('click', ()=> toggleFaceEdit(document));

/* ---------- contagens ---------- */

function liveDocs(){
  const docs = [document];
  if(pipWin && !pipWin.closed) docs.push(pipWin.document);
  return docs;
}

function renderEnemies(){
  if(!myTeam) return;
  const now = serverNow();
  const enemies = state.enemies[myTeam] || {};
  const chars = state.chars[myTeam] || {};

  liveDocs().forEach(doc=>{
    ENEMY_SLOTS.forEach(s=>{
      const dot = doc.getElementById(`enemy-${s.id}`);
      if(!dot) return;
      const c = chars[s.id] || '';
      const has = !!c && CHAR_IDX[c] !== undefined;
      const start = enemies[s.id];
      const elapsed = start ? (now - start) / 1000 : null;
      const dead = elapsed !== null && elapsed < CYCLE;
      const remaining = dead ? Math.max(0, Math.ceil(CYCLE - elapsed)) : '';

      if(has && dot.dataset.c !== c) setFace(dot.querySelector('.face'), c);
      dot.dataset.c = has ? c : '';
      dot.classList.toggle('has-face', has);
      dot.classList.toggle('dead', dead);
      dot.title = has ? charName(c) : '';
      const cd = dot.querySelector('.cd');
      if(cd.textContent !== String(remaining)) cd.textContent = remaining;
      const nm = doc.getElementById(`ename-${s.id}`);
      if(nm){
        const t = has ? shortName(c) : s.label;
        if(nm.textContent !== t){ nm.textContent = t; nm.title = has ? charName(c) : ''; }
      }
    });
    const row = doc.getElementById('enemyRow');
    if(row) row.classList.toggle('editing', faceEdit);
    const eb = doc.getElementById(doc === document ? 'faceEditBtn' : 'pfaceBtn');
    if(eb){
      eb.classList.toggle('on', faceEdit);
      eb.textContent = doc === document
        ? (faceEdit ? '✓ Terminar' : '✎ Escolher personagens')
        : (faceEdit ? '✓' : '✎');
    }
  });
}

function renderTimers(){
  const map = currentMapObj();
  if(!map || !myTeam) return;
  const now = serverNow();
  const docs = liveDocs();

  map.points.forEach(p=>{
    const start = (state.points[myTeam] || {})[p.id];
    const elapsed = start ? (now - start) / 1000 : null;
    const ready = elapsed !== null && elapsed >= CYCLE;
    const remaining = start ? Math.max(0, Math.ceil(CYCLE - elapsed)) : null;

    docs.forEach(doc=>{
      const card = doc.getElementById(`card-${p.id}`);
      if(!card) return;
      const ring = doc.getElementById(`ring-${p.id}`);
      const timeEl = doc.getElementById(`time-${p.id}`);
      const statusEl = doc.getElementById(`status-${p.id}`);
      const subEl = doc.getElementById(`sub-${p.id}`);
      const pring = doc.getElementById(`pring-${p.id}`);

      if(!start){
        if(ring) ring.style.strokeDashoffset = CIRC;
        if(timeEl) timeEl.textContent = '--';
        if(statusEl) statusEl.textContent = 'Aguardando';
        if(subEl) subEl.textContent = 'Sem uso registrado.';
        card.classList.remove('is-ready','pulse');
        if(pring) pring.style.setProperty('--pct','0%');
        return;
      }
      if(!ready){
        const progress = elapsed / CYCLE;
        if(ring) ring.style.strokeDashoffset = CIRC * (1 - progress);
        if(pring) pring.style.setProperty('--pct', Math.round(progress*100)+'%');
        if(timeEl) timeEl.textContent = remaining;
        if(statusEl) statusEl.textContent = 'Curando';
        if(subEl) subEl.textContent = `Disponível em ${remaining}s.`;
        card.classList.remove('is-ready','pulse');
      } else {
        if(ring) ring.style.strokeDashoffset = 0;
        if(pring) pring.style.setProperty('--pct','100%');
        if(timeEl) timeEl.textContent = '60+';
        if(statusEl) statusEl.textContent = 'Disponível';
        if(subEl) subEl.textContent = 'Ponto já renasceu.';
        card.classList.add('is-ready','pulse');
      }
    });

    if(ready && alertedFor[p.id] !== start){
      alertedFor[p.id] = start;
      if(elapsed < CYCLE + 4){        // só avisa se renasceu agora (não ao abrir a página)
        showBanner(`${p.label}: ponto de cura disponível`);
        if(soundOn) playBeep();
        if(navigator.vibrate){ try{ navigator.vibrate([120,60,120]); }catch(e){} }
      }
    }
  });
}

/* ---------- janela flutuante (Document Picture-in-Picture) ---------- */

function showPipNote(text, warn){
  pipNote.textContent = text;
  pipNote.classList.remove('hidden');
  pipNote.classList.toggle('warn', !!warn);
}

function buildFloatingDoc(win, map, team){
  const doc = win.document;
  doc.head.innerHTML = `
    <meta charset="UTF-8">
    <style>
      *{box-sizing:border-box;}
      html,body{margin:0;padding:0;background:#0A0E13;color:#EAF1F7;font-family:system-ui,-apple-system,Segoe UI,sans-serif;}
      .frow{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #232D38;}
      .frow:last-child{border-bottom:none;}
      .frow.is-ready{background:rgba(255,216,77,0.14);}
      .pring{--pct:0%;width:46px;height:46px;border-radius:50%;flex:none;position:relative;background:conic-gradient(${team.color} var(--pct), #232D38 0);display:flex;align-items:center;justify-content:center;}
      .pring::before{content:'';position:absolute;inset:5px;background:#0A0E13;border-radius:50%;}
      .pring span{position:relative;z-index:1;font-weight:700;font-size:13px;font-family:monospace;}
      .pinfo{flex:1;min-width:0;}
      .pname{font-weight:700;font-size:13px;}
      .pstatus{font-size:11px;color:#7E93A7;margin-top:1px;}
      .pbtn{border:none;border-radius:7px;padding:9px 12px;font-weight:700;font-size:11px;color:#0A0E13;cursor:pointer;text-transform:uppercase;background:${team.color};flex:none;}
      .pbtn:active{transform:scale(0.96);}
      .fhead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px 6px;}
      .fheader{font-size:11px;color:#7E93A7;}
      .fedit{background:#131A22;border:1px solid #232D38;color:#EAF1F7;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px;cursor:pointer;}
      .fedit.on{border-color:#FFD84D;color:#FFD84D;}
      .enemy-row{display:flex;gap:6px;padding:2px 12px 10px;border-bottom:1px solid #232D38;}
      .enemy-col{display:flex;}
      .enemy-dot{position:relative;width:var(--d);height:var(--d);border-radius:50%;flex:none;padding:0;overflow:hidden;
        border:3px solid var(--ring);background:var(--ring);cursor:pointer;touch-action:manipulation;
        font-family:monospace;font-weight:700;color:#0A0E13;user-select:none;-webkit-user-select:none;}
      .enemy-dot:active{transform:scale(.93);}
      .enemy-dot .face{--s:calc(var(--d) - 6px);position:absolute;left:0;top:0;border-radius:0;display:none;pointer-events:none;}
      .enemy-dot .lbl{font-size:11px;pointer-events:none;}
      .enemy-dot .cd{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:15px;color:#FF6B70;text-shadow:0 0 4px #000,0 0 2px #000;pointer-events:none;}
      .enemy-dot.has-face .face{display:block;}
      .enemy-dot.has-face .lbl{display:none;}
      .enemy-dot.dead{cursor:default;}
      .enemy-dot.dead .face{filter:grayscale(1) brightness(.35);}
      .enemy-dot.dead:not(.has-face){background:#4D5C6C;}
      .enemy-dot.dead .lbl{display:none;}
      .enemy-dot.dead .cd{display:flex;}
      .enemy-row.editing .enemy-dot{outline:2px dashed #FFD84D;outline-offset:1px;}
    </style>
  `;
  injectFaceCss(doc);
  const rowsHtml = map.points.map(p => `
    <div class="frow" id="card-${p.id}">
      <div class="pring" id="pring-${p.id}"><span id="time-${p.id}">--</span></div>
      <div class="pinfo">
        <div class="pname">${p.label}</div>
        <div class="pstatus" id="status-${p.id}">Aguardando</div>
      </div>
      <button class="pbtn" id="btn-${p.id}" type="button">Usei</button>
    </div>
  `).join('');
  doc.body.innerHTML = `
    <div class="fhead"><span class="fheader">${team.name} · ${map.name}</span><button class="fedit" id="pfaceBtn" type="button" title="Escolher personagens dos inimigos">&#9998;</button></div>
    <div class="enemy-row" id="enemyRow"></div>${rowsHtml}`;
  buildEnemyRow(doc, doc.getElementById('enemyRow'), 38, false);
  doc.getElementById('pfaceBtn').addEventListener('click', ()=> toggleFaceEdit(doc));
  map.points.forEach(p=>{
    doc.getElementById(`btn-${p.id}`).addEventListener('click', ()=>markPointUsed(p.id));
  });
  renderEnemies();
}

async function toggleFloating(){
  if(pipWin && !pipWin.closed){ pipWin.close(); return; }
  if(!('documentPictureInPicture' in window)){
    showPipNote('Modo flutuante clicável requer Chrome ou Edge atualizado (versão 116 ou mais recente) no computador.', true);
    return;
  }
  const map = currentMapObj();
  const team = currentTeamObj();
  if(!myTeam || !map){
    showPipNote('Selecione uma equipe e um mapa antes de abrir o modo flutuante.', true);
    return;
  }
  try{
    pipWin = await documentPictureInPicture.requestWindow({
      width: 320,
      height: Math.max(330, Math.min(560, 120 + map.points.length * 68))
    });
  }catch(e){
    showPipNote('Não foi possível abrir a janela flutuante agora. Tente de novo.', true);
    return;
  }
  buildFloatingDoc(pipWin, map, team);
  renderTimers();
  pipLabel.textContent = 'Fechar flutuante';
  pipNote.classList.add('hidden');
  pipWin.addEventListener('pagehide', ()=>{
    pipWin = null;
    closePicker();
    faceEdit = false;
    pipLabel.textContent = 'Modo flutuante';
    renderEnemies();
  });
}
function closeFloating(){
  if(pipWin && !pipWin.closed) pipWin.close();
  pipWin = null;
  pipLabel.textContent = 'Modo flutuante';
}
pipBtn.addEventListener('click', toggleFloating);

/* ---------- relógio de 1s (num Worker, para não ser freado com a aba em segundo plano) ---------- */

let tickN = 0;
function onTick(){
  tickN++;
  renderTimers();
  renderEnemies();
  if(tickN % 25 === 0) keepAlive();
}
function startTicker(){
  try{
    const blob = new Blob(['setInterval(function(){postMessage(1)},1000)'], {type:'text/javascript'});
    const w = new Worker(URL.createObjectURL(blob));
    w.onmessage = onTick;
  }catch(e){
    setInterval(onTick, 1000);
  }
}

function init(){
  buildChips();
  loadPrefs();
  renderSoundBtn();
  updateAdminUI();
  if(!('documentPictureInPicture' in window)){
    showPipNote('Modo flutuante clicável requer Chrome ou Edge atualizado (versão 116+) no computador.', true);
  }
  renderChips();
  renderMapSection();
  startTicker();
  if(canAuto() && location.host){
    setMode('boot');                       // já tem login salvo: tenta entrar sozinho
    connect();
    bootTimer = setTimeout(()=>{
      if(uiMode === 'boot') showLogin('Está demorando para conectar. Confira a internet (vou continuar tentando).', false);
    }, 10000);
  } else {
    showLogin(location.host ? '' : 'Abra pelo link do site, não pelo arquivo baixado.', false);
  }
}
