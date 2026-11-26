// Página "Explorar el mapa": especies probables, emblemáticas y áreas protegidas cercanas a un punto.
import { CONFIG } from './config.js';
import {
  $, $$, esc, fmt, fmtKm, layout, url, param, GRUPOS, REGIONES_BASE, badgeUICN, chipRegion, photoUrl, photoCredit,
  loadingHTML, errorHTML, loadData, norm,
} from './common.js';
import { inat, inatIUCN, gbif, ebird, stri, geocode, elevation } from './api.js';
import { ubicar, haversine } from './geo.js';
import { db, taxaParaEspecies } from './datos.js';

layout('explorar.html');

const state = {
  lat: null, lng: null,
  radius: Number(param('r')) || CONFIG.radioPorDefecto,
  grupo: param('g') || 'todos',
  temporada: param('t') === '1',
  fuente: 'inat',
  gbifSoloEbird: false,
  ubic: null,
  elev: null,
  inatPage: 1,
  run: 0,
};

let DB = null;
const dbPromise = db().then((d) => (DB = d)).catch((e) => { console.warn('Datos curados no disponibles', e); return null; });

/* ------------------------------------------------------------------ */
/* Mapa                                                                 */
/* ------------------------------------------------------------------ */
const map = L.map('mapa', { zoomControl: true, minZoom: 6, maxBounds: [[8.5, -91], [16.8, -80]] }).fitBounds(CONFIG.limites);
const base = {
  'Mapa (OpenStreetMap)': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }),
  'Satélite (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics',
  }),
  'Relieve (OpenTopoMap)': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, attribution: '&copy; OpenStreetMap, SRTM | estilo &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  }),
};
base['Mapa (OpenStreetMap)'].addTo(map);

const capaDeptos = L.layerGroup().addTo(map);
const capaAreas = L.layerGroup().addTo(map);
let capaDensidad = L.tileLayer(gbif.densityTiles({}), { opacity: 0.75, attribution: 'Registros: <a href="https://www.gbif.org">GBIF.org</a>' });
const control = L.control.layers(base, {
  'Departamentos': capaDeptos,
  'Áreas protegidas y sitios': capaAreas,
  'Densidad de registros (GBIF)': capaDensidad,
}, { collapsed: true }).addTo(map);

const leyenda = L.control({ position: 'bottomleft' });
leyenda.onAdd = () => {
  const d = L.DomUtil.create('div', 'map-legend');
  d.innerHTML = '<i style="background:#2e6e4f"></i>Área protegida<br><i style="background:#1f7fa0"></i>Sitio de importancia ecológica';
  return d;
};
leyenda.addTo(map);

loadData('geo/departamentos.geojson').then((fc) => {
  L.geoJSON(fc, {
    style: (f) => ({ color: (REGIONES_BASE[f.properties.region] || {}).color || '#555', weight: 1.2, opacity: 0.8, fillOpacity: 0.04 }),
    interactive: false,
  }).addTo(capaDeptos);
}).catch(() => {});

dbPromise.then((d) => {
  if (!d) return;
  for (const a of d.areas) {
    if (!a.coordenadas) continue;
    const color = a.tipo === 'sitio_ecologico' ? '#1f7fa0' : '#2e6e4f';
    L.circleMarker(a.coordenadas, { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 })
      .bindPopup(`<h4>${esc(a.nombre)}</h4><div class="small muted">${esc(a.categoria || '')}</div><a href="${url(`area.html?id=${a.id}`)}">Ver ficha →</a>`)
      .addTo(capaAreas);
  }
  const sel = $('#lugares');
  const lugares = [...d.lugares].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  sel.insertAdjacentHTML('beforeend', lugares.map((l, i) => `<option value="${i}">${esc(l.nombre)} (${esc(l.departamento)})</option>`).join(''));
  sel.addEventListener('change', () => {
    const l = lugares[Number(sel.value)];
    if (l) setPoint(l.coordenadas[0], l.coordenadas[1], l.nombre);
  });
  if (!state.lat && !param('q')) renderRegiones();
});

let marcador = null;
let circulo = null;
map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));

/* ------------------------------------------------------------------ */
/* Controles                                                            */
/* ------------------------------------------------------------------ */
const segRadio = $('#seg-radio');
const segGrupo = $('#seg-grupo');
segGrupo.innerHTML = `<button type="button" data-v="todos">Todos</button>` +
  Object.entries(GRUPOS).map(([k, g]) => `<button type="button" data-v="${k}">${esc(g.label)}</button>`).join('');

function syncControls() {
  $$('button', segRadio).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === state.radius)));
  $$('button', segGrupo).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.grupo)));
  $('#chk-temporada').checked = state.temporada;
}
syncControls();

