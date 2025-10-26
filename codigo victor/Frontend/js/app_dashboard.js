// --- SPA hash navigation helper --------------------------------------------
/**
 * Navega a un hash dado. Si ya es el mismo, fuerza el router.
 * Protege contra navegadores que podrían no disparar hashchange.
 */
function navigateHash(newHash) {
  if (location.hash === newHash) {
    router();
  } else {
    location.hash = newHash;
  }
}

/**
 * Persistir el contexto de "metas" y navegar a la vista de indicadores
 * para el goal indicado. Se expone globalmente para uso inline.
 */
function navigateToIndicators(goalId) {
  const ctx = window.__metasCtx || JSON.parse(sessionStorage.getItem('metasCtx') || 'null');
  if (ctx) sessionStorage.setItem('metasCtx', JSON.stringify(ctx));
  navigateHash(`#/indicadores/goal/${goalId}`);
}
window.navigateToIndicators = navigateToIndicators;


// --- Static/demo data used by dashboard tiles -------------------------------
const data = {
  avance: 75,
  stats: { indicadores: 20, metas: 35, actividades: 50, recursos: 50000 },
  reporte: [
    { nombre: 'Actividad 1', estado: 'Completada' },
    { nombre: 'Actividad 2', estado: 'En proceso' },
    { nombre: 'Actividad 3', estado: 'Retrasada' },
    { nombre: 'Actividad 4', estado: 'Pendiente' },
  ],
  recursos: [
    { etiqueta: 'Personal', valor: 68 },
    { etiqueta: 'Infraestructura', valor: 45 },
    { etiqueta: 'Equipamiento', valor: 30 },
    { etiqueta: 'Otros', valor: 20 },
  ],
};


// --- Small UI utilities used by the dashboard -------------------------------
/** Formatea CLP sin decimales. */
function formatoMoneda(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

/** Mapea estado a clase visual de "chip". */
function claseChip(estado) {
  const e = estado.toLowerCase();
  if (e.includes('complet')) return 'chip chip--ok';
  if (e.includes('proceso')) return 'chip chip--info';
  if (e.includes('retras')) return 'chip chip--warn';
  return 'chip chip--danger';
}

/** Anima el anillo de progreso hasta el % objetivo. */
function pintarAvance(valor) {
  const ring = document.querySelector('.ring');
  const txt = document.getElementById('progressValue');
  if (!ring || !txt) return;
  ring.style.setProperty('--value', 0);
  const target = Math.max(0, Math.min(100, valor));
  let cur = 0;
  const step = () => {
    cur += Math.max(1, Math.round((target - cur) / 8));
    ring.style.setProperty('--value', cur);
    txt.textContent = `${cur}%`;
    if (cur < target) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Pinta los azulejos de stats. */
function pintarStats(s) {
  const ids = ['statIndicadores', 'statMetas', 'statActividades', 'statRecursos'];
  if (!ids.every(id => document.getElementById(id))) return;
  document.getElementById('statIndicadores').textContent = s.indicadores;
  document.getElementById('statMetas').textContent = s.metas;
  document.getElementById('statActividades').textContent = s.actividades;
  document.getElementById('statRecursos').textContent = formatoMoneda(s.recursos);
}

/** Renderiza la lista de reporte con chips. */
function pintarReporte(items) {
  const ul = document.getElementById('reportList');
  if (!ul) return;
  ul.innerHTML = '';
  items.forEach((it) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    const chip = document.createElement('span');
    name.textContent = it.nombre;
    chip.textContent = it.estado;
    chip.className = claseChip(it.estado);
    li.appendChild(name);
    li.appendChild(chip);
    ul.appendChild(li);
  });
}

/** Renderiza barras horizontales de recursos. */
function pintarBarras(items) {
  const cont = document.getElementById('resourcesBars');
  if (!cont) return;
  cont.innerHTML = '';
  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'bar';
    const label = document.createElement('div');
    label.className = 'bar__label';
    label.textContent = it.etiqueta;
    const track = document.createElement('div');
    track.className = 'bar__track';
    const fill = document.createElement('div');
    fill.className = 'bar__fill';
    fill.style.setProperty('--w', 0);
    requestAnimationFrame(() => {
      fill.style.setProperty('--w', Math.max(0, Math.min(100, it.valor)) / 100);
    });
    track.appendChild(fill);
    const val = document.createElement('div');
    val.className = 'bar__value';
    val.textContent = `${it.valor}%`;
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(val);
    cont.appendChild(row);
  });
}


// --- Role helpers (from JWT / localStorage) ---------------------------------
/** Decodifica el payload del JWT guardado como "token". */
function getTokenPayload() {
  const t = localStorage.getItem('token');
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Devuelve 'editor', 'viewer' o null segun token/fallbacks. */
function getRole() {
  const p = getTokenPayload() || {};
  return p.role || (Array.isArray(p.roles) && p.roles[0]) ||
    (Array.isArray(p.scopes) && (p.scopes.includes('editor') ? 'editor' : (p.scopes.includes('viewer') ? 'viewer' : null))) ||
    localStorage.getItem('role') || null;
}

/** Atajo: ¿es editor el usuario actual? */
function isEditor() { return getRole() === 'editor'; }


// --- Generic SPA + API helpers ----------------------------------------------
const API = "http://127.0.0.1:8000";
const $view = document.getElementById('view');
const $title = document.getElementById('pageTitle');

/** Cabecera Authorization si existe token. */
function authHeaders() {
  // intenta ambas claves habituales por si el login guardó "access_token" o "token"
  const t = localStorage.getItem('token') || localStorage.getItem('access_token') || null;
  return t ? { "Authorization": "Bearer " + t } : {};
}

/** Carga un fragmento HTML sin cache y devuelve texto. */
async function loadHTML(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudo cargar ' + url);
  return res.text();
}

/** Carga un script una sola vez (idempotente). */
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-dyn="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.type = 'module';
    s.dataset.dyn = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.body.appendChild(s);
  });
}

/** Resalta en sidebar el link activo según hash. */
function setActiveByHash(hash) {
  document.querySelectorAll('.nav__item').forEach(a => a.classList.remove('is-active'));
  const active = document.querySelector(`a[href="${hash}"]`);
  if (active) active.classList.add('is-active');
}

/** Escape HTML básico. */
const esc = (s = '') => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/** Formatea ISO como dd/mm/yyyy en es-CL (UTC). */
function fechaCL(iso = '') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('es-CL', { timeZone: 'UTC' });
}

/** Título legible para dimensión. */
function tituloDimension(dim) {
  switch (dim) {
    case 'LIDERAZGO': return 'Liderazgo';
    case 'GESTION_PEDAGOGICA': return 'Gestión Pedagógica';
    case 'CONVIVENCIA_ESCOLAR': return 'Convivencia Escolar';
    case 'GESTION_RECURSOS': return 'Gestión de Recursos';
    default: return dim;
  }
}


