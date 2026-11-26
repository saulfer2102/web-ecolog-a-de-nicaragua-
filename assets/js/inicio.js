// Página de inicio: estadísticas en vivo, regiones, especies y áreas destacadas.
import { CONFIG } from './config.js';
import { $, esc, fmt, layout, url, speciesCard, fillCardPhoto, chipRegion } from './common.js';
import { inat, gbif } from './api.js';
import { db, taxaParaEspecies } from './datos.js';

layout('index.html');

const compacto = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('es-NI', { maximumFractionDigits: 1 })} M` : fmt(n));
gbif.countryTotal().then((n) => { $('#s-gbif').textContent = compacto(n); }).catch(() => { $('#s-gbif').textContent = '—'; });
inat.placeSpeciesCount().then((n) => { $('#s-inat-sp').textContent = fmt(n); }).catch(() => { $('#s-inat-sp').textContent = '—'; });
gbif.datasetCountInCountry(CONFIG.gbifEbirdDataset).then((n) => { $('#s-ebird').textContent = compacto(n); }).catch(() => { $('#s-ebird').textContent = '—'; });

// Mezcla determinista por día, para variar las especies destacadas sin saltos al recargar.
function barajar(arr, semilla) {
  const a = [...arr];
  let s = semilla;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

db().then((D) => {
  $('#s-cat').textContent = fmt(D.especies.length + D.areas.length);

  const regionesPrincipales = D.regionesLista;
  $('#regiones').innerHTML = regionesPrincipales.map((r) => `
    <a class="region-card" href="${url(`explorar.html?region=${r.id}`)}" style="background:linear-gradient(140deg, ${esc(r.color)}, color-mix(in srgb, ${esc(r.color)} 55%, #0d1f18))">
      <h3>${esc(r.nombre)}</h3>
      <p>${esc((r.ecosistemas || []).slice(0, 3).join(' · '))}</p>
    </a>`).join('');

  const hoy = Math.floor(Date.now() / 86400000);
  const prioritarias = D.especies.filter((s) => s.simbolo_nacional || s.endemica || ['CR', 'EN', 'VU'].includes(s.uicn));
  const resto = D.especies.filter((s) => !prioritarias.includes(s));
  const seleccion = [...barajar(prioritarias, hoy).slice(0, 5), ...barajar(resto, hoy).slice(0, 3)];
  const grid = $('#destacadas');
  grid.innerHTML = seleccion.map((s) => speciesCard(s)).join('');
  taxaParaEspecies(seleccion, (id, t) => t?.default_photo && fillCardPhoto(grid, id, t.default_photo));

  const conDesignacion = D.areas.filter((a) => (a.designaciones || []).length);
  const areas = barajar(conDesignacion.length >= 6 ? conDesignacion : D.areas, hoy).slice(0, 6);
  $('#areas').innerHTML = areas.map((a) => `
    <a class="card card-link" href="${url(`area.html?id=${a.id}`)}" style="border-top:4px solid ${a.tipo === 'sitio_ecologico' ? '#1f7fa0' : '#2e6e4f'}">
      <div class="card-body">
        <div class="small muted" style="font-weight:600">${esc(a.categoria || '')}</div>
        <h3 style="margin:4px 0 6px">${esc(a.nombre)}</h3>
        <div class="chips" style="margin:8px 0">${chipRegion(a.region, D.regiones)}${(a.designaciones || []).slice(0, 2).map((d) => `<span class="chip">${esc(d.replace(/\s*\(.*\)/, ''))}</span>`).join('')}</div>
        <p class="small" style="margin:0;color:var(--text-soft)">${esc((a.importancia || a.descripcion || '').slice(0, 150))}…</p>
      </div>
    </a>`).join('');
}).catch(() => {
  $('#s-cat').textContent = '—';
});
