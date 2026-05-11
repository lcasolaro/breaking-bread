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

// ── Canonical topping order ───────────────────────────────────────────────────
// 0=Farina, 1=Pomodoro, 2=Mozzarella, 3=altri, 4=Parmigiano, 5=Olio

function canonicalCategoryWeight(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('farina')) return 0;
  if (['pomodoro', 'pelati', 'passata', 'pomodorini'].some(x => n.includes(x))) return 1;
  if (['mozzarella', 'fiordilatte', 'fior di latte', 'stracciatella'].some(x => n.includes(x))) return 2;
  if (['parmigiano', 'grana', 'pecorino'].some(x => n.includes(x))) return 4;
  if (n.includes('olio')) return 5;
  return 3;
}

function sortToppingsCanonically(toppings) {
  return [...toppings].sort((a, b) => {
    const ca = canonicalCategoryWeight(a.name);
    const cb = canonicalCategoryWeight(b.name);
    if (ca !== cb) return ca - cb;
    const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
    if (sa !== sb) return sa - sb;
    return (a.id || 0) - (b.id || 0);
  });
}

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
    if (btn.dataset.tab === 'menu') renderMenuTab();
    if (btn.dataset.tab === 'planner') initPlanner();
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
let allIngredients = [];
let variantiSelectedRecipeId = null;
let menuSubView = 'pizze';
let editingRecipe = null;
let toppingsCache = {};
let lastPartyOutcomes = [];

// ── Load data ─────────────────────────────────────────────────────────────────

