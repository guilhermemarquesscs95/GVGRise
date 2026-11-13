/* ================= Aba PVE: montar PT, procurar PT e convites ================= */
let pveG = [], pveL = [], pveI = [];
let pveLoaded = false;
const pvf = {content: '', diff: '', record: false, day: ''};      // filtros
let pveForm = null;

const peMe = () => nickname || (isAdmin ? 'Admin' : '');
const peSame = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
const peAgo = (ts) => { const m = Math.max(0, Math.round((serverNow() - ts) / 60000)); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`; };

function resetPve(){ pveLoaded = false; pveG = []; pveL = []; pveI = []; }
function enterPve(){ if(!pveLoaded) send({t: 'pve_get'}, true); renderPve(); }
function onPve(m){ pveG = m.groups || []; pveL = m.lfg || []; pveI = m.invites || []; pveLoaded = true; if(currentTab === 'pve') renderPve(); }
function onPveDirty(){ if(pveLoaded || currentTab === 'pve') send({t: 'pve_get'}, true); }
function onPveSaved(){
  if(!pveForm) return;
  closePicker(); closeModal(); pveForm = null; showBanner('Salvo.');
}
const PVE_ERR = {sumiu: 'Isso não existe mais (alguém apagou ou expirou).', ja: 'Essa pessoa já está na PT ou já foi convidada.', vaga: 'Essa vaga já foi ocupada.',
  cheia: 'A PT está cheia.', limite: 'Limite atingido: apague alguma PT ou pedido antigo.', conteudo: 'Conteúdo inválido.', config: 'Dificuldade ou tamanho inválidos.'};
function onPveError(reason){
  const t = PVE_ERR[reason] || 'Não foi possível concluir. Tente de novo.';
  const el = $('peErr');
  if(el){ el.textContent = t; el.classList.remove('hidden'); const b = $('peSave'); if(b) b.disabled = false; }
  else showBanner(t);
}

/* ---------- disponibilidade (dias da semana e horários, horário de Brasília) ---------- */
const PE_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
function peDaysText(days){
  const d = [...days].sort((a, b) => a - b);
  if(d.length === 7) return 'Todos os dias';
  const out = []; let i = 0;
  while(i < d.length){
    let j = i; while(j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    out.push(j - i >= 2 ? `${PE_DAYS[d[i]]}–${PE_DAYS[d[j]]}` : d.slice(i, j + 1).map(x => PE_DAYS[x]).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}
const peAvailChips = (av) => av && av.length ? av.map(b => `<span class="av-chip"><b>${peDaysText(b.days)}</b> ${b.from}–${b.to}</span>`).join('') : '<span class="small-dim">horário a combinar</span>';
const peOverlap = (a, b) => !!(a && a.length && b && b.length) && a.some(x => b.some(y => x.days.some(d => y.days.includes(d)) && x.from < y.to && y.from < x.to));
const peHasDay = (av, d) => (av || []).some(b => b.days.includes(d));
const peAvOk = (av) => av.every(b => b.days.length && b.from && b.to && b.from < b.to);

/* ---------- peças visuais ---------- */
function pveIcon(key, size){
  const src = PVE_ICONS[key];
  const s = size || 36;
  return src ? `<img class="pe-ico" src="${src}" alt="" width="${s}" height="${s}" style="--s:${s}px">` : `<span class="pe-ico pe-ico-t" style="--s:${s}px">BR</span>`;
}
const peDiff = (d) => `<span class="df ${d}">${PVE_DIFF[d] || d}</span>`;
const peFixed = () => '<span class="df fix" title="PT fixa: continua na semana seguinte, depois do reset de sexta">FIXA</span>';
const peRec = () => '<span class="df rec" title="Modo record: tempo limite para ganhar bônus. Costuma ser para contas Endgame.">RECORD</span>';
const peRole = (r) => r === 'any' ? '<span class="rbadge" style="--c:#8A99A8">Livre</span>' : roleBadge(r);
const peFaces = (ids, size) => (ids || []).length ? facesInline(ids, size) : '<span class="small-dim">sem personagem indicado</span>';

/* ---------- cartões ---------- */
function groupCard(g){
  const C = PVE[g.content]; if(!C) return '';
  const me = peMe();
  const boss = isAdmin || peSame(g.owner, me);
  const inside = g.slots.some(s => peSame(s.nick, me));
  const open = g.slots.filter(s => !s.nick).length;
  const invs = pveI.filter(i => i.group === g.id);
  const fits = !inside && pveL.some(l => peSame(l.nick, me) && l.content === g.content && peOverlap(l.avail, g.avail));
  const bosses = C.bosses.length ? `<div class="pt-bosses"><span class="small-dim">Bosses ${boss ? '(clique para marcar os já feitos)' : ''}</span><div class="pt-bchips">${C.bosses.map(b => {
    const done = (g.bossesDone || []).includes(b);
    return `<${boss ? 'button type="button" data-act="tboss" data-g="' + g.id + '" data-b="' + b + '"' : 'span'} class="pt-boss${done ? ' done' : ''}" title="${PVE_BOSS_NAME[b]}${done ? ' · já feito' : ' · falta fazer'}">${pveIcon(b, 26)}<i>${PVE_BOSS_NAME[b]}</i>${done ? '<b>&#10003;</b>' : ''}</${boss ? 'button' : 'span'}>`;
  }).join('')}</div></div>` : '';
  const slots = g.slots.map((s, i) => `<div class="pt-slot${s.nick ? '' : ' vac'}">
      <div class="pt-role">${peRole(s.role)}</div>
      ${s.nick ? `<div class="pt-who">${avatarHTML(s.nick, 26)}<div><b>${esc(s.nick)}${peSame(s.nick, g.owner) ? ' <small class="own">dono</small>' : ''}${peSame(s.nick, me) ? ' <small class="own">você</small>' : ''}</b>${peFaces(s.chars, 24)}</div></div>`
        : '<div class="pt-who"><span class="small-dim">vaga aberta</span></div>'}
      <div class="pt-act">${s.nick ? (boss && !peSame(s.nick, g.owner) ? `<button class="mini-btn" type="button" data-act="kick" data-g="${g.id}" data-i="${i}" title="Remover da PT">&times;</button>` : '')
        : (!inside ? `<button class="mini-btn on" type="button" data-act="join" data-g="${g.id}" data-i="${i}">Entrar</button>` : '')}</div>
    </div>`).join('');
  return `<section class="pt-card${open ? '' : ' full'}${inside ? ' mine' : ''}">
    <header class="pt-head">${pveIcon(C.icon, 40)}
      <div class="pt-title"><b>${C.name}</b><div class="pt-tags">${peDiff(g.diff)}${g.record ? peRec() : ''}${g.fixed ? peFixed() : ''}${fits ? '<span class="df match" title="Seu horário (Procurando PT) combina com o desta PT">HORÁRIO COMBINA</span>' : ''}<span class="small-dim">${g.size} jogadores</span></div></div>
      <span class="pt-state ${open ? 'open' : 'closed'}">${open ? `${open} vaga${open > 1 ? 's' : ''}` : 'CHEIA'}</span>
    </header>
    <div class="av-row"><span class="small-dim">Horários</span><span class="av-chips">${peAvailChips(g.avail)}</span></div>
    ${g.note ? `<div class="pt-note">“${esc(g.note)}”</div>` : ''}
    ${bosses}
    <div class="pt-slots">${slots}</div>
    ${invs.length && boss ? `<div class="pt-invs"><span class="small-dim">Convidados:</span> ${invs.map(i => `<span class="inv-chip">${esc(i.to)}<button type="button" data-act="delinv" data-v="${i.id}" title="Cancelar convite">&times;</button></span>`).join('')}</div>` : ''}
    <footer class="pt-foot"><span class="small-dim">Dono: ${esc(g.owner)} · ${peAgo(g.ts)}${g.fixed ? ' · fixa: segue após o reset de sexta' : ' · acaba no reset de sexta'}</span>
      <span class="pt-btns">${inside ? `<button class="mini-btn" type="button" data-act="leave" data-g="${g.id}">Sair</button>` : ''}
      ${boss ? `<button class="mini-btn" type="button" data-act="editg" data-g="${g.id}">Editar</button><button class="mini-btn" type="button" data-act="delg" data-g="${g.id}">Apagar PT</button>` : ''}</span></footer>
  </section>`;
}

function lfgCard(l){
  const C = PVE[l.content]; if(!C) return '';
  const me = peMe();
  const mine = isAdmin || peSame(l.nick, me);
  const targets = pveG.filter(g => g.content === l.content && peSame(g.owner, me) && g.slots.some(s => !s.nick) && !g.slots.some(s => peSame(s.nick, l.nick)) && !pveI.some(i => i.group === g.id && peSame(i.to, l.nick)));
  const tname = (g) => `${C.name} ${PVE_DIFF[g.diff]}${g.record ? ' (record)' : ''}${peOverlap(l.avail, g.avail) ? ' · horário combina' : ''}`;
  const fitsL = peSame(l.nick, me) ? false : pveG.some(g => peSame(g.owner, me) && g.content === l.content && peOverlap(l.avail, g.avail));
  const inv = peSame(l.nick, me) ? '' : targets.length === 1
    ? `<button class="mini-btn on" type="button" data-act="inv" data-l="${l.nick ? esc(l.nick) : ''}" data-g="${targets[0].id}">Convidar para a minha PT</button>`
    : targets.length > 1 ? `<select data-act="invsel" data-l="${esc(l.nick)}"><option value="">Convidar para…</option>${targets.map(g => `<option value="${g.id}">${esc(tname(g))}</option>`).join('')}</select>` : '';
  return `<section class="pt-card lfg${peSame(l.nick, me) ? ' mine' : ''}">
    <header class="pt-head">${avatarHTML(l.nick, 40)}
      <div class="pt-title"><b>${esc(l.nick)}</b><div class="pt-tags">${pveIcon(C.icon, 20)}<span>${C.name}</span>${peDiff(l.diff)}${l.record ? peRec() : ''}${fitsL ? '<span class="df match" title="O horário dele combina com o da sua PT">HORÁRIO COMBINA</span>' : ''}</div></div>
      <span class="small-dim">${peAgo(l.ts)}</span>
    </header>
    <div class="lfg-row"><span class="small-dim">Joga de</span><span class="rbadges">${(l.roles || []).length ? l.roles.map(peRole).join('') : '<span class="small-dim">qualquer função</span>'}</span></div>
    <div class="lfg-row"><span class="small-dim">Personagens</span>${peFaces(l.chars, 28)}</div>
    <div class="av-row"><span class="small-dim">Horários</span><span class="av-chips">${peAvailChips(l.avail)}</span></div>
    ${l.note ? `<div class="pt-note">“${esc(l.note)}”</div>` : ''}
    <footer class="pt-foot"><span class="pt-btns">${inv}</span>
      <span class="pt-btns">${mine ? `<button class="mini-btn" type="button" data-act="editl" data-l="${l.id}">Editar</button><button class="mini-btn" type="button" data-act="dell" data-l="${l.id}">Remover</button>` : ''}</span></footer>
  </section>`;
}

function inviteBanner(i){
  const g = pveG.find(x => x.id === i.group); if(!g) return '';
  const C = PVE[g.content]; if(!C) return '';
  const open = g.slots.filter(s => !s.nick).length;
  return `<div class="inv-box">${pveIcon(C.icon, 34)}<div><b>${esc(i.by)}</b> te convidou para <b>${C.name}</b> ${peDiff(g.diff)}${g.record ? peRec() : ''}<div class="small-dim">${open ? open + ' vaga(s) aberta(s)' : 'PT cheia'} · ${peAgo(i.ts)}</div></div>
    <span class="pt-btns"><button class="mini-btn on" type="button" data-act="acc" data-v="${i.id}"${open ? '' : ' disabled'}>Aceitar</button><button class="mini-btn" type="button" data-act="rej" data-v="${i.id}">Recusar</button></span></div>`;
}

function renderPve(){
  if(uiMode !== 'app' || !tabPve) return;
  const me = peMe();
  const okF = (x) => (!pvf.content || x.content === pvf.content) && (!pvf.diff || x.diff === pvf.diff) && (!pvf.record || x.record) && (!pvf.day || peHasDay(x.avail, Number(pvf.day) - 1));
  const gs = pveG.filter(okF).sort((a, b) => (b.slots.some(s => !s.nick) - a.slots.some(s => !s.nick)) || b.ts - a.ts);
  const ls = pveL.filter(okF).sort((a, b) => b.ts - a.ts);
  const sel = (key, v, label) => `<option value="${v}"${pvf[key] === v ? ' selected' : ''}>${label}</option>`;
  const hasF = pvf.content || pvf.diff || pvf.record || pvf.day;
  const myInv = pveI.filter(i => peSame(i.to, me));
  tabPve.innerHTML = `<div class="an-top">
      <div class="filters">
        <select data-act="fc" class="${pvf.content ? 'active' : ''}">${sel('content', '', 'Todos os conteúdos')}${PVE_IDS.map(k => sel('content', k, PVE[k].name)).join('')}</select>
        <select data-act="fd" class="${pvf.diff ? 'active' : ''}">${sel('diff', '', 'Qualquer dificuldade')}${Object.keys(PVE_DIFF).map(k => sel('diff', k, PVE_DIFF[k])).join('')}</select>
        <select data-act="fday" class="${pvf.day ? 'active' : ''}"><option value="">Qualquer dia</option>${PE_DAYS.map((n, i) => `<option value="${i + 1}"${pvf.day === String(i + 1) ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <label class="chk-inline"><input type="checkbox" data-act="fr"${pvf.record ? ' checked' : ''}> Só record</label>
        ${hasF ? '<button class="mini-btn" type="button" data-act="clear">Limpar filtros</button>' : ''}
      </div>
      <div class="filters"><button class="mini-btn on" type="button" data-act="newg">+ Montar PT</button><button class="mini-btn on" type="button" data-act="newl">+ Procurar PT</button></div>
    </div>
    ${myInv.length ? `<div class="inv-list">${myInv.map(inviteBanner).join('')}</div>` : ''}
    ${!pveLoaded ? '<div class="placeholder">Carregando PTs...</div>' : `<div class="pve-cols">
      <div><h3 class="pve-h">PTs disponíveis <small>${gs.length}</small></h3>${gs.length ? gs.map(groupCard).join('') : '<div class="an-card"><div class="empty-box">Nenhuma PT montada' + (hasF ? ' neste filtro' : '') + '.<br>Clique em <b>+ Montar PT</b> para criar a sua.</div></div>'}</div>
      <div><h3 class="pve-h">Procurando PT <small>${ls.length}</small></h3>${ls.length ? ls.map(lfgCard).join('') : '<div class="an-card"><div class="empty-box">Ninguém procurando PT' + (hasF ? ' neste filtro' : '') + '.<br>Quer entrar numa? Clique em <b>+ Procurar PT</b>.</div></div>'}</div>
    </div>
    <p class="note-low" style="margin-top:12px">O conteúdo PVE reseta toda sexta 00:00 (virada de quinta para sexta): PT fixa continua com os mesmos membros e os bosses feitos zerados; PT não fixa acaba. Pedidos e convites somem sozinhos depois de 24 h sem atualização.</p>`}`;
}

/* ---------- ações nos cartões ---------- */
tabPve.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if(!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const d = el.dataset;
  switch(d.act){
    case 'clear': pvf.content = ''; pvf.diff = ''; pvf.record = false; pvf.day = ''; break;
    case 'newg': return openPveForm('pt', null);
    case 'newl': return openPveForm('lfg', null);
    case 'editg': return openPveForm('pt', pveG.find(g => g.id === d.g));
    case 'editl': return openPveForm('lfg', pveL.find(l => l.id === d.l));
    case 'join': return openPveJoin(d.g, Number(d.i), null);
    case 'acc': { const inv = pveI.find(i => i.id === d.v); if(inv) openPveJoin(inv.group, -1, inv.id); return; }
    case 'rej': send({t: 'pve_invite_reply', id: d.v, accept: false}); return;
    case 'leave': if(confirm('Sair desta PT?')) send({t: 'pve_leave', id: d.g}); return;
    case 'kick': { const g = pveG.find(x => x.id === d.g); const s = g && g.slots[Number(d.i)]; if(s && confirm(`Remover ${s.nick} da PT?`)) send({t: 'pve_kick', id: d.g, slot: Number(d.i)}); return; }
    case 'delg': if(confirm('Apagar esta PT?')) send({t: 'pve_group_del', id: d.g}); return;
    case 'dell': send({t: 'pve_lfg_del', id: d.l}); return;
    case 'delinv': send({t: 'pve_invite_del', id: d.v}); return;
    case 'inv': send({t: 'pve_invite', group: d.g, to: d.l}); showBanner('Convite enviado.'); return;
    case 'tboss': {
      const g = pveG.find(x => x.id === d.g); if(!g) return;
      const done = new Set(g.bossesDone || []); if(done.has(d.b)) done.delete(d.b); else done.add(d.b);
      g.bossesDone = [...done]; renderPve();
      send({t: 'pve_group_save', group: {id: g.id, diff: g.diff, record: g.record, fixed: g.fixed, note: g.note, bossesDone: g.bossesDone}});
      return;
    }
    default: return;
  }
  renderPve();
});
tabPve.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]'); if(!el) return;
  switch(el.dataset.act){
    case 'fc': pvf.content = el.value; break;
    case 'fd': pvf.diff = el.value; break;
    case 'fr': pvf.record = el.checked; break;
    case 'fday': pvf.day = el.value; break;
    case 'invsel': if(el.value){ send({t: 'pve_invite', group: el.value, to: el.dataset.l}); showBanner('Convite enviado.'); } return;
    default: return;
  }
  renderPve();
});

