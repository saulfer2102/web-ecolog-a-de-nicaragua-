// Utilidades compartidas: diseño de página, formato, insignias y carga de datos.
import { CONFIG } from './config.js';

export const ROOT = new URL('../../', import.meta.url).href;
export const url = (p) => new URL(p, ROOT).href;

/* ------------------------------------------------------------------ */
/* Helpers de DOM y formato                                             */
/* ------------------------------------------------------------------ */
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const nf = new Intl.NumberFormat('es-NI');
export const fmt = (n) => (n == null || Number.isNaN(n) ? '—' : nf.format(n));
export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

export const param = (name) => new URLSearchParams(location.search).get(name);

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Mayúscula inicial (los nombres comunes se guardan en minúscula). */
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Versión corta de una designación internacional, para chips. */
export function designacionCorta(d) {
  if (/ramsar/i.test(d)) return 'Sitio Ramsar';
  if (/biosfera/i.test(d)) return 'Reserva de Biosfera';
  if (/geoparque/i.test(d)) return 'Geoparque UNESCO';
  if (/patrimonio/i.test(d)) return 'Patrimonio Mundial';
  const corta = d.replace(/\s*\(.*\)/, '');
  return corta.length > 38 ? `${corta.slice(0, 36)}…` : corta;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { return null; }
  return value;
}