segRadio.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.radius = Number(b.dataset.v); syncControls();
  if (state.lat != null) setPoint(state.lat, state.lng, null, { keepView: false });
});
segGrupo.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.grupo = b.dataset.v; syncControls(); actualizarDensidad();
  if (state.lat != null) { state.inatPage = 1; renderProbables(); updateURL(); }
});
$('#chk-temporada').addEventListener('change', (e) => {
  state.temporada = e.target.checked;
  if (state.lat != null) { state.inatPage = 1; renderProbables(); updateURL(); }
});

function actualizarDensidad() {
  const keys = state.grupo !== 'todos' ? GRUPOS[state.grupo].gbif : null;
  capaDensidad.setUrl(gbif.densityTiles({ taxonKeys: keys }));
}

$('#form-buscar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q) buscarLugar(q);
});

async function buscarLugar(q) {
  const box = $('#geo-resultados');
  box.innerHTML = loadingHTML('Buscando lugar…');
  try {
    const res = await geocode(q);
    if (!res.length) { box.innerHTML = '<span class="muted">No encontramos ese lugar en Nicaragua. Prueba con otro nombre o toca el mapa.</span>'; return; }
    if (res.length === 1) { box.innerHTML = ''; return setPoint(Number(res[0].lat), Number(res[0].lon), res[0].name || q); }
    box.innerHTML = `<div class="muted" style="margin-bottom:4px">¿Cuál de estos?</div>` + res.map((r, i) =>
      `<button type="button" class="btn btn-ghost btn-sm" data-i="${i}" style="display:block;text-align:left">${esc(r.display_name)}</button>`).join('');
    box.onclick = (ev) => {
      const b = ev.target.closest('button[data-i]'); if (!b) return;
      const r = res[Number(b.dataset.i)];
      box.innerHTML = '';
      setPoint(Number(r.lat), Number(r.lon), r.name || q);
    };
  } catch (err) {
    box.innerHTML = errorHTML(err, 'Puedes tocar el mapa directamente.');
  }
}

$('#btn-ubicacion').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('Tu navegador no permite obtener la ubicación.');
  const b = $('#btn-ubicacion');
  b.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => { b.disabled = false; setPoint(pos.coords.latitude, pos.coords.longitude, 'Mi ubicación'); },
    () => { b.disabled = false; alert('No pudimos obtener tu ubicación. Revisa los permisos del navegador.'); },
    { enableHighAccuracy: false, timeout: 12000 },
  );
});

function updateURL() {
  const p = new URLSearchParams();
  if (state.lat != null) { p.set('lat', state.lat.toFixed(4)); p.set('lng', state.lng.toFixed(4)); }
  p.set('r', state.radius);
  if (state.grupo !== 'todos') p.set('g', state.grupo);
  if (state.temporada) p.set('t', '1');
  history.replaceState(null, '', `?${p}`);
}