/* ---------- formulários: montar PT / procurar PT / entrar ---------- */
const peFaceBtn = (i, id) => `<button type="button" class="face-btn${id ? ' set' : ''}" data-pc="${i}" id="peb-${i}" title="${id ? esc(charName(id)) : 'Escolher personagem'}">${id ? faceHTML(id, 42) : '+'}</button>`;
const peUpd = (i) => { const b = $('peb-' + i); if(b) b.outerHTML = peFaceBtn(i, pveForm.chars[i]); };
function peCharsMax(f){
  if(f.type === 'lfg') return 6;
  const g = f.type === 'join' ? pveG.find(x => x.id === f.group) : null;
  return g ? pveMaxChars(g.content, g.diff) : pveMaxChars(f.content, f.diff);
}
function peFit(f){ const n = peCharsMax(f); f.chars = Array.from({length: n}, (_, i) => f.chars[i] || ''); }
function peCharsHTML(f){
  const n = peCharsMax(f);
  const hint = f.type === 'lfg' ? 'até 6, os que você pode jogar'
    : n === 4 ? 'até 4 candidatos que você pode jogar' : n === 2 ? 'você leva 2 personagens' : 'o personagem que você vai jogar';
  return `<div class="sec-head"><span>Personagens <span class="small-dim">(${hint})</span></span></div>
    <div class="face-row">${f.chars.map((id, i) => `<div class="face-cell">${peFaceBtn(i, id)}<span>${i + 1}</span></div>`).join('')}</div>`;
}

