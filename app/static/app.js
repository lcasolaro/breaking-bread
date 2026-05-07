// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(n, decimals = 0) {
  if (n == null) return '—';
  const v = Math.round(Math.abs(n) * Math.pow(10, decimals)) / Math.pow(10, decimals);
  const s = v.toFixed(decimals);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtG(n) { return fmt(n, 1) + ' g'; }

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ── Tab navigation ────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'party') renderPartyRecipes();
    if (btn.dataset.tab === 'varianti') renderVariantiTab();
  });
});

// ── State ─────────────────────────────────────────────────────────────────────

function getRecipeEmoji(name) {
  if (!name) return '🍕';
  const n = name.toLowerCase();
  if (n.includes('napoletana') || n.includes('napolit')) return '🍕';
  if (n.includes('teglia')) return '🫓';
  if (n.includes('focaccia')) return '🫓';
  if (n.includes('lioniello')) return '🦁';
  if (n.includes('michele') || n.includes('micheli')) return '👨‍🍳';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('pane') || n.includes('bread')) return '🍞';
  return '🍕';
}

let allRecipes = [];
let allVariants = [];
let variantiSelectedRecipeId = null;
let editingRecipe = null;

// ── Load data ─────────────────────────────────────────────────────────────────

async function loadRecipes() {
  try {
    [allRecipes, allVariants] = await Promise.all([
      api('GET', '/api/recipes'),
      api('GET', '/api/variants'),
    ]);
    renderRecipeGrid();
  } catch (e) {
    toast('Errore caricamento ricette', 'error');
  }
}

// ── Recipes grid ──────────────────────────────────────────────────────────────