/* ------------------------------------------------------------------ */
/* Selección de un punto                                                */
/* ------------------------------------------------------------------ */
async function setPoint(lat, lng, etiqueta = null, { keepView = false } = {}) {
  const run = ++state.run;
  Object.assign(state, { lat, lng, inatPage: 1, elev: null });
  $('#map-hint')?.classList.add('hidden');
  updateURL();

  if (marcador) marcador.setLatLng([lat, lng]); else marcador = L.marker([lat, lng]).addTo(map);
  if (circulo) circulo.setLatLng([lat, lng]).setRadius(state.radius * 1000);
  else circulo = L.circle([lat, lng], { radius: state.radius * 1000, color: '#f2b134', weight: 2, fillColor: '#f2b134', fillOpacity: 0.08 }).addTo(map);
  if (!keepView) map.fitBounds(circulo.getBounds(), { padding: [30, 30], maxZoom: 13 });

  $('#resultados').innerHTML = `
    <div class="panel-block" id="r-lugar">${loadingHTML('Ubicando el punto…')}</div>
    <div class="panel-block" id="r-areas"></div>
    <div class="panel-block" id="r-emblematicas"></div>
    <div class="panel-block" id="r-probables">
      <h2>Especies probables de observar</h2>
      <div class="tabs" role="tablist">
        <button role="tab" data-f="inat" aria-selected="true">iNaturalist</button>
        <button role="tab" data-f="gbif" aria-selected="false">GBIF (museos + eBird)</button>
        <button role="tab" data-f="ebird" aria-selected="false">eBird en vivo</button>
      </div>
      <div id="probables-body"></div>
    </div>
    <div class="panel-block" id="r-peces"></div>
    <div class="panel-block notice notice-info small" id="r-metodo">
      <strong>¿Cómo se calcula "probable"?</strong>
      Ordenamos las especies por el número de registros verificados dentro del radio elegido. Es una aproximación:
      depende de cuánta gente ha observado en el lugar y de qué tan fácil es ver o fotografiar cada especie.
      No es una garantía de avistamiento. <a href="${url('fuentes.html#metodo')}">Más sobre el método</a>.
    </div>`;
  $$('#r-probables .tabs button').forEach((b) => b.addEventListener('click', () => {
    state.fuente = b.dataset.f;
    $$('#r-probables .tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    renderProbables();
  }));
  state.fuente = 'inat';

  await dbPromise;
  const ubic = await ubicar(lat, lng).catch(() => ({ regiones: [], lat, lon: lng }));
  if (run !== state.run) return;
  state.ubic = ubic;
  renderLugar(ubic, etiqueta);
  const cercanas = renderAreas(ubic);
  renderProbables();
  const elevP = elevation(lat, lng).catch(() => null);
  elevP.then((m) => {
    if (run !== state.run) return;
    state.elev = m;
    const el = $('#r-elev');
    if (el) el.textContent = m != null ? `${fmt(Math.round(m))} m s. n. m.` : 'no disponible';
  });
  renderEmblematicas(ubic, cercanas, elevP, run);
  renderPeces(ubic, run);
}

function renderLugar(u, etiqueta) {
  const regs = DB?.regiones || REGIONES_BASE;
  let titulo = etiqueta || u.municipio || 'Punto seleccionado';
  let sub = '';
  if (u.fuera) {
    titulo = etiqueta || (u.pais ? `En ${u.pais}` : 'Fuera de Nicaragua');
    sub = `<div class="notice" style="margin-top:10px">Este punto está fuera de Nicaragua${u.pais ? ` (${esc(u.pais)})` : ''}. Los datos en vivo funcionan igual, pero el contenido curado se centra en Nicaragua.</div>`;
  } else if (u.mar) {
    sub = `<p class="small muted" style="margin:4px 0 0">En el ${u.mar === 'caribe' ? 'mar Caribe' : 'océano Pacífico'}, a ${fmtKm(u.distanciaCosta)} de la costa de ${esc(u.municipio)} (${esc(u.departamento)}).</p>`;
  }
  $('#r-lugar').innerHTML = `
    <div class="place-card">
      <span class="eyebrow">Tu punto</span>
      <h2>${esc(titulo)}</h2>
      ${sub}
      <div class="chips" style="margin-top:8px">${u.regiones.map((r) => chipRegion(r, regs)).join('')}</div>
      <dl class="kv">
        ${u.municipio && !u.mar ? `<dt>Municipio</dt><dd>${esc(u.municipio)}</dd>` : ''}
        ${u.departamento && !u.mar ? `<dt>Departamento</dt><dd>${esc(u.departamento)}</dd>` : ''}
        ${u.lago ? `<dt>Cuerpo de agua</dt><dd>${esc(u.lago)}</dd>` : ''}
        <dt>Coordenadas</dt><dd>${u.lat.toFixed(4)}, ${u.lon.toFixed(4)}</dd>
        <dt>Altitud aprox.</dt><dd id="r-elev"><span class="spinner" style="width:14px;height:14px;border-width:2px"></span></dd>
        <dt>Radio</dt><dd>${state.radius} km</dd>
      </dl>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary btn-sm" type="button" id="btn-compartir">Copiar enlace</button>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${inat.exploreUrl({ lat: u.lat, lng: u.lon, radius: state.radius })}">Ver en iNaturalist ↗</a>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${gbif.occurrencesUrl({ lat: u.lat, lng: u.lon, radiusKm: state.radius })}">Ver en GBIF ↗</a>
      </div>
    </div>`;
  $('#btn-compartir').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = '¡Enlace copiado!'; } catch { prompt('Copia este enlace:', location.href); }
  });
}

function renderAreas(u) {
  const box = $('#r-areas');
  if (!DB) { box.innerHTML = ''; return []; }
  const lista = DB.areas.filter((a) => a.coordenadas)
    .map((a) => ({ a, km: haversine([u.lat, u.lon], a.coordenadas) }))
    .sort((x, y) => x.km - y.km);
  const cerca = lista.filter((x) => x.km <= Math.max(60, state.radius * 2)).slice(0, 6);
  const mostrar = cerca.length ? cerca : lista.slice(0, 3);
  box.innerHTML = `
    <h2>Áreas protegidas y sitios cercanos</h2>
    <div class="place-card" style="padding:4px 16px">
      ${mostrar.map(({ a, km }) => `
        <a class="area-near" href="${url(`area.html?id=${a.id}`)}">
          <span class="area-dot" style="background:${a.tipo === 'sitio_ecologico' ? '#1f7fa0' : '#2e6e4f'}"></span>
          <span><strong>${esc(a.nombre)}</strong><br><span class="small muted">${esc(a.categoria || '')}</span></span>
          <span class="dist">${fmtKm(km)}</span>
        </a>`).join('')}
    </div>
    <p class="tiny muted" style="margin-top:6px">Distancia al punto central aproximado de cada área, no a su límite.</p>`;
  return lista;
}