/* ------------------------------------------------------------------ */
/* Carga de JSON con caché en memoria                                   */
/* ------------------------------------------------------------------ */
const cache = new Map();
export function fetchJSON(u, { headers, signal } = {}) {
  const key = u + (headers ? JSON.stringify(headers) : '');
  if (cache.has(key)) return cache.get(key);
  const intentar = async (n) => {
    const r = await fetch(u, { headers, signal });
    // Límite de uso de la API: esperar y reintentar (máx. 2 veces).
    if (r.status === 429 && n < 2) {
      await new Promise((res) => setTimeout(res, 1500 * (n + 1)));
      return intentar(n + 1);
    }
    return r;
  };
  const p = intentar(0).then(async (r) => {
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} al consultar ${new URL(u, location.href).host}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
export const loadData = (name) => fetchJSON(url(`data/${name}`));

/* ------------------------------------------------------------------ */
/* Vocabularios                                                         */
/* ------------------------------------------------------------------ */
export const UICN = {
  EX: 'Extinta', EW: 'Extinta en estado silvestre', CR: 'En peligro crítico', EN: 'En peligro',
  VU: 'Vulnerable', NT: 'Casi amenazada', LC: 'Preocupación menor', DD: 'Datos insuficientes', NE: 'No evaluada',
};
export const INAT_IUCN = { 5: 'DD', 10: 'LC', 20: 'NT', 30: 'VU', 40: 'EN', 50: 'CR', 60: 'EW', 70: 'EX' };

export const GRUPOS = {
  aves:          { label: 'Aves',          singular: 'Ave',          color: '#2a9d8f', inat: 'Aves',           gbif: [212] },
  mamiferos:     { label: 'Mamíferos',     singular: 'Mamífero',     color: '#a0522d', inat: 'Mammalia',       gbif: [359] },
  reptiles:      { label: 'Reptiles',      singular: 'Reptil',       color: '#6b8e23', inat: 'Reptilia',       gbif: [11592253, 11418114, 11493978] },
  anfibios:      { label: 'Anfibios',      singular: 'Anfibio',      color: '#e76f51', inat: 'Amphibia',       gbif: [131] },
  peces:         { label: 'Peces',         singular: 'Pez',          color: '#1f7fa0', inat: 'Actinopterygii', gbif: [204, 121] },
  invertebrados: { label: 'Invertebrados', singular: 'Invertebrado', color: '#8e6cef', inat: 'Insecta,Arachnida,Mollusca', gbif: [216, 52, 367, 206] },
  plantas:       { label: 'Plantas',       singular: 'Planta',       color: '#3f8a63', inat: 'Plantae',        gbif: [6] },
  hongos:        { label: 'Hongos',        singular: 'Hongo',        color: '#b5838d', inat: 'Fungi',          gbif: [5] },
};

export const REGIONES_BASE = {
  pacifico:          { nombre: 'Pacífico', color: '#D98E04' },
  'centro-norte':    { nombre: 'Centro y Norte', color: '#2E7D32' },
  caribe:            { nombre: 'Caribe', color: '#00897B' },
  lagos:             { nombre: 'Lagos y ríos', color: '#1E88E5' },
  'marino-pacifico': { nombre: 'Océano Pacífico', color: '#3949AB' },
  'marino-caribe':   { nombre: 'Mar Caribe', color: '#00ACC1' },
};

export const ESTADOS = {
  pendiente: 'Pendiente de verificación',
  revisar: 'En revisión',
  verificado: 'Verificado',
};

/* ------------------------------------------------------------------ */
/* Insignias                                                            */
/* ------------------------------------------------------------------ */
export function badgeUICN(code, { long = false } = {}) {
  if (!code) return '';
  const c = String(code).toUpperCase();
  const label = UICN[c] || c;
  return `<span class="badge-uicn" data-c="${esc(c)}" title="Lista Roja UICN (global): ${esc(label)}">${long ? `${esc(c)} · ${esc(label)}` : esc(c)}</span>`;
}

export function badgeVerif(v) {
  const estado = v?.estado || 'pendiente';
  const icon = estado === 'verificado' ? '✓' : estado === 'revisar' ? '!' : '○';
  return `<span class="badge-verif" data-estado="${esc(estado)}" title="${esc(ESTADOS[estado] || estado)}">${icon} ${esc(ESTADOS[estado] || estado)}</span>`;
}

export function chipGrupo(grupo) {
  const g = GRUPOS[grupo];
  if (!g) return '';
  return `<span class="chip" style="color:${g.color}"><span class="chip-dot"></span><span style="color:var(--text-soft)">${esc(g.singular)}</span></span>`;
}

export function chipRegion(id, regiones = REGIONES_BASE) {
  const r = regiones[id] || REGIONES_BASE[id];
  if (!r) return '';
  return `<span class="chip" style="color:${r.color}"><span class="chip-dot"></span><span style="color:var(--text-soft)">${esc(r.nombre)}</span></span>`;
}

/* ------------------------------------------------------------------ */
/* Fotos de iNaturalist                                                 */
/* ------------------------------------------------------------------ */
export function photoUrl(photo, size = 'medium') {
  if (!photo) return null;
  const u = photo.url || photo.square_url || photo.medium_url;
  if (!u) return null;
  return u.replace(/\/(square|small|medium|large|thumb|original)\./, `/${size}.`);
}
export function photoCredit(photo) {
  if (!photo) return '';
  return photo.attribution ? `${photo.attribution} · iNaturalist` : 'iNaturalist';
}

/* ------------------------------------------------------------------ */
/* Tarjetas                                                             */
/* ------------------------------------------------------------------ */
export function speciesHref(sp) {
  if (sp.id) return url(`especie.html?id=${encodeURIComponent(sp.id)}`);
  if (sp.inat) return url(`especie.html?inat=${encodeURIComponent(sp.inat)}`);
  return url(`especie.html?nombre=${encodeURIComponent(sp.nombre_cientifico)}`);
}

export function speciesCard(sp, photo) {
  const img = photoUrl(photo, 'medium');
  const nombre = sp.nombres_comunes?.[0] || sp.nombre_cientifico;
  return `
  <a class="card card-link sp-card" href="${speciesHref(sp)}">
    <div class="sp-photo" data-photo-for="${esc(sp.id || '')}">
      ${img ? `<img src="${esc(img)}" alt="${esc(nombre)}" loading="lazy">` : '<div class="sp-placeholder">Cargando foto…</div>'}
      <div class="sp-badges">${badgeUICN(sp.uicn)}${sp.endemica ? '<span class="chip" style="background:#fff">Endémica</span>' : ''}</div>
      ${img ? `<div class="sp-credit">${esc(photoCredit(photo))}</div>` : ''}
    </div>
    <div class="sp-info">
      <div class="sp-name">${esc(nombre)}</div>
      <div class="sp-sci">${esc(sp.nombre_cientifico)}</div>
      <div class="sp-meta">${chipGrupo(sp.grupo)}${sp.simbolo_nacional ? '<span class="chip">Símbolo nacional</span>' : ''}${badgeVerif(sp.verificacion)}</div>
    </div>
  </a>`;
}

export function fillCardPhoto(container, id, photo) {
  const box = container.querySelector(`[data-photo-for="${CSS.escape(id)}"]`);
  if (!box) return;
  const img = photoUrl(photo, 'medium');
  const ph = box.querySelector('.sp-placeholder');
  if (!img) { if (ph) ph.textContent = 'Sin foto disponible'; return; }
  if (ph) ph.remove();
  box.insertAdjacentHTML('afterbegin', `<img src="${esc(img)}" alt="" loading="lazy">`);
  box.insertAdjacentHTML('beforeend', `<div class="sp-credit">${esc(photoCredit(photo))}</div>`);
}

export function loadingHTML(txt = 'Cargando…') {
  return `<div class="loading-row"><span class="spinner" aria-hidden="true"></span><span>${esc(txt)}</span></div>`;
}
export function errorHTML(err, extra = '') {
  return `<div class="error-box" role="alert">No se pudo cargar la información (${esc(err?.message || err)}). ${extra}</div>`;
}

/* ------------------------------------------------------------------ */
/* Encabezado y pie de página                                           */
/* ------------------------------------------------------------------ */
const LOGO = `
<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="23" fill="#1a4536"/>
  <circle cx="33" cy="15" r="5" fill="#f2b134"/>
  <path d="M6 33 L18 16 Q20 13.5 22 16 L27 23 L30 20 Q31.5 18.5 33 20 L42 33 Z" fill="#0f2a22"/>
  <path d="M18 16 Q20 13.5 22 16 L23.5 18 Q20 19.5 16.6 18 Z" fill="#e8dcc0"/>
  <path d="M3.5 31 Q24 27 44.5 31 A23 23 0 0 1 3.5 31 Z" fill="#1f7fa0"/>
  <path d="M10 36 Q16 34 22 36 M26 38 Q32 36 38 38" stroke="#7cc4dc" stroke-width="1.4" fill="none" stroke-linecap="round"/>
</svg>`;

const NAV = [
  ['index.html', 'Inicio'],
  ['explorar.html', 'Explorar el mapa'],
  ['especies.html', 'Especies'],
  ['areas.html', 'Áreas protegidas'],
  ['fuentes.html', 'Fuentes y método'],
];

export function layout(active) {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="container">
      <a class="brand" href="${url('index.html')}">${LOGO}
        <span class="brand-text"><span class="brand-name">${esc(CONFIG.nombreSitio)}</span><span class="brand-sub">Flora · Fauna · Áreas protegidas</span></span>
      </a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="Abrir menú">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
      <nav class="main-nav" id="main-nav" aria-label="Principal">
        ${NAV.map(([href, label]) => `<a href="${url(href)}" ${active === href ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
        <a class="nav-ninos" href="${url('ninos/index.html')}" ${active === 'ninos' ? 'aria-current="page"' : ''}>Mi Primera Enciclopedia</a>
        <button class="theme-toggle" type="button" aria-label="Cambiar tema claro/oscuro" title="Cambiar tema">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        </button>
      </nav>
    </div>`;
  document.body.prepend(header);

  const toggle = header.querySelector('.nav-toggle');
  const nav = header.querySelector('.main-nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  const saved = storage('tema');
  if (saved) document.documentElement.dataset.theme = saved;
  header.querySelector('.theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    storage('tema', next);
  });

  if (document.body.dataset.noFooter !== undefined) return;
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="row" style="gap:10px;margin-bottom:10px">${LOGO}<strong style="font-family:var(--font-display);font-size:1.1rem;color:#fff">${esc(CONFIG.nombreSitio)}</strong></div>
          <p>Un atlas para curiosear y entender, de forma integral, la biodiversidad de Nicaragua: sus especies, sus ecosistemas y los lugares que la protegen.</p>
          <p class="tiny">Los textos curados están en proceso de verificación científica. Cada ficha indica su estado.</p>
        </div>
        <div>
          <h4>Explora</h4>
          <ul>
            <li><a href="${url('explorar.html')}">¿Qué puedo ver aquí?</a></li>
            <li><a href="${url('especies.html')}">Catálogo de especies</a></li>
            <li><a href="${url('areas.html')}">Áreas protegidas y sitios</a></li>
            <li><a href="${url('ninos/index.html')}">Mi Primera Enciclopedia</a></li>
            <li><a href="${url('revision.html')}">Panel de revisión científica</a></li>
          </ul>
        </div>
        <div>
          <h4>Datos abiertos de</h4>
          <ul>
            <li><a href="https://www.gbif.org" target="_blank" rel="noopener">GBIF</a></li>
            <li><a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a></li>
            <li><a href="https://ebird.org" target="_blank" rel="noopener">eBird (Cornell Lab of Ornithology)</a></li>
            <li><a href="https://biogeodb.stri.si.edu/caribbean/es/pages" target="_blank" rel="noopener">Smithsonian (STRI) — Peces</a></li>
            <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-note">
        Fotografías de la comunidad de iNaturalist bajo licencias Creative Commons; la autoría aparece en cada imagen.
        Consulta <a href="${url('fuentes.html')}">Fuentes y método</a> para las citas completas y cómo se calcula cada dato.
        ¿Encontraste un error? <a href="${esc(CONFIG.repoUrl)}/issues" target="_blank" rel="noopener">Repórtalo aquí</a>.
      </div>
    </div>`;
  document.body.append(footer);
}