function renderRecipeGrid() {
  const grid = document.getElementById('recipes-grid');
  if (!allRecipes.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>Nessuna ricetta trovata.</p>
        <button class="btn btn-primary" onclick="triggerImport()">Importa da Excel</button>
      </div>`;
    return;
  }
  grid.innerHTML = allRecipes.map(r => recipeCardHTML(r)).join('');
  grid.querySelectorAll('.recipe-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleRecipeDetails(btn));
  });
  grid.querySelectorAll('.btn-edit-recipe').forEach(btn => {
    btn.addEventListener('click', () => openEditRecipe(parseInt(btn.dataset.id)));
  });
  grid.querySelectorAll('.btn-delete-recipe').forEach(btn => {
    btn.addEventListener('click', () => deleteRecipe(parseInt(btn.dataset.id)));
  });
  grid.querySelectorAll('.btn-order-up').forEach(btn => {
    btn.addEventListener('click', () => reorderRecipe(parseInt(btn.dataset.id), -1));
  });
  grid.querySelectorAll('.btn-order-down').forEach(btn => {
    btn.addEventListener('click', () => reorderRecipe(parseInt(btn.dataset.id), 1));
  });
}

function recipeCardHTML(r) {
  const idx = allRecipes.findIndex(x => x.id === r.id);
  const isFirst = idx === 0;
  const isLast  = idx === allRecipes.length - 1;

  const metaHTML = [];
  if (r.description) metaHTML.push(`<div class="recipe-desc">${r.description}</div>`);
  if (r.notes) metaHTML.push(`<div class="recipe-note">${r.notes.length > 90 ? r.notes.slice(0,87)+'...' : r.notes}</div>`);
  const metaBlock = metaHTML.length ? `<div class="recipe-meta">${metaHTML.join('')}</div>` : '';

  return `
<div class="recipe-card" data-recipe-id="${r.id}">
  <div class="recipe-card-header">
    <div>
      <div class="recipe-name">${getRecipeEmoji(r.name)} ${r.name}</div>
      ${metaBlock}
    </div>
    <div class="recipe-actions">
      <button class="btn-order btn-order-up" data-id="${r.id}" ${isFirst ? 'disabled' : ''} title="Sposta su">↑</button>
      <button class="btn-order btn-order-down" data-id="${r.id}" ${isLast ? 'disabled' : ''} title="Sposta giù">↓</button>
      <button class="btn-icon btn-edit-recipe" data-id="${r.id}" title="Modifica">✏️</button>
      <button class="btn-icon btn-delete-recipe" data-id="${r.id}" title="Elimina">🗑️</button>
    </div>
  </div>
  <button class="recipe-expand-btn" data-recipe-id="${r.id}">
    <span>Mostra ingredienti e procedimento</span>
    <span class="expand-icon">▾</span>
  </button>
  <div class="recipe-details" id="details-${r.id}"></div>
</div>`;
}

async function toggleRecipeDetails(btn) {
  const recipeId = parseInt(btn.dataset.recipeId);
  const details = document.getElementById('details-' + recipeId);
  const icon = btn.querySelector('.expand-icon');
  const isOpen = details.classList.contains('open');

  if (isOpen) {
    details.classList.remove('open');
    icon.classList.remove('open');
    btn.querySelector('span').textContent = 'Mostra ingredienti e procedimento';
    return;
  }

  btn.querySelector('span').textContent = 'Caricamento...';
  try {
    const recipe = await api('GET', `/api/recipes/${recipeId}`);
    details.innerHTML = recipeDetailsHTML(recipe);
    details.classList.add('open');
    icon.classList.add('open');
    btn.querySelector('span').textContent = 'Nascondi dettagli';

    details.querySelectorAll('.param-pct, .proc-input').forEach(inp => {
      inp.addEventListener('input', debounce(() => onParamChange(recipeId, recipe), 200));
    });
    onParamChange(recipeId, recipe);
  } catch (e) {
    toast('Errore caricamento dettagli', 'error');
    btn.querySelector('span').textContent = 'Mostra ingredienti e procedimento';
  }
}

function recipeDetailsHTML(recipe) {
  const extras = recipe.extra_ingredients || [];

  const extraRowsForSection = (section) => extras
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => (e.section || 'chiusura') === section)
    .map(({ e, i }) => `
    <div class="prep-row">
      <span>${e.name}</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-extra-idx="${i}" data-extra-section="${section}" min="0" step="0.1" value="${e.pct || 0}">%</span>
      <span class="prep-row-grams" data-calc="extra-g-${i}">—</span>
    </div>`).join('');

  const notesHTML = recipe.notes
    ? `<div style="padding:10px 18px; font-size:.82rem; color:var(--text-3); border-top:1px solid var(--border)">${recipe.notes}</div>`
    : '';

  return `
<div class="params-widget" data-recipe-id="${recipe.id}">
  <div class="params-grid">
    <div class="param-field">
      <label>Numero panetti</label>
      <input type="number" class="param-pct" data-param="pieces" min="1" value="${recipe.default_pieces}">
    </div>
    <div class="param-field">
      <label>Peso panetto (g)</label>
      <input type="number" class="param-pct" data-param="weight" min="50" step="5" value="${recipe.default_ball_g}">
    </div>
    <div class="param-field">
      <label>Idratazione (%)</label>
      <input type="number" class="param-pct" data-param="hydration" min="40" max="100" step="1" value="${recipe.hydration_pct}">
    </div>
    <div class="param-field">
      <label>BIGA (%)</label>
      <input type="number" class="param-pct" data-param="biga" min="0" max="100" step="5" value="${recipe.biga_pct}">
    </div>
    <div class="param-field">
      <label>POOLISH (%)</label>
      <input type="number" class="param-pct" data-param="poolish" min="0" max="100" step="5" value="${recipe.poolish_pct}">
    </div>
    <div class="param-field">
      <label>AUTOLISI (%)</label>
      <input type="number" class="param-pct" data-param="autolisi" min="0" max="100" step="5" value="${recipe.autolisi_pct}">
    </div>
  </div>
  <div class="params-summary">
    <div class="summary-item">
      <span class="summary-label">Impasto totale</span>
      <span class="summary-val" data-calc="summary-total">—</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Farina</span>
      <span class="summary-val" data-calc="summary-flour">—</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Acqua totale</span>
      <span class="summary-val" data-calc="summary-water">—</span>
    </div>
  </div>
</div>
<div class="prep-container" data-recipe-id="${recipe.id}">
  <div class="prep-section" id="prep-biga-${recipe.id}">
    <div class="prep-section-header biga">
      <span>BIGA</span>
      <span class="header-flour" data-calc="biga-total">—</span>
    </div>
    <div class="prep-row">
      <span>Farina</span>
      <span class="prep-row-pct-fixed">100%</span>
      <span class="prep-row-grams" data-calc="biga-flour">—</span>
    </div>
    <div class="prep-row">
      <span>Acqua</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="biga-acqua" min="20" max="100" step="1" value="${recipe.biga_hydration_pct ?? 44}">%</span>
      <span class="prep-row-grams" data-calc="biga-water">—</span>
    </div>
    <div class="prep-row">
      <span>Lievito</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="biga-lievito" min="0" max="5" step="0.1" value="${recipe.biga_yeast_pct ?? 0.5}">%</span>
      <span class="prep-row-grams" data-calc="biga-yeast">—</span>
    </div>
    ${extraRowsForSection('biga')}
  </div>
  <div class="prep-section" id="prep-poolish-${recipe.id}">
    <div class="prep-section-header poolish">
      <span>POOLISH</span>
      <span class="header-flour" data-calc="poolish-total">—</span>
    </div>
    <div class="prep-row">
      <span>Farina</span>
      <span class="prep-row-pct-fixed">100%</span>
      <span class="prep-row-grams" data-calc="poolish-flour">—</span>
    </div>
    <div class="prep-row">
      <span>Acqua</span>
      <span class="prep-row-pct-fixed">100%</span>
      <span class="prep-row-grams" data-calc="poolish-water">—</span>
    </div>
    <div class="prep-row">
      <span>Lievito</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="poolish-lievito" min="0" max="5" step="0.05" value="${recipe.poolish_yeast_pct ?? 0.1}">%</span>
      <span class="prep-row-grams" data-calc="poolish-yeast">—</span>
    </div>
    ${extraRowsForSection('poolish')}
  </div>
  <div class="prep-section" id="prep-autolisi-${recipe.id}">
    <div class="prep-section-header autolisi">
      <span>AUTOLISI</span>
      <span class="header-flour" data-calc="autolisi-total">—</span>
    </div>
    <div class="prep-row">
      <span>Farina</span>
      <span class="prep-row-pct-fixed">100%</span>
      <span class="prep-row-grams" data-calc="autolisi-flour">—</span>
    </div>
    <div class="prep-row">
      <span>Acqua</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="autolisi-acqua" min="0" max="100" step="1" value="${recipe.autolisi_water_pct || recipe.hydration_pct}">%</span>
      <span class="prep-row-grams" data-calc="autolisi-water">—</span>
    </div>
    ${extraRowsForSection('autolisi')}
  </div>
  <div class="prep-section" id="prep-chiusura-${recipe.id}">
    <div class="prep-section-header chiusura">
      <span>Chiusura Impasto</span>
      <span class="header-flour" data-calc="chiusura-total">—</span>
    </div>
    <div class="prep-row">
      <span>Farina rimanente</span>
      <span class="prep-row-pct-fixed">—</span>
      <span class="prep-row-grams" data-calc="chiusura-flour">—</span>
    </div>
    <div class="prep-row">
      <span>Acqua rimanente</span>
      <span class="prep-row-pct-fixed">—</span>
      <span class="prep-row-grams" data-calc="chiusura-water">—</span>
    </div>
    <div class="prep-row">
      <span>Sale</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="chiusura-sale" min="0" max="5" step="0.1" value="${recipe.salt_pct}">%</span>
      <span class="prep-row-grams" data-calc="chiusura-salt">—</span>
    </div>
    <div class="prep-row">
      <span>Lievito <span style="font-size:.7rem; opacity:.65">(%&nbsp;tot.&nbsp;farina)</span></span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="chiusura-lievito" min="0" max="5" step="0.01" value="${recipe.yeast_pct}">%</span>
      <span class="prep-row-grams" data-calc="chiusura-yeast">—</span>
    </div>
    <div class="prep-row">
      <span>Malto diastasico</span>
      <span class="prep-row-pct-fixed" style="font-size:.72rem">7 g/kg</span>
      <span class="prep-row-grams" data-calc="malto-g">—</span>
    </div>
    <div class="prep-row">
      <span>Carbone vegetale</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="carbone" min="0" max="5" step="0.05" value="${recipe.carbone_pct ?? 0}">%</span>
      <span class="prep-row-grams" data-calc="carbone-g">—</span>
    </div>
    <div class="prep-row">
      <span>Olio</span>
      <span class="prep-row-pct"><input type="number" class="proc-input" data-sec-param="olio" min="0" max="10" step="0.5" value="${recipe.olio_pct ?? 0}">%</span>
      <span class="prep-row-grams" data-calc="olio-g">—</span>
    </div>
    ${extraRowsForSection('chiusura')}
  </div>
  <div class="prep-totale">
    <span>Totale Impasto</span>
    <span class="totale-val" data-calc="total-impasto">—</span>
  </div>
</div>
${notesHTML}`;
}

function onParamChange(recipeId, recipe) {
  const widget = document.querySelector(`.params-widget[data-recipe-id="${recipeId}"]`);
  const prep   = document.querySelector(`.prep-container[data-recipe-id="${recipeId}"]`);
  if (!widget || !prep) return;

  const getMain = p => parseFloat(widget.querySelector(`[data-param="${p}"]`)?.value) || 0;
  const getSec  = p => parseFloat(prep.querySelector(`[data-sec-param="${p}"]`)?.value) || 0;

  const pieces    = getMain('pieces')  || 1;
  const weight    = getMain('weight');
  const hydration = getMain('hydration');
  const biga      = getMain('biga');
  const poolish   = getMain('poolish');
  const autolisi  = getMain('autolisi');

  // Correct formula: totalDough = pieces × weight; flour = totalDough / (1 + hydration/100); water = flour × hydration/100
  const totalDough = pieces * weight;
  const flour      = totalDough / (1 + hydration / 100);
  const waterTotal = flour * hydration / 100;

  // BIGA
  const bigaAcqua   = getSec('biga-acqua') || 44;
  const bigaLievito = getSec('biga-lievito');
  const bigaF = flour * biga / 100;
  const bigaW = bigaF * bigaAcqua / 100;
  const bigaY = bigaF * bigaLievito / 100;

  // POOLISH
  const poolishLiev = getSec('poolish-lievito');
  const poolishF = flour * poolish / 100;
  const poolishW = poolishF;
  const poolishY = poolishF * poolishLiev / 100;

  // AUTOLISI — cap water so chiusura never goes negative
  const autolisiAcqua = getSec('autolisi-acqua') || hydration;
  const autolisiF     = flour * autolisi / 100;
  const availableW    = Math.max(0, waterTotal - bigaW - poolishW);
  const autolisiW     = Math.min(autolisiF * autolisiAcqua / 100, availableW);

  // CHIUSURA
  const chiusuraF = Math.max(0, flour - bigaF - poolishF - autolisiF);
  const chiusuraW = Math.max(0, waterTotal - bigaW - poolishW - autolisiW);

  const chiusuraSale     = getSec('chiusura-sale');
  const chiusuraTotalLiev= getSec('chiusura-lievito');  // % on total flour
  const carbone          = getSec('carbone');
  const olio             = getSec('olio');

  const saltG        = flour * chiusuraSale / 100;
  const totalYeastG  = flour * chiusuraTotalLiev / 100;
  const chiusuraYeastG = Math.max(0, totalYeastG - bigaY - poolishY);
  const maltoG       = flour / 1000 * 7;           // 7g per kg di farina totale
  const carboneG     = flour * carbone / 100;
  const olioG        = flour * olio / 100;

  const totalImpasto = flour + waterTotal + saltG + totalYeastG + maltoG + carboneG + olioG;

  // Summary bar (inside params-widget)
  const setW = (key, val) => { const el = widget.querySelector(`[data-calc="${key}"]`); if (el) el.textContent = fmtG(val); };
  setW('summary-total', totalDough);
  setW('summary-flour', flour);
  setW('summary-water', waterTotal);

  const set = (key, val) => { const el = prep.querySelector(`[data-calc="${key}"]`); if (el) el.textContent = fmtG(val); };

  // Extra ingredients — collect per section
  let extrasChiusura = 0, extrasBiga = 0, extrasPoolish = 0, extrasAutolisi = 0;
  prep.querySelectorAll('[data-extra-idx]').forEach(inp => {
    const idx = inp.dataset.extraIdx;
    const section = inp.dataset.extraSection || 'chiusura';
    const g = flour * (parseFloat(inp.value) || 0) / 100;
    set('extra-g-' + idx, g);
    if (section === 'biga') extrasBiga += g;
    else if (section === 'poolish') extrasPoolish += g;
    else if (section === 'autolisi') extrasAutolisi += g;
    else extrasChiusura += g;
  });

  set('biga-flour',  bigaF);
  set('biga-water',  bigaW);
  set('biga-yeast',  bigaY);
  set('biga-total',  bigaF + bigaW + bigaY + extrasBiga);

  set('poolish-flour', poolishF);
  set('poolish-water', poolishW);
  set('poolish-yeast', poolishY);
  set('poolish-total', poolishF + poolishW + poolishY + extrasPoolish);

  set('autolisi-flour', autolisiF);
  set('autolisi-water', autolisiW);
  set('autolisi-total', autolisiF + autolisiW + extrasAutolisi);

  set('chiusura-flour', chiusuraF);
  set('chiusura-water', chiusuraW);
  set('chiusura-salt',  saltG);
  set('chiusura-yeast', chiusuraYeastG);
  set('malto-g',        maltoG);
  set('carbone-g',      carboneG);
  set('olio-g',         olioG);
  set('chiusura-total', chiusuraF + chiusuraW + saltG + chiusuraYeastG + maltoG + carboneG + olioG + extrasChiusura);

  set('total-impasto', totalDough);
}

// ── Recipe Modal ──────────────────────────────────────────────────────────────

function openNewRecipe() {
  editingRecipe = null;
  document.getElementById('modal-recipe-title').textContent = 'Nuova Ricetta';
  document.getElementById('recipe-id-field').value = '';
  document.getElementById('rf-name').value = '';
  document.getElementById('rf-description').value = '';
  document.getElementById('rf-notes').value = '';
  document.getElementById('rf-pieces').value = 6;
  document.getElementById('rf-ball').value = 255;
  document.getElementById('rf-hydration').value = 65;
  document.getElementById('rf-biga').value = 0;
  document.getElementById('rf-poolish').value = 0;
  document.getElementById('rf-autolisi').value = 0;
  document.getElementById('rf-biga-hydration').value = 44;
  document.getElementById('rf-biga-yeast').value = 0.5;
  document.getElementById('rf-poolish-yeast').value = 0.1;
  document.getElementById('rf-autolisi-water').value = 0;
  document.getElementById('rf-salt').value = 2.5;
  document.getElementById('rf-yeast').value = 1.0;
  document.getElementById('rf-carbone').value = 0;
  document.getElementById('rf-olio').value = 0;
  document.getElementById('recipe-params-section').style.display = '';
  document.getElementById('extras-list').innerHTML = '';
  openModal('modal-recipe');
}

async function openEditRecipe(recipeId) {
  try {
    const r = await api('GET', `/api/recipes/${recipeId}`);
    editingRecipe = r;
    document.getElementById('modal-recipe-title').textContent = 'Modifica Ricetta';
    document.getElementById('recipe-id-field').value = r.id;
    document.getElementById('rf-name').value = r.name;
    document.getElementById('rf-description').value = r.description || '';
    document.getElementById('rf-notes').value = r.notes || '';
    document.getElementById('rf-pieces').value = r.default_pieces;
    document.getElementById('rf-ball').value = r.default_ball_g;
    document.getElementById('rf-hydration').value = r.hydration_pct;
    document.getElementById('rf-biga').value = r.biga_pct;
    document.getElementById('rf-poolish').value = r.poolish_pct;
    document.getElementById('rf-autolisi').value = r.autolisi_pct;
    document.getElementById('rf-biga-hydration').value = r.biga_hydration_pct ?? 44;
    document.getElementById('rf-biga-yeast').value = r.biga_yeast_pct ?? 0.5;
    document.getElementById('rf-poolish-yeast').value = r.poolish_yeast_pct ?? 0.1;
    document.getElementById('rf-autolisi-water').value = r.autolisi_water_pct ?? 0;
    document.getElementById('rf-salt').value = r.salt_pct;
    document.getElementById('rf-yeast').value = r.yeast_pct;
    document.getElementById('rf-carbone').value = r.carbone_pct ?? 0;
    document.getElementById('rf-olio').value = r.olio_pct ?? 0;
    document.getElementById('extras-list').innerHTML = (r.extra_ingredients || []).map(extraItemHTML).join('');
    document.getElementById('recipe-params-section').style.display = '';
    openModal('modal-recipe');
  } catch (e) {
    toast('Errore caricamento ricetta', 'error');
  }
}

function extraItemHTML(e = {}) {
  const sec = e.section || 'chiusura';
  return `<div class="extra-item">
    <input type="text" placeholder="Nome ingrediente" value="${e.name || ''}">
    <select class="extra-section">
      <option value="chiusura"${sec==='chiusura'?' selected':''}>Chiusura</option>
      <option value="biga"${sec==='biga'?' selected':''}>BIGA</option>
      <option value="poolish"${sec==='poolish'?' selected':''}>POOLISH</option>
      <option value="autolisi"${sec==='autolisi'?' selected':''}>AUTOLISI</option>
    </select>
    <input type="number" class="extra-pct" placeholder="%" min="0" step="0.1" value="${e.pct || ''}">
    <button class="btn-icon" onclick="this.closest('.extra-item').remove()">✕</button>
  </div>`;
}

document.getElementById('btn-add-extra').addEventListener('click', () => {
  document.getElementById('extras-list').insertAdjacentHTML('beforeend', extraItemHTML());
});

async function saveRecipe() {
  const id = document.getElementById('recipe-id-field').value;
  const extras = [...document.querySelectorAll('#extras-list .extra-item')].map(el => ({
    name: el.querySelector('input[type=text]').value.trim(),
    section: el.querySelector('.extra-section')?.value || 'chiusura',
    pct: parseFloat(el.querySelector('.extra-pct').value) || 0,
  })).filter(e => e.name);

  const name        = document.getElementById('rf-name').value.trim();
  const description = document.getElementById('rf-description').value.trim() || null;
  const notes       = document.getElementById('rf-notes').value.trim() || null;
  if (!name) { toast('Inserisci il nome della ricetta', 'error'); return; }

  const pieces = parseInt(document.getElementById('rf-pieces').value) || 6;
  const ballG  = parseFloat(document.getElementById('rf-ball').value) || 255;
  const hydrat = parseFloat(document.getElementById('rf-hydration').value) || 65;

  const payload = {
    name, description, notes,
    base_flour_g: Math.round(pieces * ballG / (1 + hydrat / 100)),
    default_pieces: pieces,
    default_ball_g: ballG,
    hydration_pct: hydrat,
    salt_pct:    parseFloat(document.getElementById('rf-salt').value) || 2.5,
    yeast_pct:   parseFloat(document.getElementById('rf-yeast').value) || 1.0,
    biga_pct:    parseFloat(document.getElementById('rf-biga').value) || 0,
    poolish_pct: parseFloat(document.getElementById('rf-poolish').value) || 0,
    autolisi_pct:parseFloat(document.getElementById('rf-autolisi').value) || 0,
    biga_hydration_pct:  parseFloat(document.getElementById('rf-biga-hydration').value) || 44,
    biga_yeast_pct:      parseFloat(document.getElementById('rf-biga-yeast').value) || 0.5,
    poolish_yeast_pct:   parseFloat(document.getElementById('rf-poolish-yeast').value) || 0.1,
    autolisi_water_pct:  parseFloat(document.getElementById('rf-autolisi-water').value) || 0,
    malto_pct: 0,
    carbone_pct: parseFloat(document.getElementById('rf-carbone').value) || 0,
    olio_pct:    parseFloat(document.getElementById('rf-olio').value) || 0,
    extra_ingredients: extras,
    sort_order: (id && editingRecipe) ? (editingRecipe.sort_order || 0) : allRecipes.length * 10,
  };

  try {
    if (id) {
      await api('PUT', `/api/recipes/${id}`, payload);
    } else {
      await api('POST', '/api/recipes', payload);
    }
    closeModal('modal-recipe');
    await loadRecipes();
    toast('Ricetta salvata!', 'success');
  } catch (e) {
    toast('Errore salvataggio', 'error');
  }
}

async function reorderRecipe(id, direction) {
  const idx = allRecipes.findIndex(r => r.id === id);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= allRecipes.length) return;
  const a = allRecipes[idx];
  const b = allRecipes[newIdx];
  try {
    await Promise.all([
      api('PATCH', `/api/recipes/${a.id}/sort`, { sort_order: newIdx * 10 }),
      api('PATCH', `/api/recipes/${b.id}/sort`, { sort_order: idx * 10 }),
    ]);
    await loadRecipes();
  } catch (e) {
    toast('Errore riordinamento', 'error');
  }
}

async function deleteRecipe(id) {
  if (!confirm('Eliminare questa ricetta e tutte le sue varianti?')) return;
  try {
    await api('DELETE', `/api/recipes/${id}`);
    await loadRecipes();
    toast('Ricetta eliminata');
  } catch (e) {
    toast('Errore eliminazione', 'error');
  }
}

// ── Variant Modal ─────────────────────────────────────────────────────────────

function openAddVariant(recipeId) {
  document.getElementById('modal-variant-title').textContent = 'Aggiungi Variante';
  document.getElementById('variant-id-field').value = '';
  document.getElementById('variant-recipe-id-field').value = recipeId;
  document.getElementById('vf-name').value = '';
  openModal('modal-variant');
}

function openEditVariant(variantId, name, recipeId) {
  document.getElementById('modal-variant-title').textContent = 'Rinomina Variante';
  document.getElementById('variant-id-field').value = variantId;
  document.getElementById('variant-recipe-id-field').value = recipeId;
  document.getElementById('vf-name').value = name;
  openModal('modal-variant');
}

async function saveVariant() {
  const id = document.getElementById('variant-id-field').value;
  const recipeId = parseInt(document.getElementById('variant-recipe-id-field').value);
  const name = document.getElementById('vf-name').value.trim();
  if (!name) { toast('Inserisci il nome della variante', 'error'); return; }

  try {
    if (id) {
      await api('PUT', `/api/variants/${id}`, { name, sort_order: 0 });
    } else {
      await api('POST', `/api/recipes/${recipeId}/variants`, { name, sort_order: 0 });
    }
    closeModal('modal-variant');
    await refreshVariantiTab();
    toast('Variante salvata!', 'success');
  } catch (e) {
    toast('Errore salvataggio variante', 'error');
  }
}

async function deleteVariant(variantId) {
  if (!confirm('Eliminare questa variante e tutti i suoi condimenti?')) return;
  try {
    await api('DELETE', `/api/variants/${variantId}`);
    await refreshVariantiTab();
    toast('Variante eliminata');
  } catch (e) {
    toast('Errore eliminazione', 'error');
  }
}

// ── Topping Modal ─────────────────────────────────────────────────────────────

function openAddTopping(variantId) {
  document.getElementById('modal-topping-title').textContent = 'Aggiungi Condimento';
  document.getElementById('topping-id-field').value = '';
  document.getElementById('topping-variant-id-field').value = variantId;
  ['tf-name','tf-qty','tf-kcal','tf-protein','tf-carbs','tf-fat'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('tf-qty').value = 0;
  openModal('modal-topping');
}

function openEditTopping(toppingId, variantId) {
  document.getElementById('modal-topping-title').textContent = 'Modifica Condimento';
  document.getElementById('topping-id-field').value = toppingId;
  document.getElementById('topping-variant-id-field').value = variantId;
  openModal('modal-topping');
}

async function saveTopping() {
  const id = document.getElementById('topping-id-field').value;
  const variantId = parseInt(document.getElementById('topping-variant-id-field').value);
  const body = {
    name: document.getElementById('tf-name').value.trim(),
    quantity_g: parseFloat(document.getElementById('tf-qty').value) || 0,
    kcal_per100: parseFloat(document.getElementById('tf-kcal').value) || null,
    protein_per100: parseFloat(document.getElementById('tf-protein').value) || null,
    carbs_per100: parseFloat(document.getElementById('tf-carbs').value) || null,
    fat_per100: parseFloat(document.getElementById('tf-fat').value) || null,
    sort_order: 0,
  };
  if (!body.name) { toast('Inserisci il nome del condimento', 'error'); return; }

  try {
    if (id) {
      await api('PUT', `/api/toppings/${id}`, body);
    } else {
      await api('POST', `/api/variants/${variantId}/toppings`, body);
    }
    closeModal('modal-topping');
    await refreshVariantiTab();
    toast('Condimento salvato!', 'success');
  } catch (e) {
    toast('Errore salvataggio condimento', 'error');
  }
}

async function deleteTopping(toppingId) {
  try {
    await api('DELETE', `/api/toppings/${toppingId}`);
    await refreshVariantiTab();
    toast('Condimento eliminato');
  } catch (e) {
    toast('Errore eliminazione', 'error');
  }
}

async function refreshVariantiTab() {
  allVariants = await api('GET', '/api/variants').catch(() => allVariants);
  if (variantiSelectedRecipeId) {
    await renderVariantsForRecipe(variantiSelectedRecipeId);
  }
}

// ── Import ─────────────────────────────────────────────────────────────────────

async function triggerImport() {
  openModal('modal-import');
  document.getElementById('modal-import-body').innerHTML = `
    <div style="text-align:center; padding:24px">
      <div class="spinner" style="width:28px;height:28px;border-width:3px;margin:0 auto 12px"></div>
      <p style="color:var(--text-3)">Importazione in corso...</p>
    </div>`;
  document.getElementById('btn-import-ok').style.display = 'none';

  try {
    const res = await api('POST', '/api/import-excel');
    let html = '';
    if (res.ok) {
      html = `
        <p style="color:var(--green); font-weight:700; margin-bottom:12px">Importazione completata!</p>
        <ul style="font-size:.9rem; line-height:2">
          <li>Ricette aggiunte: <strong>${res.recipes_added}</strong></li>
          <li>Varianti: <strong>${res.variants_added}</strong></li>
          <li>Condimenti: <strong>${res.toppings_added}</strong></li>
          <li>Guide tempistiche: <strong>${res.timing_guides_added}</strong></li>
        </ul>`;
      if (res.errors && res.errors.length) {
        html += `<p style="color:var(--gold); margin-top:12px; font-size:.82rem">
          Avvisi: ${res.errors.join(' · ')}</p>`;
      }
    } else {
      html = `<p style="color:var(--red)">Errore: ${res.error}</p>`;
    }
    document.getElementById('modal-import-body').innerHTML = `<div style="padding:4px">${html}</div>`;
    document.getElementById('btn-import-ok').style.display = 'inline-flex';
    await loadRecipes();
  } catch (e) {
    document.getElementById('modal-import-body').innerHTML =
      `<p style="color:var(--red); padding:8px">Errore durante l'importazione: ${e.message}</p>`;
    document.getElementById('btn-import-ok').style.display = 'inline-flex';
  }
}