/* ------------------------------------------------------------------ */
/* Especies emblemáticas de la zona (contenido curado)                  */
/* ------------------------------------------------------------------ */
async function renderEmblematicas(u, cercanas, elevP, run) {
  const box = $('#r-emblematicas');
  if (!DB || !DB.especies.length) { box.innerHTML = ''; return; }
  const regs = new Set(u.regiones);
  for (const { a, km } of cercanas) if (km <= 8 && a.region === 'lagos') regs.add('lagos');

  const score = new Map();
  const add = (id, s, motivo) => {
    if (!DB.especie(id)) return;
    const cur = score.get(id) || { s: 0, motivos: new Set() };
    cur.s += s; if (motivo) cur.motivos.add(motivo);
    score.set(id, cur);
  };
  for (const { a, km } of cercanas.filter((x) => x.km <= 30)) {
    for (const sp of DB.especiesDeArea(a.id)) add(sp.id, 3 + 5 / (km + 1), a.nombre);
  }
  for (const r of regs) {
    for (const id of DB.regiones[r]?.especies_emblematicas || []) add(id, 2, null);
  }
  for (const sp of DB.especies) {
    if ((sp.regiones || []).some((r) => regs.has(r))) add(sp.id, 1 + (sp.simbolo_nacional ? 0.5 : 0) + (sp.endemica ? 0.5 : 0), null);
  }
  const elev = await Promise.race([elevP, new Promise((r) => setTimeout(() => r(null), 2500))]);
  if (run !== state.run) return;
  if (elev != null) {
    for (const [id, v] of score) {
      const alt = DB.especie(id).altitud_m;
      if (Array.isArray(alt) && (elev < alt[0] - 250 || elev > alt[1] + 250)) v.s -= 4;
    }
  }
  const top = [...score.entries()].filter(([, v]) => v.s > 0).sort((a, b) => b[1].s - a[1].s).slice(0, 12)
    .map(([id, v]) => ({ sp: DB.especie(id), motivos: [...v.motivos] }));
  if (!top.length) { box.innerHTML = ''; return; }

  box.innerHTML = `
    <h2>Especies emblemáticas de la zona</h2>
    <p class="small muted" style="margin-top:-4px">Seleccionadas de nuestro catálogo curado según la región, las áreas protegidas cercanas${elev != null ? ' y la altitud' : ''}.
    <span class="near-flag">● Registrada en el radio</span> indica observaciones verificadas en iNaturalist dentro de ${state.radius} km.</p>
    <div class="mini-grid">
      ${top.map(({ sp, motivos }) => `
        <a class="mini-card" href="${url(`especie.html?id=${sp.id}`)}" title="${esc(motivos.length ? `Documentada en: ${motivos.join(', ')}` : '')}">
          <div class="mini-photo" data-photo-for="${esc(sp.id)}"></div>
          <div class="mini-txt"><b>${esc(sp.nombres_comunes?.[0] || sp.nombre_cientifico)}</b><i>${esc(sp.nombre_cientifico)}</i>
          <div style="margin-top:4px">${badgeUICN(sp.uicn)}</div></div>
        </a>`).join('')}
    </div>`;

  const lista = top.map((x) => x.sp);
  const taxa = await taxaParaEspecies(lista, (id, t) => {
    const ph = box.querySelector(`[data-photo-for="${CSS.escape(id)}"]`);
    const img = photoUrl(t?.default_photo, 'small');
    if (ph && img) ph.innerHTML = `<img src="${esc(img)}" alt="" loading="lazy" title="${esc(photoCredit(t.default_photo))}">`;
  });
  if (run !== state.run) return;
  // ¿Cuáles tienen observaciones verificadas dentro del radio? Una sola consulta a iNaturalist.
  const ids = [...taxa.values()].map((t) => t.id);
  if (!ids.length) return;
  try {
    const esp = await inat.speciesCounts({ lat: u.lat, lng: u.lon, radius: state.radius, taxonIds: ids, perPage: 100 });
    if (run !== state.run) return;
    const vistos = new Set((esp.results || []).map((r) => r.taxon.id));
    for (const [sid, t] of taxa) {
      if (vistos.has(t.id)) {
        const ph = box.querySelector(`[data-photo-for="${CSS.escape(sid)}"]`);
        ph?.insertAdjacentHTML('beforeend', '<span class="near-badge">● En el radio</span>');
      }
    }
  } catch (e) { console.warn(e); }
}

/* ------------------------------------------------------------------ */
/* Especies probables (datos en vivo)                                    */
/* ------------------------------------------------------------------ */
function mesesTemporada() {
  const m = new Date().getMonth() + 1;
  return [((m + 10) % 12) + 1, m, (m % 12) + 1];
}
function etiquetaFrecuencia(frac) {
  if (frac >= 0.5) return 'Muy frecuente';
  if (frac >= 0.2) return 'Frecuente';
  if (frac >= 0.05) return 'Ocasional';
  return 'Poco registrada';
}

function renderProbables() {
  const body = $('#probables-body');
  if (!body) return;
  if (state.fuente === 'inat') return probablesINat(body);
  if (state.fuente === 'gbif') return probablesGBIF(body);
  return probablesEBird(body);
}

