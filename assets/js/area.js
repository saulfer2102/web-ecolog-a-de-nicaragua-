// Ficha de un área protegida o sitio de importancia ecológica.
import { CONFIG } from './config.js';
import { $, esc, fmt, layout, url, param, chipRegion, badgeVerif, badgeUICN, photoUrl, photoCredit, loadingHTML, errorHTML, ESTADOS } from './common.js';
import { inat } from './api.js';
import { db, taxaParaEspecies } from './datos.js';

layout('areas.html');
const main = $('#ficha');
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return 'enlace'; } };

db().then((D) => {
  const a = D.area(param('id'));
  if (!a) {
    main.innerHTML = `<div class="page-head"><h1>Lugar no encontrado</h1><p><a href="${url('areas.html')}">Ver todas las áreas</a></p></div>`;
    return;
  }
  document.title = `${a.nombre} · ${CONFIG.nombreSitio}`;
  // Radio de referencia: el de un círculo con la misma superficie (acotado), solo para consultas de datos.
  const radioKm = a.area_ha ? Math.min(40, Math.max(3, Math.sqrt(a.area_ha / 100 / Math.PI))) : 8;
  const sps = D.especiesDeArea(a.id);
  const issueUrl = `${CONFIG.repoUrl}/issues/new?title=${encodeURIComponent(`Corrección: ${a.nombre}`)}&body=${encodeURIComponent(`Ficha: ${location.href}\n\nDato a corregir:\n\nFuente:\n`)}`;
  const color = a.tipo === 'sitio_ecologico' ? '#1f7fa0' : '#2e6e4f';

  main.innerHTML = `
  <div class="page-head">
    <nav class="breadcrumbs"><a href="${url('index.html')}">Inicio</a> › <a href="${url('areas.html')}">Áreas protegidas</a></nav>
    <div class="chips" style="margin-bottom:10px">${badgeVerif(a.verificacion)}${chipRegion(a.region, D.regiones)}</div>
    <span class="eyebrow" style="color:${color}">${esc(a.categoria || '')}</span>
    <h1>${esc(a.nombre)}</h1>
    <div class="facts">
      <div class="fact"><div class="k">Ubicación</div><div class="v">${esc((a.departamentos || []).join(', '))}</div></div>
      ${a.area_ha ? `<div class="fact"><div class="k">Superficie aprox.</div><div class="v">${fmt(Math.round(a.area_ha))} ha</div></div>` : ''}
      ${a.anio_declaracion ? `<div class="fact"><div class="k">Declarada</div><div class="v">${a.anio_declaracion}</div></div>` : ''}
      <div class="fact"><div class="k">Tipo</div><div class="v">${a.tipo === 'sitio_ecologico' ? 'Sitio de importancia ecológica' : 'Área protegida'}</div></div>
    </div>
    ${a.nota_area ? `<p class="tiny muted" style="margin-top:-6px">${esc(a.nota_area)}</p>` : ''}
    ${a.designaciones?.length ? `<div class="chips">${a.designaciones.map((d) => `<span class="chip" style="background:var(--lago-100)">${esc(d)}</span>`).join('')}</div>` : ''}
  </div>

  <div class="content-grid" style="margin-top:8px">
    <article class="prose">
      <h2>Descripción</h2><p>${esc(a.descripcion)}</p>
      <div class="callout"><strong>¿Por qué es importante?</strong> ${esc(a.importancia)}</div>
      ${a.ecosistemas?.length ? `<h2>Ecosistemas</h2><div class="chips">${a.ecosistemas.map((e) => `<span class="chip">${esc(e)}</span>`).join('')}</div>` : ''}
      ${sps.length ? `<h2>Especies emblemáticas</h2><div class="mini-grid">${sps.map((sp) => `
        <a class="mini-card" href="${url(`especie.html?id=${sp.id}`)}"><div class="mini-photo" data-photo-for="${esc(sp.id)}"></div>
        <div class="mini-txt"><b>${esc(sp.nombres_comunes?.[0])}</b><i>${esc(sp.nombre_cientifico)}</i><div style="margin-top:4px">${badgeUICN(sp.uicn)}</div></div></a>`).join('')}</div>` : ''}
      ${a.otras_especies?.length ? `<h3 style="margin-top:1.4em">Otras especies relevantes</h3><p>${a.otras_especies.map((n) => `<a href="${url(`especie.html?nombre=${encodeURIComponent(n)}`)}"><i>${esc(n)}</i></a>`).join(', ')}</p>` : ''}
      <h2>Especies registradas en los alrededores</h2>
      <p class="small muted" style="margin-top:-6px">Observaciones verificadas de iNaturalist en un radio de ${Math.round(radioKm)} km alrededor del punto central (aproximación: el círculo no coincide con los límites del área).</p>
      <div id="alrededores">${loadingHTML()}</div>
      <p><a class="btn btn-secondary btn-sm" href="${url(`explorar.html?lat=${a.coordenadas[0]}&lng=${a.coordenadas[1]}&r=${radioKm > 17 ? 25 : radioKm > 7 ? 10 : 5}`)}">Explorar esta zona en el mapa →</a></p>
      ${a.visitar ? `<h2>Visitar</h2><p>${esc(a.visitar)}</p>` : ''}
      <h2>Fuentes</h2>
      <ol class="sources">${(a.fuentes || []).map((f) => `<li>${esc(f.cita)}${f.url ? ` <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(host(f.url))} ↗</a>` : ''}</li>`).join('')}</ol>
    </article>
    <aside>
      <div class="side-box">
        <h3>Ubicación</h3>
        <div class="map-box" id="mapa-area"></div>
        <p class="tiny muted" style="margin-top:6px">Punto central aproximado. El círculo punteado tiene una superficie equivalente y es solo una referencia visual.</p>
      </div>
      <div class="verif-box" data-estado="${esc(a.verificacion?.estado || 'pendiente')}">
        <strong>Estado de verificación:</strong> ${esc(ESTADOS[a.verificacion?.estado] || 'Pendiente de verificación')}
        ${a.verificacion?.revisor ? `<br>Revisado por ${esc(a.verificacion.revisor)}${a.verificacion.fecha ? ` (${esc(a.verificacion.fecha)})` : ''}` : ''}
        ${a.verificacion?.notas && a.verificacion?.estado !== 'verificado' ? `<br><span class="small muted">Nota: ${esc(a.verificacion.notas)}</span>` : ''}
        <br><a href="${issueUrl}" target="_blank" rel="noopener">¿Encontraste un error? Repórtalo ↗</a>
      </div>
    </aside>
  </div>`;

  const m = L.map('mapa-area', { scrollWheelZoom: false }).setView(a.coordenadas, 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(m);
  L.circleMarker(a.coordenadas, { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(m);
  if (a.area_ha) {
    const c = L.circle(a.coordenadas, { radius: Math.sqrt((a.area_ha * 10000) / Math.PI), color, weight: 1.5, dashArray: '5 6', fillOpacity: 0.06 }).addTo(m);
    m.fitBounds(c.getBounds(), { padding: [10, 10] });
  }

  taxaParaEspecies(sps, (sid, t) => {
    const ph = main.querySelector(`[data-photo-for="${CSS.escape(sid)}"]`);
    const img = photoUrl(t?.default_photo, 'small');
    if (ph && img) ph.innerHTML = `<img src="${esc(img)}" alt="" loading="lazy" title="${esc(photoCredit(t.default_photo))}">`;
  });

  inat.speciesCounts({ lat: a.coordenadas[0], lng: a.coordenadas[1], radius: Math.round(radioKm), perPage: 24 }).then((d) => {
    $('#alrededores').innerHTML = d.results.length ? `
      <p class="small"><strong>${fmt(d.total_results)}</strong> especies con observaciones verificadas. Las más registradas:</p>
      <div class="mini-grid">${d.results.map(({ taxon, count }) => {
        const cur = D.especieDeTaxon(taxon);
        const href = cur ? url(`especie.html?id=${cur.id}`) : url(`especie.html?inat=${taxon.id}`);
        const img = photoUrl(taxon.default_photo, 'small');
        return `<a class="mini-card" href="${href}"><div class="mini-photo">${img ? `<img src="${esc(img)}" alt="" loading="lazy" title="${esc(photoCredit(taxon.default_photo))}">` : ''}</div>
          <div class="mini-txt"><b>${esc(cur?.nombres_comunes?.[0] || taxon.preferred_common_name || taxon.name)}</b><i>${esc(taxon.name)}</i><br><span class="tiny muted">${fmt(count)} obs.</span></div></a>`;
      }).join('')}</div>` : '<p class="muted small">Aún no hay observaciones verificadas en este radio.</p>';
  }).catch((e) => { $('#alrededores').innerHTML = errorHTML(e); });
}).catch((err) => { main.innerHTML = `<div class="page-head">${errorHTML(err)}</div>`; });