// --- ObjectiveId cache por (dimension::name) --------------------------------
const OBJMAP_KEY = 'objectiveIdByDimAndName';
function getObjectiveMap() {
  return JSON.parse(sessionStorage.getItem(OBJMAP_KEY) || '{}');
}
function setObjectiveMap(map) {
  sessionStorage.setItem(OBJMAP_KEY, JSON.stringify(map));
}
function cacheObjectiveId(dimension, name, id) {
  const map = getObjectiveMap();
  map[`${dimension}::${name}`] = id;
  setObjectiveMap(map);
}
function getCachedObjectiveId(dimension, name) {
  const map = getObjectiveMap();
  return map[`${dimension}::${name}`] || null;
}


// --- API layer: objectives / goals / indicators -----------------------------
/** GET /objectives con límite alto. */
async function apiListObjectives() {
  const res = await fetch(`${API}/objectives?limit=500`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('No se pudo listar objectives');
  return res.json();
}

/** GET /objectives filtrado por dimensión. */
async function apiListObjectivesByDim(dimension) {
  const res = await fetch(`${API}/objectives?dimension=${encodeURIComponent(dimension)}`, {
    headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error('No se pudo listar objectives');
  return res.json();
}

/** POST /objectives crea nuevo objetivo. */
async function apiCreateObjective(obj) {
  const res = await fetch(`${API}/objectives`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(obj)
  });
  if (!res.ok) throw new Error('No se pudo crear objective');
  return res.json();
}

/**
 * Asegura existencia de un Objective por (dimension, name).
 * Si no existe, lo crea con rango de 4 años desde el año actual.
 * Emplea caché en sessionStorage para evitar llamadas repetidas.
 */
async function ensureObjectiveByName(dimension, name) {
  // caché rápida
  const cached = getCachedObjectiveId(dimension, name);
  if (cached) return { id: cached, name, dimension };

  // buscar por filtros del backend
  const res = await fetch(`${API}/objectives?dimension=${encodeURIComponent(dimension)}&name=${encodeURIComponent(name)}`, {
    headers: { ...authHeaders() }
  });
  const list = res.ok ? await res.json() : [];
  if (list && list.length) {
    cacheObjectiveId(dimension, name, list[0].id);
    return list[0];
  }

  // crear idempotente
  const now = new Date();
  const payload = {
    name,
    dimension,
    description: '',
    start_year: now.getUTCFullYear(),
    end_year: now.getUTCFullYear() + 3
  };
  const created = await apiCreateObjective(payload);
  cacheObjectiveId(dimension, name, created.id);
  return created;
}

/** GET /objectives/:id/goals */
async function apiListGoalsByObjective(objectiveId) {
  const res = await fetch(`${API}/objectives/${objectiveId}/goals?limit=500`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('No se pudo listar goals');
  return res.json();
}

/** POST /objectives/:id/goals */
async function apiCreateGoal(objectiveId, payload) {
  const res = await fetch(`${API}/objectives/${objectiveId}/goals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('No se pudo crear goal');
  return res.json();
}

/** GET /goals/:id/indicators */
async function apiListIndicatorsByGoal(goalId) {
  const res = await fetch(`${API}/goals/${goalId}/indicators?limit=500`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('No se pudo listar indicators');
  return res.json();
}

/** POST /goals/:id/indicators (limpia payload) */
async function apiCreateIndicator(goalId, payload) {
  const clean = {};
  if (payload.title && payload.title.trim()) clean.title = payload.title.trim();
  if (payload.unit && payload.unit.trim()) clean.unit = payload.unit.trim();
  if (payload.target !== '' && payload.target !== null && payload.target !== undefined) {
    clean.target = String(payload.target).trim();
  }

  const res = await fetch(`${API}/goals/${goalId}/indicators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(clean)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${txt}`);
  }
  return res.json();
}


// --- 403 view ---------------------------------------------------------------
function showForbidden(msg = 'No tienes permisos para acceder a esta sección.') {
  $title.textContent = 'Acceso restringido';
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header"><h2>403 — Acceso restringido</h2></header>
      <div class="card__body">
        <p>${esc(msg)}</p>
        <button class="btn" id="goDash">Ir al Dashboard</button>
      </div>
    </section>
  `;
  document.getElementById('goDash')?.addEventListener('click', () => { location.hash = '#/dashboard'; });
}


// --- Plans cache and grouping by dimension ----------------------------------
/**
 * plansCache: Map<dimension, { list:Array, groups:Map<objectiveName, ArrayPlans> }>
 */
const plansCache = new Map();
window.invalidatePlansCache = (dim) => dim ? plansCache.delete(dim) : plansCache.clear();

/** Agrupa planes por objetivo dentro de una dimensión (con memoización). */
async function getPlansByDimension(dimensionValue) {
  if (plansCache.has(dimensionValue)) return plansCache.get(dimensionValue);
  const res = await fetch(`${API}/plans?dimension=${encodeURIComponent(dimensionValue)}`, {
    headers: { ...authHeaders() }
  });
  if (res.status === 401) { window.location.href = 'login.html'; return { list: [], groups: new Map() }; }
  if (res.status === 403) { showForbidden(); return { list: [], groups: new Map() }; }

  const list = await res.json();
  const groups = new Map();
  for (const p of list) {
    const key = (p.objetivo_estrategico || '').trim() || '(Sin objetivo)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const value = { list, groups };
  plansCache.set(dimensionValue, value);
  return value;
}


// --- Views: Dashboard --------------------------------------------------------
async function showDashboard() {
  $title.textContent = 'Panel de Gestión';
  $view.innerHTML = `
    <section class="grid">
      <article class="card">
        <header class="card__header"><h2>Avance del Plan Estratégico</h2></header>
        <div class="card__body plan">
          <div class="progress">
            <div class="ring" style="--value: 75" aria-label="Avance 75%">
              <div class="ring__inside"><div class="ring__value" id="progressValue">75%</div></div>
            </div>
          </div>
          <ul class="stats">
            <li><span>Indicadores</span><strong id="statIndicadores">20</strong></li>
            <li><span>Metas</span><strong id="statMetas">35</strong></li>
            <li><span>Actividades</span><strong id="statActividades">50</strong></li>
            <li><span>Recursos</span><strong id="statRecursos">$50.000</strong></li>
          </ul>
        </div>
      </article>
      <article class="card">
        <header class="card__header"><h2>Reporte de Gestión</h2></header>
        <div class="card__body"><ul class="report" id="reportList"></ul></div>
      </article>
      <article class="card card--wide">
        <header class="card__header"><h2>Seguimiento de Recursos</h2></header>
        <div class="card__body"><div class="bars" id="resourcesBars"></div></div>
      </article>
    </section>
  `;
  pintarAvance(data.avance);
  pintarStats(data.stats);
  pintarReporte(data.reporte);
  pintarBarras(data.recursos);
}

/** Form de planes (solo editores). */
async function showPlanForm() {
  if (!isEditor()) { showForbidden('Solo los editores pueden crear/editar planes.'); return; }
  $title.textContent = 'Formulario de Planes Estratégicos';
  const html = await loadHTML('plan_form.html');
  $view.innerHTML = html;
  await loadScriptOnce('js/plan_form.js');
  if (window.initPlanForm) window.initPlanForm();
}

// Filtros placeholder
const currentFilters = { sort: 'objetivo-asc', colegio: 'TODOS', subdimension: 'TODOS' };


// --- Views: lista de objetivos por dimensión --------------------------------
async function showPlanList(dimensionValue) {
  $title.textContent = `Plan Estratégico — ${tituloDimension(dimensionValue)}`;
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header" style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;">${tituloDimension(dimensionValue)}</h2>
        <button id="btnRefrescar" class="btn">Refrescar</button>
      </header>
      <div class="card__body" id="plansList">Cargando…</div>
    </section>
  `;

  const $list = document.getElementById('plansList');
  const { groups } = await getPlansByDimension(dimensionValue);
  if (!groups || groups.size === 0) { $list.innerHTML = `<p>Sin planes para esta dimensión.</p>`; return; }

  let i = 1;
  let html = `<ol class="obj-list">`;
  const orden = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  for (const [objetivo, items] of orden) {
    const oEnc = encodeURIComponent(objetivo);
    html += `
      <li class="obj-item">
        <div class="obj-item__title">
          <span class="obj-item__num">${i++}.</span> ${esc(objetivo)}
        </div>
        <div class="obj-item__actions">
          <button class="btn btn--sm" data-act="ver" data-obj="${oEnc}">Ir al objetivo</button>
          <button class="btn btn--sm btn--secondary" data-act="met" data-obj="${oEnc}">Metas</button>
          <button class="btn btn--sm btn--ghost" data-act="rec" data-obj="${oEnc}">Recursos del objetivo</button>
          <button class="btn btn--sm" data-act="evi" data-obj="${oEnc}">Evidencia</button>
          <span class="obj-item__meta">${items.length} acción(es)</span>
        </div>
      </li>
    `;
  }
  html += `</ol>`;
  $list.innerHTML = html;

  $list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const objetivo = decodeURIComponent(btn.dataset.obj || '');
    if (btn.dataset.act === 'ver') showObjectiveDetail(dimensionValue, objetivo);
    if (btn.dataset.act === 'rec') showObjectiveResources(dimensionValue, objetivo);
    if (btn.dataset.act === 'evi') showEvidenceUpload(dimensionValue, objetivo);
    if (btn.dataset.act === 'met') showStrategicGoalsEditor(dimensionValue, objetivo);
  });

  document.getElementById('btnRefrescar')?.addEventListener('click', () => {
    plansCache.delete(dimensionValue);
    showPlanList(dimensionValue);
  });
}


// --- Views: detalle de objetivo ---------------------------------------------
async function showObjectiveDetail(dimensionValue, objetivo) {
  const { groups } = await getPlansByDimension(dimensionValue);
  const items = (groups.get(objetivo) || []).slice()
    .sort((a, b) => (a.fecha_inicio || '').localeCompare(b.fecha_inicio || ''));

  $title.textContent = `${tituloDimension(dimensionValue)} — Objetivo`;
  $view.innerHTML = `
      <section class="card card--full">
      <header class="card__header" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
        <button class="btn btn--ghost" id="btnBack">← Volver</button>
        <h2 style="margin:0;">${esc(objetivo)}</h2>
        <div style="margin-left:auto;display:flex;gap:.5rem;">
          <!-- evidencias eliminado -->
         <!-- otros botones si los necesita -->
        </div>
      </header>

      <div id="filterArea" class="filter-area" style="display:none; padding:15px; border-bottom: 1px solid var(--border-color);">
        <p>Contenido del filtro para acciones…</p>
      </div>

      <div class="card__body">
        <div class="table-wrap">
          <table class="plan-table">
            <thead>
              <tr>
                <th>Colegio</th>
                <th>Estrategia</th>
                <th>Subdimensiones</th>
                <th>Acción</th>
                <th>Descripción</th>
                <th>Inicio</th>
                <th>Término</th>
                <th>Programa</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(r => `
                <tr>
                  <td>${esc(r.colegio)}</td>
                  <td>${esc(r.estrategia)}</td>
                  <td>${esc(r.subdimension)}</td>
                  <td>${esc(r.accion)}</td>
                  <td>${esc(r.descripcion)}</td>
                  <td>${fechaCL(r.fecha_inicio)}</td>
                  <td>${fechaCL(r.fecha_termino)}</td>
                  <td>${esc(r.programa_asociado)}</td>
                  <td>${esc(r.responsable)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  // Volver a la lista de planes
  document.getElementById('btnBack')?.addEventListener('click', () => showPlanList(dimensionValue));

  const $filterBtn = document.getElementById('btnFiltros');
  const $filterArea = document.getElementById('filterArea');
  $filterBtn?.addEventListener('click', () => {
    const isVisible = $filterArea.style.display === 'flex';
    $filterArea.style.display = isVisible ? 'none' : 'flex';
    $filterBtn.textContent = isVisible ? 'Filtrar / Ordenar' : 'Ocultar Filtros';
  });

  // Resolver objectiveId por (dimension, nombre) con caché (se deja por si otras funciones lo usan)
  let objectiveId = getCachedObjectiveId(dimensionValue, objetivo);
  if (!objectiveId) {
    try {
      const obj = await ensureObjectiveByName(dimensionValue, objetivo);
      objectiveId = obj?.id || null;
    } catch (e) { console.error(e); }
  }

  // Nota: se removió aquí el código de "Evidencias" (badges, modal y llamadas a /objectives/.../evidences)
}


// --- Local evidence storage (IndexedDB) — utilidades (se preservan) ---------
const DB_NAME = 'evidenciasDB';
const DB_STORE = 'files';
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        const store = db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('byObjetivo', 'objetivo', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbAdd(fileRec) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).add(fileRec);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbListByObjetivo(objetivo) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const idx = tx.objectStore(DB_STORE).index('byObjetivo');
    const req = idx.getAll(IDBKeyRange.only(objetivo));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}


// --- View: Evidencias (sube a backend y lista por Objetivo) -----------------

// ...existing code...
async function showEvidenceUpload(dimensionValue, objetivo) {
  // 1) Garantizar Objetivo
  const objective = await ensureObjectiveByName(dimensionValue, objetivo);
  const objectiveId = objective.id;

  // 2) Garantizar Meta (año actual) e Indicador “Evidencias”
  const metas = await apiListGoalsByObjective(objectiveId);
  let goalId = metas[0]?.id;
  if (!goalId) {
    const year = new Date().getUTCFullYear();
    const nueva = await apiCreateGoal(objectiveId, {
      title: 'Evidencias del objetivo',
      description: `Repositorio de evidencias — ${year}`,
      year
    });
    goalId = nueva.id;
  }

  const indics = await apiListIndicatorsByGoal(goalId);
  let indicator = indics.find(x => (x.title || '').toLowerCase() === 'evidencias');
  if (!indicator) {
    indicator = await apiCreateIndicator(goalId, { title: 'Evidencias', unit: '', target: '' });
  }
  const indicatorId = indicator?.id;
  if (!indicatorId) {
    alert('No se pudo inicializar el indicador "Evidencias".');
    return;
  }

  // obtener planes (acciones) para este objetivo (para permitir vincular evidencias a una acción)
  const plansByDim = await getPlansByDimension(dimensionValue);
  const plansForObjective = (plansByDim.groups.get(objetivo) || []).slice();

  // 3) UI (ahora incluye select de acción/plan)
  $title.textContent = `${tituloDimension(dimensionValue)} — Evidencias`;
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
        <button class="btn btn--ghost" id="btnBack">← Volver</button>
        <h2 style="margin:0;">Evidencias — ${esc(objetivo)}</h2>
      </header>

      <div class="card__body">
        <div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">
          <label style="display:flex;gap:.5rem;align-items:center;">
            <span>Vincular a acción:</span>
            <select id="selAction" class="inp">
              <option value="">(No vincular / usar indicador)</option>
              ${plansForObjective.map(p => `<option value="${p.id}">${esc(p.accion || ('Acción #' + p.id))} — ${esc(p.colegio || '')}</option>`).join('')}
            </select>
          </label>

          <input id="fileInput" type="file"
                 accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx"
                 multiple />
          <textarea id="fileDesc" class="inp inp--lg" placeholder="Descripción (opcional)" rows="3" style="min-width:380px;max-width:60vw;"></textarea>
          <button class="btn" id="btnUpload">Subir</button>
          <small>Se guardará en el servidor y quedará visible en “Ir al objetivo → Evidencias”.</small>
        </div>

        <hr/>

        <div class="table-wrap">
          <table class="plan-table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Pertenece a</th>
                <th>Fecha</th>
                <th></th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody id="tbFiles"><tr><td colspan="5">Cargando…</td></tr></tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  document.getElementById('btnBack').onclick = () => showObjectiveDetail(dimensionValue, objetivo);

  // 4) Listado: trae evidencias del indicador y de las acciones del objetivo y las mezcla
  async function refreshList() {
    const tb = document.getElementById('tbFiles');
    tb.innerHTML = `<tr><td colspan="5">Cargando…</td></tr>`;
    try {
      // evidencias guardadas en el indicador
      const resInd = await fetch(`${API}/indicators/${indicatorId}/evidences?limit=500`, { headers: { ...authHeaders() } });
      const evsInd = resInd.ok ? await resInd.json() : [];

      // evidencias por cada plan/acción del objetivo
      const planFetches = plansForObjective.map(p =>
        fetch(`${API}/plans/${p.id}/evidences?limit=500`, { headers: { ...authHeaders() } })
          .then(r => r.ok ? r.json() : [])
          .then(list => list.map(e => ({ ...e, _plan: p })))
          .catch(() => [])
      );
      const planEvsArrays = await Promise.all(planFetches);
      const evsPlan = planEvsArrays.flat();

      const all = [
        ...evsInd.map(e => ({ ...e, _kind: 'indicator' })),
        ...evsPlan.map(e => ({ ...e, _kind: 'plan' }))
      ].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());

      if (!all.length) {
        tb.innerHTML = `<tr><td colspan="5">Sin evidencias aún.</td></tr>`;
        return;
      }

      // construir filas con control de ancho y wrapping en la celda de descripción
      tb.innerHTML = all.map(ev => {
        // determinar etiqueta de acción/plan relacionada (puede venir desde _plan o desde campos del backend)
        const actionLabel = ev._plan?.accion || ev.plan_title || (ev.plan_id ? ('Acción #' + ev.plan_id) : '');
        // construir bloque de descripción + acción debajo
        const descHtml = `
           <div style="white-space:pre-wrap; overflow-wrap:break-word; word-break:break-word; max-width:48vw;">${esc(ev.description || '—')}</div>
           ${actionLabel ? `<div style="font-size:12px;color:var(--muted-color,#666);margin-top:6px;white-space:normal;">Pertenece a: <strong>${esc(actionLabel)}</strong></div>` : ''}
         `;
        return `
           <tr>
             <td style="max-width:22vw; white-space:normal; overflow-wrap:break-word;">${esc(ev.original_filename || ev.filename)}</td>
             <td style="white-space:normal;">${ev._kind === 'plan' ? esc(ev._plan?.accion || ('Acción #' + ev._plan?.id)) : esc(ev.indicator_title || 'Indicador')}</td>
             <td>${new Date(ev.uploaded_at).toLocaleString('es-CL')}</td>
             <td><a class="btn btn--sm" href="${API}${ev.download_url || ('/uploads/' + ev.filename)}" target="_blank" rel="noopener">Descargar</a></td>
             <td style="max-width:48vw; white-space:normal; vertical-align:top;">${descHtml}</td>
           </tr>
         `;
      }).join('');

    } catch (e) {
      console.error(e);
      tb.innerHTML = `<tr><td colspan="5">No se pudo cargar evidencias.</td></tr>`;
    }
  }

  // 5) Subida (multiarchivo) — si se selecciona una acción sube a /plans/:id/evidences, si no a indicador
  document.getElementById('btnUpload').addEventListener('click', async () => {
    const inp = document.getElementById('fileInput');
    const desc = (document.getElementById('fileDesc').value || '').trim();
    const sel = document.getElementById('selAction').value;
    if (!inp.files || !inp.files.length) {
      alert('Selecciona uno o más archivos primero.');
      return;
    }

    for (const file of inp.files) {
      const fd = new FormData();
      fd.append('file', file);
      if (desc) fd.append('description', desc);

      const url = sel ? `${API}/plans/${sel}/evidences` : `${API}/indicators/${indicatorId}/evidences`;
      console.log('Subiendo archivo:', file.name, '->', url, 'token?', !!localStorage.getItem('token'));
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { ...authHeaders() }, // no set Content-Type for multipart
          body: fd
        });

        const text = await resp.text().catch(() => '');
        console.log('Respuesta servidor:', resp.status, text);

        if (!resp.ok) {
          alert(`No se pudo subir "${file.name}": HTTP ${resp.status}\n${text || 'sin mensaje del servidor'}`);
          return; // detener si falla
        }
      } catch (err) {
        console.error('Error fetch:', err);
        alert('Error al enviar petición: ' + (err?.message || err));
        return;
      }
    }

    // Limpia inputs y refresca listado
    inp.value = '';
    document.getElementById('fileDesc').value = '';
    await refreshList();
  });


  // Cargar listado inicial
  refreshList();
}



// --- View: Resources by objective ------------------------------------------
async function showObjectiveResources(dimensionValue, objetivo) {
  const { groups } = await getPlansByDimension(dimensionValue);
  const plans = (groups.get(objetivo) || []).slice()
    .sort((a, b) => (a.fecha_inicio || '').localeCompare(b.fecha_inicio || ''));

  const lists = await Promise.all(
    plans.map(p =>
      fetch(`${API}/plans/${p.id}/resources`, { headers: { ...authHeaders() } })
        .then(r => (r.status === 403 ? (showForbidden(), []) : (r.ok ? r.json() : [])))
        .catch(() => [])
    )
  );

  const rows = [];
  lists.forEach((resources, idx) => {
    const plan = plans[idx];
    if (Array.isArray(resources) && resources.length) {
      resources.forEach(res => rows.push({ plan, res }));
    } else {
      rows.push({ plan, res: null });
    }
  });

  const money = (v) => {
    if (v === null || v === undefined || v === '') return '–';
    const n = Number(v); return Number.isFinite(n) ? formatoMoneda(n) : String(v);
  };
  const txt = (v) => (v && String(v).trim()) ? String(v) : '–';

  $title.textContent = `${tituloDimension(dimensionValue)} — Recursos`;
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header" style="display:flex;gap:.5rem;align-items:center;">
        <button id="btnFiltrosRecursos" class="btn btn--secondary">Filtrar / Ordenar</button>
        <button class="btn btn--ghost" id="btnVolver">← Volver</button>
        <h2 style="margin:0;">Recursos — ${esc(objetivo)}</h2>
      </header>

      <div id="filterAreaRecursos" class="filter-area" style="display:none; padding:15px; border-bottom: 1px solid var(--border-color);">
        <p>Contenido del filtro para recursos…</p>
      </div>

      <div class="card__body table-wrap">
        <div class="scroll-btns">
          <button class="btn-swipe" data-dir="-1">◀</button>
          <button class="btn-swipe" data-dir="1">▶</button>
        </div>

        <div class="hscroll" id="recWrap">
          <table class="plan-table">
            <colgroup>
              <col class="w-lg"><col class="w-xs"><col class="w-xs"><col class="w-md"><col class="w-md">
              <col class="w-sm"><col class="w-sm"><col class="w-sm"><col class="w-sm">
              <col class="w-sm"><col class="w-sm"><col class="w-sm"><col class="w-sm">
              <col class="w-sm"><col class="w-sm"><col class="w-sm">
            </colgroup>
            <thead>
              <tr>
                <th>Recursos Necesarios<br/>Ejecución</th>
                <th>Ate</th>
                <th>TIC</th>
                <th>Plan(es)</th>
                <th>Medios de Verificación</th>
                <th>Monto Subv. General</th>
                <th>Monto SEP</th>
                <th>Monto PIE</th>
                <th>Monto EIB</th>
                <th>Monto Mantención</th>
                <th>Monto Pro retención</th>
                <th>Monto Internado</th>
                <th>Monto Reforzamiento</th>
                <th>Monto FAEP</th>
                <th>Monto Aporte Municipal</th>
                <th>Monto Total</th>
              </tr>
            </thead>
            <tbody id="tbRecursos"></tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  const $tb = document.getElementById('tbRecursos');
  if (!rows.length) {
    $tb.innerHTML = `<tr><td colspan="16">Sin datos de recursos para este objetivo.</td></tr>`;
  } else {
    $tb.innerHTML = rows.map(({ res }) => `
      <tr>
        <td>${esc(txt(res?.recursos_necesarios))}</td>
        <td>${esc(txt(res?.ate))}</td>
        <td>${esc(txt(res?.tic))}</td>
        <td>${esc(txt(res?.planes))}</td>
        <td>${esc(txt(res?.medios_verificacion))}</td>
        <td class="money">${money(res?.monto_subvencion_general)}</td>
        <td class="money">${money(res?.monto_sep)}</td>
        <td class="money">${money(res?.monto_pie)}</td>
        <td class="money">${money(res?.monto_eib)}</td>
        <td class="money">${money(res?.monto_mantenimiento)}</td>
        <td class="money">${money(res?.monto_pro_retencion)}</td>
        <td class="money">${money(res?.monto_internado)}</td>
        <td class="money">${money(res?.monto_reforzamiento)}</td>
        <td class="money">${money(res?.monto_faep)}</td>
        <td class="money">${money(res?.monto_aporte_municipal)}</td>
        <td class="money"><strong>${money(res?.monto_total)}</strong></td>
      </tr>
    `).join('');
  }

  const wrap = document.getElementById('recWrap');
  document.querySelectorAll('.btn-swipe').forEach(b => {
    b.addEventListener('click', () => {
      const step = 420;
      const dir = Number(b.dataset.dir);
      wrap.scrollBy({ left: step * dir, behavior: 'smooth' });
    });
  });

  const $filterBtnRecursos = document.getElementById('btnFiltrosRecursos');
  const $filterAreaRecursos = document.getElementById('filterAreaRecursos');
  $filterBtnRecursos?.addEventListener('click', () => {
    const isVisible = $filterAreaRecursos.style.display === 'flex';
    $filterAreaRecursos.style.display = isVisible ? 'none' : 'flex';
    $filterBtnRecursos.textContent = isVisible ? 'Filtrar / Ordenar' : 'Ocultar Filtros';
  });

  document.getElementById('btnVolver')?.addEventListener('click', () => showPlanList(dimensionValue));
}


// --- View: Indicators for a goal -------------------------------------------
async function showIndicatorsForGoal(goalId) {
  async function loadIndicators() {
    const list = await apiListIndicatorsByGoal(goalId).catch(() => []);
    return Array.isArray(list) ? list : [];
  }

  function classifyUnit(uRaw) {
    const u = (uRaw || '').trim().toLowerCase();
    if (u === '%' || u === 'porcentaje') return 'percent';
    if (u === 'n' || u === 'n°' || u.includes('alum') || u.includes('caso') || u.includes('num') || u === 'nº') return 'count';
    return 'other';
  }

  function paintTable(indics) {
    if (!indics.length) {
      $tb.innerHTML = `<tr><td colspan="5">Sin indicadores para esta meta.</td></tr>`;
      return;
    }
    $tb.innerHTML = indics.map((x, idx) => {
      const kind = classifyUnit(x.unit);
      return `
        <tr data-id="${x.id}" data-kind="${kind}">
          <td>${idx + 1}</td>
          <td>${esc(x.title || '—')}</td>
          <td>${esc(x.unit || '—')}</td>
          <td>${x.target == null ? '—' : esc(x.target)}</td>
          <td>
            <button class="btn btn--sm" data-act="prog">Progreso</button>
            <button class="btn btn--sm btn--ghost" data-act="del">Eliminar</button>
          </td>
        </tr>

        <tr class="prog-row" data-for="${x.id}" style="display:none;">
          <td colspan="5">
            <div class="prog-box">
              ${(() => {
          if (kind === 'percent') {
            return `
                    <div class="prog-grid">
                      <label>Cantidad total
                        <input type="number" min="0" step="1" class="inp prog-total" data-id="${x.id}" placeholder="Ej: 100">
                      </label>
                      <label>Cantidad obtenida
                        <input type="number" min="0" step="1" class="inp prog-obt" data-id="${x.id}" placeholder="Ej: 80">
                      </label>
                      <div class="prog-result" id="prog-res-${x.id}">
                        <span class="badge">%</span> <strong>Resultado:</strong> —
                      </div>
                    </div>
                  `;
          } else if (kind === 'count') {
            return `
                    <div class="prog-grid">
                      <label>Cantidad total
                        <input type="number" min="0" step="1" class="inp prog-total" data-id="${x.id}" placeholder="Ej: 4">
                      </label>
                      <label>Cantidad obtenida
                        <input type="number" min="0" step="1" class="inp prog-obt" data-id="${x.id}" placeholder="Ej: 2">
                      </label>
                      <div class="prog-result" id="prog-res-${x.id}">
                        <span class="badge">n°</span> <strong>Resultado:</strong> —
                      </div>
                    </div>
                  `;
          } else {
            return `
                    <div class="prog-grid">
                      <label>Valor actual
                        <input type="text" class="inp prog-free" data-id="${x.id}" placeholder="Ej: 3.5 pts">
                      </label>
                      <div class="prog-result" id="prog-res-${x.id}">
                        <span class="badge">•</span> <strong>Resultado:</strong> —
                      </div>
                    </div>
                  `;
          }
        })()}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // restaurar inputs guardados localmente
    indics.forEach(x => {
      const saved = JSON.parse(localStorage.getItem(`ind-prog-${x.id}`) || 'null');
      if (!saved) return;
      const kind = classifyUnit(x.unit);
      if (kind === 'percent' || kind === 'count') {
        const t = document.querySelector(`.prog-total[data-id="${x.id}"]`);
        const o = document.querySelector(`.prog-obt[data-id="${x.id}"]`);
        if (t) t.value = saved.total ?? '';
        if (o) o.value = saved.obt ?? '';
        computeAndRenderProgress(x.id, kind);
      } else {
        const f = document.querySelector(`.prog-free[data-id="${x.id}"]`);
        if (f) f.value = saved.free ?? '';
        computeAndRenderProgress(x.id, kind);
      }
    });
  }

  function computeAndRenderProgress(id, kind) {
    const $out = document.getElementById(`prog-res-${id}`);
    if (!$out) return;

    if (kind === 'percent' || kind === 'count') {
      const $t = document.querySelector(`.prog-total[data-id="${id}"]`);
      const $o = document.querySelector(`.prog-obt[data-id="${id}"]`);
      const total = Number($t?.value ?? 0);
      const obt = Number($o?.value ?? 0);

      if (!Number.isFinite(total) || total <= 0) { $out.innerHTML = `<strong>Resultado:</strong> —`; return; }
      if (!Number.isFinite(obt) || obt < 0) { $out.innerHTML = `<strong>Resultado:</strong> —`; return; }

      if (kind === 'percent') {
        const pct = Math.max(0, Math.min(100, (obt / total) * 100));
        $out.innerHTML = `<strong>Resultado:</strong> ${pct.toFixed(1)} %`;
        localStorage.setItem(`ind-prog-${id}`, JSON.stringify({ total, obt }));
      } else {
        $out.innerHTML = `<strong>Resultado:</strong> ${obt}/${total}`;
        localStorage.setItem(`ind-prog-${id}`, JSON.stringify({ total, obt }));
      }
      return;
    }

    const $f = document.querySelector(`.prog-free[data-id="${id}"]`);
    const v = ($f?.value ?? '').trim();
    $out.innerHTML = `<strong>Resultado:</strong> ${v || '—'}`;
    localStorage.setItem(`ind-prog-${id}`, JSON.stringify({ free: v || '' }));
  }

  // Shell
  $title.textContent = `Indicadores — Meta ${goalId}`;
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header" style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;">
        <button class="btn btn--ghost" id="btnBack">← Volver</button>
        <h2 style="margin:0;">Indicadores de la meta #${esc(goalId)}</h2>
      </header>

      <div class="card__body" style="display:flex;flex-direction:column;gap:16px;">
        <div class="ind-form">
          <div class="field field--wide">
            <label class="lbl">Nombre del indicador</label>
            <textarea id="indNombre" class="inp inp--lg" rows="2" placeholder="Ej: % movilización en resultado de logros…"></textarea>
          </div>
          <div class="field">
            <label class="lbl">Unidad</label>
            <input id="indUnidad" class="inp" placeholder="%, n°, índice, etc.">
          </div>
          <div class="field">
            <label class="lbl">Meta/Target</label>
            <input id="indTarget" class="inp" type="text" placeholder="Ej: 80 o 80%">
          </div>
          <div class="field field--btn">
            <button class="btn btn--primary btn--lg" id="btnAddIndic">Agregar indicador</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="plan-table ind-table">
            <thead>
              <tr>
                <th class="w-xs">#</th>
                <th>Indicador</th>
                <th class="w-sm">Unidad</th>
                <th class="w-sm">Meta/Target</th>
                <th class="w-md">Acciones</th>
              </tr>
            </thead>
            <tbody id="tbIndics"><tr><td colspan="5">Cargando…</td></tr></tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  // Volver a metas con contexto
  document.getElementById('btnBack')?.addEventListener('click', () => {
    const ctx = window.__metasCtx || JSON.parse(sessionStorage.getItem('metasCtx') || 'null');
    if (ctx && ctx.dimension && ctx.objetivo) {
      navigateHash(`#/metas/${encodeURIComponent(ctx.dimension)}/${encodeURIComponent(ctx.objetivo)}`);
    } else {
      history.back();
    }
  });

  const $tb = document.getElementById('tbIndics');

  // Carga inicial
  let indicators = await loadIndicators();
  paintTable(indicators);

  // Crear indicador
  document.getElementById('btnAddIndic')?.addEventListener('click', async () => {
    const nombre = document.getElementById('indNombre').value.trim();
    const unidad = document.getElementById('indUnidad').value.trim();
    const targetStr = document.getElementById('indTarget').value.trim();

    if (!nombre) { alert('Ingresa el nombre del indicador.'); return; }

    // Validación básica para %
    const u = (unidad || '').toLowerCase();
    if ((u === '%' || u === 'porcentaje') && targetStr && !/^(100(\.0+)?|[0-9]?\d(\.\d+)?)%?$/.test(targetStr)) {
      return alert('Si la unidad es %, el target debe ser 0–100 (puedes usar "80" o "80%").');
    }

    try {
      await apiCreateIndicator(goalId, { title: nombre, unit: unidad || undefined, target: targetStr || undefined });
      document.getElementById('indNombre').value = '';
      document.getElementById('indUnidad').value = '';
      document.getElementById('indTarget').value = '';
      indicators = await apiListIndicatorsByGoal(goalId).catch(() => []);
      paintTable(indicators);
    } catch (err) {
      alert('No se pudo crear el indicador.\n' + (err?.message || ''));
    }
  });

  // Acciones tabla
  $tb.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr[data-id]');
    const id = tr?.dataset.id;

    if (btn.dataset.act === 'prog') {
      const row = document.querySelector(`tr.prog-row[data-for="${id}"]`);
      if (!row) return;
      row.style.display = row.style.display === 'none' ? '' : 'none';
      return;
    }

    if (btn.dataset.act === 'del') {
      if (!confirm('¿Eliminar este indicador?')) return;
      const res = await fetch(`${API}/indicators/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (!res.ok) { alert('No se pudo eliminar.'); return; }
      indicators = await apiListIndicatorsByGoal(goalId).catch(() => []);
      paintTable(indicators);
      return;
    }
  });

  // Cálculo en vivo
  $tb.addEventListener('input', (e) => {
    const inp = e.target;
    const id = inp?.dataset?.id;
    if (!id) return;
    const hostRow = document.querySelector(`tr[data-id="${id}"]`);
    const kind = hostRow?.dataset.kind;
    computeAndRenderProgress(id, kind);
  });
}


// --- View: Reportes (placeholder) -------------------------------------------
function showReportes() {
  $title.textContent = 'Reportes';
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header"><h2 style="margin:0;">Reportes</h2></header>
      <div class="card__body" style="padding: 50px; text-align: center;">
        <h1 style="color: var(--primary); font-size: 2.5rem;">En proceso...</h1>
        <p style="margin-top: 15px; font-size: 1.2rem;">Pronto podrás acceder a los informes de gestión.</p>
      </div>
    </section>
  `;
}


// --- UI: acordeón lateral con transición ------------------------------------
function setupAccordionTransition() {
  document.querySelectorAll('.nav__details').forEach(details => {
    const content = details.querySelector('.nav__submenu-content');
    const summary = details.querySelector('summary');
    if (!content || !summary) return;

    if (details.open) {
      content.style.maxHeight = content.scrollHeight + 'px';
      content.style.transition = 'max-height 0.4s ease-in-out';
    } else {
      content.style.maxHeight = '0';
    }

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !details.open;
      if (isOpening) {
        details.open = true;
        content.style.transition = 'none';
        const h = content.scrollHeight;
        requestAnimationFrame(() => {
          content.style.maxHeight = h + 'px';
          content.style.transition = 'max-height 0.4s ease-in-out';
        });
      } else {
        content.style.transition = 'none';
        content.style.maxHeight = content.scrollHeight + 'px';
        requestAnimationFrame(() => {
          content.style.transition = 'max-height 0.4s ease-in-out';
          content.style.maxHeight = '0';
          const end = () => { details.open = false; content.removeEventListener('transitionend', end); };
          content.addEventListener('transitionend', end);
        });
      }
    });
  });
}


// --- View: Metas (editor) ---------------------------------------------------
async function showStrategicGoalsEditor(dimensionValue, objetivo) {
  // persistir contexto para el botón "Volver" desde indicadores
  window.__metasCtx = { dimension: dimensionValue, objetivo };
  sessionStorage.setItem('metasCtx', JSON.stringify(window.__metasCtx));

  // garantizar Objective por (dimensión, nombre)
  const objective = await ensureObjectiveByName(dimensionValue, objetivo);
  const objectiveId = objective.id;

  const startY = Number(objective.start_year) || new Date().getUTCFullYear();
  const endY = Number(objective.end_year) || (startY + 3);
  const years = [];
  for (let y = startY; y <= endY; y++) years.push(y);
  const yearOptions = years.map(y => `<option value="${y}" ${y === new Date().getUTCFullYear() ? 'selected' : ''}>${y}</option>`).join('');

  $title.textContent = `${tituloDimension(dimensionValue)} — Metas Estratégicas`;
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
        <button class="btn btn--ghost" id="btnBack">← Volver</button>
        <h2 style="margin:0;">${esc(objetivo)}</h2>
      </header>

      <div class="card__body" style="display:flex;flex-direction:column;gap:16px;">
        <div class="assoc-bar metas-grid">
          <div class="field">
            <label class="lbl">Meta Estratégica</label>
            <textarea id="inpMeta" class="inp inp--lg" rows="3" placeholder="Escribe la meta estratégica"></textarea>
          </div>

          <div class="field">
            <label class="lbl">Estrategia del Periodo</label>
            <textarea id="inpEstrategiaPeriodo" class="inp inp--lg" rows="3" placeholder="Escribe la estrategia del periodo"></textarea>
          </div>

          <div class="field field--year">
            <label class="lbl">Año</label>
            <select id="selAnio" class="inp">${yearOptions}</select>
          </div>

          <div class="field field--btn">
            <button id="btnAgregarFila" class="btn btn--primary btn--lg">Guardar Meta</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="plan-table">
            <thead>
              <tr>
                <th>Meta Estratégica</th>
                <th>Estrategia del Periodo</th>
                <th>Año</th>
                <th style="width:220px;">Indicadores</th>
              </tr>
            </thead>
            <tbody id="tbMetas"><tr><td colspan="4">Cargando…</td></tr></tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  document.getElementById('btnBack')?.addEventListener('click', () => showObjectiveDetail(dimensionValue, objetivo));

  const $tb = document.getElementById('tbMetas');

  async function refreshTable() {
    const metas = await apiListGoalsByObjective(objectiveId);
    if (!metas.length) {
      $tb.innerHTML = `<tr><td colspan="4">Sin metas estratégicas aún.</td></tr>`;
      return;
    }
    const rows = metas.map(g => ({
      id: g.id,
      title: g.title,
      periodo: g.description || '',
      year: g.year
    }));

    $tb.innerHTML = rows.map(r => `
      <tr>
        <td>${esc(r.title)}</td>
        <td>${esc(r.periodo)}</td>
        <td>${esc(r.year)}</td>
        <td class="cell-actions">
          <div class="btn-group">
            <button class="btn btn--sm" data-act="toIndicators" data-goal="${r.id}">Ver indicadores</button>
            <button class="btn btn--sm btn--ghost" data-act="del" data-goal="${r.id}">Eliminar Meta Estratégica</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  await refreshTable();

  // Crear meta (idempotente por combinación en backend)
  let savingGoal = false;
  document.getElementById('btnAgregarFila')?.addEventListener('click', async () => {
    if (savingGoal) return;
    savingGoal = true;
    const btn = document.getElementById('btnAgregarFila');
    btn.disabled = true;

    try {
      const meta = document.getElementById('inpMeta').value.trim();
      const periodo = document.getElementById('inpEstrategiaPeriodo').value.trim();
      const year = Number(document.getElementById('selAnio').value);
      if (!meta || !periodo) { alert('Completa Meta y Estrategia del Periodo.'); return; }

      await apiCreateGoal(objectiveId, { title: meta, description: periodo, year });
      document.getElementById('inpMeta').value = '';
      document.getElementById('inpEstrategiaPeriodo').value = '';
      await refreshTable();
    } catch (e) {
      alert('No se pudo crear la meta.');
    } finally {
      savingGoal = false;
      btn.disabled = false;
    }
  });

  // Acciones sobre filas
  $tb.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;

    if (btn.dataset.act === 'toIndicators') {
      const goalId = btn.dataset.goal;
      window.__metasCtx = { dimension: dimensionValue, objetivo };
      sessionStorage.setItem('metasCtx', JSON.stringify(window.__metasCtx));
      navigateHash(`#/indicadores/goal/${goalId}`);
      return;
    }

    if (btn.dataset.act === 'del') {
      const goalId = btn.dataset.goal;
      if (!confirm('¿Eliminar esta meta? (si tiene indicadores, elimínalos primero)')) return;
      const res = await fetch(`${API}/goals/${goalId}`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (!res.ok) { alert('No se pudo eliminar la meta.'); return; }
      await refreshTable();
      return;
    }
  });
}


// --- Single indicator evidence upload (server) ------------------------------
async function showIndicadoresPage(id) {
  $title.textContent = `Indicadores — Registro ${id}`;
  $view.innerHTML = `
    <section class="card card--full">
      <header class="card__header"><h2>Indicador ${esc(id)}</h2></header>
      <div class="card__body" style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label class="lbl">Subir evidencia (PDF, DOCX, XLSX, PPTX, PNG, JPG)</label>
          <input type="file" id="evFile" />
          <input type="text" id="evDesc" class="inp" placeholder="Descripción (opcional)" />
          <button class="btn" id="btnUp">Subir</button>
        </div>
        <div id="evMsg"></div>
      </div>
    </section>
  `;

  document.getElementById('btnUp')?.addEventListener('click', async () => {
    const f = document.getElementById('evFile').files?.[0];
    const d = document.getElementById('evDesc').value || '';
    if (!f) { alert('Selecciona un archivo'); return; }

    const fd = new FormData();
    fd.append('file', f);
    fd.append('description', d);

    const res = await fetch(`${API}/indicators/${id}/evidences`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: fd
    });

    const $msg = document.getElementById('evMsg');
    if (res.ok) {
      $msg.innerHTML = `<p class="ok">Evidencia subida con éxito.</p>`;
      document.getElementById('evFile').value = '';
      document.getElementById('evDesc').value = '';
    } else {
      const t = await res.text().catch(() => '');
      $msg.innerHTML = `<p class="err">Error al subir evidencia: ${esc(t || res.status)}</p>`;
    }
  });
}


// --- Router -----------------------------------------------------------------
// Bloqueo de reentradas del router para evitar dobles render
let __routing = false;
async function router() {
  if (__routing) return;
  __routing = true;
  try {
    const hash = location.hash || '#/dashboard';

    const mGoal = hash.match(/^#\/indicadores\/goal\/([^/]+)$/);
    if (mGoal) { await showIndicatorsForGoal(decodeURIComponent(mGoal[1])); return; }

    const mMetas = hash.match(/^#\/metas\/([^/]+)\/(.+)$/);
    if (mMetas) { await showStrategicGoalsEditor(decodeURIComponent(mMetas[1]), decodeURIComponent(mMetas[2])); return; }

    if (hash === '#/dashboard') return showDashboard();
    if (hash === '#/reportes') return showReportes();
    if (hash === '#/planes/form') return isEditor() ? showPlanForm() : showForbidden('Solo los editores pueden crear/editar planes.');
    if (hash === '#/planes/liderazgo') return showPlanList('LIDERAZGO');
    if (hash === '#/planes/gestion') return showPlanList('GESTION_PEDAGOGICA');
    if (hash === '#/planes/convivencia') return showPlanList('CONVIVENCIA_ESCOLAR');
    if (hash === '#/planes/recursos') return showPlanList('GESTION_RECURSOS');

    return showDashboard();
  } finally {
    __routing = false;
  }
}


// --- App bootstrapping ------------------------------------------------------
window.addEventListener('hashchange', router);

window.addEventListener('DOMContentLoaded', () => {
  const liForm = document.querySelector('#nav-plan-form')?.closest('.nav__item, li, a');
  if (liForm && !isEditor()) liForm.style.display = 'none';
  router();
});
window.addEventListener('DOMContentLoaded', setupAccordionTransition);

// Accesos directos si existen en DOM
document.getElementById('nav-dashboard')?.addEventListener('click', e => { e.preventDefault(); location.hash = '#/dashboard'; });
document.getElementById('nav-plan-form')?.addEventListener('click', e => { e.preventDefault(); location.hash = '#/planes/form'; });

// Asegura que solo un acordeón esté abierto a la vez
document.querySelectorAll('.nav__details').forEach(d => {
  d.addEventListener('toggle', () => {
    if (d.open) document.querySelectorAll('.nav__details').forEach(o => { if (o !== d) o.open = false; });
  });
});


// === Evidencias por PLAN (subdimensión/acción) ===
async function apiListEvidencesByPlan(planId) {
  const res = await fetch(`${API}/plans/${planId}/evidences`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('No se pudo listar evidencias del plan');
  return res.json();
}
async function apiUploadEvidenceByPlan(planId, file, description = "") {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('description', description || "");
  const res = await fetch(`${API}/plans/${planId}/evidences`, {
    method: 'POST',
    body: fd,
    headers: { ...authHeaders(false) }, // no content-type manual en multipart
  });
  if (!res.ok) throw new Error('No se pudo subir evidencia');
  return res.json();
}

// Modal reutilizable para evidencias por plan
(function ensurePlanEvidenceModal() {
  if (document.getElementById('plan-ev-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'plan-ev-modal';
  modal.style.cssText = 'position:fixed;inset:0;display:none;background:rgba(0,0,0,.4);z-index:9999;';
  modal.innerHTML = `
    <div style="max-width:860px;margin:6vh auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee">
        <h3 style="margin:0">Evidencias de la acción</h3>
        <button id="plan-ev-close" class="btn btn--ghost" title="Cerrar">✕</button>
      </div>
      <div id="plan-ev-list" style="max-height:60vh;overflow:auto;padding:12px 16px"></div>
      <div id="plan-ev-uploader" style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid #eee">
        <input type="file" id="plan-ev-file" />
        <textarea id="plan-ev-desc" placeholder="Descripción (opcional)" style="flex:1;min-height:44px;resize:vertical;"></textarea>
        <button id="plan-ev-upload" class="btn">Subir</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let CURRENT_PLAN = null;
  async function refresh() {
    const list = document.getElementById('plan-ev-list');
    list.innerHTML = 'Cargando...';
    try {
      const data = await apiListEvidencesByPlan(CURRENT_PLAN);
      if (!Array.isArray(data) || data.length === 0) {
        list.innerHTML = '<p>No hay evidencias aún.</p>';
        return;
      }
      list.innerHTML = data.map(ev => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee">
          <div>
            <strong>${ev.original_filename || ev.filename}</strong>
            <div style="font-size:12px;color:#666">${(ev.description || '') + ' · '}${new Date(ev.uploaded_at).toLocaleString('es-CL')}</div>
          </div>
          <div>
            <a class="btn btn--sm" href="${API}${ev.download_url || ('/uploads/' + ev.filename)}">Descargar</a>
          </div>
        </div>
      `).join('');
    } catch (e) {
      list.innerHTML = `<p style="color:#c00">${e.message}</p>`;
    }
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-plan-evidencias]');
    if (!btn) return;
    CURRENT_PLAN = btn.getAttribute('data-plan-evidencias');
    document.getElementById('plan-ev-modal').style.display = 'block';
    const canEdit = (window.USER_ROLE === 'editor' || window.USER_ROLE === 'admin');
    document.getElementById('plan-ev-uploader').style.display = canEdit ? 'flex' : 'none';
    refresh();
  });
  document.getElementById('plan-ev-close').addEventListener('click', () => {
    document.getElementById('plan-ev-modal').style.display = 'none';
    CURRENT_PLAN = null;
  });
  document.getElementById('plan-ev-upload').addEventListener('click', async () => {
    const f = document.getElementById('plan-ev-file').files[0];
    const d = document.getElementById('plan-ev-desc').value;
    if (!f) { alert('Selecciona un archivo'); return; }
    try {
      await apiUploadEvidenceByPlan(CURRENT_PLAN, f, d);
      document.getElementById('plan-ev-file').value = '';
      document.getElementById('plan-ev-desc').value = '';
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  });
})();