// ── Varianti Tab ──────────────────────────────────────────────────────────────

function renderVariantiTab() {
  const selector = document.getElementById('varianti-recipe-selector');

  if (!allRecipes.length) {
    selector.innerHTML = '';
    document.getElementById('varianti-content').innerHTML =
      `<div class="empty-state"><p>Nessuna ricetta. Importa prima dall'Excel.</p></div>`;
    return;
  }

  if (!variantiSelectedRecipeId) variantiSelectedRecipeId = allRecipes[0].id;

  selector.innerHTML = allRecipes.map(r => `
    <button class="recipe-pill${variantiSelectedRecipeId === r.id ? ' active' : ''}" data-recipe-id="${r.id}">
      ${r.name}
    </button>`).join('');

  selector.querySelectorAll('.recipe-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      variantiSelectedRecipeId = parseInt(btn.dataset.recipeId);
      selector.querySelectorAll('.recipe-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      renderVariantsForRecipe(variantiSelectedRecipeId);
    });
  });

  renderVariantsForRecipe(variantiSelectedRecipeId);
}

async function renderVariantsForRecipe(recipeId) {
  if (!recipeId) return;
  const content = document.getElementById('varianti-content');
  content.innerHTML = `<div style="padding:20px; color:var(--text-3); font-size:.85rem">Caricamento...</div>`;
  try {
    const recipe = await api('GET', `/api/recipes/${recipeId}`);
    const variantsHTML = recipe.variants.length
      ? recipe.variants.map(v => variantHTML(v)).join('')
      : `<p style="color:var(--text-3); font-size:.85rem; padding:8px 0">Nessuna variante. Aggiungine una.</p>`;

    content.innerHTML = `
      <div id="variants-container-${recipeId}">${variantsHTML}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-action="add-variant" data-recipe-id="${recipeId}">+ Aggiungi Variante</button>`;

    wireVariantButtons(content, recipeId);

    content.querySelectorAll('.variant-toggle').forEach(vBtn => {
      vBtn.addEventListener('click', () => vBtn.nextElementSibling.classList.toggle('open'));
    });
  } catch (e) {
    content.innerHTML = `<p style="color:var(--red); padding:8px">Errore caricamento varianti.</p>`;
  }
}