async function probablesINat(body, append = false) {
  const run = state.run;
  const iconic = state.grupo !== 'todos' ? GRUPOS[state.grupo].inat : undefined;
  if (!append) body.innerHTML = loadingHTML('Consultando observaciones verificadas en iNaturalist…');
  try {
    const d = await inat.speciesCounts({
      lat: state.lat, lng: state.lng, radius: state.radius, iconic, months: state.temporada ? mesesTemporada() : null, page: state.inatPage, perPage: 40,
    });
    if (run !== state.run || state.fuente !== 'inat') return;
    if (!append) state.inatMax = d.results[0]?.count || 1;
    const idx = await stri.index().catch(() => null);
    const rows = d.results.map((r) => filaINat(r, idx)).join('');
    if (!append) {
      body.innerHTML = d.total_results
        ? `<p class="small muted" style="margin-top:0">${fmt(d.total_results)} especies con observaciones de <strong>grado de investigación</strong> en ${state.radius} km${state.temporada ? ' en esta época del año' : ''}.</p><div class="sp-list" id="lista-inat">${rows}</div>`
        : `<div class="empty-state"><p>No hay observaciones verificadas de este grupo en el radio elegido.<br>Prueba con un radio mayor o con "Todos".</p></div>`;
    } else {
      $('#lista-inat').insertAdjacentHTML('beforeend', rows);
    }
    $('#mas-inat')?.remove();
    if (d.total_results > state.inatPage * 40) {
      body.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary btn-sm" id="mas-inat" style="margin-top:10px;width:100%">Ver más especies</button>`);
      $('#mas-inat').addEventListener('click', () => { state.inatPage++; probablesINat(body, true); });
    }
  } catch (err) {
    if (!append) body.innerHTML = errorHTML(err, 'iNaturalist puede estar ocupado; intenta de nuevo en unos segundos.');
  }
}

