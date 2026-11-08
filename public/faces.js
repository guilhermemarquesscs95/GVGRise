/* ---------- rostos dos personagens + seletor rápido ---------- */
/* O arquivo chars.webp é uma "folha" com todos os rostos (11 colunas x 10 linhas, 104px cada).
   chars.js diz a posição de cada personagem. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const SPRITE_URL = new URL('chars.webp?v=1', location.href).href;
const CHAR_ROWS = Math.ceil(CHARS.length / CHAR_COLS);
const CHAR_IDX = {};
const CHAR_NAME = {};
CHARS.forEach(([id, name], i) => { CHAR_IDX[id] = i; CHAR_NAME[id] = name; });
const charName = (id) => CHAR_NAME[id] || id || '';

function normText(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

// HTML de um rosto quadrado (tamanho em px, ou uma expressão css como "calc(...)")
function faceHTML(id, size){
  const i = CHAR_IDX[id];
  const s = typeof size === 'number' ? size + 'px' : size;
  if(i === undefined) return `<i class="face empty" style="--s:${s}"></i>`;
  return `<i class="face" title="${esc(charName(id))}" style="--s:${s};--x:${i % CHAR_COLS};--y:${Math.floor(i / CHAR_COLS)}"></i>`;
}
// troca o rosto de um <i class="face"> que já existe na tela (sem recriar o elemento)
function setFace(el, id){
  const i = CHAR_IDX[id];
  if(i === undefined){ el.style.setProperty('--x', 0); el.style.setProperty('--y', 0); return false; }
  el.style.setProperty('--x', i % CHAR_COLS);
  el.style.setProperty('--y', Math.floor(i / CHAR_COLS));
  el.title = charName(id);
  return true;
}

const FACE_CSS = `
.face{display:inline-block;flex:none;width:var(--s,40px);height:var(--s,40px);border-radius:calc(var(--s,40px)*.16);
  background-color:#0F151C;background-image:url("${SPRITE_URL}");background-repeat:no-repeat;
  background-size:calc(var(--s,40px)*${CHAR_COLS}) calc(var(--s,40px)*${CHAR_ROWS});
  background-position:calc(var(--s,40px)*var(--x,0)*-1) calc(var(--s,40px)*var(--y,0)*-1);}
.face.empty{background-image:none;border:1.5px dashed #4D5C6C;}

.pk-overlay{position:fixed;inset:0;z-index:1000;background:rgba(5,8,12,.82);display:flex;align-items:flex-start;justify-content:center;
  padding:10px;overflow:auto;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#EAF1F7;}
.pk-box{width:100%;max-width:640px;background:#131A22;border:1px solid #2C3947;border-radius:14px;padding:12px;margin:auto 0;}
.pk-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
.pk-head b{font-size:14px;}
.pk-x{background:#0F151C;border:1px solid #232D38;color:#EAF1F7;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:14px;}
.pk-search{width:100%;background:#0F151C;border:1px solid #2C3947;color:#EAF1F7;border-radius:8px;padding:10px 12px;font-size:15px;margin-bottom:8px;}
.pk-actions{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.pk-actions button{background:#0F151C;border:1px solid #2C3947;color:#9FB2C4;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;}
.pk-sec{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7E93A7;margin:10px 2px 6px;}
.pk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:6px;}
.pk-item{background:#0F151C;border:1.5px solid transparent;border-radius:10px;padding:5px 2px 4px;cursor:pointer;color:#B9C7D4;
  display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;line-height:1.15;text-align:center;}
.pk-item:hover,.pk-item:focus{border-color:#3E8EF7;outline:none;}
.pk-item.first{border-color:#FFD84D;}
.pk-item.cur{border-color:#35C48C;}
.pk-item span{display:block;max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;}
.pk-none{color:#7E93A7;font-size:13px;padding:14px 4px;}
`;
function injectFaceCss(doc){
  const st = doc.createElement('style');
  st.textContent = FACE_CSS;
  doc.head.appendChild(st);
}
injectFaceCss(document);

/* ---------- recentes (ficam neste aparelho) ---------- */
const LS_RECENT = 'gvg_recent_chars';
function getRecent(){ try{ const r = JSON.parse(localStorage.getItem(LS_RECENT) || '[]'); return Array.isArray(r) ? r.filter(id => CHAR_IDX[id] !== undefined) : []; }catch(e){ return []; } }
function pushRecent(id){
  try{
    const r = getRecent().filter(x => x !== id);
    r.unshift(id);
    localStorage.setItem(LS_RECENT, JSON.stringify(r.slice(0, 18)));
  }catch(e){}
}

