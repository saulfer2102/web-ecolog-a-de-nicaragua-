// Clientes de las APIs públicas: iNaturalist, GBIF, eBird, Smithsonian (STRI), Nominatim y Open-Meteo.
import { CONFIG } from './config.js';
import { fetchJSON, loadData, storage } from './common.js';

/* Cola sencilla para no saturar APIs con límite de uso (iNaturalist recomienda ~1 consulta/segundo sostenida). */
function makeQueue(concurrency, gapMs) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= concurrency || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift();
    fn().then(res, rej).finally(() => setTimeout(() => { active--; next(); }, gapMs));
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}
const inatQ = makeQueue(3, 250);

const qs = (o) => Object.entries(o)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/* ================================================================== */
/* iNaturalist — https://api.inaturalist.org/v1/docs/                   */
/* ================================================================== */
const INAT = 'https://api.inaturalist.org/v1';
const inatGet = (path, params) => inatQ(() => fetchJSON(`${INAT}${path}?${qs({ locale: 'es', preferred_place_id: CONFIG.inatPlaceId, ...params })}`));

export const inat = {
  /** Especies observadas alrededor de un punto, ordenadas por número de observaciones. */
  speciesCounts({ lat, lng, radius, iconic, taxonIds, months, page = 1, perPage = 50, quality = 'research' }) {
    return inatGet('/observations/species_counts', {
      lat, lng, radius, iconic_taxa: iconic, taxon_id: taxonIds?.join(','), month: months?.join(','), page, per_page: perPage,
      quality_grade: quality,
    });
  },
  /** Especies observadas en Nicaragua (o en otro lugar), ordenadas por número de observaciones. */
  placeSpecies({ iconic, q, page = 1, perPage = 48, threatened, introduced, placeId = CONFIG.inatPlaceId }) {
    return inatGet('/observations/species_counts', {
      place_id: placeId, verifiable: true, iconic_taxa: iconic, q, search_on: q ? 'names' : undefined,
      threatened: threatened ? true : undefined, introduced: introduced ? true : undefined, page, per_page: perPage,
    });
  },
  /** Conteo de especies en un lugar (place_id). */
  placeSpeciesCount(placeId = CONFIG.inatPlaceId) {
    return inatGet('/observations/species_counts', { place_id: placeId, per_page: 1, verifiable: true }).then((d) => d.total_results);
  },
  placeObservationCount(placeId = CONFIG.inatPlaceId) {
    return inatGet('/observations', { place_id: placeId, per_page: 0, verifiable: true }).then((d) => d.total_results);
  },
  /** Varios taxones por id (hasta 30 por consulta). */
  async taxaByIds(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const d = await inatGet(`/taxa/${chunk.join(',')}`, {});
      out.push(...d.results);
    }
    return out;
  },
  taxon(id) {
    return inatGet(`/taxa/${id}`, {}).then((d) => d.results?.[0]);
  },
  /** Busca un taxón por nombre científico exacto. */
  async taxonByName(name) {
    const d = await inatGet('/taxa', { q: name, per_page: 10, is_active: true });
    const n = name.toLowerCase();
    return d.results.find((t) => t.name.toLowerCase() === n) || d.results.find((t) => t.matched_term?.toLowerCase() === n) || null;
  },
  autocomplete(q) {
    return inatGet('/taxa/autocomplete', { q, per_page: 12, is_active: true });
  },
  histogram(taxonId, placeId = CONFIG.inatPlaceId) {
    return inatGet('/observations/histogram', {
      taxon_id: taxonId, place_id: placeId, interval: 'month_of_year', date_field: 'observed', verifiable: true,
    }).then((d) => d.results?.month_of_year || {});
  },
  observationCount(taxonId, placeId = CONFIG.inatPlaceId) {
    return inatGet('/observations', { taxon_id: taxonId, place_id: placeId, per_page: 0, verifiable: true }).then((d) => d.total_results);
  },
  recentObservations(taxonId, placeId = CONFIG.inatPlaceId, perPage = 8) {
    return inatGet('/observations', {
      taxon_id: taxonId, place_id: placeId, per_page: perPage, quality_grade: 'research', photos: true, order_by: 'observed_on',
    });
  },
  taxonUrl: (id) => `https://www.inaturalist.org/taxa/${id}`,
  exploreUrl: ({ lat, lng, radius }) => `https://www.inaturalist.org/observations?lat=${lat}&lng=${lng}&radius=${radius}&subview=map`,
};

/** Estado UICN global a partir de los datos de un taxón de iNaturalist. */
export function inatIUCN(taxon) {
  const sts = taxon?.conservation_statuses || [];
  const global = sts.find((s) => /iucn/i.test(s.authority || '') && !s.place);
  // El estado resumido solo vale si es de la UICN y global (no NatureServe ni listas nacionales).
  const cs = taxon?.conservation_status;
  const s = global || (cs && !cs.place_id && !cs.place && /iucn/i.test(cs.authority || '') ? cs : null);
  if (!s) return null;
  const map = { 5: 'DD', 10: 'LC', 20: 'NT', 30: 'VU', 40: 'EN', 50: 'CR', 60: 'EW', 70: 'EX' };
  return map[s.iucn] || (s.status ? String(s.status).toUpperCase() : null);
}

/* ================================================================== */
/* GBIF — https://techdocs.gbif.org/en/openapi/                         */
/* ================================================================== */
const GBIF = 'https://api.gbif.org/v1';