function openPveForm(type, rec){
  if(type === 'pt'){
    const content = rec ? rec.content : (pvf.content || 'enies');
    const C = PVE[content];
    pveForm = rec ? {type, id: rec.id, content, diff: rec.diff, size: rec.size, record: !!rec.record, fixed: !!rec.fixed, avail: JSON.parse(JSON.stringify(rec.avail || [])), note: rec.note || '', bosses: [...(rec.bossesDone || [])], mySlot: 0, chars: []}
      : {type, id: '', content, diff: C.diffs[C.diffs.length - 1] === 'hard' && C.diffs.includes('elite') ? 'elite' : C.diffs[0], size: C.sizes[0], record: false, fixed: false, avail: [], note: '', bosses: [], mySlot: 0, chars: []};
  } else {
    const content = rec ? rec.content : (pvf.content || 'enies');
    const C = PVE[content];
    pveForm = rec ? {type, id: rec.id, content, diff: rec.diff, record: !!rec.record, roles: [...(rec.roles || [])], chars: [...(rec.chars || [])].slice(0, 6), avail: JSON.parse(JSON.stringify(rec.avail || [])), note: rec.note || ''}
      : {type, id: '', content, diff: C.diffs.includes('elite') ? 'elite' : C.diffs[0], record: false, roles: [], chars: [], avail: [], note: ''};
  }
  if(!pveForm.chars.length || pveForm.id === '' || type === 'lfg') peFit(pveForm);
  if(type === 'pt' && pveForm.id) pveForm.chars = [];
  renderPveForm();
}
function openPveJoin(gid, slot, invId){
  const g = pveG.find(x => x.id === gid); if(!g) return;
  const open = g.slots.map((s, i) => ({s, i})).filter(x => !x.s.nick);
  if(!open.length) return showBanner('A PT está cheia.');
  const mineL = pveL.find(l => peSame(l.nick, peMe()) && l.content === g.content);
  pveForm = {type: 'join', group: gid, inv: invId, slot: slot >= 0 && !g.slots[slot].nick ? slot : open[0].i, chars: mineL ? [...mineL.chars] : []};
  peFit(pveForm);
  renderPveForm();
}

