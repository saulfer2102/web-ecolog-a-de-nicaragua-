// Panel de revisión científica: estado de verificación + alertas de la validación automática.
import { $, $$, esc, layout, url, norm, loadData, badgeUICN, badgeVerif, debounce, GRUPOS } from './common.js';

layout('revision.html');

const st = { tab: 'especies', estado: '', alertas: false, q: '' };
const [especies, areas, ninos, val] = await Promise.all([
  loadData('especies.json').catch(() => ({ especies: [] })),
  loadData('areas.json').catch(() => ({ areas: [] })),
  loadData('ninos.json').catch(() => ({})),
  loadData('../reportes/validacion.json').catch(() => null),
]);

if (val?.fecha) $('#fecha-validacion').textContent = `Última validación automática: ${val.fecha}.`;
else $('#fecha-validacion').textContent = 'Aún no se ha ejecutado la validación automática (node scripts/validar.mjs).';

const estadoDe = (r) => r.verificacion?.estado || 'pendiente';
const todos = [
  ...especies.especies, ...areas.areas, ...(ninos.temas || []), ...(ninos.fichas || []),
];
const cuenta = (e) => todos.filter((r) => estadoDe(r) === e).length;
$('#resumen').innerHTML = [
  ['Registros curados', todos.length],
  ['Verificados', cuenta('verificado')],
  ['En revisión', cuenta('revisar')],
  ['Pendientes', cuenta('pendiente')],
].map(([k, v]) => `<div class="stat"><div class="stat-num">${v}</div><div class="stat-label">${k}</div></div>`).join('');