function filaINat({ count, taxon }, striIdx) {
  const curada = DB?.especieDeTaxon(taxon);
  const nombre = curada?.nombres_comunes?.[0] || taxon.preferred_common_name || taxon.name;
  const href = curada ? url(`especie.html?id=${curada.id}`) : url(`especie.html?inat=${taxon.id}`);
  const frac = count / (state.inatMax || 1);
  const img = photoUrl(taxon.default_photo, 'square');
  const uicn = curada?.uicn || inatIUCN(taxon);
  const pez = striIdx?.especies?.[taxon.name];
  return `
    <a class="sp-row" href="${href}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" title="${esc(photoCredit(taxon.default_photo))}">` : '<span class="thumb-ph"></span>'}
      <span>
        <span class="sp-name">${esc(nombre)}</span><br>
        <span class="sp-sci">${esc(taxon.name)}</span>
        <span class="chips" style="margin-top:3px">${uicn && uicn !== 'LC' ? badgeUICN(uicn) : ''}${curada ? '<span class="chip">En el catálogo</span>' : ''}${pez ? '<span class="chip">Ficha Smithsonian</span>' : ''}</span>
      </span>
      <span class="freq">
        <span class="freq-label">${etiquetaFrecuencia(frac)}</span>
        <div class="freq-bar"><span style="width:${Math.max(3, Math.round(frac * 100))}%"></span></div>
        <span class="freq-label">${fmt(count)} obs.</span>
      </span>
    </a>`;
}

async function probablesGBIF(body) {
  const run = state.run;
  body.innerHTML = `
    <label class="check small" style="margin-bottom:8px"><input type="checkbox" id="chk-ebird-gbif" ${state.gbifSoloEbird ? 'checked' : ''}> Solo datos de eBird publicados en GBIF (aves)</label>
    <div id="gbif-lista">${loadingHTML('Consultando GBIF…')}</div>`;
  $('#chk-ebird-gbif').addEventListener('change', (e) => { state.gbifSoloEbird = e.target.checked; probablesGBIF(body); });
  const box = $('#gbif-lista');
  try {
    let keys = state.grupo !== 'todos' ? GRUPOS[state.grupo].gbif : null;
    if (state.gbifSoloEbird && !keys) keys = [212];
    const months = state.temporada ? mesesTemporada() : null;
    const { total, especies } = await gbif.speciesNear({
      lat: state.lat, lng: state.lng, radiusKm: state.radius, taxonKeys: keys, months,
      datasetKey: state.gbifSoloEbird ? CONFIG.gbifEbirdDataset : undefined, limit: 40,
    });
    if (run !== state.run || state.fuente !== 'gbif') return;
    if (!especies.length) { box.innerHTML = '<div class="empty-state"><p>GBIF no tiene registros de este grupo en el radio elegido.</p></div>'; return; }
    const detalles = await Promise.all(especies.map((e) => gbif.species(e.key).catch(() => null)));
    if (run !== state.run || state.fuente !== 'gbif') return;
    const max = especies[0].count;
    const idx = await stri.index().catch(() => null);
    box.innerHTML = `
      <p class="small muted" style="margin-top:0">${fmt(total)} registros en ${state.radius} km. GBIF reúne colecciones de museos y herbarios, inventarios, eBird, iNaturalist y otras fuentes.</p>
      <div class="sp-list">${especies.map((e, i) => {
        const s = detalles[i];
        if (!s) return '';
        const nombreCient = s.canonicalName || s.scientificName;
        const curada = DB?.especiePorNombre(nombreCient);
        const href = curada ? url(`especie.html?id=${curada.id}`) : url(`especie.html?nombre=${encodeURIComponent(nombreCient)}&gbif=${e.key}`);
        const frac = e.count / max;
        const pez = idx?.especies?.[nombreCient];
        return `
        <a class="sp-row" href="${href}">
          <span class="thumb-ph" style="display:grid;place-items:center;font-size:.65rem;color:var(--text-muted);text-align:center;padding:4px">${esc(s.family || s.class || '')}</span>
          <span>
            <span class="sp-name">${curada ? esc(curada.nombres_comunes[0]) : `<i>${esc(nombreCient)}</i>`}</span><br>
            <span class="sp-sci">${curada ? esc(nombreCient) : esc([s.class, s.order].filter(Boolean).join(' · '))}</span>
            <span class="chips" style="margin-top:3px">${curada ? '<span class="chip">En el catálogo</span>' : ''}${pez ? '<span class="chip">Ficha Smithsonian</span>' : ''}</span>
          </span>
          <span class="freq"><span class="freq-label">${etiquetaFrecuencia(frac)}</span><div class="freq-bar"><span style="width:${Math.max(3, Math.round(frac * 100))}%"></span></div><span class="freq-label">${fmt(e.count)} reg.</span></span>
        </a>`;
      }).join('')}</div>
      <p class="tiny muted">Fuente: GBIF.org — Búsqueda de ocurrencias, consultada el ${new Date().toLocaleDateString('es-NI')}.
      <a target="_blank" rel="noopener" href="${gbif.occurrencesUrl({ lat: state.lat, lng: state.lng, radiusKm: state.radius })}">Ver registros en GBIF ↗</a></p>`;
  } catch (err) {
    box.innerHTML = errorHTML(err);
  }
}

async function probablesEBird(body) {
  const run = state.run;
  const key = ebird.getKey();
  if (!key) {
    body.innerHTML = `
      <div class="notice">
        <strong>eBird en vivo necesita una clave gratuita</strong>
        La API de eBird (Cornell Lab of Ornithology) muestra las aves reportadas en los últimos 30 días y los sitios de observación (hotspots).
        Solicita tu clave en <a href="https://ebird.org/api/keygen" target="_blank" rel="noopener">ebird.org/api/keygen</a> y pégala aquí.
        Se guarda solo en este navegador.
        <form class="search-bar" id="form-ebird" style="margin-top:10px">
          <input class="input" id="ebird-key" placeholder="Clave de la API de eBird" autocomplete="off">
          <button class="btn btn-primary btn-sm" type="submit">Guardar</button>
        </form>
      </div>
      <p class="small" style="margin-top:12px">Mientras tanto, puedes ver los <button class="btn btn-ghost btn-sm" id="ver-eod">datos históricos de eBird publicados en GBIF</button>.</p>`;
    $('#form-ebird').addEventListener('submit', (e) => { e.preventDefault(); ebird.setKey($('#ebird-key').value); probablesEBird(body); });
    $('#ver-eod').addEventListener('click', () => {
      state.fuente = 'gbif'; state.gbifSoloEbird = true;
      $$('#r-probables .tabs button').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.f === 'gbif')));
      renderProbables();
    });
    return;
  }
  body.innerHTML = loadingHTML('Consultando eBird…');
  try {
    const [obs, hots] = await Promise.all([
      ebird.recent({ lat: state.lat, lng: state.lng, dist: state.radius }),
      ebird.hotspots({ lat: state.lat, lng: state.lng, dist: state.radius }).catch(() => []),
    ]);
    if (run !== state.run || state.fuente !== 'ebird') return;
    const porEspecie = new Map();
    for (const o of obs) {
      const cur = porEspecie.get(o.speciesCode) || { ...o, n: 0, ultimo: o.obsDt };
      cur.n++;
      if (o.obsDt > cur.ultimo) cur.ultimo = o.obsDt;
      porEspecie.set(o.speciesCode, cur);
    }
    const lista = [...porEspecie.values()].sort((a, b) => b.n - a.n);
    const max = lista[0]?.n || 1;
    body.innerHTML = `
      <p class="small muted" style="margin-top:0">${fmt(lista.length)} especies de aves reportadas en eBird en los últimos 30 días dentro de ${Math.min(50, state.radius)} km.
      <button class="btn btn-ghost btn-sm" id="borrar-key">Cambiar clave</button></p>
      <div class="sp-list">${lista.slice(0, 60).map((o) => {
        const curada = DB?.especiePorNombre(o.sciName);
        const href = curada ? url(`especie.html?id=${curada.id}`) : url(`especie.html?nombre=${encodeURIComponent(o.sciName)}`);
        const frac = o.n / max;
        return `<a class="sp-row" href="${href}">
          <span class="thumb-ph"></span>
          <span><span class="sp-name">${esc(o.comName)}</span><br><span class="sp-sci">${esc(o.sciName)}</span>
          <span class="tiny muted" style="display:block">Último: ${esc(o.ultimo)} · ${esc(o.locName)}</span></span>
          <span class="freq"><span class="freq-label">${o.n} ${o.n === 1 ? 'localidad' : 'localidades'}</span><div class="freq-bar"><span style="width:${Math.max(3, Math.round(frac * 100))}%"></span></div></span>
        </a>`;
      }).join('') || '<div class="empty-state"><p>Sin reportes recientes en este radio.</p></div>'}</div>
      ${hots.length ? `<h3 style="margin-top:18px;font-size:1rem">Sitios de observación (hotspots) de eBird</h3>
        <ul class="link-list">${hots.sort((a, b) => (b.numSpeciesAllTime || 0) - (a.numSpeciesAllTime || 0)).slice(0, 10).map((h) =>
          `<li><a target="_blank" rel="noopener" href="${ebird.hotspotUrl(h.locId)}">${esc(h.locName)}</a> <span class="muted">· ${fmt(h.numSpeciesAllTime || 0)} especies</span></li>`).join('')}</ul>` : ''}
      <p class="tiny muted">Datos de <a href="https://ebird.org" target="_blank" rel="noopener">eBird.org</a>, Cornell Lab of Ornithology, Ithaca, Nueva York.</p>`;
    $('#borrar-key').addEventListener('click', () => { ebird.setKey(null); probablesEBird(body); });
  } catch (err) {
    body.innerHTML = errorHTML(err, err.status === 403 || err.status === 401 ? 'La clave parece no ser válida.' : '') +
      '<button class="btn btn-secondary btn-sm" id="borrar-key">Ingresar otra clave</button>';
    $('#borrar-key').addEventListener('click', () => { ebird.setKey(null); probablesEBird(body); });
  }
}

/* ------------------------------------------------------------------ */
/* Peces: enlaces al Smithsonian (STRI)                                  */
/* ------------------------------------------------------------------ */
async function renderPeces(u, run) {
  const box = $('#r-peces');
  const marino = u.regiones.filter((r) => r.startsWith('marino-'));
  const lagos = u.regiones.includes('lagos');
  if (!marino.length && !lagos) { box.innerHTML = ''; return; }
  const sistemas = marino.map((r) => r === 'marino-caribe'
    ? `<a target="_blank" rel="noopener" href="${stri.home.caribe}">Peces costeros del Gran Caribe ↗</a>`
    : `<a target="_blank" rel="noopener" href="${stri.home.pacifico}">Peces costeros del Pacífico Oriental Tropical ↗</a>`).join(' · ');
  box.innerHTML = `
    <h2>Peces de la zona</h2>
    <div class="place-card">
      ${marino.length ? `<p class="small" style="margin-top:0">Este punto está en el mar o cerca de la costa. El Instituto Smithsonian de Investigaciones Tropicales (STRI) mantiene sistemas de información con fichas, fotos y mapas de distribución de peces costeros: ${sistemas}.</p>` : ''}
      ${lagos ? `<p class="small" style="margin-top:0">Zona de agua dulce: el Cocibolca, el Xolotlán y las lagunas cratéricas albergan cíclidos (mojarras, guapotes) y especies que vienen del mar, como el tiburón toro y el sábalo real. Consulta el <a href="${url('especies.html?grupo=peces')}">catálogo de peces</a>.</p>` : ''}
      <div id="peces-stri">${loadingHTML('Buscando peces registrados con ficha del Smithsonian…')}</div>
    </div>`;
  try {
    // 47178 = Actinopterygii (peces óseos), 47273 = Elasmobranchii (tiburones y rayas) en iNaturalist.
    const d = await inat.speciesCounts({ lat: u.lat, lng: u.lon, radius: Math.max(state.radius, 10), taxonIds: [47178, 47273], perPage: 200 });
    const idx = await stri.index();
    if (run !== state.run) return;
    const conFicha = d.results.filter((r) => idx.especies[r.taxon.name]);
    const el = $('#peces-stri');
    if (!el) return;
    el.innerHTML = conFicha.length ? `
      <p class="small muted" style="margin-bottom:6px">${conFicha.length} especies de peces observadas cerca (iNaturalist, grado de investigación) tienen ficha en el Smithsonian:</p>
      <ul class="link-list">${conFicha.slice(0, 25).map((r) => {
        const [c, p] = idx.especies[r.taxon.name];
        const links = [c ? `<a target="_blank" rel="noopener" href="${idx.fuente.url_caribe}${c}">Caribe</a>` : '', p ? `<a target="_blank" rel="noopener" href="${idx.fuente.url_pacifico}${p}">Pacífico</a>` : ''].filter(Boolean).join(' · ');
        return `<li><i>${esc(r.taxon.name)}</i>${r.taxon.preferred_common_name ? ` — ${esc(r.taxon.preferred_common_name)}` : ''} <span class="muted">(${fmt(r.count)} obs.)</span><br><span class="small">STRI: ${links}</span></li>`;
      }).join('')}</ul>` : '<p class="small muted">No hay observaciones de peces con ficha STRI en este radio.</p>';
  } catch (err) {
    const el = $('#peces-stri'); if (el) el.innerHTML = errorHTML(err);
  }
}

/* ------------------------------------------------------------------ */
/* Regiones (estado inicial)                                            */
/* ------------------------------------------------------------------ */
const CAJAS_REGION = {
  'marino-pacifico': [[10.9, -87.9], [13.1, -85.6]],
  'marino-caribe': [[10.9, -84.0], [15.1, -82.5]],
  lagos: [[11.0, -86.5], [12.5, -84.8]],
};
async function renderRegiones() {
  const box = $('#region-info');
  if (!DB) return;
  box.innerHTML = `
    <div class="panel-block" style="margin-top:8px">
      <h2 style="font-size:1.1rem">O explora por región</h2>
      <div class="stack">${DB.regionesLista.map((r) => `
        <button class="card" data-region="${esc(r.id)}" style="display:block;width:100%;text-align:left;padding:14px 16px;cursor:pointer;border-left:6px solid ${esc(r.color)}">
          <strong style="font-family:var(--font-display);font-size:1.05rem">${esc(r.nombre)}</strong>
          <span class="small muted" style="display:block">${esc((r.ecosistemas || []).slice(0, 4).join(' · '))}</span>
        </button>`).join('')}</div>
    </div>`;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-region]'); if (!b) return;
    mostrarRegion(b.dataset.region);
  });
  const pr = param('region');
  if (pr) mostrarRegion(pr);
}

async function mostrarRegion(id) {
  const r = DB.regiones[id];
  if (!r) return;
  const fc = await loadData('geo/departamentos.geojson').catch(() => null);
  let bounds = CAJAS_REGION[id];
  if (!bounds && fc) {
    const feats = fc.features.filter((f) => f.properties.region === id);
    if (feats.length) bounds = L.geoJSON({ type: 'FeatureCollection', features: feats }).getBounds();
  }
  if (bounds) map.fitBounds(bounds, { padding: [20, 20] });
  const sps = (r.especies_emblematicas || []).map((x) => DB.especie(x)).filter(Boolean);
  $('#resultados').innerHTML = `
    <div class="panel-block">
      <div class="place-card" style="border-left:6px solid ${esc(r.color)}">
        <span class="eyebrow">Región</span>
        <h2>${esc(r.nombre)}</h2>
        <p class="small">${esc(r.descripcion || '')}</p>
        ${r.clima ? `<p class="small"><strong>Clima:</strong> ${esc(r.clima)}</p>` : ''}
        <div class="chips">${(r.ecosistemas || []).map((e) => `<span class="chip">${esc(e)}</span>`).join('')}</div>
        <p class="tiny muted" style="margin:10px 0 0">Toca un punto del mapa para ver las especies registradas en ese lugar.</p>
      </div>
    </div>
    ${sps.length ? `<div class="panel-block"><h2>Especies emblemáticas</h2><div class="mini-grid">${sps.map((sp) => `
      <a class="mini-card" href="${url(`especie.html?id=${sp.id}`)}"><div class="mini-photo" data-photo-for="${esc(sp.id)}"></div>
      <div class="mini-txt"><b>${esc(sp.nombres_comunes?.[0])}</b><i>${esc(sp.nombre_cientifico)}</i></div></a>`).join('')}</div></div>` : ''}
    <div id="region-info"></div>`;
  taxaParaEspecies(sps, (sid, t) => {
    const ph = document.querySelector(`[data-photo-for="${CSS.escape(sid)}"]`);
    const img = photoUrl(t?.default_photo, 'small');
    if (ph && img) ph.innerHTML = `<img src="${esc(img)}" alt="" loading="lazy" title="${esc(photoCredit(t.default_photo))}">`;
  });
}

/* ------------------------------------------------------------------ */
/* Arranque desde la URL                                                */
/* ------------------------------------------------------------------ */
const pLat = Number(param('lat'));
const pLng = Number(param('lng'));
if (param('lat') && param('lng') && !Number.isNaN(pLat) && !Number.isNaN(pLng)) {
  setPoint(pLat, pLng);
} else if (param('q')) {
  $('#q').value = param('q');
  buscarLugar(param('q'));
}
actualizarDensidad();