function renderPveForm(){
  const f = pveForm;
  let body = '';
  if(f.type === 'join'){
    const g = pveG.find(x => x.id === f.group); const C = PVE[g.content];
    const opts = g.slots.map((s, i) => ({s, i})).filter(x => !x.s.nick);
    body = `<h3>Entrar na PT</h3>
      <p class="small-dim" style="margin-bottom:10px">${pveIcon(C.icon, 20)} ${C.name} ${peDiff(g.diff)}${g.record ? peRec() : ''} · dono ${esc(g.owner)}</p>
      <label class="f" for="peSlot">Sua vaga</label>
      <select class="nick-input" id="peSlot">${opts.map(x => `<option value="${x.i}"${x.i === f.slot ? ' selected' : ''}>${PVE_ROLE_LABEL[x.s.role]}${x.s.role === 'any' ? ' (qualquer DPS)' : ''}</option>`).join('')}</select>
      ${peCharsHTML(f)}`;
  } else {
    const C = PVE[f.content];
    const canRec = C.record && f.diff === 'hard';
    const common = `<label class="f" for="peDiff">Dificuldade</label>
      <select class="nick-input" id="peDiff">${C.diffs.map(d => `<option value="${d}"${d === f.diff ? ' selected' : ''}>${PVE_DIFF[d]}</option>`).join('')}</select>
      ${canRec ? `<label class="pv-ranked"><input type="checkbox" id="peRec"${f.record ? ' checked' : ''}><span><b>Modo record</b><small>tempo limite para ganhar bônus (geralmente contas Endgame)</small></span></label>` : ''}`;
    if(f.type === 'pt'){
      body = `<h3>${f.id ? 'Editar PT' : 'Montar PT'}</h3>
        <label class="f" for="peCont">Conteúdo</label>
        <select class="nick-input" id="peCont"${f.id ? ' disabled' : ''}>${PVE_IDS.map(k => `<option value="${k}"${k === f.content ? ' selected' : ''}>${PVE[k].name}</option>`).join('')}</select>
        ${common}
        ${C.sizes.length > 1 ? `<label class="f">Jogadores</label><div class="seg">${C.sizes.map(s => `<button type="button" data-size="${s}" aria-pressed="${f.size === s}"${f.id ? ' disabled' : ''}>${s}</button>`).join('')}</div>` : `<p class="small-dim" style="margin-top:8px">${f.size} jogadores${f.content === 'rush' ? ' (cada um leva 2 personagens)' : ''}.</p>`}
        ${C.bosses.length ? `<div class="sec-head"><span>Bosses já feitos <span class="small-dim">(opcional)</span></span></div><div class="pt-bchips">${C.bosses.map(b => `<button type="button" class="pt-boss${f.bosses.includes(b) ? ' done' : ''}" data-bd="${b}">${pveIcon(b, 26)}<i>${PVE_BOSS_NAME[b]}</i>${f.bosses.includes(b) ? '<b>&#10003;</b>' : ''}</button>`).join('')}</div>` : ''}
        <label class="pv-ranked"><input type="checkbox" id="peFix"${f.fixed ? ' checked' : ''}><span><b>PT fixa</b><small>o PVE reseta toda sexta 00:00. Fixa: continua na semana seguinte com os mesmos membros. Não fixa: acaba no reset.</small></span></label>
        ${f.id ? '' : `${f.content === 'rush' ? '' : `<label class="f" for="peMy" style="margin-top:12px">Sua função na PT</label>
          <select class="nick-input" id="peMy">${pveSlotRoles(f.content, f.size).map((r, i) => `<option value="${i}"${i === f.mySlot ? ' selected' : ''}>${PVE_ROLE_LABEL[r]}${r === 'any' ? ' (qualquer DPS)' : ''}</option>`).join('')}</select>`}
          ${peCharsHTML(f)}`}
        ${peAvailHTML(f, 'Quando vamos jogar')}
        <label class="f" for="peNote" style="margin-top:12px">Observação (opcional)</label>
        <input class="nick-input" id="peNote" type="text" maxlength="120" value="${esc(f.note)}" placeholder="ex.: só quem já fez o Hard">`;
    } else {
      body = `<h3>${f.id ? 'Editar pedido' : 'Procurar PT'}</h3>
        <label class="f" for="peCont">Conteúdo</label>
        <select class="nick-input" id="peCont">${PVE_IDS.map(k => `<option value="${k}"${k === f.content ? ' selected' : ''}>${PVE[k].name}</option>`).join('')}</select>
        ${common}
        <label class="f" style="margin-top:12px">Funções que você joga</label>
        <div class="rbadges peroles">${['tank', 'support', 'ranged', 'melee'].map(r => `<button type="button" class="rchip" data-role="${r}" data-on="${f.roles.includes(r)}" style="--c:${ROLE_BY_ID[r].color}">${PVE_ROLE_LABEL[r]}</button>`).join('')}</div>
        ${peCharsHTML(f)}
        ${peAvailHTML(f, 'Quando posso jogar')}
        <label class="f" for="peNote" style="margin-top:12px">Observação (opcional)</label>
        <input class="nick-input" id="peNote" type="text" maxlength="120" value="${esc(f.note)}" placeholder="ex.: prefiro quem tem experiência">`;
    }
  }
  openModal(`${body}<p class="form-err hidden" id="peErr"></p>
    <div class="modal-actions"><button class="primary-btn" id="peSave" type="button">${f.type === 'join' ? 'Entrar' : 'Salvar'}</button><button class="ghost-btn" id="peCancel" type="button">Cancelar</button></div>`, true);
  const box = $('modalBox');
  box.addEventListener('input', (e) => {
    const t = e.target;
    if(t.id === 'peNote') f.note = t.value;
    else if(t.dataset && t.dataset.at){ f.avail[Number(t.dataset.b)][t.dataset.at] = t.value; }
  });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if(t.id === 'peCont'){ const C = PVE[t.value]; f.content = t.value; f.diff = C.diffs.includes(f.diff) ? f.diff : (C.diffs.includes('elite') ? 'elite' : C.diffs[0]); f.size = C.sizes.includes(f.size) ? f.size : C.sizes[0]; f.bosses = []; f.fixed = false; f.mySlot = 0; if(!(C.record && f.diff === 'hard')) f.record = false; peFit(f); renderPveForm(); }
    else if(t.id === 'peDiff'){ f.diff = t.value; if(!(PVE[f.content].record && f.diff === 'hard')) f.record = false; peFit(f); renderPveForm(); }
    else if(t.id === 'peRec') f.record = t.checked;
    else if(t.id === 'peFix') f.fixed = t.checked;
    else if(t.id === 'peMy') f.mySlot = Number(t.value);
    else if(t.id === 'peSlot') f.slot = Number(t.value);
  });
  box.addEventListener('click', (e) => {
    const t = e.target;
    const ad = t.closest('[data-ad]'); if(ad){ const b = f.avail[Number(ad.dataset.b)], d = Number(ad.dataset.ad); b.days = b.days.includes(d) ? b.days.filter(x => x !== d) : [...b.days, d].sort((x, y) => x - y); ad.setAttribute('aria-pressed', String(b.days.includes(d))); return; }
    const pre = t.closest('[data-apre]'); if(pre){ const b = f.avail[Number(pre.dataset.b)]; b.days = {all: [0, 1, 2, 3, 4, 5, 6], util: [0, 1, 2, 3, 4], fds: [5, 6]}[pre.dataset.apre]; renderPveForm(); return; }
    if(t.closest('[data-aadd]')){ if(f.avail.length < 7){ f.avail.push({days: [], from: '20:00', to: '23:00'}); renderPveForm(); } return; }
    const rm = t.closest('[data-arm]'); if(rm){ f.avail.splice(Number(rm.dataset.arm), 1); renderPveForm(); return; }
    const sz = t.closest('[data-size]'); if(sz && !sz.disabled){ f.size = Number(sz.dataset.size); f.mySlot = 0; renderPveForm(); return; }
    const bd = t.closest('[data-bd]'); if(bd){ const b = bd.dataset.bd; f.bosses = f.bosses.includes(b) ? f.bosses.filter(x => x !== b) : [...f.bosses, b]; renderPveForm(); return; }
    const rc = t.closest('[data-role]'); if(rc){ const r = rc.dataset.role; f.roles = f.roles.includes(r) ? f.roles.filter(x => x !== r) : [...f.roles, r]; rc.dataset.on = String(f.roles.includes(r)); return; }
    const fb = t.closest('[data-pc]'); if(fb){ pePick(Number(fb.dataset.pc)); return; }
    const id = t.closest('button') && t.closest('button').id;
    if(id === 'peCancel'){ closePicker(); closeModal(); pveForm = null; }
    else if(id === 'peSave') peSave();
  });
}
function peAvailHTML(f, title){
  return `<div class="sec-head" style="margin-top:12px"><span>${title} <span class="small-dim">(horário de Brasília, opcional)</span></span></div>
    <div class="av-ed">${f.avail.map((b, i) => `<div class="av-block">
        <div class="av-days">${PE_DAYS.map((n, d) => `<button type="button" class="rchip av-d" data-ad="${d}" data-b="${i}" aria-pressed="${b.days.includes(d)}">${n}</button>`).join('')}</div>
        <div class="av-times"><input type="time" class="nick-input" data-at="from" data-b="${i}" value="${b.from}"> <span class="small-dim">até</span> <input type="time" class="nick-input" data-at="to" data-b="${i}" value="${b.to}">
          <span class="av-pre"><button type="button" class="mini-btn" data-apre="util" data-b="${i}">Seg–Sex</button><button type="button" class="mini-btn" data-apre="fds" data-b="${i}">Fim de semana</button><button type="button" class="mini-btn" data-apre="all" data-b="${i}">Todos</button></span>
          <button type="button" class="mini-btn" data-arm="${i}" title="Remover este horário">&times;</button></div>
      </div>`).join('')}
      ${f.avail.length < 7 ? '<button type="button" class="mini-btn on" data-aadd="1">+ Adicionar horário</button>' : ''}</div>`;
}
function pePick(i){
  const f = pveForm;
  runPicker({doc: document, count: f.chars.length, start: i, single: true, label: n => `Personagem ${n + 1}`,
    get: n => f.chars[n] || '',
    set: (n, id) => { if(id) f.chars.forEach((x, k) => { if(k !== n && x === id){ f.chars[k] = ''; peUpd(k); } }); f.chars[n] = id; peUpd(n); }});
}
function peSave(){
  const f = pveForm;
  const chars = f.chars.filter(Boolean);
  let msg;
  if(f.type !== 'join' && !peAvOk(f.avail)){ const el = $('peErr'); el.textContent = 'Confira os horários: marque os dias e use um início menor que o fim (o horário vale no mesmo dia; para passar da meia-noite, crie outro bloco).'; el.classList.remove('hidden'); return; }
  if(f.type === 'join'){
    msg = {t: f.inv ? 'pve_invite_reply' : 'pve_join', slot: f.slot, chars};
    if(f.inv){ msg.id = f.inv; msg.accept = true; } else msg.id = f.group;
    if(!send(msg)) return;
    if(f.inv){ closePicker(); closeModal(); pveForm = null; showBanner('Você entrou na PT.'); return; }
  } else if(f.type === 'pt'){
    const group = {id: f.id || undefined, content: f.content, diff: f.diff, size: f.size, record: f.record, fixed: f.fixed, avail: f.avail, note: f.note.trim(), bossesDone: f.bosses};
    if(!f.id){ group.mySlot = f.mySlot; group.chars = chars; }
    if(!send({t: 'pve_group_save', group})) return;
  } else {
    if(!send({t: 'pve_lfg_save', lfg: {id: f.id || undefined, content: f.content, diff: f.diff, record: f.record, roles: f.roles, chars, avail: f.avail, note: f.note.trim()}})) return;
  }
  const b = $('peSave'); if(b) b.disabled = true;
}
