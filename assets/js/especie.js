// Ficha de especie: contenido curado (si existe) + datos en vivo de iNaturalist, GBIF y STRI.
import { CONFIG } from './config.js';
import {
  $, $$, esc, fmt, layout, url, param, GRUPOS, UICN, badgeUICN, badgeVerif, chipRegion, photoUrl, photoCredit,
  loadingHTML, errorHTML, ESTADOS, cap,
} from './common.js';
import { inat, inatIUCN, gbif, stri } from './api.js';
import { db } from './datos.js';

layout('especies.html');
const main = $('#ficha');
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return 'enlace'; } };
const textoPlano = (html) => new DOMParser().parseFromString(html || '', 'text/html').body.textContent.trim();

async function init() {
  const D = await db().catch(() => null);
  let sp = param('id') && D ? D.especie(param('id')) : null;
  let taxon = null;

  try {
    if (sp?.ids?.inat) taxon = await inat.taxon(sp.ids.inat);
    else if (param('inat')) taxon = await inat.taxon(param('inat'));
    else {
      const nombre = sp?.nombre_cientifico || param('nombre');
      if (nombre) {
        const t = await inat.taxonByName(nombre);
        if (t) taxon = await inat.taxon(t.id);
      }
    }
  } catch (e) { console.warn('iNaturalist', e); }

  if (!sp && taxon && D) sp = D.especieDeTaxon(taxon) || null;
  const nombreCientifico = sp?.nombre_cientifico || taxon?.name || param('nombre');
  if (!nombreCientifico) {
    main.innerHTML = `<div class="page-head"><h1>Especie no encontrada</h1><p><a href="${url('especies.html')}">Volver al catálogo</a></p></div>`;
    return;
  }

  let gbifKey = sp?.ids?.gbif || Number(param('gbif')) || null;
  if (!gbifKey) {
    try {
      const m = await gbif.match(nombreCientifico);
      if (m.matchType !== 'NONE') gbifKey = m.acceptedUsageKey || m.usageKey;
    } catch { /* sin GBIF */ }
  }

  render({ sp, taxon, nombreCientifico, gbifKey, D });
}