/* ---------- seletor ---------- */
let pickerEl = null;

function closePicker(){
  if(pickerEl && pickerEl.parentNode) pickerEl.parentNode.removeChild(pickerEl);
  pickerEl = null;
}

// opts: {title, current, onPick(id), onClear(), onSkip(), onClose()}
function openPicker(doc, opts){
  closePicker();
  const ov = doc.createElement('div');
  ov.className = 'pk-overlay';
  ov.innerHTML = `
    <div class="pk-box">
      <div class="pk-head"><b>${esc(opts.title || 'Escolha o personagem')}</b><button class="pk-x" type="button" aria-label="Fechar">&#10005;</button></div>
      <input class="pk-search" type="text" placeholder="Digite o nome… (Enter escolhe o primeiro)" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="pk-actions">
        ${opts.onClear ? '<button type="button" data-a="clear">Limpar este slot</button>' : ''}
        ${opts.onSkip ? '<button type="button" data-a="skip">Pular &rsaquo;</button>' : ''}
      </div>
      <div class="pk-body"></div>
    </div>`;
  doc.body.appendChild(ov);
  pickerEl = ov;
  const body = ov.querySelector('.pk-body');
  const search = ov.querySelector('.pk-search');
  const recent = getRecent();

  const item = (id, cls) => `<button type="button" class="pk-item ${cls || ''}${id === opts.current ? ' cur' : ''}" data-id="${id}">${faceHTML(id, 52)}<span>${esc(charName(id))}</span></button>`;

  function draw(){
    const q = normText(search.value).trim();
    let html = '';
    if(!q){
      if(recent.length) html += `<div class="pk-sec">Usados recentemente</div><div class="pk-grid">${recent.map(id => item(id)).join('')}</div>`;
      html += `<div class="pk-sec">Todos (${CHARS.length})</div><div class="pk-grid">${CHARS.map(c => item(c[0])).join('')}</div>`;
    } else {
      const words = q.split(/\s+/);
      const hits = CHARS.filter(c => { const n = normText(c[1]); return words.every(w => n.includes(w)); });
      html = hits.length
        ? `<div class="pk-grid">${hits.map((c, i) => item(c[0], i === 0 ? 'first' : '')).join('')}</div>`
        : '<div class="pk-none">Nenhum personagem com esse nome.</div>';
    }
    body.innerHTML = html;
  }
  draw();

  const pick = (id) => { pushRecent(id); if(opts.onPick) opts.onPick(id); };
  const dismiss = () => { closePicker(); if(opts.onClose) opts.onClose(); };

  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      const first = body.querySelector('.pk-item.first') || (search.value.trim() ? null : null);
      if(first) pick(first.dataset.id);
    } else if(e.key === 'Escape'){ dismiss(); }
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('.pk-item');
    if(b) pick(b.dataset.id);
  });
  ov.addEventListener('click', (e) => {
    if(e.target === ov || e.target.closest('.pk-x')) return dismiss();
    const a = e.target.closest('[data-a]');
    if(!a) return;
    if(a.dataset.a === 'clear' && opts.onClear) opts.onClear();
    if(a.dataset.a === 'skip' && opts.onSkip) opts.onSkip();
  });
  // no computador já deixa o cursor na busca; no celular não, para não abrir o teclado sem querer
  try{ if(doc.defaultView.matchMedia('(hover:hover) and (pointer:fine)').matches) search.focus(); }catch(e){}
}

/* ---------- preencher vários slots em sequência (ou só um) ----------
   cfg: {doc, count, label(i), get(i), set(i,id), start, single, onEnd()} */
function runPicker(cfg){
  const go = (i) => {
    if(i >= cfg.count){ closePicker(); if(cfg.onEnd) cfg.onEnd(); return; }
    openPicker(cfg.doc, {
      title: cfg.label(i) + (cfg.single ? '' : ` (${i + 1}/${cfg.count})`),
      current: cfg.get(i),
      onPick: (id) => { cfg.set(i, id); cfg.single ? go(cfg.count) : go(i + 1); },
      onClear: () => { cfg.set(i, ''); cfg.single ? go(cfg.count) : go(i + 1); },
      onSkip: cfg.single ? null : () => go(i + 1),
      onClose: () => { if(cfg.onEnd) cfg.onEnd(); },
    });
  };
  go(cfg.start || 0);
}