function variantHTML(v) {
  const toppings = v.toppings.length
    ? `<table style="width:100%; border-collapse:collapse; font-size:.82rem; margin-top:6px">
        <thead><tr>
          <th style="text-align:left; padding:4px 6px; color:var(--text-3); font-size:.7rem; border-bottom:1px solid var(--border)">Ingrediente</th>
          <th style="text-align:right; padding:4px 6px; color:var(--text-3); font-size:.7rem; border-bottom:1px solid var(--border)">g/pizza</th>
          <th style="text-align:right; padding:4px 6px; color:var(--text-3); font-size:.7rem; border-bottom:1px solid var(--border)">kcal/100g</th>
          <th style="padding:4px 6px; border-bottom:1px solid var(--border)"></th>
        </tr></thead>
        <tbody>
          ${v.toppings.map(t => `
            <tr>
              <td style="padding:4px 6px">${t.name}</td>
              <td style="text-align:right; padding:4px 6px">${fmtG(t.quantity_g)}</td>
              <td style="text-align:right; padding:4px 6px; color:var(--text-3)">${t.kcal_per100 != null ? fmt(t.kcal_per100) : '—'}</td>
              <td style="padding:4px 6px; text-align:right">
                <button class="btn-icon btn-edit-topping" data-id="${t.id}" data-variant-id="${v.id}" style="font-size:.7rem" title="Modifica">✏️</button>
                <button class="btn-icon btn-delete-topping" data-id="${t.id}" style="font-size:.7rem" title="Elimina">🗑️</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : `<p style="color:var(--text-3); font-size:.8rem; margin-top:6px">Nessun condimento. Aggiungine uno.</p>`;

  return `
<div class="variant-item" data-variant-id="${v.id}">
  <button class="variant-toggle">
    <span>${v.name}</span>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn-ghost btn-sm btn-edit-variant" data-id="${v.id}" data-name="${v.name}" style="font-size:.7rem">Rinomina</button>
      <button class="btn-ghost btn-sm btn-delete-variant" data-id="${v.id}" style="font-size:.7rem; color:var(--red)">Elimina</button>
      <span>▾</span>
    </div>
  </button>
  <div class="variant-body">
    ${toppings}
    <button class="btn btn-ghost btn-sm" style="margin-top:8px" data-action="add-topping" data-variant-id="${v.id}">+ Aggiungi Condimento</button>
  </div>
</div>`;
}