async function loadRecipes() {
  try {
    [allRecipes, allVariants, allIngredients] = await Promise.all([
      api('GET', '/api/recipes'),
      api('GET', '/api/variants'),
      api('GET', '/api/ingredients'),
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
        <button class="btn btn-primary" id="btn-import-empty">Importa da Excel</button>
      </div>`;
    document.getElementById('btn-import-empty').addEventListener('click', triggerImport);
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
    details.innerHTML = recipeDetailsHTML(recipe, false);
    details.classList.add('open');
    icon.classList.add('open');
    btn.querySelector('span').textContent = 'Nascondi dettagli';
    wireRecipeDetailViewMode(details, recipe);
    onParamChange(recipeId, recipe);
  } catch (e) {
    toast('Errore caricamento dettagli', 'error');
    btn.querySelector('span').textContent = 'Mostra ingredienti e procedimento';
  }
}

function recipeDetailsHTML(recipe, editMode = false) {
  const extras = recipe.extra_ingredients || [];

  // Helper: returns an editable input in editMode, or a read-only span in view mode
  const pMain = (param, val, attrs = '') => editMode
    ? `<input type="number" class="param-pct" data-param="${param}" ${attrs} value="${val}">`
    : `<span class="param-display-val" data-param="${param}" data-value="${val}">${val}</span>`;

  const pSec = (secParam, val, attrs = '') => editMode
    ? `<input type="number" class="proc-input" data-sec-param="${secParam}" ${attrs} value="${val}">`
    : `<span class="param-display-val proc-input" data-sec-param="${secParam}" data-value="${val}">${val}%</span>`;

  const extraRowsForSection = (section) => extras
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => (e.section || 'chiusura') === section)
    .map(({ e, i }) => {
      const pctEl = editMode
        ? `<input type="number" class="proc-input" data-extra-idx="${i}" data-extra-section="${section}" min="0" step="0.1" value="${e.pct || 0}">%`
        : `<span class="param-display-val proc-input" data-extra-idx="${i}" data-extra-section="${section}" data-value="${e.pct || 0}">${e.pct || 0}%</span>`;
      return `
    <div class="prep-row">
      <span>${e.name}</span>
      <span class="prep-row-pct">${pctEl}</span>
      <span class="prep-row-grams" data-calc="extra-g-${i}">—</span>
    </div>`;
    }).join('');

  const notesHTML = recipe.notes
    ? `<div style="padding:10px 18px; font-size:.82rem; color:var(--text-3); border-top:1px solid var(--border)">${recipe.notes}</div>`
    : '';

  const editBar = editMode
    ? `<div class="edit-mode-bar">
        <button class="btn btn-sm btn-primary" id="recipe-inline-save-${recipe.id}">Salva parametri</button>
        <button class="btn btn-sm btn-secondary" id="recipe-inline-cancel-${recipe.id}">Annulla</button>
      </div>`
    : `<div class="edit-mode-bar">
        <button class="btn btn-sm btn-ghost" id="recipe-inline-edit-${recipe.id}">✏️ Modifica parametri</button>
      </div>`;

  return `
<div class="params-widget" data-recipe-id="${recipe.id}">
  ${editBar}
  <div class="params-grid">
    <div class="param-field">
      <label>Numero panetti</label>
      ${pMain('pieces', recipe.default_pieces, 'min="1"')}
    </div>
    <div class="param-field">
      <label>Peso panetto (g)</label>
      ${pMain('weight', recipe.default_ball_g, 'min="50" step="5"')}
    </div>
    <div class="param-field">
      <label>Idratazione (%)</label>
      ${pMain('hydration', recipe.hydration_pct, 'min="40" max="100" step="1"')}
    </div>
    <div class="param-field">
      <label>BIGA (%)</label>
      ${pMain('biga', recipe.biga_pct, 'min="0" max="100" step="5"')}
    </div>
    <div class="param-field">
      <label>POOLISH (%)</label>
      ${pMain('poolish', recipe.poolish_pct, 'min="0" max="100" step="5"')}
    </div>
    <div class="param-field">
      <label>AUTOLISI (%)</label>
      ${pMain('autolisi', recipe.autolisi_pct, 'min="0" max="100" step="5"')}
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
      <span class="prep-row-pct">${pSec('biga-acqua', recipe.biga_hydration_pct ?? 44, 'min="20" max="100" step="1"')}</span>
      <span class="prep-row-grams" data-calc="biga-water">—</span>
    </div>
    <div class="prep-row">
      <span>Lievito</span>
      <span class="prep-row-pct">${pSec('biga-lievito', recipe.biga_yeast_pct ?? 0.5, 'min="0" max="5" step="0.1"')}</span>
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
      <span class="prep-row-pct">${pSec('poolish-lievito', recipe.poolish_yeast_pct ?? 0.1, 'min="0" max="5" step="0.05"')}</span>
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
      <span class="prep-row-pct">${pSec('autolisi-acqua', recipe.autolisi_water_pct || recipe.hydration_pct, 'min="0" max="100" step="1"')}</span>
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
      <span class="prep-row-pct">${pSec('chiusura-sale', recipe.salt_pct, 'min="0" max="5" step="0.1"')}</span>
      <span class="prep-row-grams" data-calc="chiusura-salt">—</span>
    </div>
    <div class="prep-row">
      <span>Lievito <span style="font-size:.7rem; opacity:.65">(%&nbsp;tot.&nbsp;farina)</span></span>
      <span class="prep-row-pct">${pSec('chiusura-lievito', recipe.yeast_pct, 'min="0" max="5" step="0.01"')}</span>
      <span class="prep-row-grams" data-calc="chiusura-yeast">—</span>
    </div>
    <div class="prep-row">
      <span>Carbone vegetale</span>
      <span class="prep-row-pct-fixed" style="font-size:.72rem">7 g/kg</span>
      <span class="prep-row-grams" data-calc="carbone-g">—</span>
    </div>
    <div class="prep-row">
      <span>Malto diastasico <span style="font-size:.7rem; opacity:.65">(% biga+poolish)</span></span>
      <span class="prep-row-pct">${pSec('malto', recipe.malto_pct ?? 0, 'min="0" max="5" step="0.05"')}</span>
      <span class="prep-row-grams" data-calc="malto-g">—</span>
    </div>
    <div class="prep-row">
      <span>Olio</span>
      <span class="prep-row-pct">${pSec('olio', recipe.olio_pct ?? 0, 'min="0" max="10" step="0.5"')}</span>
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

  const readEl  = el => el ? parseFloat(el.tagName === 'INPUT' ? el.value : (el.dataset.value ?? '')) || 0 : 0;
  const getMain = p => readEl(widget.querySelector(`[data-param="${p}"]`));
  const getSec  = p => readEl(prep.querySelector(`[data-sec-param="${p}"]`));

  const pieces    = getMain('pieces')  || 1;
  const weight    = getMain('weight');
  const hydration = getMain('hydration');
  const biga      = getMain('biga');
  const poolish   = getMain('poolish');
  const autolisi  = getMain('autolisi');

  const totalDough = pieces * weight;
  const flour      = totalDough / (1 + hydration / 100);
  const waterTotal = flour * hydration / 100;

  const bigaAcqua   = getSec('biga-acqua') || 44;
  const bigaLievito = getSec('biga-lievito');
  const bigaF = flour * biga / 100;
  const bigaW = bigaF * bigaAcqua / 100;
  const bigaY = bigaF * bigaLievito / 100;

  const poolishLiev = getSec('poolish-lievito');
  const poolishF = flour * poolish / 100;
  const poolishW = poolishF;
  const poolishY = poolishF * poolishLiev / 100;

  const autolisiAcqua = getSec('autolisi-acqua') || hydration;
  const autolisiF     = flour * autolisi / 100;
  const availableW    = Math.max(0, waterTotal - bigaW - poolishW);
  const autolisiW     = Math.min(autolisiF * autolisiAcqua / 100, availableW);

  const chiusuraF = Math.max(0, flour - bigaF - poolishF - autolisiF);
  const chiusuraW = Math.max(0, waterTotal - bigaW - poolishW - autolisiW);

  const chiusuraSale     = getSec('chiusura-sale');
  const chiusuraTotalLiev= getSec('chiusura-lievito');
  const malto            = getSec('malto');
  const olio             = getSec('olio');

  const saltG        = flour * chiusuraSale / 100;
  const totalYeastG  = flour * chiusuraTotalLiev / 100;
  const chiusuraYeastG = Math.max(0, totalYeastG - bigaY - poolishY);
  const carboneG     = flour / 1000 * 7;
  const maltoG       = (bigaF + poolishF) * malto / 100;
  const olioG        = flour * olio / 100;

  const setW = (key, val) => { const el = widget.querySelector(`[data-calc="${key}"]`); if (el) el.textContent = fmtG(val); };
  setW('summary-total', totalDough);
  setW('summary-flour', flour);
  setW('summary-water', waterTotal);

  const set = (key, val) => { const el = prep.querySelector(`[data-calc="${key}"]`); if (el) el.textContent = fmtG(val); };

  let extrasChiusura = 0, extrasBiga = 0, extrasPoolish = 0, extrasAutolisi = 0;
  prep.querySelectorAll('[data-extra-idx]').forEach(inp => {
    const idx = inp.dataset.extraIdx;
    const section = inp.dataset.extraSection || 'chiusura';
    const g = flour * readEl(inp) / 100;
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

function wireRecipeDetailViewMode(details, recipe) {
  details.querySelector(`#recipe-inline-edit-${recipe.id}`)?.addEventListener('click', () => {
    details.innerHTML = recipeDetailsHTML(recipe, true);
    wireRecipeDetailEditMode(details, recipe);
    onParamChange(recipe.id, recipe);
    details.querySelectorAll('.param-pct, .proc-input').forEach(inp => {
      inp.addEventListener('input', debounce(() => onParamChange(recipe.id, recipe), 200));
    });
  });
}

function wireRecipeDetailEditMode(details, recipe) {
  details.querySelector(`#recipe-inline-save-${recipe.id}`)?.addEventListener('click', () => saveRecipeParamsInline(details, recipe));
  details.querySelector(`#recipe-inline-cancel-${recipe.id}`)?.addEventListener('click', () => {
    details.innerHTML = recipeDetailsHTML(recipe, false);
    wireRecipeDetailViewMode(details, recipe);
    onParamChange(recipe.id, recipe);
  });
}

async function saveRecipeParamsInline(details, recipe) {
  const widget = details.querySelector('.params-widget');
  const prep   = details.querySelector('.prep-container');
  const readEl  = el => el ? parseFloat(el.tagName === 'INPUT' ? el.value : (el.dataset.value ?? '')) || 0 : 0;
  const getMain = p => readEl(widget.querySelector(`[data-param="${p}"]`));
  const getSec  = p => readEl(prep.querySelector(`[data-sec-param="${p}"]`));

  const pieces  = getMain('pieces') || 1;
  const ballG   = getMain('weight');
  const hydrat  = getMain('hydration');
  const payload = {
    name: recipe.name, description: recipe.description, notes: recipe.notes,
    base_flour_g: Math.round(pieces * ballG / (1 + hydrat / 100)),
    default_pieces: pieces, default_ball_g: ballG, hydration_pct: hydrat,
    biga_pct: getMain('biga'), poolish_pct: getMain('poolish'), autolisi_pct: getMain('autolisi'),
    biga_hydration_pct: getSec('biga-acqua'), biga_yeast_pct: getSec('biga-lievito'),
    poolish_yeast_pct: getSec('poolish-lievito'), autolisi_water_pct: getSec('autolisi-acqua'),
    salt_pct: getSec('chiusura-sale'), yeast_pct: getSec('chiusura-lievito'),
    malto_pct: getSec('malto'), olio_pct: getSec('olio'), carbone_pct: recipe.carbone_pct || 0,
    extra_ingredients: recipe.extra_ingredients || [],
    sort_order: recipe.sort_order || 0,
  };
  try {
    await api('PUT', `/api/recipes/${recipe.id}`, payload);
    const freshRecipe = await api('GET', `/api/recipes/${recipe.id}`);
    // Update allRecipes cache
    const idx = allRecipes.findIndex(r => r.id === recipe.id);
    if (idx !== -1) allRecipes[idx] = { ...allRecipes[idx], ...freshRecipe };
    details.innerHTML = recipeDetailsHTML(freshRecipe, false);
    wireRecipeDetailViewMode(details, freshRecipe);
    onParamChange(freshRecipe.id, freshRecipe);
    toast('Parametri salvati!', 'success');
  } catch (e) {
    toast('Errore salvataggio', 'error');
  }
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
  document.getElementById('rf-malto').value = 0;
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
    document.getElementById('rf-malto').value = r.malto_pct ?? 0;
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
    malto_pct: parseFloat(document.getElementById('rf-malto').value) || 0,
    carbone_pct: 0,
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
  document.getElementById('vf-description').value = '';
  openModal('modal-variant');
}

function openEditVariant(variantId, name, description, recipeId) {
  document.getElementById('modal-variant-title').textContent = 'Modifica Variante';
  document.getElementById('variant-id-field').value = variantId;
  document.getElementById('variant-recipe-id-field').value = recipeId;
  document.getElementById('vf-name').value = name;
  document.getElementById('vf-description').value = description || '';
  openModal('modal-variant');
}

async function saveVariant() {
  const id = document.getElementById('variant-id-field').value;
  const recipeId = parseInt(document.getElementById('variant-recipe-id-field').value);
  const name = document.getElementById('vf-name').value.trim();
  const description = document.getElementById('vf-description').value.trim() || null;
  if (!name) { toast('Inserisci il nome della variante', 'error'); return; }

  try {
    if (id) {
      await api('PUT', `/api/variants/${id}`, { name, description, sort_order: 0 });
    } else {
      await api('POST', `/api/recipes/${recipeId}/variants`, { name, description, sort_order: 0 });
    }
    closeModal('modal-variant');
    await refreshMenuTab();
    toast('Variante salvata!', 'success');
  } catch (e) {
    toast('Errore salvataggio variante', 'error');
  }
}

async function deleteVariant(variantId) {
  if (!confirm('Eliminare questa variante e tutti i suoi condimenti?')) return;
  try {
    await api('DELETE', `/api/variants/${variantId}`);
    await refreshMenuTab();
    toast('Variante eliminata');
  } catch (e) {
    toast('Errore eliminazione', 'error');
  }
}

// ── Topping Modal ─────────────────────────────────────────────────────────────

function buildIngredientOptions(selectedId = null) {
  const opts = ['<option value="">— Personalizzato —</option>'];
  allIngredients.forEach(ing => {
    opts.push(`<option value="${ing.id}"${selectedId === ing.id ? ' selected' : ''}>${ing.name}</option>`);
  });
  return opts.join('');
}

function setNutritionReadonly(readonly) {
  ['tf-kcal', 'tf-protein', 'tf-carbs', 'tf-fat', 'tf-fiber'].forEach(id => {
    document.getElementById(id).readOnly = readonly;
  });
}

function openAddTopping(variantId) {
  document.getElementById('modal-topping-title').textContent = 'Aggiungi Ingrediente';
  document.getElementById('topping-id-field').value = '';
  document.getElementById('topping-variant-id-field').value = variantId;
  document.getElementById('tf-ingredient').innerHTML = buildIngredientOptions();
  document.getElementById('tf-name').value = '';
  document.getElementById('tf-qty').value = 0;
  ['tf-kcal', 'tf-protein', 'tf-carbs', 'tf-fat', 'tf-fiber'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('tf-name-group').style.display = '';
  setNutritionReadonly(false);
  updateToppingPreview();
  openModal('modal-topping');
}

function openEditTopping(topping) {
  document.getElementById('modal-topping-title').textContent = 'Modifica Ingrediente';
  document.getElementById('topping-id-field').value = topping.id;
  document.getElementById('topping-variant-id-field').value = topping.variant_id;
  document.getElementById('tf-ingredient').innerHTML = buildIngredientOptions(topping.ingredient_id);
  document.getElementById('tf-name').value = topping.name || '';
  document.getElementById('tf-qty').value = topping.quantity_g || 0;
  document.getElementById('tf-kcal').value = topping.kcal_per100 ?? '';
  document.getElementById('tf-protein').value = topping.protein_per100 ?? '';
  document.getElementById('tf-carbs').value = topping.carbs_per100 ?? '';
  document.getElementById('tf-fat').value = topping.fat_per100 ?? '';
  document.getElementById('tf-fiber').value = topping.fiber_per100 ?? '';
  const isLinked = !!topping.ingredient_id;
  document.getElementById('tf-name-group').style.display = isLinked ? 'none' : '';
  setNutritionReadonly(isLinked);
  updateToppingPreview();
  openModal('modal-topping');
}

document.getElementById('tf-ingredient').addEventListener('change', () => {
  const ingredientId = parseInt(document.getElementById('tf-ingredient').value) || null;
  const ing = ingredientId ? allIngredients.find(i => i.id === ingredientId) : null;
  if (ing) {
    document.getElementById('tf-name').value = ing.name;
    document.getElementById('tf-kcal').value = ing.kcal_per100 ?? '';
    document.getElementById('tf-protein').value = ing.protein_per100 ?? '';
    document.getElementById('tf-carbs').value = ing.carbs_per100 ?? '';
    document.getElementById('tf-fat').value = ing.fat_per100 ?? '';
    document.getElementById('tf-fiber').value = ing.fiber_per100 ?? '';
    document.getElementById('tf-name-group').style.display = 'none';
    setNutritionReadonly(true);
  } else {
    document.getElementById('tf-name-group').style.display = '';
    setNutritionReadonly(false);
  }
  updateToppingPreview();
});

['tf-qty', 'tf-kcal', 'tf-protein', 'tf-carbs', 'tf-fat', 'tf-fiber'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateToppingPreview);
});

function updateToppingPreview() {
  const qty     = parseFloat(document.getElementById('tf-qty').value) || 0;
  const kcal    = parseFloat(document.getElementById('tf-kcal').value) || 0;
  const protein = parseFloat(document.getElementById('tf-protein').value) || 0;
  const carbs   = parseFloat(document.getElementById('tf-carbs').value) || 0;
  const fat     = parseFloat(document.getElementById('tf-fat').value) || 0;
  const fiber   = parseFloat(document.getElementById('tf-fiber').value) || 0;

  const preview  = document.getElementById('tf-preview');
  const macrosEl = document.getElementById('tf-preview-macros');

  if (qty > 0 && (kcal > 0 || protein > 0 || carbs > 0 || fat > 0)) {
    const f = qty / 100;
    macrosEl.innerHTML = `
      <span class="macro-pill macro-kcal">${Math.round(kcal * f)} kcal</span>
      <span class="macro-pill macro-protein">${(Math.round(protein * f * 10) / 10)}g prot.</span>
      <span class="macro-pill macro-carbs">${(Math.round(carbs * f * 10) / 10)}g carb.</span>
      <span class="macro-pill macro-fat">${(Math.round(fat * f * 10) / 10)}g grassi</span>
      ${fiber > 0 ? `<span class="macro-pill macro-fiber">${(Math.round(fiber * f * 10) / 10)}g fibre</span>` : ''}`;
    preview.style.display = '';
  } else {
    preview.style.display = 'none';
  }
}

async function saveTopping() {
  const id = document.getElementById('topping-id-field').value;
  const variantId = parseInt(document.getElementById('topping-variant-id-field').value);
  const ingredientId = parseInt(document.getElementById('tf-ingredient').value) || null;

  let name = document.getElementById('tf-name').value.trim();
  if (!name && ingredientId) {
    name = allIngredients.find(i => i.id === ingredientId)?.name || '';
  }

  const body = {
    name,
    quantity_g: parseFloat(document.getElementById('tf-qty').value) || 0,
    kcal_per100:    parseFloat(document.getElementById('tf-kcal').value)    || null,
    protein_per100: parseFloat(document.getElementById('tf-protein').value) || null,
    carbs_per100:   parseFloat(document.getElementById('tf-carbs').value)   || null,
    fat_per100:     parseFloat(document.getElementById('tf-fat').value)     || null,
    fiber_per100:   parseFloat(document.getElementById('tf-fiber').value)   || null,
    ingredient_id: ingredientId,
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
    await refreshMenuTab();
    toast('Condimento salvato!', 'success');
  } catch (e) {
    toast('Errore salvataggio condimento', 'error');
  }
}

async function deleteTopping(toppingId) {
  try {
    await api('DELETE', `/api/toppings/${toppingId}`);
    await refreshMenuTab();
    toast('Condimento eliminato');
  } catch (e) {
    toast('Errore eliminazione', 'error');
  }
}

async function refreshMenuTab() {
  allVariants = await api('GET', '/api/variants').catch(() => allVariants);
  if (menuSubView === 'ingredienti') {
    allIngredients = await api('GET', '/api/ingredients').catch(() => allIngredients);
    renderMenuIngredienti();
  } else if (variantiSelectedRecipeId) {
    await renderVariantsForRecipe(variantiSelectedRecipeId);
  }
}

// ── Export / Import ────────────────────────────────────────────────────────────

function openExportModal() {
  renderExportModalBody('recipes');
  openModal('modal-export');
}

function renderExportModalBody(type) {
  const body = document.getElementById('modal-export-body');
  const typeSelector = `
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${['recipes','variants','ingredients','backup'].map(t => {
        const labels = { recipes: '🍕 Ricette', variants: '🍕 Varianti Pizza', ingredients: '🥫 Libreria Ingredienti', backup: '💾 Backup completo' };
        return `<button class="btn btn-sm export-type-btn${type === t ? ' btn-primary' : ' btn-ghost'}" data-type="${t}">${labels[t]}</button>`;
      }).join('')}
    </div>`;

  let inner = '';
  if (type === 'recipes') {
    if (!allRecipes.length) {
      inner = `<p style="color:var(--text-3);padding:4px 0">Nessuna ricetta da esportare.</p>`;
    } else {
      const items = allRecipes.map(r => `
        <label class="import-recipe-item">
          <input type="checkbox" class="export-recipe-check" value="${r.id}" checked>
          <span>${getRecipeEmoji(r.name)} ${r.name}</span>
        </label>`).join('');
      inner = `
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="btn btn-ghost btn-sm" id="export-sel-all">Seleziona tutto</button>
          <button class="btn btn-ghost btn-sm" id="export-desel-all">Deseleziona tutto</button>
        </div>
        <div class="import-recipe-list">${items}</div>`;
    }
  } else if (type === 'variants') {
    if (!allVariants.length) {
      inner = `<p style="color:var(--text-3);padding:4px 0">Nessuna variante da esportare.</p>`;
    } else {
      const byRecipe = {};
      allVariants.forEach(v => {
        if (!byRecipe[v.recipe_id]) byRecipe[v.recipe_id] = { name: v.recipe_name, variants: [] };
        byRecipe[v.recipe_id].variants.push(v);
      });
      const groups = Object.values(byRecipe).map(g => {
        const items = g.variants.map(v => `
          <label class="import-recipe-item" style="padding-left:24px">
            <input type="checkbox" class="export-variant-check" value="${v.id}" checked>
            <span>${v.name}</span>
          </label>`).join('');
        return `<div style="margin-bottom:8px">
          <div style="font-size:.82rem;font-weight:700;color:var(--text-2);margin-bottom:4px">${getRecipeEmoji(g.name)} ${g.name}</div>
          ${items}
        </div>`;
      }).join('');
      inner = `
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="btn btn-ghost btn-sm" id="export-sel-all">Seleziona tutto</button>
          <button class="btn btn-ghost btn-sm" id="export-desel-all">Deseleziona tutto</button>
        </div>
        <div class="import-recipe-list">${groups}</div>`;
    }
  } else if (type === 'ingredients') {
    inner = `<p style="color:var(--text-2);font-size:.88rem">Esporta l'intera libreria ingredienti con i valori nutrizionali.</p>`;
  } else {
    inner = `<p style="color:var(--text-2);font-size:.88rem">Esporta tutte le ricette + varianti + libreria ingredienti in un unico file reimportabile.</p>`;
  }

  body.innerHTML = `<div style="padding:4px">${typeSelector}${inner}</div>`;

  body.querySelectorAll('.export-type-btn').forEach(btn => {
    btn.addEventListener('click', () => renderExportModalBody(btn.dataset.type));
  });
  if (type === 'recipes' || type === 'variants') {
    const cls = type === 'variants' ? '.export-variant-check' : '.export-recipe-check';
    document.getElementById('export-sel-all')?.addEventListener('click', () => {
      document.querySelectorAll(cls).forEach(cb => { cb.checked = true; });
    });
    document.getElementById('export-desel-all')?.addEventListener('click', () => {
      document.querySelectorAll(cls).forEach(cb => { cb.checked = false; });
    });
  }
}

let pendingImportFile = null;

function importLoadingHTML(msg = 'Analisi file in corso...') {
  return `<div style="text-align:center; padding:24px">
    <div class="spinner" style="width:28px;height:28px;border-width:3px;margin:0 auto 12px"></div>
    <p style="color:var(--text-3)">${msg}</p>
  </div>`;
}

async function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx';
  input.onchange = async () => {
    pendingImportFile = input.files[0];
    if (!pendingImportFile) return;

    openModal('modal-import');
    document.getElementById('modal-import-body').innerHTML = importLoadingHTML();
    document.getElementById('btn-import-ok').style.display = 'none';

    try {
      const formData = new FormData();
      formData.append('file', pendingImportFile);
      const resp = await fetch('/api/preview-import', { method: 'POST', body: formData });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const preview = await resp.json();
      if (!preview.ok) {
        showImportError(preview.error);
      } else {
        showImportPreview(preview);
      }
    } catch (e) {
      showImportError(e.message);
    }
  };
  input.click();
}

function showImportPreview(preview) {
  const recipes = preview.recipes || [];
  const ingredients = preview.ingredients || [];
  const variants = preview.variants || [];
  const n = recipes.length;
  const ni = ingredients.length;
  const nv = variants.length;

  const recipeItems = recipes.map(r => `
    <label class="import-recipe-item">
      <input type="checkbox" class="import-recipe-check" value="${r.name}" checked>
      <span>${r.name}${r.already_exists ? ' <span class="import-exists-badge">già presente</span>' : ''}</span>
    </label>`).join('');

  const ingItems = ingredients.map(i => `
    <label class="import-recipe-item">
      <input type="checkbox" class="import-ingredient-check" value="${i.name}" checked>
      <span>${i.name}${i.already_exists ? ' <span class="import-exists-badge">già presente</span>' : ''}</span>
    </label>`).join('');

  const variantItems = variants.map(v => `
    <label class="import-recipe-item">
      <input type="checkbox" class="import-variant-check" value="${v.recipe_name}::${v.name}" checked>
      <span><span style="color:var(--text-3);font-size:.82rem">${v.recipe_name} / </span>${v.name}${v.already_exists ? ' <span class="import-exists-badge">già presente</span>' : ''}</span>
    </label>`).join('');

  const recipesSection = n > 0 ? `
    <p style="font-size:.82rem;font-weight:700;color:var(--text-2);margin-bottom:6px">Ricette (${n})</p>
    <div class="import-recipe-list">${recipeItems}</div>` : '';

  const variantsSection = nv > 0 ? `
    <p style="font-size:.82rem;font-weight:700;color:var(--text-2);margin:12px 0 6px">Varianti pizza (${nv})</p>
    <div class="import-recipe-list">${variantItems}</div>` : '';

  const ingredientsSection = ni > 0 ? `
    <p style="font-size:.82rem;font-weight:700;color:var(--text-2);margin:12px 0 6px">Ingredienti libreria (${ni})</p>
    <div class="import-recipe-list">${ingItems}</div>` : '';

  const emptyMsg = n === 0 && ni === 0 && nv === 0
    ? `<p style="color:var(--text-3)">Nessun dato trovato nel file.</p>` : '';

  document.getElementById('modal-import-body').innerHTML = `
    <div style="padding:4px">
      ${emptyMsg}${recipesSection}${variantsSection}${ingredientsSection}
      ${n > 0 ? `<label class="import-recipe-item" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <input type="checkbox" id="import-reset-check">
        <span style="font-size:.82rem;color:var(--text-3)">Sovrascrivi ricette già presenti</span>
      </label>` : ''}
      <button class="btn btn-primary" style="width:100%;margin-top:12px" id="btn-do-import">
        Importa selezionati
      </button>
    </div>`;

  document.getElementById('btn-do-import').addEventListener('click', doImportSelected);
}

async function doImportSelected() {
  const selectedRecipes = Array.from(document.querySelectorAll('.import-recipe-check:checked')).map(cb => cb.value);
  const selectedIngredients = Array.from(document.querySelectorAll('.import-ingredient-check:checked')).map(cb => cb.value);
  const selectedVariants = Array.from(document.querySelectorAll('.import-variant-check:checked')).map(cb => cb.value);
  if (!selectedRecipes.length && !selectedIngredients.length && !selectedVariants.length) {
    toast('Seleziona almeno un elemento', 'error'); return;
  }

  const reset = document.getElementById('import-reset-check')?.checked || false;
  document.getElementById('modal-import-body').innerHTML = importLoadingHTML('Importazione in corso...');
  document.getElementById('btn-import-ok').style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('file', pendingImportFile);
    const params = new URLSearchParams({ reset });
    if (selectedRecipes.length) params.set('only', selectedRecipes.join(','));
    if (selectedIngredients.length) params.set('only_ingredients', selectedIngredients.join(','));
    if (selectedVariants.length) params.set('only_variants', selectedVariants.join(','));
    const resp = await fetch(`/api/import-excel?${params}`, { method: 'POST', body: formData });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const res = await resp.json();
    showImportResult(res);
    await loadRecipes();
    allIngredients = await api('GET', '/api/ingredients').catch(() => allIngredients);
  } catch (e) {
    showImportError(e.message);
  }
}

function showImportResult(res) {
  let html = '';
  if (res.ok) {
    html = `
      <p style="color:var(--green); font-weight:700; margin-bottom:12px">Importazione completata!</p>
      <ul style="font-size:.9rem; line-height:2">
        <li>Ricette aggiunte: <strong>${res.recipes_added}</strong></li>
        <li>Varianti: <strong>${res.variants_added}</strong></li>
        <li>Ingredienti pizza: <strong>${res.toppings_added}</strong></li>
        ${res.ingredients_added != null ? `<li>Ingredienti libreria: <strong>${res.ingredients_added}</strong></li>` : ''}
        <li>Guide tempistiche: <strong>${res.timing_guides_added}</strong></li>
      </ul>`;
    if (res.errors && res.errors.length) {
      html += `<p style="color:var(--gold); margin-top:12px; font-size:.82rem">Avvisi: ${res.errors.join(' · ')}</p>`;
    }
  } else {
    html = `<p style="color:var(--red)">Errore: ${res.error}</p>`;
  }
  document.getElementById('modal-import-body').innerHTML = `<div style="padding:4px">${html}</div>`;
  document.getElementById('btn-import-ok').style.display = 'inline-flex';
}

function showImportError(msg) {
  document.getElementById('modal-import-body').innerHTML =
    `<p style="color:var(--red); padding:8px">Errore: ${msg}</p>`;
  document.getElementById('btn-import-ok').style.display = 'inline-flex';
}

// ── Menù Pizze Tab ────────────────────────────────────────────────────────────

function renderMenuTab() {
  if (menuSubView === 'ingredienti') {
    renderMenuIngredienti();
  } else {
    renderVariantiTab();
  }
}

// Sub-nav wiring (once, at bottom of file)

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
  const scrollY = window.scrollY;
  const content = document.getElementById('varianti-content');
  content.innerHTML = `<div style="padding:20px; color:var(--text-3); font-size:.85rem">Caricamento...</div>`;
  try {
    const recipe = await api('GET', `/api/recipes/${recipeId}`);
    // Populate toppings cache
    recipe.variants.forEach(v => {
      v.toppings.forEach(t => { toppingsCache[t.id] = t; });
    });

    const sortedVariants = [...recipe.variants].sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const variantsHTML = sortedVariants.length
      ? sortedVariants.map(v => variantHTML(v)).join('')
      : `<p style="color:var(--text-3); font-size:.85rem; padding:8px 0">Nessuna variante. Aggiungine una.</p>`;

    content.innerHTML = `
      <div id="variants-container-${recipeId}">${variantsHTML}</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" data-action="add-variant" data-recipe-id="${recipeId}">+ Aggiungi Variante</button>`;

    wireVariantButtons(content, recipeId);

    content.querySelectorAll('.variant-toggle').forEach(vBtn => {
      vBtn.addEventListener('click', () => vBtn.nextElementSibling.classList.toggle('open'));
    });

    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
  } catch (e) {
    content.innerHTML = `<p style="color:var(--red); padding:8px">Errore caricamento varianti.</p>`;
  }
}

function calcToppingMacros(t) {
  const qty = t.quantity_g || 0;
  const f = qty / 100;
  return {
    qty,
    kcal:    t.kcal_per100    != null ? Math.round(t.kcal_per100    * f)            : null,
    protein: t.protein_per100 != null ? Math.round(t.protein_per100 * f * 10) / 10 : null,
    carbs:   t.carbs_per100   != null ? Math.round(t.carbs_per100   * f * 10) / 10 : null,
    fat:     t.fat_per100     != null ? Math.round(t.fat_per100     * f * 10) / 10 : null,
    fiber:   t.fiber_per100   != null ? Math.round(t.fiber_per100   * f * 10) / 10 : null,
  };
}

function variantHTML(v) {
  const rows = sortToppingsCanonically(v.toppings).map(t => ({ t, m: calcToppingMacros(t) }));
  const hasNutrition = rows.some(({ m }) => m.kcal != null || m.protein != null);

  const sumOf = key => {
    const vals = rows.map(({ m }) => m[key]).filter(x => x != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10 : null;
  };

  const descHTML = v.description
    ? `<p class="variant-desc">${v.description}</p>`
    : '';

  let tableHTML;
  if (!v.toppings.length) {
    tableHTML = `<p style="color:var(--text-3); font-size:.8rem; margin-top:6px">Nessun ingrediente. Aggiungine uno.</p>`;
  } else {
    const bodyRows = rows.map(({ t, m }, idx) => `
      <tr data-topping-id="${t.id}">
        <td>${t.name}</td>
        <td class="num">${m.qty}</td>
        <td class="num">${fmt(m.kcal)}</td>
        <td class="num">${fmt(m.protein, 1)}</td>
        <td class="num">${fmt(m.carbs, 1)}</td>
        <td class="num">${fmt(m.fat, 1)}</td>
        <td class="num">${fmt(m.fiber, 1)}</td>
        <td class="td-actions">
          <button class="btn-icon btn-move-up" data-id="${t.id}" title="Sposta su"${idx === 0 ? ' disabled' : ''} style="font-size:.65rem">↑</button>
          <button class="btn-icon btn-move-down" data-id="${t.id}" title="Sposta giù"${idx === rows.length - 1 ? ' disabled' : ''} style="font-size:.65rem">↓</button>
          <button class="btn-icon btn-edit-topping" data-id="${t.id}" title="Modifica" style="font-size:.7rem">✏️</button>
          <button class="btn-icon btn-delete-topping" data-id="${t.id}" title="Elimina" style="font-size:.7rem">🗑️</button>
        </td>
      </tr>`).join('');

    const totRow = hasNutrition ? `
      <tr class="totale-row">
        <td><strong>Totale pizza</strong></td>
        <td></td>
        <td class="num"><strong>${fmt(sumOf('kcal'))}</strong></td>
        <td class="num"><strong>${fmt(sumOf('protein'), 1)}</strong></td>
        <td class="num"><strong>${fmt(sumOf('carbs'), 1)}</strong></td>
        <td class="num"><strong>${fmt(sumOf('fat'), 1)}</strong></td>
        <td class="num"><strong>${fmt(sumOf('fiber'), 1)}</strong></td>
        <td></td>
      </tr>` : '';

    tableHTML = `
      <table class="macro-table">
        <thead><tr>
          <th>Ingrediente</th>
          <th class="num">g</th>
          <th class="num">kcal</th>
          <th class="num">Prot.</th>
          <th class="num">Carbs.</th>
          <th class="num">Grassi</th>
          <th class="num">Fibre</th>
          <th></th>
        </tr></thead>
        <tbody>${bodyRows}${totRow}</tbody>
      </table>`;
  }

  return `
<div class="variant-item" data-variant-id="${v.id}">
  <button class="variant-toggle">
    <span>${v.name}</span>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn-ghost btn-sm btn-edit-variant" data-id="${v.id}" data-name="${v.name}" data-description="${(v.description || '').replace(/"/g,'&quot;')}" style="font-size:.7rem">Modifica</button>
      <button class="btn-ghost btn-sm btn-copy-variant" data-id="${v.id}" data-name="${v.name}" style="font-size:.7rem">Copia pizza ↗</button>
      <button class="btn-ghost btn-sm btn-copy-toppings" data-id="${v.id}" data-name="${v.name}" style="font-size:.7rem">Copia ingredienti →</button>
      <button class="btn-ghost btn-sm btn-delete-variant" data-id="${v.id}" style="font-size:.7rem; color:var(--red)">Elimina</button>
      <span>▾</span>
    </div>
  </button>
  <div class="variant-body open">
    ${descHTML}
    ${tableHTML}
    <button class="btn btn-ghost btn-sm" style="margin-top:8px" data-action="add-topping" data-variant-id="${v.id}">+ Aggiungi Ingrediente</button>
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
      openEditVariant(parseInt(btn.dataset.id), btn.dataset.name, btn.dataset.description, recipeId);
    });
  });
  container.querySelectorAll('.btn-delete-variant').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteVariant(parseInt(btn.dataset.id));
    });
  });
  container.querySelectorAll('.btn-copy-variant').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openCopyVariant(parseInt(btn.dataset.id), btn.dataset.name);
    });
  });
  container.querySelectorAll('.btn-copy-toppings').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openCopyToppings(parseInt(btn.dataset.id), btn.dataset.name);
    });
  });
  container.querySelectorAll('.btn-move-up').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      moveToppingInDir(parseInt(btn.dataset.id), -1);
    });
  });
  container.querySelectorAll('.btn-move-down').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      moveToppingInDir(parseInt(btn.dataset.id), 1);
    });
  });
  container.querySelectorAll('.btn-edit-topping').forEach(btn => {
    btn.addEventListener('click', () => openEditTopping(toppingsCache[parseInt(btn.dataset.id)]));
  });
  container.querySelectorAll('.btn-delete-topping').forEach(btn => {
    btn.addEventListener('click', () => deleteTopping(parseInt(btn.dataset.id)));
  });
}

// ── Sort toppings ─────────────────────────────────────────────────────────────

async function moveToppingInDir(toppingId, dir) {
  const row = document.querySelector(`tr[data-topping-id="${toppingId}"]`);
  if (!row) return;
  const tbody = row.closest('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr[data-topping-id]'));
  const idx = rows.findIndex(r => parseInt(r.dataset.toppingId) === toppingId);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= rows.length) return;
  const swapId = parseInt(rows[swapIdx].dataset.toppingId);
  try {
    await Promise.all([
      api('PATCH', `/api/toppings/${toppingId}/sort`, { sort_order: swapIdx * 10 }),
      api('PATCH', `/api/toppings/${swapId}/sort`, { sort_order: idx * 10 }),
    ]);
    renderVariantsForRecipe(variantiSelectedRecipeId);
  } catch (e) {
    toast('Errore ordinamento', 'error');
  }
}

// ── Copy variant ──────────────────────────────────────────────────────────────

function openCopyVariant(variantId, variantName) {
  document.getElementById('copy-variant-source-id').value = variantId;
  document.getElementById('copy-variant-desc').textContent = `Pizza: "${variantName}"`;
  const others = allRecipes.filter(r => r.id !== variantiSelectedRecipeId);
  document.getElementById('copy-variant-target-recipe').innerHTML =
    others.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  openModal('modal-copy-variant');
}

async function saveCopyVariant() {
  const variantId = parseInt(document.getElementById('copy-variant-source-id').value);
  const targetRecipeId = parseInt(document.getElementById('copy-variant-target-recipe').value);
  try {
    await api('POST', `/api/variants/${variantId}/copy`, { target_recipe_id: targetRecipeId });
    closeModal('modal-copy-variant');
    const targetName = allRecipes.find(r => r.id === targetRecipeId)?.name || 'ricetta';
    toast(`Pizza copiata in "${targetName}"`);
    allVariants = await api('GET', '/api/variants').catch(() => allVariants);
    if (variantiSelectedRecipeId) renderVariantsForRecipe(variantiSelectedRecipeId);
  } catch (e) {
    toast('Errore nella copia', 'error');
  }
}

// ── Copy toppings ─────────────────────────────────────────────────────────────

function openCopyToppings(variantId, variantName) {
  document.getElementById('copy-toppings-source-id').value = variantId;
  document.getElementById('copy-toppings-desc').textContent = `Copia ingredienti di: "${variantName}"`;
  const opts = [];
  allRecipes.forEach(r => {
    const vars = allVariants.filter(v => v.recipe_id === r.id && v.id !== variantId);
    if (vars.length) {
      opts.push(`<optgroup label="${r.name}">`);
      vars.forEach(v => opts.push(`<option value="${v.id}">${v.name}</option>`));
      opts.push('</optgroup>');
    }
  });
  document.getElementById('copy-toppings-target-variant').innerHTML = opts.join('');
  openModal('modal-copy-toppings');
}

async function saveCopyToppings() {
  const variantId = parseInt(document.getElementById('copy-toppings-source-id').value);
  const targetVariantId = parseInt(document.getElementById('copy-toppings-target-variant').value);
  try {
    await api('POST', `/api/variants/${variantId}/copy-toppings`, { target_variant_id: targetVariantId });
    closeModal('modal-copy-toppings');
    const targetName = allVariants.find(v => v.id === targetVariantId)?.name || 'pizza';
    toast(`Ingredienti copiati in "${targetName}"`);
    renderVariantsForRecipe(variantiSelectedRecipeId);
  } catch (e) {
    toast('Errore nella copia ingredienti', 'error');
  }
}

// ── Ingredient Library ────────────────────────────────────────────────────────

function renderMenuIngredienti() {
  const container = document.getElementById('menu-view-ingredienti');
  const headerHTML = `
    <div class="section-header" style="margin-bottom:16px">
      <h2 style="font-size:1.05rem; font-weight:700;">Libreria Ingredienti</h2>
      <button class="btn btn-primary btn-sm" id="btn-new-ingredient">+ Aggiungi Ingrediente</button>
    </div>`;

  if (!allIngredients.length) {
    container.innerHTML = headerHTML + `<div class="empty-state"><p>Nessun ingrediente in libreria.</p></div>`;
  } else {
    const rows = allIngredients.map(ing => `
      <tr>
        <td>${ing.name}</td>
        <td class="num">${ing.kcal_per100 != null ? fmt(ing.kcal_per100) : '—'}</td>
        <td class="num">${ing.protein_per100 != null ? fmt(ing.protein_per100, 1) : '—'}</td>
        <td class="num">${ing.carbs_per100 != null ? fmt(ing.carbs_per100, 1) : '—'}</td>
        <td class="num">${ing.fat_per100 != null ? fmt(ing.fat_per100, 1) : '—'}</td>
        <td class="num">${ing.fiber_per100 != null ? fmt(ing.fiber_per100, 1) : '—'}</td>
        <td class="td-actions">
          <button class="btn-icon btn-lookup-ingredient" data-id="${ing.id}" data-name="${ing.name}" title="Cerca valori su OpenFoodFacts">🔍</button>
          <button class="btn-icon btn-edit-ingredient" data-id="${ing.id}" title="Modifica">✏️</button>
          <button class="btn-icon btn-delete-ingredient" data-id="${ing.id}" title="Elimina">🗑️</button>
        </td>
      </tr>`).join('');

    container.innerHTML = headerHTML + `
      <table class="ingredient-table">
        <thead><tr>
          <th>Nome</th>
          <th class="num">kcal/100g</th>
          <th class="num">Prot. (g)</th>
          <th class="num">Carbs. (g)</th>
          <th class="num">Grassi (g)</th>
          <th class="num">Fibre (g)</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  container.querySelector('#btn-new-ingredient')?.addEventListener('click', openNewIngredient);
  container.querySelectorAll('.btn-lookup-ingredient').forEach(btn => {
    btn.addEventListener('click', () => lookupIngredientNutrition(parseInt(btn.dataset.id), btn.dataset.name));
  });
  container.querySelectorAll('.btn-edit-ingredient').forEach(btn => {
    btn.addEventListener('click', () => openEditIngredient(parseInt(btn.dataset.id)));
  });
  container.querySelectorAll('.btn-delete-ingredient').forEach(btn => {
    btn.addEventListener('click', () => deleteIngredient(parseInt(btn.dataset.id)));
  });
}

async function lookupIngredientNutrition(ingredientId, name) {
  const btn = document.querySelector(`.btn-lookup-ingredient[data-id="${ingredientId}"]`);
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  try {
    const results = await api('GET', `/api/lookup-nutrition?name=${encodeURIComponent(name)}&limit=5`);
    const list = Array.isArray(results) ? results : [results];
    if (list.length === 1) {
      applyLookupToIngredient(ingredientId, list[0]);
    } else if (list.length > 1) {
      showLookupDisambiguation(ingredientId, list);
    } else {
      toast('Nessun risultato su OpenFoodFacts', 'error');
    }
  } catch (e) {
    toast('Nessun risultato su OpenFoodFacts', 'error');
  } finally {
    if (btn) { btn.textContent = '🔍'; btn.disabled = false; }
  }
}

function applyLookupToIngredient(ingredientId, result) {
  openEditIngredient(ingredientId);
  document.getElementById('if-kcal').value    = result.kcal_per100;
  document.getElementById('if-protein').value = result.protein_per100;
  document.getElementById('if-carbs').value   = result.carbs_per100;
  document.getElementById('if-fat').value     = result.fat_per100;
  document.getElementById('if-fiber').value   = result.fiber_per100;
  closeModal('modal-lookup');
  toast(`Trovato: "${result.source_name}" — verifica i valori e salva`, 'success');
}

function showLookupDisambiguation(ingredientId, results) {
  const body = document.getElementById('modal-lookup-body');
  body.innerHTML = `
    <p style="font-size:.85rem;color:var(--text-2);margin-bottom:12px">Trovati ${results.length} risultati. Scegli quello corretto.</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${results.map((r, i) => `
        <button class="btn btn-secondary lookup-result-btn" data-idx="${i}"
          style="justify-content:flex-start;text-align:left;flex-direction:column;align-items:flex-start;padding:10px 14px">
          <div style="font-weight:600;font-size:.88rem">${r.source_name}</div>
          <div style="font-size:.76rem;color:var(--text-3);margin-top:2px">
            ${r.kcal_per100} kcal · ${r.protein_per100}g prot · ${r.carbs_per100}g carbs · ${r.fat_per100}g grassi
          </div>
        </button>`).join('')}
    </div>`;

  body.querySelectorAll('.lookup-result-btn').forEach(btn => {
    btn.addEventListener('click', () => applyLookupToIngredient(ingredientId, results[parseInt(btn.dataset.idx)]));
  });
  openModal('modal-lookup');
}

function openNewIngredient() {
  document.getElementById('modal-ingredient-title').textContent = 'Aggiungi Ingrediente';
  document.getElementById('ingredient-id-field').value = '';
  document.getElementById('if-name').value = '';
  ['if-kcal', 'if-protein', 'if-carbs', 'if-fat', 'if-fiber'].forEach(id => {
    document.getElementById(id).value = 0;
  });
  openModal('modal-ingredient');
}

function openEditIngredient(ingredientId) {
  const ing = allIngredients.find(i => i.id === ingredientId);
  if (!ing) return;
  document.getElementById('modal-ingredient-title').textContent = 'Modifica Ingrediente';
  document.getElementById('ingredient-id-field').value = ing.id;
  document.getElementById('if-name').value = ing.name;
  document.getElementById('if-kcal').value = ing.kcal_per100 ?? 0;
  document.getElementById('if-protein').value = ing.protein_per100 ?? 0;
  document.getElementById('if-carbs').value = ing.carbs_per100 ?? 0;
  document.getElementById('if-fat').value = ing.fat_per100 ?? 0;
  document.getElementById('if-fiber').value = ing.fiber_per100 ?? 0;
  openModal('modal-ingredient');
}

async function saveIngredient() {
  const id = document.getElementById('ingredient-id-field').value;
  const name = document.getElementById('if-name').value.trim();
  if (!name) { toast("Inserisci il nome dell'ingrediente", 'error'); return; }

  const body = {
    name,
    kcal_per100:    parseFloat(document.getElementById('if-kcal').value)    || 0,
    protein_per100: parseFloat(document.getElementById('if-protein').value) || 0,
    carbs_per100:   parseFloat(document.getElementById('if-carbs').value)   || 0,
    fat_per100:     parseFloat(document.getElementById('if-fat').value)     || 0,
    fiber_per100:   parseFloat(document.getElementById('if-fiber').value)   || 0,
  };

  try {
    const scrollY = window.scrollY;
    if (id) {
      await api('PUT', `/api/ingredients/${id}`, body);
    } else {
      await api('POST', '/api/ingredients', body);
    }
    closeModal('modal-ingredient');
    allIngredients = await api('GET', '/api/ingredients');
    renderMenuIngredienti();
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
    toast('Ingrediente salvato!', 'success');
  } catch (e) {
    toast('Errore salvataggio ingrediente', 'error');
  }
}

async function deleteIngredient(id) {
  if (!confirm('Eliminare questo ingrediente dalla libreria?')) return;
  try {
    await api('DELETE', `/api/ingredients/${id}`);
    allIngredients = await api('GET', '/api/ingredients');
    renderMenuIngredienti();
    toast('Ingrediente eliminato');
  } catch (e) {
    toast('Errore eliminazione', 'error');
  }
}

// ── Pizza Party ────────────────────────────────────────────────────────────────

let partyState = {};
let partyDebounceTimer = null;
let partyRowCounter = 0;

function renderPartyRecipes() {
  const container = document.getElementById('party-recipe-list');
  if (!allRecipes.length) {
    container.innerHTML = `<p style="color:var(--text-3);font-size:.85rem">Nessuna ricetta. Importa prima dall'Excel.</p>`;
    return;
  }
  container.innerHTML = allRecipes.map(r => {
    const active = !!partyState[r.id]?.active;
    return `
      <label class="recipe-checkbox-item${active ? ' selected' : ''}">
        <input type="checkbox" name="party-recipe" value="${r.id}"${active ? ' checked' : ''}>
        <div>
          <div class="recipe-radio-label">${r.name}</div>
          <div class="recipe-radio-meta">${r.hydration_pct}% idrat. · ${r.default_pieces}× ${r.default_ball_g}g</div>
        </div>
      </label>`;
  }).join('');
  container.querySelectorAll('input[type=checkbox]').forEach(inp => {
    inp.addEventListener('change', () => onPartyRecipeToggle(parseInt(inp.value), inp.checked));
  });
}

function onPartyRecipeToggle(recipeId, checked) {
  const label = document.querySelector(`input[name=party-recipe][value="${recipeId}"]`)?.closest('.recipe-checkbox-item');
  if (label) label.classList.toggle('selected', checked);
  if (checked) {
    const recipe = allRecipes.find(r => r.id === recipeId);
    if (!recipe) return;
    if (!partyState[recipeId]) {
      partyState[recipeId] = {
        active: true,
        pieces: recipe.default_pieces, ball_weight: recipe.default_ball_g,
        hydration: recipe.hydration_pct, salt: recipe.salt_pct,
        yeast: recipe.yeast_pct, biga: recipe.biga_pct,
        poolish: recipe.poolish_pct, autolisi: recipe.autolisi_pct,
        portion_denominator: 4,
        variant_rows: [],
      };
      const recipeVariants = allVariants.filter(v => v.recipe_id === recipeId);
      (recipeVariants.length ? recipeVariants : [null]).forEach(v => {
        partyState[recipeId].variant_rows.push({ row_id: ++partyRowCounter, variant_id: v?.id || null, count: 0 });
      });
    } else {
      partyState[recipeId].active = true;
    }
  } else {
    if (partyState[recipeId]) partyState[recipeId].active = false;
  }
  renderPartyRecipeCards();
  schedulePartyCalc();
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

function renderPartyRecipeCards() {
  const container = document.getElementById('party-recipe-cards');
  container.querySelectorAll('.party-recipe-card').forEach(card => {
    const rid = parseInt(card.dataset.recipeId);
    if (!partyState[rid]?.active) card.remove();
  });
  allRecipes.forEach(recipe => {
    const state = partyState[recipe.id];
    if (!state?.active) return;
    if (container.querySelector(`.party-recipe-card[data-recipe-id="${recipe.id}"]`)) return;
    const card = buildPartyRecipeCard(recipe, state);
    container.appendChild(card);
    wirePartyRecipeCard(card, recipe.id);
  });
}

function buildPartyRecipeCard(recipe, state) {
  const div = document.createElement('div');
  div.className = 'party-step party-recipe-card';
  div.dataset.recipeId = recipe.id;
  const composizioneHTML = state.variant_rows.map(row => `
    <div class="composizione-row" data-row-id="${row.row_id}">
      <select data-row-id="${row.row_id}">${buildVariantOptions(row.variant_id)}</select>
      <div class="counter-cell">
        <button class="counter-btn" data-action="dec">−</button>
        <span class="counter-val" id="crow-${row.row_id}">${row.count}</span>
        <button class="counter-btn" data-action="inc">+</button>
      </div>
      <button class="btn-remove" title="Rimuovi">✕</button>
    </div>`).join('');
  div.innerHTML = `
    <div class="party-step-header party-recipe-card-header">
      <div>
        <div class="party-recipe-card-name">${getRecipeEmoji(recipe.name)} ${recipe.name}</div>
        <div class="recipe-radio-meta" style="font-size:.75rem; color:var(--text-3); margin-top:2px">Step 2 — Parametri</div>
      </div>
    </div>
    <div class="party-step-body party-recipe-card-body">
      <div>
        <div class="party-recipe-section-label">Impasto</div>
        <div class="params-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="param-field"><label>N. Palline</label><input type="number" class="party-param" data-param="pieces" min="1" value="${state.pieces}"></div>
          <div class="param-field"><label>Peso (g)</label><input type="number" class="party-param" data-param="ball_weight" min="50" step="5" value="${state.ball_weight}"></div>
          <div class="param-field"><label>Idratazione (%)</label><span class="param-readonly-val">${state.hydration}</span></div>
          <div class="param-field"><label>Sale (%)</label><span class="param-readonly-val">${state.salt}</span></div>
          <div class="param-field"><label>Lievito (%)</label><span class="param-readonly-val">${state.yeast}</span></div>
          <div class="param-field" style="grid-column:span 1"></div>
          <div class="param-field"><label>BIGA (%)</label><span class="param-readonly-val">${state.biga}</span></div>
          <div class="param-field"><label>POOLISH (%)</label><span class="param-readonly-val">${state.poolish}</span></div>
          <div class="param-field"><label>AUTOLISI (%)</label><span class="param-readonly-val">${state.autolisi}</span></div>
        </div>
        <div class="piece-warning" id="party-warn-${recipe.id}" style="display:none"></div>
      </div>
      <div>
        <div class="party-recipe-section-label">Composizione Pizze</div>
        <div class="party-composizione-rows" data-recipe-id="${recipe.id}">${composizioneHTML}</div>
        <button class="btn btn-ghost btn-sm btn-add-row" data-recipe-id="${recipe.id}" style="margin-top:8px">+ Aggiungi Variante</button>
      </div>
      <div>
        <div class="party-recipe-section-label">Dimensione Porzione</div>
        <div class="portion-grid party-portion-grid" data-recipe-id="${recipe.id}">
          ${[2,3,4,6,8].map(v => `<button class="portion-btn${state.portion_denominator === v ? ' active' : ''}" data-val="${v}">1/${v} pizza</button>`).join('')}
        </div>
      </div>
    </div>`;
  return div;
}

function wirePartyRecipeCard(card, recipeId) {
  const state = partyState[recipeId];
  card.querySelectorAll('.party-param').forEach(inp => {
    inp.addEventListener('input', () => {
      state[inp.dataset.param] = parseFloat(inp.value) || 0;
      updatePartyPieceWarning(recipeId);
      schedulePartyCalc();
    });
  });
  // Read-only params (hydration, salt, yeast, biga, poolish, autolisi) come from recipe state
  // and are displayed as spans — no listener needed
  card.querySelector('.party-portion-grid').addEventListener('click', e => {
    const btn = e.target.closest('.portion-btn');
    if (!btn) return;
    card.querySelectorAll('.party-portion-grid .portion-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.portion_denominator = parseInt(btn.dataset.val);
    schedulePartyCalc();
  });
  card.querySelectorAll('.composizione-row').forEach(row => wireComposizioneRow(row, recipeId));
  card.querySelector('.btn-add-row').addEventListener('click', () => {
    const rowId = ++partyRowCounter;
    state.variant_rows.push({ row_id: rowId, variant_id: null, count: 0 });
    const rowsContainer = card.querySelector('.party-composizione-rows');
    const div = document.createElement('div');
    div.className = 'composizione-row';
    div.dataset.rowId = rowId;
    div.innerHTML = `
      <select data-row-id="${rowId}">${buildVariantOptions(null)}</select>
      <div class="counter-cell">
        <button class="counter-btn" data-action="dec">−</button>
        <span class="counter-val" id="crow-${rowId}">0</span>
        <button class="counter-btn" data-action="inc">+</button>
      </div>
      <button class="btn-remove" title="Rimuovi">✕</button>`;
    rowsContainer.appendChild(div);
    wireComposizioneRow(div, recipeId);
    schedulePartyCalc();
  });
}

function wireComposizioneRow(row, recipeId) {
  const state = partyState[recipeId];
  const rowId = parseInt(row.dataset.rowId);
  row.querySelector('select').addEventListener('change', e => {
    const sr = state.variant_rows.find(r => r.row_id === rowId);
    if (sr) sr.variant_id = parseInt(e.target.value) || null;
    updatePartyPieceWarning(recipeId);
    schedulePartyCalc();
  });
  row.querySelectorAll('.counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('crow-' + rowId);
      let val = parseInt(el.textContent) || 0;
      if (btn.dataset.action === 'inc') val++;
      else if (val > 0) val--;
      el.textContent = val;
      const sr = state.variant_rows.find(r => r.row_id === rowId);
      if (sr) sr.count = val;
      updatePartyPieceWarning(recipeId);
      schedulePartyCalc();
    });
  });
  row.querySelector('.btn-remove').addEventListener('click', () => {
    state.variant_rows = state.variant_rows.filter(r => r.row_id !== rowId);
    row.remove();
    updatePartyPieceWarning(recipeId);
    schedulePartyCalc();
  });
}

function updatePartyPieceWarning(recipeId) {
  const state = partyState[recipeId];
  if (!state) return;
  const assigned = state.variant_rows.reduce((s, r) => s + (r.count || 0), 0);
  const warning = document.getElementById(`party-warn-${recipeId}`);
  if (!warning) return;
  const show = assigned > 0 && assigned !== (state.pieces || 0);
  warning.style.display = show ? 'block' : 'none';
  if (show) warning.textContent = `Totale assegnato: ${assigned} su ${state.pieces} palline`;
}

function schedulePartyCalc() {
  clearTimeout(partyDebounceTimer);
  partyDebounceTimer = setTimeout(calcParty, 400);
}

async function calcParty() {
  const activeRecipes = allRecipes.filter(r => partyState[r.id]?.active);
  if (!activeRecipes.length) {
    document.getElementById('results-empty').style.display = '';
    document.getElementById('results-content').style.display = 'none';
    return;
  }
  const requests = activeRecipes.map(recipe => {
    const state = partyState[recipe.id];
    const variantQuantities = state.variant_rows
      .filter(row => row.variant_id && row.count > 0)
      .map(row => ({ variant_id: row.variant_id, count: row.count }));
    return api('POST', '/api/pizza-party', {
      recipe_id: recipe.id,
      target_pieces: state.pieces || 1,
      ball_weight_g: state.ball_weight || null,
      hydration_pct: state.hydration,
      salt_pct: state.salt,
      yeast_pct: state.yeast || 0,
      biga_pct: state.biga || 0,
      poolish_pct: state.poolish || 0,
      autolisi_pct: state.autolisi || 0,
      variant_quantities: variantQuantities,
      portion_denominator: state.portion_denominator || 4,
    }).then(result => ({ recipe, result })).catch(err => ({ recipe, error: err.message }));
  });
  const outcomes = await Promise.all(requests);
  renderPartyResults(outcomes);
}

function partyVariantCardHTML(v, portionDenom = 4) {
  const sortedToppings = sortToppingsCanonically(v.toppings);
  const hasMacros = sortedToppings.some(t => t.macros_per_pizza.kcal > 0);
  let tableHTML;
  if (!sortedToppings.length) {
    tableHTML = `<p style="color:var(--text-3);font-size:.8rem">Nessun condimento</p>`;
  } else {
    const bodyRows = sortedToppings.map(t => {
      const m = t.macros_per_pizza;
      return `<tr>
        <td>${t.name}</td>
        <td class="num">${fmtG(t.quantity_g_per_pizza)}</td>
        ${hasMacros ? `<td class="num">${fmt(m.kcal)}</td><td class="num">${fmt(m.protein_g,1)}</td><td class="num">${fmt(m.carbs_g,1)}</td><td class="num">${fmt(m.fat_g,1)}</td><td class="num">${fmt(m.fiber_g,1)}</td>` : ''}
      </tr>`;
    }).join('');
    const tot = v.per_pizza_macros;
    const totRow = hasMacros ? `<tr class="totale-row"><td><strong>Totale</strong></td><td></td><td class="num"><strong>${fmt(tot.kcal)}</strong></td><td class="num"><strong>${fmt(tot.protein_g,1)}</strong></td><td class="num"><strong>${fmt(tot.carbs_g,1)}</strong></td><td class="num"><strong>${fmt(tot.fat_g,1)}</strong></td><td class="num"><strong>${fmt(tot.fiber_g,1)}</strong></td></tr>` : '';
    const p = v.per_portion_macros;
    const portRow = hasMacros ? `<tr style="color:var(--text-3);font-size:.78rem"><td>1/${portionDenom} pizza</td><td></td><td class="num">${fmt(p.kcal)}</td><td class="num">${fmt(p.protein_g,1)}</td><td class="num">${fmt(p.carbs_g,1)}</td><td class="num">${fmt(p.fat_g,1)}</td><td class="num">${fmt(p.fiber_g,1)}</td></tr>` : '';
    tableHTML = `<table class="macro-table" style="font-size:.78rem"><thead><tr><th>Ingrediente</th><th class="num">g/pizza</th>${hasMacros ? '<th class="num">kcal</th><th class="num">Prot.</th><th class="num">Carbs.</th><th class="num">Grassi</th><th class="num">Fibre</th>' : ''}</tr></thead><tbody>${bodyRows}${totRow}${portRow}</tbody></table>`;
  }
  return `<div class="variant-result-card"><div class="variant-result-header"><span>${v.name}</span><span style="color:var(--text-3);font-size:.78rem;font-weight:400">${v.count} pizza${v.count>1?'e':''}</span></div><div class="variant-result-body">${tableHTML}</div></div>`;
}

function doughTableHTML(d) {
  const prefHTML = [
    d.biga_flour_g > 0     ? `<tr class="prefermento"><td>↳ BIGA farina</td><td class="num">${fmtG(d.biga_flour_g)}</td></tr>` : '',
    d.poolish_flour_g > 0  ? `<tr class="prefermento"><td>↳ POOLISH farina</td><td class="num">${fmtG(d.poolish_flour_g)}</td></tr>` : '',
    d.autolisi_flour_g > 0 ? `<tr class="prefermento"><td>↳ AUTOLISI farina</td><td class="num">${fmtG(d.autolisi_flour_g)}</td></tr>` : '',
  ].join('');
  const extrasHTML = (d.extra_ingredients || []).map(e => `<tr><td>${e.name}</td><td class="num">${fmtG(e.grams)}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:.85rem"><tbody>
    <tr><td>Farina</td><td class="num">${fmtG(d.flour_g)}</td></tr>
    <tr><td>Acqua</td><td class="num">${fmtG(d.water_g)}</td></tr>
    <tr><td>Sale</td><td class="num">${fmtG(d.salt_g)}</td></tr>
    ${d.yeast_g > 0 ? `<tr><td>Lievito</td><td class="num">${fmtG(d.yeast_g)}</td></tr>` : ''}
    ${prefHTML}${extrasHTML}
    <tr class="total-row"><td>Totale Impasto</td><td class="num">${fmtG(d.total_dough_g)}</td></tr>
    <tr style="color:var(--text-3);font-size:.8rem"><td>${d.actual_pieces} palline × ${fmtG(d.actual_ball_g)}</td><td></td></tr>
  </tbody></table>`;
}

function renderPartyResults(outcomes) {
  lastPartyOutcomes = outcomes;
  const empty   = document.getElementById('results-empty');
  const content = document.getElementById('results-content');
  empty.style.display = 'none';
  content.style.display = '';
  if (window.innerWidth < 900) {
    setTimeout(() => document.getElementById('results-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }

  // Combined shopping list
  const shoppingTotals = {};
  outcomes.forEach(({ result }) => {
    if (!result) return;
    (result.shopping_list || []).forEach(s => {
      shoppingTotals[s.name] = (shoppingTotals[s.name] || 0) + s.total_g;
    });
  });
  const combined = Object.entries(shoppingTotals).sort((a, b) => b[1] - a[1]);
  const shoppingHTML = combined.length
    ? combined.map(([name, g]) => `<div class="shopping-item"><span>${name}</span><span class="shopping-weight">${fmtG(Math.round(g * 10) / 10)}</span></div>`).join('')
    : `<p style="color:var(--text-3);font-size:.82rem">Nessun condimento con quantità.</p>`;

  // Per-recipe sections
  const recipeSections = outcomes.map(({ recipe, result, error }) => {
    if (error) return `<div class="results-section"><div class="results-section-title">${getRecipeEmoji(recipe.name)} ${recipe.name}</div><div class="results-section-body" style="color:var(--red);font-size:.85rem">Errore: ${error}</div></div>`;
    const portionDenom = partyState[recipe.id]?.portion_denominator || 4;
    const variantsHTML = result.variants.filter(v => v.count > 0).map(v => partyVariantCardHTML(v, portionDenom)).join('') ||
      `<p style="color:var(--text-3);font-size:.85rem;padding:8px 0">Nessuna variante assegnata.</p>`;
    return `
      <div class="results-section">
        <div class="results-section-title">${getRecipeEmoji(recipe.name)} ${recipe.name} — Impasto</div>
        <div class="results-section-body" style="padding-bottom:8px">${doughTableHTML(result.dough)}</div>
      </div>
      <div class="results-section">
        <div class="results-section-title">${getRecipeEmoji(recipe.name)} ${recipe.name} — Pizze</div>
        <div class="results-section-body">${variantsHTML}</div>
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="results-section">
      <div class="results-section-title">Lista Spesa Condimenti</div>
      <div class="results-section-body">${shoppingHTML}</div>
    </div>
    ${recipeSections}
    <div style="padding:14px 18px;display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" id="party-btn-save" style="width:100%">💾 Salva e pianifica</button>
      <button class="btn btn-secondary" id="party-btn-share" style="width:100%">📤 Condividi riepilogo</button>
    </div>`;

  document.getElementById('party-btn-share').addEventListener('click', sharePartyResults);
  document.getElementById('party-btn-save').addEventListener('click', savePartyForPlanner);
}

function formatSharedText(outcomes, timelines) {
  const dateStr = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [`🍕 PIZZA PARTY — ${dateStr}`, ''];
  const hasParty = outcomes && outcomes.some(o => o.result);
  const hasTl = timelines && Object.keys(timelines).length > 0;

  // 1. Lista della spesa
  if (hasParty) {
    const shoppingTotals = {};
    outcomes.forEach(({ result }) => {
      if (!result) return;
      (result.shopping_list || []).forEach(s => {
        shoppingTotals[s.name] = (shoppingTotals[s.name] || 0) + s.total_g;
      });
    });
    const combined = Object.entries(shoppingTotals).sort((a, b) => b[1] - a[1]);
    if (combined.length) {
      lines.push('══ LISTA DELLA SPESA ══');
      combined.forEach(([name, g]) => lines.push(`☐ ${name}: ${Math.round(g)} g`));
      lines.push('');
    }
  }

  // 2. Le pizze
  if (hasParty) {
    lines.push('══ LE PIZZE ══');
    outcomes.forEach(({ recipe, result, error }) => {
      if (error || !result) return;
      const portionDenom = partyState[recipe.id]?.portion_denominator || 4;
      const emoji = getRecipeEmoji(recipe.name);
      const d = result.dough;
      lines.push(`${emoji} ${recipe.name.toUpperCase()} — IMPASTO`);
      let doughLine = `Farina: ${Math.round(d.flour_g)} g  |  Acqua: ${Math.round(d.water_g)} g  |  Sale: ${Math.round(d.salt_g)} g`;
      if (d.yeast_g > 0) doughLine += `  |  Lievito: ${Math.round(d.yeast_g)} g`;
      lines.push(doughLine);
      if (d.biga_flour_g > 0)     lines.push(`  ↳ BIGA: ${Math.round(d.biga_flour_g)} g farina`);
      if (d.poolish_flour_g > 0)  lines.push(`  ↳ POOLISH: ${Math.round(d.poolish_flour_g)} g farina`);
      if (d.autolisi_flour_g > 0) lines.push(`  ↳ AUTOLISI: ${Math.round(d.autolisi_flour_g)} g farina`);
      (d.extra_ingredients || []).forEach(e => lines.push(`  ↳ ${e.name}: ${Math.round(e.grams)} g`));
      lines.push(`${d.actual_pieces} panetti × ${Math.round(d.actual_ball_g)} g`);
      lines.push('');
      result.variants.filter(v => v.count > 0).forEach(v => {
        lines.push(`${v.name.toUpperCase()} × ${v.count} pizza${v.count > 1 ? 'e' : ''}`);
        sortToppingsCanonically(v.toppings).forEach(t => lines.push(`  ${t.name}: ${Math.round(t.quantity_g_per_pizza)} g / pizza`));
        const kcalPizza = Math.round(v.per_pizza_macros.kcal);
        const kcalFetta = Math.round(v.per_portion_macros.kcal);
        if (kcalPizza > 0) lines.push(`  🔥 ${kcalPizza} kcal / pizza  |  ${kcalFetta} kcal / fetta (1/${portionDenom})`);
        lines.push('');
      });
    });
  }

  // 3. Tempistiche
  if (hasTl) {
    lines.push('══ LE TEMPISTICHE ══');
    for (const [recipeKey, events] of Object.entries(timelines)) {
      const recipe = TIMING_DATA[recipeKey];
      lines.push(`── ${recipe.emoji} ${recipe.name.toUpperCase()} ──`);
      let lastDay = null;
      for (const ev of events) {
        const day = ev.start.toDateString();
        if (day !== lastDay) {
          lines.push(`  ${fmtDay(ev.start).toUpperCase()}`);
          lastDay = day;
        }
        const marker = ev.isService ? '🍕' : '•';
        lines.push(`  ${marker} ${fmtTime(ev.start)} → ${fmtTime(ev.end)}  ${ev.name}`);
        if (ev.note) lines.push(`     ${ev.note}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

function formatPartyText(outcomes) {
  return formatSharedText(outcomes, plannerTimelines);
}

async function sharePartyResults() {
  const text = formatPartyText(lastPartyOutcomes);
  if (navigator.share) {
    try {
      await navigator.share({ title: '🍕 Pizza Party', text });
    } catch (e) {
      if (e.name !== 'AbortError') toast('Condivisione non riuscita', 'error');
    }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      toast('Riepilogo copiato negli appunti!');
    } catch (e) {
      window.open(`mailto:?subject=${encodeURIComponent('🍕 Pizza Party')}&body=${encodeURIComponent(text)}`);
    }
  }
}

// ── Menu sub-nav ──────────────────────────────────────────────────────────────

document.querySelectorAll('.subnav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subnav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    menuSubView = btn.dataset.view;
    if (menuSubView === 'pizze') {
      document.getElementById('menu-view-pizze').style.display = '';
      document.getElementById('menu-view-ingredienti').style.display = 'none';
      renderVariantiTab();
    } else {
      document.getElementById('menu-view-pizze').style.display = 'none';
      document.getElementById('menu-view-ingredienti').style.display = '';
      renderMenuIngredienti();
    }
  });
});

// ── Global button wires ───────────────────────────────────────────────────────

function openTemplateModal() { openModal('modal-template'); }

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

document.getElementById('btn-new-recipe').addEventListener('click', openNewRecipe);
document.getElementById('btn-import').addEventListener('click', triggerImport);
document.getElementById('btn-export').addEventListener('click', openExportModal);
document.getElementById('btn-template').addEventListener('click', openTemplateModal);

document.getElementById('modal-export-close').addEventListener('click', () => closeModal('modal-export'));
document.getElementById('btn-export-cancel').addEventListener('click',  () => closeModal('modal-export'));
document.getElementById('btn-export-confirm').addEventListener('click', () => {
  const activeTypeBtn = document.querySelector('.export-type-btn.btn-primary');
  const type = activeTypeBtn?.dataset.type || 'recipes';

  if (type === 'ingredients') {
    downloadFile('/api/export-excel?type=ingredients', 'ingredienti_export.xlsx');
    closeModal('modal-export');
    return;
  }
  if (type === 'backup') {
    downloadFile('/api/export-excel?type=backup', 'backup_completo.xlsx');
    closeModal('modal-export');
    return;
  }
  if (type === 'variants') {
    const checked = document.querySelectorAll('.export-variant-check:checked');
    const ids = Array.from(checked).map(cb => cb.value).join(',');
    if (!ids) { toast('Seleziona almeno una variante', 'error'); return; }
    downloadFile(`/api/export-excel?type=variants&variant_ids=${ids}`, 'varianti_export.xlsx');
    closeModal('modal-export');
    return;
  }
  const checked = document.querySelectorAll('.export-recipe-check:checked');
  const ids = Array.from(checked).map(cb => cb.value).join(',');
  if (!ids) { toast('Seleziona almeno una ricetta', 'error'); return; }
  downloadFile(`/api/export-excel?ids=${ids}`, 'ricette_export.xlsx');
  closeModal('modal-export');
});

document.getElementById('modal-template-close').addEventListener('click', () => closeModal('modal-template'));
document.getElementById('btn-template-cancel').addEventListener('click',  () => closeModal('modal-template'));
document.getElementById('btn-template-recipes').addEventListener('click', () => {
  downloadFile('/api/import-template?type=recipes', 'template_ricette.xlsx');
  closeModal('modal-template');
});
document.getElementById('btn-template-ingredients').addEventListener('click', () => {
  downloadFile('/api/import-template?type=ingredients', 'template_ingredienti.xlsx');
  closeModal('modal-template');
});

document.getElementById('modal-lookup-close').addEventListener('click', () => closeModal('modal-lookup'));
document.getElementById('btn-lookup-cancel').addEventListener('click',  () => closeModal('modal-lookup'));

document.getElementById('modal-recipe-close').addEventListener('click', () => closeModal('modal-recipe'));
document.getElementById('btn-recipe-cancel').addEventListener('click',  () => closeModal('modal-recipe'));
document.getElementById('btn-recipe-save').addEventListener('click',    saveRecipe);

document.getElementById('modal-variant-close').addEventListener('click', () => closeModal('modal-variant'));
document.getElementById('btn-variant-cancel').addEventListener('click',  () => closeModal('modal-variant'));
document.getElementById('btn-variant-save').addEventListener('click',    saveVariant);

document.getElementById('modal-topping-close').addEventListener('click', () => closeModal('modal-topping'));
document.getElementById('btn-topping-cancel').addEventListener('click',  () => closeModal('modal-topping'));
document.getElementById('btn-topping-save').addEventListener('click',    saveTopping);

document.getElementById('modal-ingredient-close').addEventListener('click', () => closeModal('modal-ingredient'));
document.getElementById('btn-ingredient-cancel').addEventListener('click',  () => closeModal('modal-ingredient'));
document.getElementById('btn-ingredient-save').addEventListener('click',    saveIngredient);

document.getElementById('modal-copy-variant-close').addEventListener('click',  () => closeModal('modal-copy-variant'));
document.getElementById('btn-copy-variant-cancel').addEventListener('click',   () => closeModal('modal-copy-variant'));
document.getElementById('btn-copy-variant-save').addEventListener('click',     saveCopyVariant);

document.getElementById('modal-copy-toppings-close').addEventListener('click', () => closeModal('modal-copy-toppings'));
document.getElementById('btn-copy-toppings-cancel').addEventListener('click',  () => closeModal('modal-copy-toppings'));
document.getElementById('btn-copy-toppings-save').addEventListener('click',    saveCopyToppings);

document.getElementById('modal-import-close').addEventListener('click', () => closeModal('modal-import'));
document.getElementById('btn-import-ok').addEventListener('click',      () => closeModal('modal-import'));

// ── Debounce helper ───────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Pianificatore Impasti ─────────────────────────────────────────────────────

// Inserire qui il client_id OAuth da Google Cloud Console (Calendar API abilitata)
const GOOGLE_CLIENT_ID = '630068197345-e012i77rep7i806llt6dpmgkqv3m9fbv.apps.googleusercontent.com';

const TIMING_DATA = {
  focaccia: {
    name: 'Focaccia Romana in Teglia', emoji: '🟢',
    calendarColorId: '2',
    serviceLabel: 'Orario in cui la focaccia è pronta',
    serviceEventName: '🍕 Focaccia pronta — Servizio',
    serviceEventDuration: 0,
    steps: [
      { name: 'Preparazione prefermenti (biga + poolish)', inverno: 15, estate: 15, note: '' },
      { name: 'Prefermenti a temperatura ambiente', inverno: 240, estate: 60, note: 'Poolish dopo 1h può andare in frigo' },
      { name: 'Prefermenti in frigo', inverno: 1440, estate: 1440, note: 'Minimo 24h, max 48h' },
      { name: 'Chiusura impasto', inverno: 30, estate: 30, note: '' },
      { name: 'Riposo impasto', inverno: 120, estate: 60, note: 'Guida: 1.5× volume' },
      { name: 'Staglio', inverno: 15, estate: 15, note: 'Base umida in alto, cospargi farina' },
      { name: 'Lievitazione panetti + stesura', inverno: 240, estate: 240, note: 'Guida: 2× volume. Stesura: 80% teglia, parte umida sotto, lavora ultimi 2cm' },
      { name: 'Accensione forno + preriscaldo', inverno: 30, estate: 30, note: '280-290°', parallel: true },
      { name: 'Prima cottura', inverno: 10, estate: 10, note: 'Fondo più che platea' },
      { name: 'Seconda cottura', inverno: 3, estate: 3, note: '2-4 min, stessa T°, sciogliere ingredienti' },
    ],
  },
  napoletana: {
    name: 'Pizza Napoletana', emoji: '🍕',
    calendarColorId: '7',
    serviceLabel: 'Orario di inizio pizzata (prima pizza)',
    serviceEventName: '🍕 Pizzata',
    serviceEventDuration: 90,
    steps: [
      { name: 'Preparazione prefermenti (biga + poolish)', inverno: 15, estate: 15, note: '' },
      { name: 'Prefermenti a temperatura ambiente', inverno: 240, estate: 60, note: 'Poolish dopo 1h può andare in frigo' },
      { name: 'Prefermenti in frigo', inverno: 1440, estate: 1440, note: 'Minimo 24h, max 48h' },
      { name: 'Chiusura impasto', inverno: 30, estate: 30, note: '' },
      { name: 'Riposo impasto', inverno: 120, estate: 60, note: 'Guida: 1.5× volume' },
      { name: 'Staglio', inverno: 15, estate: 15, note: 'Base umida in alto, cospargi farina' },
      { name: 'Lievitazione panetti', inverno: 210, estate: 120, note: 'Guida: 2× volume' },
      { name: 'Accensione forno + preriscaldo', inverno: 25, estate: 25, note: '', parallel: true },
    ],
  },
  brioche: {
    name: 'Pasta Brioche', emoji: '🥐',
    calendarColorId: '5',
    serviceLabel: 'Orario di uscita dal forno',
    serviceEventName: '🥐 Brioche pronta — Servizio',
    serviceEventDuration: 0,
    steps: [
      { name: 'Impasto fase 1 (formazione glutine)', inverno: 10, estate: 10, note: 'Tutti gli ingredienti eccetto metà zucchero, sale, burro, aromi' },
      { name: 'Impasto fase 2 (struttura finale)', inverno: 10, estate: 60, note: 'Aggiungi zucchero + sale. Controlla T° < 26°, altrimenti frigo' },
      { name: 'Impasto fase 3 — chiusura', inverno: 15, estate: 15, note: 'Burro + aromi poco alla volta. T° 24-26° se frigo, 27-28° se porzioni subito' },
      { name: 'Riposo a temperatura ambiente', inverno: 20, estate: 20, note: '' },
      { name: 'Lievitazione massa in frigo 4°', inverno: 720, estate: 480, note: 'Guida: 1.5× volume' },
      { name: 'Divisione e formatura', inverno: 10, estate: 10, note: 'Conviene fare preforma' },
      { name: 'Lievitazione + farcitura forme', inverno: 240, estate: 120, note: 'Guida: 2× volume' },
      { name: 'Cottura', inverno: 20, estate: 20, note: 'Preriscaldo 190°, abbassa a 170° in infornata. Bun: 15-17 min, Bauletti: 25 min' },
    ],
  },
};

let plannerState = { recipes: [], day: null, time: null, season: null };
let plannerTimelines = {}; // recipeKey → events[]
let googleTokenClient = null;
let googleAccessToken = null;
let plannerInited = false;
let savedPartyConfig = null; // set by savePartyForPlanner()

function partyRecipeToPlanner(recipeName) {
  const n = (recipeName || '').toLowerCase();
  if (n.includes('napoletana') || n.includes('napolit')) return 'napoletana';
  if (n.includes('focaccia') || n.includes('teglia')) return 'focaccia';
  if (n.includes('brioche') || n.includes('bun') || n.includes('bread')) return 'brioche';
  return null;
}

function savePartyForPlanner() {
  const activeRecipes = allRecipes.filter(r => partyState[r.id]?.active);
  if (!activeRecipes.length) return;
  const firstRecipe = activeRecipes[0];
  const state = partyState[firstRecipe.id];
  const recipeKeys = activeRecipes.map(r => partyRecipeToPlanner(r.name)).filter(Boolean);
  savedPartyConfig = {
    recipeKeys,
    pieces: state.pieces || firstRecipe.default_pieces,
  };
  // switch al tab planner
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="planner"]').classList.add('active');
  document.getElementById('tab-planner').classList.add('active');
  plannerInited = false; // forza re-init per mostrare la config del party
  initPlanner();
}

function initPlanner() {
  if (plannerInited) return;
  plannerInited = true;
  renderPlannerRecipeCards();
  renderPlannerDayPills();
  renderPlannerTimePills();

  // Season buttons (static HTML → wire via JS)
  document.querySelectorAll('.season-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPlannerSeason(btn.dataset.season));
  });

  // Calendar buttons (static HTML → wire via JS)
  document.getElementById('planner-btn-share').addEventListener('click', sharePlannerTimeline);
  document.getElementById('planner-btn-connect').addEventListener('click', connectGoogleCalendar);
  document.getElementById('planner-btn-create').addEventListener('click', createCalendarEvents);

  const month = new Date().getMonth() + 1;
  const autoSeason = (month >= 4 && month <= 10) ? 'estate' : 'inverno';
  selectPlannerSeason(autoSeason, true);

  // Se arriva da "Salva Pizza Party", pre-seleziona tutte le ricette attive
  if (savedPartyConfig?.recipeKeys?.length) {
    plannerState.recipes = [...savedPartyConfig.recipeKeys];
    document.querySelectorAll('.planner-recipe-card').forEach(c => {
      c.classList.toggle('active', plannerState.recipes.includes(c.dataset.key));
    });
    tryCalcPlannerTimeline();
  }
}

function renderPlannerRecipeCards() {
  const el = document.getElementById('planner-recipe-cards');
  el.innerHTML = Object.entries(TIMING_DATA).map(([key, r]) => {
    const fromParty = savedPartyConfig?.recipeKeys?.includes(key);
    const isActive = fromParty || plannerState.recipes.includes(key);
    const desc = fromParty
      ? `🍕 Dal Pizza Party — ${savedPartyConfig.pieces} pizze`
      : r.serviceLabel;
    return `<div class="planner-recipe-card${isActive ? ' active' : ''}" id="planner-rc-${key}" data-key="${key}">
      <span class="planner-recipe-emoji">${r.emoji}</span>
      <div>
        <div class="planner-recipe-name">${r.name}</div>
        <div class="planner-recipe-desc">${desc}</div>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.planner-recipe-card').forEach(card => {
    card.addEventListener('click', () => togglePlannerRecipe(card.dataset.key));
  });
}

function renderPlannerDayPills() {
  const el = document.getElementById('planner-day-pills');
  const today = new Date();
  const days = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Oggi' : i === 1 ? 'Domani' : d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
    days.push(`<button class="planner-pill" data-day="${dateStr}">${label}</button>`);
  }
  el.innerHTML = days.join('');
  el.querySelectorAll('.planner-pill').forEach(btn => {
    btn.addEventListener('click', () => selectPlannerDay(btn.dataset.day));
  });
}

function renderPlannerTimePills() {
  const el = document.getElementById('planner-time-pills');
  const presets = ['12:30','13:00','19:00','19:30','20:00','20:30','21:00'];
  el.innerHTML = presets.map(t =>
    `<button class="planner-pill" data-time="${t}">${t}</button>`
  ).join('') + `<button class="planner-pill" data-time="altro">Altro...</button>`;
  el.querySelectorAll('.planner-pill').forEach(btn => {
    btn.addEventListener('click', () => selectPlannerTime(btn.dataset.time));
  });
}

function togglePlannerRecipe(key) {
  const idx = plannerState.recipes.indexOf(key);
  if (idx >= 0) {
    plannerState.recipes.splice(idx, 1);
  } else {
    plannerState.recipes.push(key);
  }
  document.querySelectorAll('.planner-recipe-card').forEach(c => {
    c.classList.toggle('active', plannerState.recipes.includes(c.dataset.key));
  });
  tryCalcPlannerTimeline();
}

function selectPlannerDay(dateStr) {
  plannerState.day = dateStr;
  document.querySelectorAll('#planner-day-pills .planner-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.day === dateStr);
  });
  tryCalcPlannerTimeline();
}

function selectPlannerTime(timeStr) {
  document.querySelectorAll('#planner-time-pills .planner-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.time === timeStr);
  });
  const customRow = document.getElementById('planner-custom-time-row');
  if (timeStr === 'altro') {
    customRow.style.display = '';
    document.getElementById('planner-custom-time').onchange = (e) => {
      plannerState.time = e.target.value;
      tryCalcPlannerTimeline();
    };
    plannerState.time = null;
  } else {
    customRow.style.display = 'none';
    plannerState.time = timeStr;
    tryCalcPlannerTimeline();
  }
}

function selectPlannerSeason(season, silent = false) {
  plannerState.season = season;
  document.querySelectorAll('.season-btn').forEach(b => b.classList.toggle('active', b.dataset.season === season));
  const note = document.getElementById('planner-season-note');
  note.textContent = season === 'estate'
    ? 'Estate: aprile–ottobre o T° ambiente ≥ 20°C'
    : 'Inverno: novembre–marzo o T° ambiente < 20°C';
  if (!silent) tryCalcPlannerTimeline();
}

function tryCalcPlannerTimeline() {
  const { recipes, day, time, season } = plannerState;
  const empty = document.getElementById('planner-timeline-empty');
  const tl = document.getElementById('planner-timeline');
  const calSection = document.getElementById('planner-calendar-section');
  if (!recipes.length || !day || !time || !season) {
    empty.style.display = '';
    tl.style.display = 'none';
    calSection.style.display = 'none';
    return;
  }
  const serviceDateTime = new Date(`${day}T${time}:00`);
  plannerTimelines = {};
  for (const key of recipes) {
    plannerTimelines[key] = calcPlannerTimeline(key, serviceDateTime, season);
  }
  renderPlannerTimeline(plannerTimelines);
  empty.style.display = 'none';
  tl.style.display = '';
  calSection.style.display = '';
}

function calcPlannerTimeline(recipeKey, serviceDateTime, season) {
  const recipe = TIMING_DATA[recipeKey];
  const events = [];
  let current = new Date(serviceDateTime);

  // Calcolo a ritroso: l'ultimo step finisce all'orario di servizio.
  // Steps con parallel:true terminano allo stesso momento dello step successivo nella catena
  // (es. Accensione forno è in parallelo all'ultima parte della lievitazione).
  for (let i = recipe.steps.length - 1; i >= 0; i--) {
    const step = recipe.steps[i];
    const durMin = step[season];
    const end = new Date(current);
    const start = new Date(current.getTime() - durMin * 60000);
    events.unshift({ name: step.name, note: step.note, start, end, durMin, parallel: !!step.parallel });
    if (!step.parallel) current = start;
  }

  // Aggiunge l'evento di servizio finale
  const serviceEnd = recipe.serviceEventDuration > 0
    ? new Date(serviceDateTime.getTime() + recipe.serviceEventDuration * 60000)
    : new Date(serviceDateTime);
  events.push({ name: recipe.serviceEventName, note: '', start: new Date(serviceDateTime), end: serviceEnd, isService: true });

  return splitMidnight(events);
}

function splitMidnight(events) {
  const result = [];
  for (const ev of events) {
    const startDay = ev.start.toDateString();
    const endDay = ev.end.toDateString();
    if (startDay !== endDay && ev.start < ev.end) {
      const midnight = new Date(ev.end);
      midnight.setHours(0, 0, 0, 0);
      result.push({ ...ev, name: ev.name + ' (1/2)', end: new Date(midnight), isMidnightSplit: true });
      result.push({ ...ev, name: ev.name + ' (2/2)', start: new Date(midnight), isMidnightSplit: true });
    } else {
      result.push(ev);
    }
  }
  return result;
}

function fmtTime(date) {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(date) {
  return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderPlannerTimeline(timelines) {
  const el = document.getElementById('planner-timeline');
  const headerColors = { focaccia: '#2e7d4e', napoletana: '#0097a7', brioche: '#c8920a' };
  const sections = Object.entries(timelines).map(([recipeKey, events]) => {
    const recipe = TIMING_DATA[recipeKey];
    const bg = headerColors[recipeKey] || 'var(--primary)';
    let lastDay = null;
    let rows = '';
    for (const ev of events) {
      const day = ev.start.toDateString();
      if (day !== lastDay) {
        rows += `<tr><td colspan="3" style="padding:8px 12px 4px;font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;background:var(--bg-hover)">${fmtDay(ev.start)}</td></tr>`;
        lastDay = day;
      }
      const serviceClass = ev.isService ? 'timeline-service' : '';
      const midnightBadge = ev.isMidnightSplit ? '<span class="timeline-badge-midnight">🌙 passa mezzanotte</span>' : '';
      rows += `<tr class="${serviceClass}">
        <td class="timeline-time">${fmtTime(ev.start)}</td>
        <td><div>${ev.name}${midnightBadge}</div>${ev.note ? `<div class="timeline-note">${ev.note}</div>` : ''}</td>
        <td class="timeline-time" style="color:var(--text-3)">${fmtTime(ev.end)}</td>
      </tr>`;
    }
    return `
      <div class="planner-timeline-header" style="background:${bg};color:#fff">
        <span>${recipe.emoji} ${recipe.name}</span>
      </div>
      <div style="overflow-x:auto;margin-bottom:20px">
        <table class="timeline-table">
          <thead><tr><th>Inizio</th><th>Step</th><th>Fine</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');
  el.innerHTML = sections;
}

function initGoogleAuth() {
  if (!GOOGLE_CLIENT_ID || typeof google === 'undefined' || !google.accounts) return;
  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: (response) => {
      if (response.error) { toast('Autenticazione Google fallita', 'error'); return; }
      googleAccessToken = response.access_token;
      const btn = document.getElementById('planner-btn-connect');
      btn.textContent = '✓ Google connesso';
      btn.classList.replace('btn-secondary', 'btn-primary');
      document.getElementById('planner-btn-create').disabled = false;
      toast('Google Calendar connesso!', 'success');
    },
  });
}

function connectGoogleCalendar() {
  if (!GOOGLE_CLIENT_ID) {
    document.getElementById('planner-gcal-note').textContent =
      'Configura GOOGLE_CLIENT_ID in app.js per usare questa funzione.';
    return;
  }
  if (!googleTokenClient) initGoogleAuth();
  if (googleTokenClient) googleTokenClient.requestAccessToken();
}

function formatPlannerText(timelines) {
  return formatSharedText(lastPartyOutcomes, timelines);
}

async function sharePlannerTimeline() {
  if (!Object.keys(plannerTimelines).length && !lastPartyOutcomes.some(o => o.result)) return;
  const text = formatPlannerText(plannerTimelines);
  const title = '🍕 Pizza Party';
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
    } catch (e) {
      if (e.name !== 'AbortError') toast('Condivisione non riuscita', 'error');
    }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      toast('Timeline copiata negli appunti!');
    } catch (e) {
      window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`);
    }
  }
}

async function createCalendarEvents() {
  if (!googleAccessToken || !Object.keys(plannerTimelines).length) return;
  const btn = document.getElementById('planner-btn-create');
  btn.disabled = true;
  btn.textContent = 'Creazione in corso...';

  let created = 0, errors = 0;
  for (const [recipeKey, events] of Object.entries(plannerTimelines)) {
    const recipe = TIMING_DATA[recipeKey];
    for (const ev of events) {
      if (ev.isService && recipe.serviceEventDuration === 0) continue;
      const body = {
        summary: `${recipe.emoji} ${ev.name} — ${recipe.name}`,
        description: ev.note || '',
        start: { dateTime: ev.start.toISOString(), timeZone: 'Europe/Rome' },
        end:   { dateTime: ev.end.toISOString(),   timeZone: 'Europe/Rome' },
        colorId: recipe.calendarColorId,
      };
      try {
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { Authorization: `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) created++; else errors++;
      } catch { errors++; }
    }
  }

  btn.disabled = false;
  btn.textContent = '✓ Crea eventi su Calendar';
  if (errors === 0) toast(`${created} eventi creati su Google Calendar!`, 'success');
  else toast(`${created} creati, ${errors} errori`, 'error');
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadRecipes();