function render({ sp, taxon, nombreCientifico, gbifKey, D }) {
  const comun = sp?.nombres_comunes?.[0] || taxon?.preferred_common_name || nombreCientifico;
  document.title = `${cap(comun)} (${nombreCientifico}) · ${CONFIG.nombreSitio}`;
  const fotos = (taxon?.taxon_photos?.map((tp) => tp.photo) || (taxon?.default_photo ? [taxon.default_photo] : [])).slice(0, 8);
  const uicn = sp?.uicn || inatIUCN(taxon);
  const grupo = sp ? GRUPOS[sp.grupo] : null;
  const taxo = sp
    ? [sp.clase, sp.orden, sp.familia].filter(Boolean)
    : (taxon?.ancestors || []).filter((a) => ['class', 'order', 'family'].includes(a.rank)).map((a) => a.name);

  const facts = [];
  if (uicn) facts.push(['UICN (global)', `${badgeUICN(uicn)} ${esc(UICN[uicn] || '')}`]);
  if (sp?.cites) facts.push(['CITES', `Apéndice ${esc(sp.cites)}`]);
  if (sp) facts.push(['Endémica de Nicaragua', sp.endemica ? 'Sí' : 'No']);
  if (sp?.migratoria) facts.push(['Residencia', 'Migratoria']);
  if (Array.isArray(sp?.altitud_m)) facts.push(['Altitud en Nicaragua', `${fmt(sp.altitud_m[0])}–${fmt(sp.altitud_m[1])} m`]);
  if (grupo) facts.push(['Grupo', esc(grupo.singular)]);

  const areas = sp && D ? D.areasDeEspecie(sp.id) : [];
  const issueUrl = `${CONFIG.repoUrl}/issues/new?title=${encodeURIComponent(`Corrección: ${comun} (${nombreCientifico})`)}&body=${encodeURIComponent(`Ficha: ${location.href}\n\nDato a corregir:\n\nFuente que respalda la corrección:\n`)}`;

  main.innerHTML = `
  <div class="page-head">
    <nav class="breadcrumbs"><a href="${url('index.html')}">Inicio</a> › <a href="${url('especies.html')}">Especies</a>${grupo ? ` › <a href="${url(`especies.html?grupo=${sp.grupo}`)}">${esc(grupo.label)}</a>` : ''}</nav>
    <div class="sp-hero">
      <div>
        <div class="gallery-main" id="g-main">${fotos.length ? `<img src="${esc(photoUrl(fotos[0], 'large'))}" alt="${esc(comun)}">` : '<div class="sp-placeholder" style="position:absolute;inset:0;display:grid;place-items:center" class="muted">Sin fotografías disponibles</div>'}</div>
        <div class="photo-credit" id="g-credit">${fotos.length ? esc(photoCredit(fotos[0])) : ''}</div>
        ${fotos.length > 1 ? `<div class="gallery-thumbs" id="g-thumbs">${fotos.map((p, i) => `<button type="button" data-i="${i}" ${i === 0 ? 'aria-current="true"' : ''} aria-label="Foto ${i + 1}"><img src="${esc(photoUrl(p, 'square'))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      </div>
      <div class="sp-title">
        <div class="chips" style="margin-bottom:10px">
          ${sp ? badgeVerif(sp.verificacion) : '<span class="badge-verif" title="Ficha generada con datos en vivo">Datos en vivo · sin curar</span>'}
          ${sp?.simbolo_nacional ? `<span class="chip" style="background:var(--sacuanjoche-100)">${esc(sp.simbolo_nacional)}</span>` : ''}
          ${sp?.endemica ? '<span class="chip">Endémica de Nicaragua</span>' : ''}
        </div>
        <h1>${esc(comun)}</h1>
        <div class="sci-name">${esc(nombreCientifico)} ${sp?.autoria ? `<span class="authority">${esc(sp.autoria)}</span>` : ''}</div>
        ${sp?.nombres_comunes?.length > 1 || sp?.nombre_ingles ? `<div class="alt-names">También: ${esc((sp.nombres_comunes || []).slice(1).join(', '))}${sp.nombre_ingles ? `${sp.nombres_comunes.length > 1 ? ' · ' : ''}Inglés: ${esc(sp.nombre_ingles)}` : ''}</div>` : ''}
        ${taxo.length ? `<div class="taxo">${taxo.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="facts">${facts.map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
        ${sp ? `<div class="chips">${(sp.regiones || []).map((r) => chipRegion(r, D?.regiones)).join('')}</div>` : ''}
        ${sp?.habitats?.length ? `<p class="small muted" style="margin-top:10px"><strong>Hábitats:</strong> ${esc(sp.habitats.join(', '))}</p>` : ''}
      </div>
    </div>
  </div>

  <div class="content-grid">
    <article class="prose" id="texto">
      ${sp ? `
        <h2>Descripción</h2><p>${esc(sp.descripcion)}</p>
        ${sp.dato_curioso ? `<div class="callout curious"><strong>Dato curioso.</strong> ${esc(sp.dato_curioso)}</div>` : ''}
        <h2>Cómo reconocerla</h2><p>${esc(sp.identificacion)}</p>
        <h2>Ecología y comportamiento</h2><p>${esc(sp.ecologia)}</p>
        <h2>Dónde vive en Nicaragua</h2><p>${esc(sp.distribucion_nicaragua)}</p>
        <h2>Amenazas y conservación</h2><p>${esc(sp.amenazas)}</p>
        ${areas.length ? `<h2>Áreas protegidas donde está documentada</h2><div class="chips">${areas.map((a) => `<a class="chip" href="${url(`area.html?id=${a.id}`)}">${esc(a.nombre)}</a>`).join('')}</div>` : ''}
        <h2>Fuentes</h2>
        <ol class="sources">${(sp.fuentes || []).map((f) => `<li>${esc(f.cita)}${f.url ? ` <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(host(f.url))} ↗</a>` : ''}</li>`).join('')}</ol>
      ` : `
        <div class="notice notice-info"><strong>Ficha automática</strong>Esta especie aún no está en nuestro catálogo curado. Mostramos un resumen de Wikipedia y datos abiertos en vivo; verifica la información en las fuentes enlazadas.</div>
        ${taxon?.wikipedia_summary ? `<h2>Resumen</h2><p>${esc(textoPlano(taxon.wikipedia_summary))}</p>
          <p class="tiny muted">Texto: Wikipedia (CC BY-SA), vía iNaturalist. ${taxon.wikipedia_url ? `<a href="${esc(taxon.wikipedia_url)}" target="_blank" rel="noopener">Leer artículo completo ↗</a>` : ''}</p>` : '<p class="muted">No hay un resumen disponible para este taxón.</p>'}
      `}
      <h2>¿Cuándo se observa en Nicaragua?</h2>
      <p class="small muted" style="margin-top:-6px">Observaciones verificables en iNaturalist por mes (todos los años).</p>
      <div id="hist">${loadingHTML()}</div>
      <h2>Observaciones recientes en Nicaragua</h2>
      <div id="recientes" class="grid grid-4" style="gap:10px">${loadingHTML()}</div>
    </article>

    <aside>
      <div class="side-box">
        <h3>Registros en Nicaragua</h3>
        <div class="map-box" id="mapa-sp"></div>
        <p class="tiny muted" style="margin:6px 0 10px">Densidad de registros georreferenciados en GBIF (hexágonos).</p>
        <dl class="kv" id="conteos">
          <dt>GBIF</dt><dd id="c-gbif">…</dd>
          <dt>iNaturalist</dt><dd id="c-inat">…</dd>
        </dl>
      </div>
      <div class="side-box">
        <h3>Consultar en las fuentes</h3>
        <ul class="link-list" id="enlaces">
          ${gbifKey ? `<li><a href="${gbif.speciesUrl(gbifKey)}" target="_blank" rel="noopener">GBIF — ficha y registros ↗</a></li>` : ''}
          ${taxon ? `<li><a href="${inat.taxonUrl(taxon.id)}" target="_blank" rel="noopener">iNaturalist — fotos y observaciones ↗</a></li>` : ''}
          ${eBirdLink(sp, taxon)}
          <li><a href="https://www.iucnredlist.org/search?query=${encodeURIComponent(nombreCientifico)}&searchType=species" target="_blank" rel="noopener">Lista Roja de la UICN ↗</a></li>
          ${taxon?.wikipedia_url ? `<li><a href="${esc(taxon.wikipedia_url)}" target="_blank" rel="noopener">Wikipedia ↗</a></li>` : ''}
        </ul>
      </div>
      ${sp ? `
      <div class="verif-box" data-estado="${esc(sp.verificacion?.estado || 'pendiente')}">
        <strong>Estado de verificación:</strong> ${esc(ESTADOS[sp.verificacion?.estado] || 'Pendiente de verificación')}
        ${sp.verificacion?.revisor ? `<br>Revisado por ${esc(sp.verificacion.revisor)}${sp.verificacion.fecha ? ` (${esc(sp.verificacion.fecha)})` : ''}` : ''}
        ${sp.verificacion?.notas && sp.verificacion?.estado !== 'verificado' ? `<br><span class="small muted">Nota: ${esc(sp.verificacion.notas)}</span>` : ''}
        <br><a href="${issueUrl}" target="_blank" rel="noopener">¿Encontraste un error? Repórtalo ↗</a>
      </div>` : ''}
    </aside>
  </div>`;

  // Galería
  $('#g-thumbs')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const p = fotos[Number(b.dataset.i)];
    $('#g-main').innerHTML = `<img src="${esc(photoUrl(p, 'large'))}" alt="${esc(comun)}">`;
    $('#g-credit').textContent = photoCredit(p);
    $$('#g-thumbs button').forEach((x) => x.setAttribute('aria-current', String(x === b)));
  });

  // Mapa GBIF
  const m = L.map('mapa-sp', { scrollWheelZoom: false, attributionControl: true }).fitBounds(CONFIG.limites);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(m);
  if (gbifKey) L.tileLayer(gbif.densityTiles({ taxonKey: gbifKey }), { opacity: 0.85, attribution: 'GBIF.org' }).addTo(m);

  // Conteos
  if (gbifKey) gbif.countInCountry(gbifKey).then((n) => { $('#c-gbif').innerHTML = `<a href="https://www.gbif.org/occurrence/search?taxon_key=${gbifKey}&country=NI" target="_blank" rel="noopener">${fmt(n)} registros</a>`; }).catch(() => { $('#c-gbif').textContent = '—'; });
  else $('#c-gbif').textContent = 'sin coincidencia';
  if (taxon) inat.observationCount(taxon.id).then((n) => { $('#c-inat').innerHTML = `<a href="https://www.inaturalist.org/observations?taxon_id=${taxon.id}&place_id=${CONFIG.inatPlaceId}" target="_blank" rel="noopener">${fmt(n)} observaciones</a>`; }).catch(() => { $('#c-inat').textContent = '—'; });
  else $('#c-inat').textContent = '—';

  // Histograma mensual
  if (taxon) {
    inat.histogram(taxon.id).then((h) => {
      const vals = MESES.map((_, i) => h[i + 1] || 0);
      const max = Math.max(...vals);
      $('#hist').innerHTML = max ? `<div class="hist" role="img" aria-label="Observaciones por mes">${vals.map((v, i) =>
        `<div class="bar" title="${MESES[i]}: ${v} observaciones"><span style="height:${Math.round((v / max) * 100)}%"></span><small>${MESES[i]}</small></div>`).join('')}</div>`
        : '<p class="muted small">Aún no hay observaciones verificables en Nicaragua.</p>';
    }).catch((e) => { $('#hist').innerHTML = errorHTML(e); });
    inat.recentObservations(taxon.id).then((d) => {
      $('#recientes').innerHTML = d.results.length ? d.results.map((o) => {
        const p = o.photos?.[0];
        return `<a class="mini-card" href="https://www.inaturalist.org/observations/${o.id}" target="_blank" rel="noopener">
          <div class="mini-photo">${p ? `<img src="${esc(photoUrl(p, 'small'))}" alt="" loading="lazy">` : ''}</div>
          <div class="mini-txt"><b>${esc(o.observed_on_details?.date || o.observed_on || '')}</b><i>${esc(o.place_guess || '')}</i><br><span class="tiny muted">${esc(p?.attribution || '')}</span></div></a>`;
      }).join('') : '<p class="muted small" style="grid-column:1/-1">Aún no hay observaciones con grado de investigación en Nicaragua.</p>';
    }).catch((e) => { $('#recientes').innerHTML = errorHTML(e); });
  } else {
    $('#hist').innerHTML = '<p class="muted small">Sin datos de iNaturalist.</p>';
    $('#recientes').innerHTML = '';
  }

  // Peces: enlaces al Smithsonian
  stri.lookup(nombreCientifico).then((r) => {
    if (!r) return;
    const items = [
      r.caribe ? `<li><a href="${r.caribe}" target="_blank" rel="noopener">Smithsonian STRI — Peces costeros del Gran Caribe ↗</a></li>` : '',
      r.pacifico ? `<li><a href="${r.pacifico}" target="_blank" rel="noopener">Smithsonian STRI — Peces costeros del Pacífico Oriental Tropical ↗</a></li>` : '',
    ].join('');
    $('#enlaces').insertAdjacentHTML('afterbegin', items);
  }).catch(() => {});
}

function eBirdLink(sp, taxon) {
  const fuente = sp?.fuentes?.find((f) => /ebird\.org\/species\//.test(f.url || ''));
  if (fuente) return `<li><a href="${esc(fuente.url)}" target="_blank" rel="noopener">eBird — mapas y gráficos ↗</a></li>`;
  const esAve = sp?.grupo === 'aves' || taxon?.iconic_taxon_name === 'Aves';
  return esAve ? `<li><a href="https://ebird.org/region/NI/bird-list" target="_blank" rel="noopener">eBird — lista de aves de Nicaragua ↗</a></li>` : '';
}

init().catch((err) => { main.innerHTML = `<div class="page-head">${errorHTML(err)}</div>`; });