function wireVariantButtons(container, recipeId) {
  container.querySelectorAll('[data-action="add-variant"]').forEach(btn => {
    btn.addEventListener('click', () => openAddVariant(recipeId));
  });
  container.querySelectorAll('[data-action="add-topping"]').forEach(btn => {
    btn.addEventListener('click', () => openAddTopping(parseInt(btn.dataset.variantId)));
  });
  container.querySelectorAll('.btn-edit-variant').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditVariant(parseInt(btn.dataset.id), btn.dataset.name, recipeId);
    });
  });
  container.querySelectorAll('.btn-delete-variant').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteVariant(parseInt(btn.dataset.id));
    });
  });
  container.querySelectorAll('.btn-edit-topping').forEach(btn => {
    btn.addEventListener('click', () => openEditTopping(parseInt(btn.dataset.id), parseInt(btn.dataset.variantId)));
  });
  container.querySelectorAll('.btn-delete-topping').forEach(btn => {
    btn.addEventListener('click', () => deleteTopping(parseInt(btn.dataset.id)));
  });
}

// ── Pizza Party ────────────────────────────────────────────────────────────────

let partyRecipeId = null;
let partyPortionDenom = 4;
let partyDebounceTimer = null;
let composizioneRowId = 0;

function renderPartyRecipes() {
  const container = document.getElementById('party-recipe-list');
  if (!allRecipes.length) {
    container.innerHTML = `<p style="color:var(--text-3);font-size:.85rem">Nessuna ricetta. Importa prima dall'Excel.</p>`;
    return;
  }
  container.innerHTML = allRecipes.map(r => `
    <label class="recipe-radio${partyRecipeId === r.id ? ' selected' : ''}">
      <input type="radio" name="party-recipe" value="${r.id}" ${partyRecipeId === r.id ? 'checked' : ''}>
      <div>
        <div class="recipe-radio-label">${r.name}</div>
        <div class="recipe-radio-meta">${r.hydration_pct}% idrat. · ${r.default_pieces}× ${r.default_ball_g}g</div>
      </div>
    </label>`).join('');

  container.querySelectorAll('input[type=radio]').forEach(inp => {
    inp.addEventListener('change', () => onPartyRecipeSelect(parseInt(inp.value)));
  });

  if (!partyRecipeId && allRecipes.length) onPartyRecipeSelect(allRecipes[0].id);
}

