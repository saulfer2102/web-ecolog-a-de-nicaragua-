// Vista "Todas las especies de Nicaragua": especies con observaciones verificables en iNaturalist (en vivo).
import { $, $$, esc, fmt, url, param, debounce, photoUrl, photoCredit, loadingHTML, errorHTML, badgeUICN } from './common.js';
import { inat, inatIUCN } from './api.js';
import { db } from './datos.js';

const GRUPOS_INAT = [
  ['', 'Todos'], ['Aves', 'Aves'], ['Mammalia', 'Mamíferos'], ['Reptilia', 'Reptiles'], ['Amphibia', 'Anfibios'],
  ['Actinopterygii', 'Peces'], ['Plantae', 'Plantas'], ['Insecta', 'Insectos'], ['Arachnida', 'Arácnidos'],
  ['Mollusca', 'Moluscos'], ['Fungi', 'Hongos'],
];
const ICONIC_ES = Object.fromEntries(GRUPOS_INAT.filter(([k]) => k));
const POR_PAGINA = 48;
const t = { grupo: '', q: '', amenazadas: false, introducidas: false, page: 1, run: 0 };

let DB = null;
const dbListo = db().then((d) => { DB = d; }).catch(() => {});

function tarjeta({ taxon, count }) {
  const cur = DB?.especieDeTaxon(taxon);
  const href = cur ? url(`especie.html?id=${cur.id}`) : url(`especie.html?inat=${taxon.id}`);
  const img = photoUrl(taxon.default_photo, 'medium');
  const nombre = cur?.nombres_comunes?.[0] || taxon.preferred_common_name || taxon.name;
  const uicn = cur?.uicn || inatIUCN(taxon);
  return `
  <a class="card card-link sp-card" href="${href}">
    <div class="sp-photo">
      ${img ? `<img src="${esc(img)}" alt="${esc(nombre)}" loading="lazy">` : '<div class="sp-placeholder">Sin foto</div>'}
      <div class="sp-badges">${uicn && uicn !== 'LC' ? badgeUICN(uicn) : ''}${cur ? '<span class="chip chip-ficha">Ficha completa</span>' : ''}</div>
      ${img ? `<div class="sp-credit">${esc(photoCredit(taxon.default_photo))}</div>` : ''}
    </div>
    <div class="sp-info">
      <div class="sp-name">${esc(nombre)}</div>
      <div class="sp-sci">${esc(taxon.name)}</div>
      <div class="sp-meta"><span class="chip">${esc(ICONIC_ES[taxon.iconic_taxon_name] || taxon.iconic_taxon_name || 'Otro')}</span><span class="tiny muted">${fmt(count)} obs. en Nicaragua</span></div>
    </div>
  </a>`;
}

async function cargar(append = false) {
  const run = append ? t.run : ++t.run;
  const grid = $('#t-grid');
  const mas = $('#t-mas');
  if (!append) { t.page = 1; grid.innerHTML = loadingHTML('Consultando las especies registradas en Nicaragua…'); }
  mas.disabled = true;
  try {
    await dbListo;
    const d = await inat.placeSpecies({
      iconic: t.grupo || undefined, q: t.q || undefined, page: t.page, perPage: POR_PAGINA,
      threatened: t.amenazadas, introduced: t.introducidas,
    });
    if (run !== t.run) return;
    const html = d.results.map(tarjeta).join('');
    if (append) grid.insertAdjacentHTML('beforeend', html);
    else grid.innerHTML = html || '<div class="empty-state" style="grid-column:1/-1"><p>No hay especies que coincidan con la búsqueda.</p></div>';
    $('#t-conteo').textContent = `${fmt(d.total_results)} ${d.total_results === 1 ? 'especie' : 'especies'}`;
    if (!t.grupo && !t.q && !t.amenazadas && !t.introducidas) $('#n-todas').textContent = `(${fmt(d.total_results)})`;
    mas.classList.toggle('hidden', t.page * POR_PAGINA >= d.total_results);
  } catch (err) {
    if (!append) grid.innerHTML = errorHTML(err, 'iNaturalist puede estar ocupado; intenta de nuevo en unos segundos.');
  }
  mas.disabled = false;
}

function pintarGrupos(conteos = {}) {
  $('#t-grupo').innerHTML = GRUPOS_INAT.map(([k, label]) =>
    `<button type="button" data-v="${k}" aria-pressed="${k === t.grupo}">${esc(label)}${conteos[k] != null ? ` (${fmt(conteos[k])})` : ''}</button>`).join('');
}

let conteosPedidos = false;
async function pedirConteos() {
  if (conteosPedidos) return;
  conteosPedidos = true;
  const conteos = {};
  for (const [k] of GRUPOS_INAT) {
    try {
      const d = await inat.placeSpecies({ iconic: k || undefined, perPage: 1 });
      conteos[k] = d.total_results;
      pintarGrupos(conteos);
    } catch { /* sin conteo para este grupo */ }
  }
}

pintarGrupos();
$('#t-grupo').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  t.grupo = b.dataset.v;
  $$('#t-grupo button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  cargar();
});
$('#t-buscar').addEventListener('input', debounce((e) => { t.q = e.target.value.trim(); cargar(); }, 400));
$('#t-amenazadas').addEventListener('change', (e) => { t.amenazadas = e.target.checked; cargar(); });
$('#t-introducidas').addEventListener('change', (e) => { t.introducidas = e.target.checked; cargar(); });
$('#t-mas').addEventListener('click', () => { t.page++; cargar(true); });

/* Pestañas: "Todas las especies" (por defecto) y "Fichas completas" */
function mostrarVista(v) {
  $$('#vista-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  $('#vista-todas').classList.toggle('hidden', v !== 'todas');
  $('#vista-curadas').classList.toggle('hidden', v !== 'curadas');
  const p = new URLSearchParams(location.search);
  if (v === 'curadas') p.set('vista', 'curadas'); else p.delete('vista');
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
  if (v === 'todas' && !$('#t-grid').children.length) { cargar(); pedirConteos(); }
}
$('#vista-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]'); if (b) mostrarVista(b.dataset.v);
});
const filtrosCurados = ['q', 'grupo', 'region', 'amenazadas', 'endemicas', 'simbolos'].some((k) => param(k));
mostrarVista(param('vista') === 'curadas' || filtrosCurados ? 'curadas' : 'todas');
