// Listado y mapa de áreas protegidas y sitios de importancia ecológica.
import { CONFIG } from './config.js';
import { $, $$, esc, fmt, layout, url, norm, debounce, chipRegion, designacionCorta, badgeVerif, loadingHTML, errorHTML, loadData, REGIONES_BASE } from './common.js';
import { db } from './datos.js';

layout('areas.html');

const lista = $('#lista');
lista.innerHTML = loadingHTML('Cargando áreas…');
const f = { q: '', tipo: '', region: '', ramsar: false, biosfera: false };

const map = L.map('mapa-areas', { scrollWheelZoom: false }).fitBounds(CONFIG.limites);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
loadData('geo/departamentos.geojson').then((fc) => L.geoJSON(fc, {
  style: (ft) => ({ color: (REGIONES_BASE[ft.properties.region] || {}).color || '#555', weight: 1, opacity: 0.6, fillOpacity: 0.03 }), interactive: false,
}).addTo(map)).catch(() => {});
const capa = L.layerGroup().addTo(map);

const tiene = (a, re) => (a.designaciones || []).some((d) => re.test(d));

db().then((D) => {
  $('#f-region').insertAdjacentHTML('beforeend', D.regionesLista.map((r) => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join(''));
  const render = () => {
    const q = norm(f.q);
    const res = D.areas.filter((a) =>
      (!f.tipo || a.tipo === f.tipo) && (!f.region || a.region === f.region) &&
      (!f.ramsar || tiene(a, /ramsar/i)) && (!f.biosfera || tiene(a, /biosfera/i)) &&
      (!q || norm([a.nombre, a.categoria, ...(a.departamentos || []), ...(a.ecosistemas || [])].join(' ')).includes(q)))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    $('#conteo').textContent = `${res.length} ${res.length === 1 ? 'lugar' : 'lugares'}`;
    lista.innerHTML = res.map((a) => `
      <a class="card card-link" href="${url(`area.html?id=${a.id}`)}" style="border-top:4px solid ${a.tipo === 'sitio_ecologico' ? '#1f7fa0' : '#2e6e4f'}">
        <div class="card-body">
          <div class="small muted" style="font-weight:600">${esc(a.categoria || '')}</div>
          <h3 style="margin:4px 0 6px">${esc(a.nombre)}</h3>
          <div class="small muted">${esc((a.departamentos || []).join(', '))}${a.area_ha ? ` · ${fmt(Math.round(a.area_ha))} ha aprox.` : ''}${a.anio_declaracion ? ` · desde ${a.anio_declaracion}` : ''}</div>
          <div class="chips" style="margin-top:10px">${chipRegion(a.region, D.regiones)}${(a.designaciones || []).map((d) => `<span class="chip" title="${esc(d)}">${esc(designacionCorta(d))}</span>`).join('')}</div>
          <p class="small" style="margin:10px 0 8px;color:var(--text-soft)">${esc((a.descripcion || '').slice(0, 170))}${(a.descripcion || '').length > 170 ? '…' : ''}</p>
          ${badgeVerif(a.verificacion)}
        </div>
      </a>`).join('') || '<div class="empty-state" style="grid-column:1/-1"><p>Ningún lugar coincide con los filtros.</p></div>';
    capa.clearLayers();
    for (const a of res) {
      if (!a.coordenadas) continue;
      L.circleMarker(a.coordenadas, { radius: 7, color: '#fff', weight: 2, fillColor: a.tipo === 'sitio_ecologico' ? '#1f7fa0' : '#2e6e4f', fillOpacity: 0.95 })
        .bindPopup(`<h4>${esc(a.nombre)}</h4><div class="small muted">${esc(a.categoria || '')}</div><a href="${url(`area.html?id=${a.id}`)}">Ver ficha →</a>`)
        .addTo(capa);
    }
  };
  render();
  $('#buscar').addEventListener('input', debounce((e) => { f.q = e.target.value; render(); }, 150));
  $('#f-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    f.tipo = b.dataset.v; $$('#f-tipo button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render();
  });
  $('#f-region').addEventListener('change', (e) => { f.region = e.target.value; render(); });
  $('#f-ramsar').addEventListener('change', (e) => { f.ramsar = e.target.checked; render(); });
  $('#f-biosfera').addEventListener('change', (e) => { f.biosfera = e.target.checked; render(); });
}).catch((err) => { lista.innerHTML = errorHTML(err); });