function onPartyRecipeSelect(recipeId) {
  partyRecipeId = recipeId;
  document.querySelectorAll('.recipe-radio').forEach(el => el.classList.remove('selected'));
  const radio = document.querySelector(`input[name=party-recipe][value="${recipeId}"]`);
  if (radio) { radio.checked = true; radio.closest('.recipe-radio').classList.add('selected'); }

  const recipe = allRecipes.find(r => r.id === recipeId);
  if (recipe) {
    document.getElementById('party-pieces').value = recipe.default_pieces;
    document.getElementById('party-ball-weight').value = recipe.default_ball_g;
    document.getElementById('party-hydration').value = recipe.hydration_pct;
    document.getElementById('party-salt').value = recipe.salt_pct;
    document.getElementById('party-yeast').value = recipe.yeast_pct;
    document.getElementById('party-biga').value = recipe.biga_pct;
    document.getElementById('party-poolish').value = recipe.poolish_pct;
    document.getElementById('party-autolisi').value = recipe.autolisi_pct;
  }

  initComposizioneForRecipe(recipeId);
  schedulePartyCalc();
}

function initComposizioneForRecipe(recipeId) {
  const container = document.getElementById('party-composizione-rows');
  container.innerHTML = '';
  composizioneRowId = 0;
  const recipeVariants = allVariants.filter(v => v.recipe_id === recipeId);
  if (recipeVariants.length) {
    recipeVariants.forEach(v => addComposizioneRow(v.id));
  } else {
    addComposizioneRow();
  }
}

