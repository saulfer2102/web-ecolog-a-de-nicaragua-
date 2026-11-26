// Acceso al contenido curado (data/*.json) con índices y enlaces cruzados.
import { loadData, norm, REGIONES_BASE } from './common.js';
import { inat } from './api.js';

let _db;
/** Carga especies, áreas y regiones; construye índices y une los vínculos especie↔área en ambos sentidos. */
export function db() {
  if (_db) return _db;
  _db = Promise.all([loadData('especies.json'), loadData('areas.json'), loadData('regiones.json')]).then(([e, a, r]) => {
    const especies = e.especies || [];
    const areas = a.areas || [];
    const regionesLista = r.regiones || [];
    const porId = new Map(especies.map((s) => [s.id, s]));
    const porNombre = new Map(especies.map((s) => [norm(s.nombre_cientifico), s]));
    const porInat = new Map(especies.filter((s) => s.ids?.inat).map((s) => [Number(s.ids.inat), s]));
    const areaPorId = new Map(areas.map((x) => [x.id, x]));
    const regiones = Object.fromEntries(regionesLista.map((x) => [x.id, x]));
    for (const id of Object.keys(REGIONES_BASE)) if (!regiones[id]) regiones[id] = { id, ...REGIONES_BASE[id], especies_emblematicas: [] };

    // Vínculos especie ↔ área (unión de lo declarado en ambos archivos).
    const areasDeEspecie = new Map(especies.map((s) => [s.id, new Set(s.areas || [])]));
    const especiesDeArea = new Map(areas.map((x) => [x.id, new Set(x.especies_emblematicas || [])]));
    for (const s of especies) for (const aid of s.areas || []) especiesDeArea.get(aid)?.add(s.id);
    for (const x of areas) for (const sid of x.especies_emblematicas || []) areasDeEspecie.get(sid)?.add(x.id);

    return {
      meta: e.meta, especies, areas, regiones, regionesLista, lugares: r.lugares || [],
      especie: (id) => porId.get(id),
      especiePorNombre: (n) => porNombre.get(norm(n)),
      /** Busca por taxón de iNaturalist (id) y, si no, por nombre científico. */
      especieDeTaxon: (t) => (t ? porInat.get(Number(t.id)) || porNombre.get(norm(t.name)) : undefined),
      area: (id) => areaPorId.get(id),
      areasDeEspecie: (id) => [...(areasDeEspecie.get(id) || [])].map((x) => areaPorId.get(x)).filter(Boolean),
      especiesDeArea: (id) => [...(especiesDeArea.get(id) || [])].map((x) => porId.get(x)).filter(Boolean),
    };
  });
  return _db;
}

/**
 * Obtiene los taxones de iNaturalist para una lista de especies curadas (por id guardado o por nombre).
 * Devuelve Map(especieId → taxon). Llama a `onEach(id, taxon)` a medida que llegan.
 */
export async function taxaParaEspecies(lista, onEach) {
  const out = new Map();
  const conId = lista.filter((s) => s.ids?.inat);
  const sinId = lista.filter((s) => !s.ids?.inat);
  if (conId.length) {
    try {
      const taxa = await inat.taxaByIds(conId.map((s) => s.ids.inat));
      const porTaxon = new Map(taxa.map((t) => [t.id, t]));
      for (const s of conId) {
        const t = porTaxon.get(s.ids.inat);
        if (t) { out.set(s.id, t); onEach?.(s.id, t); }
      }
    } catch (e) { console.warn('iNaturalist (lote)', e); }
  }
  await Promise.all(sinId.map(async (s) => {
    try {
      const t = await inat.taxonByName(s.nombre_cientifico);
      if (t) { out.set(s.id, t); onEach?.(s.id, t); } else onEach?.(s.id, null);
    } catch { onEach?.(s.id, null); }
  }));
  return out;
}