export const gbif = {
  match(name) {
    return fetchJSON(`${GBIF}/species/match?${qs({ name })}`);
  },
  species(key) {
    return fetchJSON(`${GBIF}/species/${key}`);
  },
  /** Facetas de especies alrededor de un punto: [{key, count}] */
  async speciesNear({ lat, lng, radiusKm, taxonKeys, datasetKey, months, limit = 60 }) {
    const d = await fetchJSON(`${GBIF}/occurrence/search?${qs({
      geoDistance: `${lat},${lng},${radiusKm}km`, limit: 0, facet: 'speciesKey', facetLimit: limit,
      taxonKey: taxonKeys, datasetKey, month: months, occurrenceStatus: 'PRESENT', hasGeospatialIssue: false,
    })}`);
    return { total: d.count, especies: (d.facets?.[0]?.counts || []).map((c) => ({ key: Number(c.name), count: c.count })) };
  },
  countInCountry(taxonKey) {
    return fetchJSON(`${GBIF}/occurrence/search?${qs({ taxonKey, country: CONFIG.gbifPais, limit: 0 })}`).then((d) => d.count);
  },
  countryTotal() {
    return fetchJSON(`${GBIF}/occurrence/search?${qs({ country: CONFIG.gbifPais, limit: 0 })}`).then((d) => d.count);
  },
  datasetCountInCountry(datasetKey) {
    return fetchJSON(`${GBIF}/occurrence/search?${qs({ datasetKey, country: CONFIG.gbifPais, limit: 0 })}`).then((d) => d.count);
  },
  densityTiles({ taxonKey, taxonKeys, country = CONFIG.gbifPais } = {}) {
    const extra = (taxonKeys || (taxonKey ? [taxonKey] : [])).map((k) => `&taxonKey=${k}`).join('');
    return `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?srs=EPSG:3857${country ? `&country=${country}` : ''}${extra}&bin=hex&hexPerTile=48&style=classic-noborder.poly`;
  },
  speciesUrl: (key) => `https://www.gbif.org/species/${key}`,
  occurrencesUrl: ({ lat, lng, radiusKm, taxonKey }) =>
    `https://www.gbif.org/occurrence/search?geo_distance=${lat},${lng},${radiusKm}km${taxonKey ? `&taxon_key=${taxonKey}` : ''}`,
};

/* ================================================================== */
/* eBird API 2.0 — https://documenter.getpostman.com/view/664302/S1ENwy59 */
/* ================================================================== */
const EBIRD = 'https://api.ebird.org/v2';
export const ebird = {
  getKey: () => storage('ebirdApiKey') || CONFIG.ebirdApiKey || '',
  setKey: (k) => storage('ebirdApiKey', k ? k.trim() : null),
  get(path, params) {
    const key = ebird.getKey();
    if (!key) return Promise.reject(new Error('Falta la clave de la API de eBird'));
    return fetchJSON(`${EBIRD}${path}?${qs(params)}`, { headers: { 'X-eBirdApiToken': key } });
  },
  recent({ lat, lng, dist = 10, back = 30 }) {
    return ebird.get('/data/obs/geo/recent', { lat: lat.toFixed(4), lng: lng.toFixed(4), dist: Math.min(50, dist), back, sppLocale: 'es' });
  },
  notable({ lat, lng, dist = 10, back = 30 }) {
    return ebird.get('/data/obs/geo/recent/notable', { lat: lat.toFixed(4), lng: lng.toFixed(4), dist: Math.min(50, dist), back, sppLocale: 'es' });
  },
  hotspots({ lat, lng, dist = 10 }) {
    return ebird.get('/ref/hotspot/geo', { lat: lat.toFixed(4), lng: lng.toFixed(4), dist: Math.min(50, dist), fmt: 'json' });
  },
  speciesUrl: (code) => `https://ebird.org/species/${code}`,
  hotspotUrl: (loc) => `https://ebird.org/hotspot/${loc}`,
  checklistUrl: (sub) => `https://ebird.org/checklist/${sub}`,
};

/* ================================================================== */
/* Smithsonian Tropical Research Institute — Shorefishes                */
/* ================================================================== */
export const stri = {
  async index() {
    return loadData('stri-peces.json');
  },
  /** Devuelve enlaces a las fichas STRI (Caribe y/o Pacífico) de un pez, o null. */
  async lookup(nombre) {
    const idx = await stri.index();
    const r = idx.especies[nombre];
    if (!r) return null;
    const [c, p, familia] = r;
    return {
      familia,
      caribe: c ? `${idx.fuente.url_caribe}${c}` : null,
      pacifico: p ? `${idx.fuente.url_pacifico}${p}` : null,
    };
  },
  home: {
    caribe: 'https://biogeodb.stri.si.edu/caribbean/es/pages',
    pacifico: 'https://biogeodb.stri.si.edu/sftep/es/pages',
  },
};

/* ================================================================== */
/* Geocodificación (Nominatim / OpenStreetMap) y elevación              */
/* ================================================================== */
export function geocode(q) {
  return fetchJSON(`https://nominatim.openstreetmap.org/search?${qs({
    q, countrycodes: 'ni', format: 'jsonv2', limit: 6, 'accept-language': 'es',
  })}`);
}

export function elevation(lat, lng) {
  return fetchJSON(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`)
    .then((d) => d.elevation?.[0] ?? null);
}