function buildVariantOptions(selectedId = null) {
  if (!allVariants.length) return '<option value="">— Nessuna variante —</option>';
  const byRecipe = {};
  allVariants.forEach(v => {
    if (!byRecipe[v.recipe_name]) byRecipe[v.recipe_name] = [];
    byRecipe[v.recipe_name].push(v);
  });
  return `<option value="">— Seleziona variante —</option>` +
    Object.entries(byRecipe).map(([recipeName, variants]) => `
      <optgroup label="${recipeName}">
        ${variants.map(v => `<option value="${v.id}"${selectedId === v.id ? ' selected' : ''}>${v.name}</option>`).join('')}
      </optgroup>`).join('');
}

function addComposizioneRow(preselectedVariantId = null) {
  const rowId = ++composizioneRowId;
  const container = document.getElementById('party-composizione-rows');
  const div = document.createElement('div');
  div.className = 'composizione-row';
  div.dataset.rowId = rowId;
  div.innerHTML = `
    <select data-row-id="${rowId}">${buildVariantOptions(preselectedVariantId)}</select>
    <div class="counter-cell">
      <button class="counter-btn" data-action="dec">−</button>
      <span class="counter-val" id="crow-${rowId}">0</span>
      <button class="counter-btn" data-action="inc">+</button>
    </div>
    <button class="btn-remove" title="Rimuovi">✕</button>`;

  div.querySelector('select').addEventListener('change', () => { updatePieceWarning(); schedulePartyCalc(); });
  div.querySelector('.btn-remove').addEventListener('click', () => { div.remove(); updatePieceWarning(); schedulePartyCalc(); });
  div.querySelectorAll('.counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('crow-' + rowId);
      let val = parseInt(el.textContent) || 0;
      if (btn.dataset.action === 'inc') val++;
      else if (val > 0) val--;
      el.textContent = val;
      updatePieceWarning();
      schedulePartyCalc();
    });
  });

  container.appendChild(div);
}

function updatePieceWarning() {
  const totalPieces = parseInt(document.getElementById('party-pieces').value) || 0;
  let assigned = 0;
  document.querySelectorAll('#party-composizione-rows .counter-val').forEach(el => {
    assigned += parseInt(el.textContent) || 0;
  });
  const warning = document.getElementById('party-piece-warning');
  const show = assigned > 0 && assigned !== totalPieces;
  warning.style.display = show ? 'block' : 'none';
  if (show) warning.textContent = `Totale assegnato: ${assigned} su ${totalPieces} palline`;
}

function schedulePartyCalc() {
  clearTimeout(partyDebounceTimer);
  partyDebounceTimer = setTimeout(calcParty, 400);
}

async function calcParty() {
  if (!partyRecipeId) return;

  const variantQuantities = [];
  document.querySelectorAll('#party-composizione-rows .composizione-row').forEach(row => {
    const variantId = parseInt(row.querySelector('select')?.value);
    const count = parseInt(row.querySelector('.counter-val')?.textContent) || 0;
    if (variantId && count > 0) variantQuantities.push({ variant_id: variantId, count });
  });

  const body = {
    recipe_id: partyRecipeId,
    target_pieces: parseInt(document.getElementById('party-pieces').value) || 6,
    ball_weight_g: parseFloat(document.getElementById('party-ball-weight').value) || null,
    hydration_pct: parseFloat(document.getElementById('party-hydration').value),
    salt_pct: parseFloat(document.getElementById('party-salt').value),
    yeast_pct: parseFloat(document.getElementById('party-yeast').value) || 0,
    biga_pct: parseFloat(document.getElementById('party-biga').value) || 0,
    poolish_pct: parseFloat(document.getElementById('party-poolish').value) || 0,
    autolisi_pct: parseFloat(document.getElementById('party-autolisi').value) || 0,
    variant_quantities: variantQuantities,
    portion_denominator: partyPortionDenom,
  };

  try {
    const result = await api('POST', '/api/pizza-party', body);
    renderPartyResults(result);
  } catch (e) {
    document.getElementById('results-empty').style.display = 'none';
    document.getElementById('results-content').style.display = '';
    document.getElementById('results-content').innerHTML =
      `<div style="padding:16px; color:var(--red); font-size:.85rem">Errore calcolo: ${e.message}</div>`;
  }
}