const filas = {
  especies: () => especies.especies.map((s) => {
    const v = val?.especies?.[s.id] || {};
    return {
      id: s.id, estado: estadoDe(s), alertas: v.alertas || [], notas: s.verificacion?.notas || '',
      texto: [s.id, s.nombre_cientifico, ...(s.nombres_comunes || [])].join(' '),
      csv: [s.id, s.nombre_cientifico, s.nombres_comunes?.[0], s.grupo, s.uicn, v.inat?.iucn || '', estadoDe(s), (v.alertas || []).join(' | '), s.verificacion?.notas || ''],
      html: `
        <td><a href="${url(`especie.html?id=${s.id}`)}"><strong>${esc(s.nombres_comunes?.[0] || s.id)}</strong></a><br><i>${esc(s.nombre_cientifico)}</i></td>
        <td>${esc(GRUPOS[s.grupo]?.singular || s.grupo)}</td>
        <td>${badgeUICN(s.uicn)}${v.inat?.iucn && v.inat.iucn !== s.uicn ? `<br><span class="tiny" style="color:var(--volcan)">iNat: ${esc(v.inat.iucn)}</span>` : ''}</td>
        <td class="tiny">${v.registrosNI ? `GBIF: ${v.registrosNI.gbif ?? '—'}<br>iNat: ${v.registrosNI.inat ?? '—'}` : '—'}</td>
        <td>${badgeVerif(s.verificacion)}${s.verificacion?.revisor ? `<br><span class="tiny muted">${esc(s.verificacion.revisor)} ${esc(s.verificacion.fecha || '')}</span>` : ''}</td>
        <td class="tiny">${(v.alertas || []).map((a) => `<div style="color:var(--volcan)">• ${esc(a)}</div>`).join('') || '<span class="muted">—</span>'}</td>
        <td class="tiny">${esc(s.verificacion?.notas || '')}</td>
        <td class="tiny">${s.ids?.gbif ? `<a href="https://www.gbif.org/species/${s.ids.gbif}" target="_blank" rel="noopener">GBIF</a><br>` : ''}${s.ids?.inat ? `<a href="https://www.inaturalist.org/taxa/${s.ids.inat}" target="_blank" rel="noopener">iNat</a><br>` : ''}<a href="https://www.iucnredlist.org/search?query=${encodeURIComponent(s.nombre_cientifico)}&searchType=species" target="_blank" rel="noopener">UICN</a></td>`,
    };
  }),
  areas: () => areas.areas.map((a) => {
    const v = val?.areas?.[a.id] || {};
    return {
      id: a.id, estado: estadoDe(a), alertas: v.alertas || [], notas: a.verificacion?.notas || '',
      texto: [a.id, a.nombre, ...(a.departamentos || [])].join(' '),
      csv: [a.id, a.nombre, a.categoria, (a.departamentos || []).join('/'), a.area_ha ?? '', a.anio_declaracion ?? '', estadoDe(a), (v.alertas || []).join(' | '), a.verificacion?.notas || ''],
      html: `
        <td><a href="${url(`area.html?id=${a.id}`)}"><strong>${esc(a.nombre)}</strong></a></td>
        <td>${esc(a.categoria || '')}</td>
        <td class="tiny">${esc((a.departamentos || []).join(', '))}</td>
        <td class="tiny">${a.area_ha ? `${Math.round(a.area_ha).toLocaleString('es-NI')} ha` : '—'}${a.anio_declaracion ? `<br>${a.anio_declaracion}` : ''}</td>
        <td>${badgeVerif(a.verificacion)}</td>
        <td class="tiny">${(v.alertas || []).map((x) => `<div style="color:var(--volcan)">• ${esc(x)}</div>`).join('') || '<span class="muted">—</span>'}</td>
        <td class="tiny">${esc(a.verificacion?.notas || '')}</td>
        <td class="tiny">${a.coordenadas ? `<a href="https://www.openstreetmap.org/?mlat=${a.coordenadas[0]}&mlon=${a.coordenadas[1]}#map=11/${a.coordenadas[0]}/${a.coordenadas[1]}" target="_blank" rel="noopener">Ver punto</a>` : ''}</td>`,
    };
  }),
  ninos: () => [...(ninos.temas || []).map((t) => ({ ...t, _tipo: 'Tema' })), ...(ninos.fichas || []).map((f) => ({ ...f, _tipo: 'Ficha' }))].map((r) => ({
    id: r.id, estado: estadoDe(r), alertas: val?.ninos?.[r.id]?.alertas || [], notas: r.verificacion?.notas || '',
    texto: [r.id, r.titulo, r.nombre].join(' '),
    csv: [r.id, r._tipo, r.titulo || r.nombre, estadoDe(r), (val?.ninos?.[r.id]?.alertas || []).join(' | '), r.verificacion?.notas || ''],
    html: `
      <td><a href="${url(`ninos/index.html#${r._tipo === 'Tema' ? 'tema' : 'ficha'}/${r.id}`)}"><strong>${esc(r.titulo || r.nombre)}</strong></a></td>
      <td>${r._tipo}</td><td colspan="2" class="tiny">${esc(r.resumen || r.texto || '').slice(0, 140)}…</td>
      <td>${badgeVerif(r.verificacion)}</td>
      <td class="tiny">${(val?.ninos?.[r.id]?.alertas || []).map((x) => `<div style="color:var(--volcan)">• ${esc(x)}</div>`).join('') || '<span class="muted">—</span>'}</td>
      <td class="tiny">${esc(r.verificacion?.notas || '')}</td><td></td>`,
  })),
};
const CABECERAS = {
  especies: ['Especie', 'Grupo', 'UICN', 'Registros en NI', 'Estado', 'Alertas automáticas', 'Notas', 'Enlaces'],
  areas: ['Área', 'Categoría', 'Departamentos', 'Superficie / año', 'Estado', 'Alertas automáticas', 'Notas', 'Mapa'],
  ninos: ['Contenido', 'Tipo', 'Resumen', '', 'Estado', 'Alertas', 'Notas', ''],
};
const CSV_CAB = {
  especies: ['id', 'nombre_cientifico', 'nombre_comun', 'grupo', 'uicn_ficha', 'uicn_inaturalist', 'estado', 'alertas', 'notas'],
  areas: ['id', 'nombre', 'categoria', 'departamentos', 'area_ha', 'anio', 'estado', 'alertas', 'notas'],
  ninos: ['id', 'tipo', 'titulo', 'estado', 'alertas', 'notas'],
};

let actuales = [];
function render() {
  const q = norm(st.q);
  actuales = filas[st.tab]().filter((r) => (!st.estado || r.estado === st.estado) && (!st.alertas || r.alertas.length) && (!q || norm(r.texto).includes(q)));
  $('#tabla').innerHTML = `<thead><tr>${CABECERAS[st.tab].map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${actuales.map((r) => `<tr>${r.html}</tr>`).join('') || `<tr><td colspan="8" class="muted">Sin registros.</td></tr>`}</tbody>`;
}
render();

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  st.tab = b.dataset.t; $$('#tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b))); render();
});
$('#f-estado').addEventListener('change', (e) => { st.estado = e.target.value; render(); });
$('#f-alertas').addEventListener('change', (e) => { st.alertas = e.target.checked; render(); });
$('#f-q').addEventListener('input', debounce((e) => { st.q = e.target.value; render(); }, 150));
$('#csv').addEventListener('click', () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [CSV_CAB[st.tab], ...actuales.map((r) => r.csv)].map((row) => row.map(q).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `revision-${st.tab}.csv`;
  a.click();
});
