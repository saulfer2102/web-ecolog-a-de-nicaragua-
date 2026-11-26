// Catálogo de especies curadas + buscador universal (iNaturalist).
import { $, $$, esc, layout, url, param, norm, debounce, GRUPOS, speciesCard, fillCardPhoto, photoUrl, loadingHTML, errorHTML, badgeUICN } from './common.js';
import { inat, inatIUCN } from './api.js';
import { db, taxaParaEspecies } from './datos.js';

layout('especies.html');

const ORDEN_AMENAZA = { EX: 0, EW: 1, CR: 2, EN: 3, VU: 4, NT: 5, DD: 6, LC: 7, NE: 8 };
const f = {
  q: param('q') || '', grupo: param('grupo') || '', region: param('region') || '',
  amenazadas: param('amenazadas') === '1', endemicas: param('endemicas') === '1', simbolos: param('simbolos') === '1', orden: 'nombre',
};
const fotos = new Map();

const grid = $('#grid');
grid.innerHTML = loadingHTML('Cargando catálogo…');

db().then((D) => {
  const counts = {};
  for (const s of D.especies) counts[s.grupo] = (counts[s.grupo] || 0) + 1;
  $('#f-grupo').innerHTML = `<button type="button" data-v="">Todas (${D.especies.length})</button>` +
    Object.entries(GRUPOS).filter(([k]) => counts[k]).map(([k, g]) => `<button type="button" data-v="${k}">${esc(g.label)} (${counts[k]})</button>`).join('');
  $('#f-region').insertAdjacentHTML('beforeend', D.regionesLista.map((r) => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join(''));

  const sync = () => {
    $('#buscar').value = f.q;
    $$('#f-grupo button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.grupo)));
    $('#f-region').value = f.region;
    $('#f-amenazadas').checked = f.amenazadas;
    $('#f-endemicas').checked = f.endemicas;
    $('#f-simbolos').checked = f.simbolos;
  };
  sync();

  const render = () => {
    const q = norm(f.q);
    let lista = D.especies.filter((s) =>
      (!f.grupo || s.grupo === f.grupo) &&
      (!f.region || (s.regiones || []).includes(f.region)) &&
      (!f.amenazadas || ['CR', 'EN', 'VU'].includes(s.uicn)) &&
      (!f.endemicas || s.endemica) &&
      (!f.simbolos || s.simbolo_nacional) &&
      (!q || norm([s.nombre_cientifico, ...(s.nombres_comunes || []), s.nombre_ingles, s.familia].join(' ')).includes(q)));
    const nombre = (s) => s.nombres_comunes?.[0] || s.nombre_cientifico;
    if (f.orden === 'nombre') lista.sort((a, b) => nombre(a).localeCompare(nombre(b), 'es'));
    if (f.orden === 'cientifico') lista.sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico));
    if (f.orden === 'amenaza') lista.sort((a, b) => (ORDEN_AMENAZA[a.uicn] ?? 9) - (ORDEN_AMENAZA[b.uicn] ?? 9));
    $('#conteo').textContent = `${lista.length} ${lista.length === 1 ? 'especie' : 'especies'}`;
    grid.innerHTML = lista.length ? lista.map((s) => speciesCard(s, fotos.get(s.id))).join('')
      : '<div class="empty-state" style="grid-column:1/-1"><p>Ninguna especie coincide con los filtros. Prueba el buscador universal más abajo.</p></div>';
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q); if (f.grupo) p.set('grupo', f.grupo); if (f.region) p.set('region', f.region);
    if (f.amenazadas) p.set('amenazadas', '1'); if (f.endemicas) p.set('endemicas', '1'); if (f.simbolos) p.set('simbolos', '1');
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
  };
  render();

  $('#buscar').addEventListener('input', debounce((e) => { f.q = e.target.value; render(); }, 150));
  $('#f-grupo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; f.grupo = b.dataset.v; sync(); render(); });
  $('#f-region').addEventListener('change', (e) => { f.region = e.target.value; render(); });
  $('#f-orden').addEventListener('change', (e) => { f.orden = e.target.value; render(); });
  $('#f-amenazadas').addEventListener('change', (e) => { f.amenazadas = e.target.checked; render(); });
  $('#f-endemicas').addEventListener('change', (e) => { f.endemicas = e.target.checked; render(); });
  $('#f-simbolos').addEventListener('change', (e) => { f.simbolos = e.target.checked; render(); });

  taxaParaEspecies(D.especies, (id, t) => {
    if (!t?.default_photo) return;
    fotos.set(id, t.default_photo);
    fillCardPhoto(grid, id, t.default_photo);
  });
}).catch((err) => { grid.innerHTML = errorHTML(err, '¿Abriste el sitio con un servidor web? Ver README.'); });

/* Buscador universal */
const res = $('#global-res');
$('#buscar-global').addEventListener('input', debounce(async (e) => {
  const q = e.target.value.trim();
  if (q.length < 3) { res.innerHTML = ''; return; }
  res.innerHTML = loadingHTML('Buscando en iNaturalist…');
  try {
    const d = await inat.autocomplete(q);
    const D = await db().catch(() => null);
    res.innerHTML = d.results.length ? d.results.map((t) => {
      const curada = D?.especieDeTaxon(t);
      const href = curada ? url(`especie.html?id=${curada.id}`) : url(`especie.html?inat=${t.id}`);
      const img = photoUrl(t.default_photo, 'square');
      const u = inatIUCN(t);
      return `<a class="sp-row" href="${href}">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="thumb-ph"></span>'}
        <span><span class="sp-name">${esc(t.preferred_common_name || t.name)}</span><br>
        <span class="sp-sci">${esc(t.name)}</span> <span class="tiny muted">· ${esc(t.rank)}</span>
        <span class="chips" style="margin-top:3px">${u && u !== 'LC' ? badgeUICN(u) : ''}${curada ? '<span class="chip">En el catálogo</span>' : ''}</span></span>
        <span class="freq"><span class="freq-label">${(t.observations_count || 0).toLocaleString('es-NI')} obs. en el mundo</span></span>
      </a>`;
    }).join('') : '<p class="muted">Sin resultados.</p>';
  } catch (err) { res.innerHTML = errorHTML(err); }
}, 350));