function renderPartyResults(result) {
  const empty = document.getElementById('results-empty');
  const content = document.getElementById('results-content');
  empty.style.display = 'none';
  content.style.display = '';

  const d = result.dough;
  const prefHTML = [
    d.biga_flour_g > 0    ? `<tr class="prefermento"><td>↳ BIGA farina</td><td class="num">${fmtG(d.biga_flour_g)}</td></tr>` : '',
    d.poolish_flour_g > 0 ? `<tr class="prefermento"><td>↳ POOLISH farina</td><td class="num">${fmtG(d.poolish_flour_g)}</td></tr>` : '',
    d.autolisi_flour_g > 0? `<tr class="prefermento"><td>↳ AUTOLISI farina</td><td class="num">${fmtG(d.autolisi_flour_g)}</td></tr>` : '',
  ].join('');

  const extrasHTML = (d.extra_ingredients || []).map(e =>
    `<tr><td>${e.name}</td><td class="num">${fmtG(e.grams)}</td></tr>`
  ).join('');

  const variantsHTML = result.variants
    .filter(v => v.count > 0)
    .map(v => {
      const toppingRows = v.toppings.map(t => `
        <tr>
          <td>${t.name}</td>
          <td class="num">${fmtG(t.quantity_g_per_pizza)}</td>
          <td class="num">${fmtG(t.total_g)}</td>
        </tr>`).join('');
      const hasMacros = v.per_pizza_macros.kcal > 0;
      return `
        <div class="variant-result-card">
          <div class="variant-result-header">
            <span>${v.name}</span>
            <span style="color:var(--text-3); font-size:.78rem; font-weight:400">${v.count} pizza${v.count > 1 ? 'e' : ''}</span>
          </div>
          <div class="variant-result-body">
            ${toppingRows ? `
              <div class="variant-result-subtitle">Condimenti</div>
              <table style="width:100%; border-collapse:collapse; font-size:.82rem">
                <thead><tr>
                  <th style="text-align:left; padding:3px 4px; color:var(--text-3); font-size:.7rem; border-bottom:1px solid var(--border)">Ingrediente</th>
                  <th style="text-align:right; padding:3px 4px; color:var(--text-3); font-size:.7rem; border-bottom:1px solid var(--border)">g/pizza</th>
                  <th style="text-align:right; padding:3px 4px; color:var(--text-3); font-size:.7rem; border-bottom:1px solid var(--border)">Totale</th>
                </tr></thead>
                <tbody>${toppingRows}</tbody>
              </table>` : '<p style="color:var(--text-3);font-size:.8rem">Nessun condimento</p>'}
            ${hasMacros ? `
              <div class="variant-result-subtitle">Macro per pizza</div>
              <div class="macro-row">
                <span class="macro-pill macro-kcal">${fmt(v.per_pizza_macros.kcal)} kcal</span>
                <span class="macro-pill macro-protein">${fmt(v.per_pizza_macros.protein_g, 1)}g prot.</span>
                <span class="macro-pill macro-carbs">${fmt(v.per_pizza_macros.carbs_g, 1)}g carb.</span>
                <span class="macro-pill macro-fat">${fmt(v.per_pizza_macros.fat_g, 1)}g grassi</span>
              </div>
              <div class="variant-result-subtitle">Per porzione (1/${partyPortionDenom})</div>
              <div class="macro-row">
                <span class="macro-pill macro-kcal">${fmt(v.per_portion_macros.kcal)} kcal</span>
                <span class="macro-pill macro-protein">${fmt(v.per_portion_macros.protein_g, 1)}g prot.</span>
                <span class="macro-pill macro-carbs">${fmt(v.per_portion_macros.carbs_g, 1)}g carb.</span>
                <span class="macro-pill macro-fat">${fmt(v.per_portion_macros.fat_g, 1)}g grassi</span>
              </div>` : ''}
          </div>
        </div>`;
    }).join('') || `<p style="color:var(--text-3); font-size:.85rem; padding:8px 0">Nessuna variante con pizze assegnate.</p>`;

  const shoppingHTML = result.shopping_list.length
    ? result.shopping_list.map(s => `
        <div class="shopping-item">
          <span>${s.name}</span>
          <span class="shopping-weight">${fmtG(s.total_g)}</span>
        </div>`).join('')
    : `<p style="color:var(--text-3); font-size:.82rem">Nessun condimento con quantità.</p>`;

  content.innerHTML = `
    <div class="results-section">
      <div class="results-section-title">Impasto</div>
      <div class="results-section-body" style="padding-bottom:8px">
        <table style="width:100%; border-collapse:collapse; font-size:.85rem">
          <tbody>
            <tr><td>Farina</td><td class="num">${fmtG(d.flour_g)}</td></tr>
            <tr><td>Acqua</td><td class="num">${fmtG(d.water_g)}</td></tr>
            <tr><td>Sale</td><td class="num">${fmtG(d.salt_g)}</td></tr>
            ${d.yeast_g > 0 ? `<tr><td>Lievito</td><td class="num">${fmtG(d.yeast_g)}</td></tr>` : ''}
            ${prefHTML}
            ${extrasHTML}
            <tr class="total-row"><td>Totale Impasto</td><td class="num">${fmtG(d.total_dough_g)}</td></tr>
            <tr style="color:var(--text-3); font-size:.8rem">
              <td>${d.actual_pieces} palline × ${fmtG(d.actual_ball_g)}</td><td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="results-section">
      <div class="results-section-title">Per Variante</div>
      <div class="results-section-body">${variantsHTML}</div>
    </div>
    <div class="results-section">
      <div class="results-section-title">Lista Spesa Condimenti</div>
      <div class="results-section-body">${shoppingHTML}</div>
    </div>`;
}

// ── Portion selector ──────────────────────────────────────────────────────────

document.getElementById('portion-grid').addEventListener('click', e => {
  const btn = e.target.closest('.portion-btn');
  if (!btn) return;
  document.querySelectorAll('.portion-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  partyPortionDenom = parseInt(btn.dataset.val);
  schedulePartyCalc();
});

// ── Wire party param inputs ───────────────────────────────────────────────────

['party-pieces','party-ball-weight','party-hydration','party-salt','party-yeast',
 'party-biga','party-poolish','party-autolisi'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    updatePieceWarning();
    schedulePartyCalc();
  });
});

document.getElementById('btn-add-composizione-row').addEventListener('click', () => addComposizioneRow());

// ── Global button wires ───────────────────────────────────────────────────────

document.getElementById('btn-new-recipe').addEventListener('click', openNewRecipe);
document.getElementById('btn-import').addEventListener('click', triggerImport);

document.getElementById('modal-recipe-close').addEventListener('click', () => closeModal('modal-recipe'));
document.getElementById('btn-recipe-cancel').addEventListener('click',  () => closeModal('modal-recipe'));
document.getElementById('btn-recipe-save').addEventListener('click',    saveRecipe);

document.getElementById('modal-variant-close').addEventListener('click', () => closeModal('modal-variant'));
document.getElementById('btn-variant-cancel').addEventListener('click',  () => closeModal('modal-variant'));
document.getElementById('btn-variant-save').addEventListener('click',    saveVariant);

document.getElementById('modal-topping-close').addEventListener('click', () => closeModal('modal-topping'));
document.getElementById('btn-topping-cancel').addEventListener('click',  () => closeModal('modal-topping'));
document.getElementById('btn-topping-save').addEventListener('click',    saveTopping);

document.getElementById('modal-import-close').addEventListener('click', () => closeModal('modal-import'));
document.getElementById('btn-import-ok').addEventListener('click',      () => closeModal('modal-import'));

// ── Debounce helper ───────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadRecipes();
