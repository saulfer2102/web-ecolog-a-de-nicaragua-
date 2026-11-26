#!/usr/bin/env node
/**
 * Validación automática del contenido curado del Atlas Vivo de Nicaragua.
 *
 * Qué hace:
 *  1. Empareja cada nombre científico de data/especies.json con el árbol taxonómico de GBIF
 *     (estado aceptado/sinónimo, familia) y con iNaturalist (id del taxón, categoría UICN global).
 *  2. Cuenta registros en Nicaragua (GBIF, país NI) y observaciones verificables (iNaturalist, lugar 6925).
 *  3. Revisa campos obligatorios, número de fuentes y URLs.
 *  4. Revisa vínculos internos: especie↔área, regiones, enciclopedia infantil.
 *  5. Comprueba que las coordenadas de cada área caigan en Nicaragua y en el departamento declarado.
 *  6. Guarda los identificadores (ids.gbif, ids.inat) en data/especies.json y escribe:
 *       reportes/validacion.json   (lo usa el panel de revisión del sitio)
 *       reportes/validacion.md     (resumen legible)
 *       reportes/validacion-especies.csv
 *
 * Uso:  node scripts/validar.mjs            (requiere Node.js 18+, sin dependencias)
 *       node scripts/validar.mjs --sin-red  (solo revisiones locales)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIN_RED = process.argv.includes('--sin-red');
const INAT_PLACE = 6925;
const UA = 'AtlasVivoNicaragua-validador/1.0';
const IUCN_INAT = { 5: 'DD', 10: 'LC', 20: 'NT', 30: 'VU', 40: 'EN', 50: 'CR', 60: 'EW', 70: 'EX' };
const GRUPOS = ['aves', 'mamiferos', 'reptiles', 'anfibios', 'peces', 'invertebrados', 'plantas', 'hongos'];
const REGIONES = ['pacifico', 'centro-norte', 'caribe', 'lagos', 'marino-pacifico', 'marino-caribe'];
const UICN = ['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'];
const ESTADOS = ['pendiente', 'revisar', 'verificado'];

const leer = async (p) => JSON.parse(await readFile(path.join(RAIZ, p), 'utf8'));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const palabras = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

async function getJSON(url, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429) { await dormir(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === intentos - 1) throw e;
      await dormir(1500 * (i + 1));
    }
  }
  return null;
}
let ultimaINat = 0;
async function inat(pathq) {
  const espera = 1100 - (Date.now() - ultimaINat);
  if (espera > 0) await dormir(espera);
  ultimaINat = Date.now();
  return getJSON(`https://api.inaturalist.org/v1${pathq}`);
}
const gbif = (pathq) => getJSON(`https://api.gbif.org/v1${pathq}`);

/* -------- Geometría (igual que en el navegador) -------- */
function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function geomContains(g, lat, lon) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some((p) => ringContains(p[0], lon, lat) && !p.slice(1).some((h) => ringContains(h, lon, lat)));
}
const ALIAS_DEPTO = {
  raccn: 'costa caribe norte', 'region autonoma de la costa caribe norte': 'costa caribe norte', 'region autonoma del atlantico norte': 'costa caribe norte', raan: 'costa caribe norte',
  raccs: 'costa caribe sur', 'region autonoma de la costa caribe sur': 'costa caribe sur', 'region autonoma del atlantico sur': 'costa caribe sur', raas: 'costa caribe sur',
};
const normDepto = (d) => { const n = norm(d); return ALIAS_DEPTO[n] || n; };

/* ================================================================== */
async function main() {
  const especiesDoc = await leer('data/especies.json');
  const areasDoc = await leer('data/areas.json');
  const regionesDoc = await leer('data/regiones.json').catch(() => ({ regiones: [], lugares: [] }));
  const ninos = await leer('data/ninos.json').catch(() => ({}));
  const stri = await leer('data/stri-peces.json');
  const municipios = await leer('data/geo/municipios.geojson');
  const lagos = await leer('data/geo/lagos.geojson');

  const especies = especiesDoc.especies;
  const areas = areasDoc.areas;
  const idsEspecies = new Set(especies.map((s) => s.id));
  const idsAreas = new Set(areas.map((a) => a.id));
  const rep = { fecha: new Date().toISOString().slice(0, 10), especies: {}, areas: {}, ninos: {}, generales: [] };
  const alerta = (obj, id, msg) => { (obj[id] ||= { alertas: [] }).alertas.push(msg); };

  /* ---- Duplicados ---- */
  const dup = (arr, k) => arr.map((x) => x[k]).filter((v, i, a) => a.indexOf(v) !== i);
  for (const d of dup(especies, 'id')) rep.generales.push(`id de especie duplicado: ${d}`);
  for (const d of dup(especies, 'nombre_cientifico')) rep.generales.push(`nombre científico duplicado: ${d}`);
  for (const d of dup(areas, 'id')) rep.generales.push(`id de área duplicado: ${d}`);

  /* ---- Revisión local de especies ---- */
  const obligatoriosEsp = ['id', 'nombre_cientifico', 'nombres_comunes', 'grupo', 'clase', 'orden', 'familia', 'uicn', 'regiones', 'habitats',
    'descripcion', 'identificacion', 'ecologia', 'distribucion_nicaragua', 'amenazas', 'dato_curioso', 'fuentes', 'verificacion'];
  for (const s of especies) {
    rep.especies[s.id] = { alertas: [] };
    for (const c of obligatoriosEsp) if (s[c] == null || s[c] === '' || (Array.isArray(s[c]) && !s[c].length)) alerta(rep.especies, s.id, `Falta el campo "${c}"`);
    if (!GRUPOS.includes(s.grupo)) alerta(rep.especies, s.id, `Grupo desconocido: ${s.grupo}`);
    if (s.uicn && !UICN.includes(s.uicn)) alerta(rep.especies, s.id, `Categoría UICN no válida: ${s.uicn}`);
    for (const r of s.regiones || []) if (!REGIONES.includes(r)) alerta(rep.especies, s.id, `Región desconocida: ${r}`);
    for (const a of s.areas || []) if (!idsAreas.has(a)) alerta(rep.especies, s.id, `Área inexistente en areas.json: ${a}`);
    if ((s.fuentes || []).length < 2) alerta(rep.especies, s.id, 'Menos de 2 fuentes');
    for (const f of s.fuentes || []) if (f.url && !/^https?:\/\/[^\s]+$/.test(f.url)) alerta(rep.especies, s.id, `URL mal formada: ${f.url}`);
    const n = palabras(s.descripcion);
    if (n && (n < 50 || n > 220)) alerta(rep.especies, s.id, `Descripción de ${n} palabras (objetivo 80–150)`);
    if (!ESTADOS.includes(s.verificacion?.estado)) alerta(rep.especies, s.id, 'Estado de verificación no válido');
    if (s.grupo === 'peces') {
      const enStri = Boolean(stri.especies[s.nombre_cientifico]);
      rep.especies[s.id].stri = enStri;
      if (!enStri && (s.regiones || []).some((r) => r.startsWith('marino-'))) alerta(rep.especies, s.id, 'Pez marino sin ficha en las listas STRI (revisar nombre)');
    }
  }

  /* ---- Revisión local de áreas ---- */
  const obligatoriosArea = ['id', 'nombre', 'tipo', 'categoria', 'departamentos', 'region', 'coordenadas', 'ecosistemas', 'descripcion', 'importancia', 'especies_emblematicas', 'fuentes', 'verificacion'];
  for (const a of areas) {
    rep.areas[a.id] = { alertas: [] };
    for (const c of obligatoriosArea) if (a[c] == null || a[c] === '' || (Array.isArray(a[c]) && !a[c].length)) alerta(rep.areas, a.id, `Falta el campo "${c}"`);
    if (!['area_protegida', 'sitio_ecologico'].includes(a.tipo)) alerta(rep.areas, a.id, `Tipo no válido: ${a.tipo}`);
    if (!REGIONES.includes(a.region)) alerta(rep.areas, a.id, `Región desconocida: ${a.region}`);
    for (const e of a.especies_emblematicas || []) if (!idsEspecies.has(e)) alerta(rep.areas, a.id, `Especie inexistente en especies.json: ${e}`);
    if ((a.fuentes || []).length < 2) alerta(rep.areas, a.id, 'Menos de 2 fuentes');
    if (!ESTADOS.includes(a.verificacion?.estado)) alerta(rep.areas, a.id, 'Estado de verificación no válido');
    if (Array.isArray(a.coordenadas) && a.coordenadas.length === 2) {
      const [lat, lon] = a.coordenadas;
      const mun = municipios.features.find((f) => geomContains(f.geometry, lat, lon));
      const lago = lagos.features.find((f) => geomContains(f.geometry, lat, lon));
      rep.areas[a.id].ubicacion = mun ? { municipio: mun.properties.municipio, departamento: mun.properties.departamento } : (lago ? { lago: lago.properties.nombre } : null);
      if (!mun && !lago && a.tipo === 'area_protegida' && !/cayo|golfo|isla/i.test(a.nombre)) alerta(rep.areas, a.id, 'Las coordenadas no caen dentro de ningún municipio (¿mar o fuera del país?)');
      if (mun && (a.departamentos || []).length && !(a.departamentos || []).some((d) => normDepto(d) === normDepto(mun.properties.departamento))) {
        alerta(rep.areas, a.id, `El punto cae en ${mun.properties.municipio} (${mun.properties.departamento}), que no está en "departamentos"`);
      }
    }
  }

  /* ---- Vínculos en ambos sentidos (informativo) ---- */
  for (const s of especies) for (const aid of s.areas || []) {
    const a = areas.find((x) => x.id === aid);
    if (a && !(a.especies_emblematicas || []).includes(s.id)) (rep.especies[s.id].vinculos ||= []).push(aid);
  }

  /* ---- Regiones ---- */
  for (const r of regionesDoc.regiones || []) {
    for (const e of r.especies_emblematicas || []) if (!idsEspecies.has(e)) rep.generales.push(`Región ${r.id}: especie inexistente ${e}`);
    for (const a of r.areas_destacadas || []) if (!idsAreas.has(a)) rep.generales.push(`Región ${r.id}: área inexistente ${a}`);
  }
  for (const l of regionesDoc.lugares || []) {
    const [lat, lon] = l.coordenadas || [];
    const mun = municipios.features.find((f) => geomContains(f.geometry, lat, lon));
    if (!mun) rep.generales.push(`Lugar "${l.nombre}": coordenadas fuera de los municipios`);
    else if (l.departamento && normDepto(l.departamento) !== normDepto(mun.properties.departamento)) {
      rep.generales.push(`Lugar "${l.nombre}": declarado en ${l.departamento}, el punto cae en ${mun.properties.departamento}`);
    }
  }

  /* ---- Enciclopedia infantil ---- */
  for (const f of ninos.fichas || []) {
    rep.ninos[f.id] = { alertas: [] };
    if (!idsEspecies.has(f.especie_id)) alerta(rep.ninos, f.id, `especie_id inexistente: ${f.especie_id}`);
  }
  for (const t of ninos.temas || []) rep.ninos[t.id] ||= { alertas: [] };
  const fichasIds = new Set((ninos.fichas || []).flatMap((f) => [f.id, f.especie_id]));
  for (const a of ninos.adivinanzas || []) if (!fichasIds.has(a.respuesta)) rep.generales.push(`Adivinanza con respuesta sin ficha: ${a.respuesta}`);
  for (const [i, q] of (ninos.quiz || []).entries()) {
    if (!Array.isArray(q.opciones) || q.correcta == null || q.correcta < 0 || q.correcta >= q.opciones.length) rep.generales.push(`Pregunta ${i + 1} del quiz mal formada`);
  }

  /* ---- Validación en línea ---- */
  if (!SIN_RED) {
    console.log(`Validando ${especies.length} especies contra GBIF e iNaturalist…`);
    // GBIF (en paralelo moderado)
    const lotes = [];
    for (let i = 0; i < especies.length; i += 6) lotes.push(especies.slice(i, i + 6));
    for (const lote of lotes) {
      await Promise.all(lote.map(async (s) => {
        const r = rep.especies[s.id];
        try {
          const m = await gbif(`/species/match?name=${encodeURIComponent(s.nombre_cientifico)}`);
          r.gbif = { matchType: m.matchType, status: m.status, rank: m.rank, key: m.usageKey, aceptado: m.acceptedUsageKey || m.usageKey, familia: m.family, nombre: m.canonicalName };
          if (m.matchType === 'NONE' || m.matchType === 'HIGHERRANK') {
            alerta(rep.especies, s.id, `GBIF no reconoce el nombre (coincidencia: ${m.matchType})${s.ids?.gbif ? `; se usa la clave fijada a mano ${s.ids.gbif}` : ''}`);
            if (s.ids?.gbif) {
              r.gbif.manual = s.ids.gbif;
              const c = await gbif(`/occurrence/search?taxonKey=${s.ids.gbif}&country=NI&limit=0`);
              (r.registrosNI ||= {}).gbif = c.count;
            }
          } else {
            if (m.status === 'SYNONYM' || m.status === 'HETEROTYPIC_SYNONYM' || m.status === 'HOMOTYPIC_SYNONYM') {
              const acc = await gbif(`/species/${m.acceptedUsageKey}`).catch(() => null);
              r.gbif.nombreAceptado = acc?.canonicalName;
              alerta(rep.especies, s.id, `GBIF lo trata como sinónimo de ${acc?.canonicalName || m.acceptedUsageKey}`);
            }
            if (m.matchType === 'FUZZY') alerta(rep.especies, s.id, `GBIF encontró una coincidencia aproximada: ${m.canonicalName}`);
            if (m.family && s.familia && norm(m.family) !== norm(s.familia)) alerta(rep.especies, s.id, `Familia en GBIF: ${m.family} (ficha: ${s.familia})`);
            const c = await gbif(`/occurrence/search?taxonKey=${r.gbif.aceptado}&country=NI&limit=0`);
            (r.registrosNI ||= {}).gbif = c.count;
          }
        } catch (e) { alerta(rep.especies, s.id, `Error consultando GBIF: ${e.message}`); }
      }));
      process.stdout.write('.');
    }
    console.log('\nGBIF listo. Consultando iNaturalist (≈1 consulta/segundo)…');

    // iNaturalist: búsqueda por nombre
    for (const s of especies) {
      const r = rep.especies[s.id];
      try {
        const d = await inat(`/taxa?q=${encodeURIComponent(s.nombre_cientifico)}&per_page=10&is_active=true`);
        const n = norm(s.nombre_cientifico);
        const t = d.results.find((x) => norm(x.name) === n) || d.results.find((x) => norm(x.matched_term) === n);
        if (!t) { alerta(rep.especies, s.id, 'iNaturalist no encontró el nombre exacto'); continue; }
        r.inat = { id: t.id, nombre: t.name, rank: t.rank };
        if (norm(t.name) !== n) alerta(rep.especies, s.id, `iNaturalist usa el nombre ${t.name}`);
      } catch (e) { alerta(rep.especies, s.id, `Error consultando iNaturalist: ${e.message}`); }
      process.stdout.write('.');
    }
    // iNaturalist: estado UICN (lotes de 30) y observaciones en Nicaragua (una consulta)
    const conInat = especies.filter((s) => rep.especies[s.id].inat);
    for (let i = 0; i < conInat.length; i += 30) {
      const lote = conInat.slice(i, i + 30);
      try {
        const d = await inat(`/taxa/${lote.map((s) => rep.especies[s.id].inat.id).join(',')}`);
        for (const t of d.results) {
          const s = lote.find((x) => rep.especies[x.id].inat.id === t.id);
          if (!s) continue;
          const st = (t.conservation_statuses || []).find((c) => /iucn/i.test(c.authority || '') && !c.place);
          const cat = st ? IUCN_INAT[st.iucn] || String(st.status).toUpperCase() : null;
          rep.especies[s.id].inat.iucn = cat;
          if (cat && s.uicn && cat !== s.uicn) alerta(rep.especies, s.id, `UICN en iNaturalist: ${cat} (ficha: ${s.uicn}) — confirmar en iucnredlist.org`);
        }
      } catch (e) { rep.generales.push(`Error consultando UICN en iNaturalist: ${e.message}`); }
    }
    try {
      const ids = conInat.map((s) => rep.especies[s.id].inat.id);
      const vistos = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const d = await inat(`/observations/species_counts?place_id=${INAT_PLACE}&verifiable=true&per_page=500&taxon_id=${ids.slice(i, i + 100).join(',')}`);
        for (const x of d.results) vistos.set(x.taxon.id, x.count);
      }
      for (const s of conInat) {
        const r = rep.especies[s.id];
        (r.registrosNI ||= {}).inat = vistos.get(r.inat.id) || 0;
        if (!r.registrosNI.inat && !r.registrosNI.gbif) alerta(rep.especies, s.id, 'Sin registros en Nicaragua ni en GBIF ni en iNaturalist');
      }
    } catch (e) { rep.generales.push(`Error contando observaciones en iNaturalist: ${e.message}`); }

    // Guardar identificadores en especies.json
    let cambios = 0;
    for (const s of especies) {
      const r = rep.especies[s.id];
      const ids = { ...(s.ids || {}) };
      if (r.gbif?.aceptado && r.gbif.matchType !== 'NONE' && r.gbif.matchType !== 'HIGHERRANK') ids.gbif = r.gbif.aceptado;
      if (r.inat?.id) ids.inat = r.inat.id;
      if (JSON.stringify(ids) !== JSON.stringify(s.ids || {})) { s.ids = ids; cambios++; }
    }
    if (cambios) {
      especiesDoc.meta = { ...(especiesDoc.meta || {}), actualizado: rep.fecha };
      await writeFile(path.join(RAIZ, 'data/especies.json'), `${JSON.stringify(especiesDoc, null, 2)}\n`);
      console.log(`\nIdentificadores actualizados en ${cambios} especies.`);
    }
  }

  /* ---- Reportes ---- */
  await mkdir(path.join(RAIZ, 'reportes'), { recursive: true });
  await writeFile(path.join(RAIZ, 'reportes/validacion.json'), `${JSON.stringify(rep, null, 1)}\n`);

  const contar = (lista, e) => lista.filter((x) => (x.verificacion?.estado || 'pendiente') === e).length;
  const conAlertasE = especies.filter((s) => rep.especies[s.id].alertas.length);
  const conAlertasA = areas.filter((a) => rep.areas[a.id].alertas.length);
  let md = `# Reporte de validación automática\n\nFecha: ${rep.fecha}${SIN_RED ? ' (solo revisiones locales)' : ''}\n\n`;
  md += '| Conjunto | Registros | Verificados | En revisión | Pendientes | Con alertas |\n|---|---|---|---|---|---|\n';
  md += `| Especies | ${especies.length} | ${contar(especies, 'verificado')} | ${contar(especies, 'revisar')} | ${contar(especies, 'pendiente')} | ${conAlertasE.length} |\n`;
  md += `| Áreas y sitios | ${areas.length} | ${contar(areas, 'verificado')} | ${contar(areas, 'revisar')} | ${contar(areas, 'pendiente')} | ${conAlertasA.length} |\n\n`;
  md += '> Las alertas son avisos para la persona revisora, no errores confirmados. Una alerta de UICN, por ejemplo, puede deberse a que iNaturalist no está actualizado.\n\n';
  if (rep.generales.length) md += `## Avisos generales\n\n${rep.generales.map((g) => `- ${g}`).join('\n')}\n\n`;
  md += '## Especies con alertas\n\n';
  md += conAlertasE.map((s) => `### ${s.nombres_comunes?.[0] || s.id} — *${s.nombre_cientifico}* (\`${s.id}\`)\n${rep.especies[s.id].alertas.map((a) => `- ${a}`).join('\n')}\n`).join('\n') || 'Ninguna.\n';
  md += '\n## Áreas con alertas\n\n';
  md += conAlertasA.map((a) => `### ${a.nombre} (\`${a.id}\`)\n${rep.areas[a.id].alertas.map((x) => `- ${x}`).join('\n')}\n`).join('\n') || 'Ninguna.\n';
  md += '\n## Registros en Nicaragua por especie\n\n| id | Nombre científico | GBIF (NI) | iNaturalist (NI) | UICN ficha | UICN iNat |\n|---|---|---|---|---|---|\n';
  md += especies.map((s) => { const r = rep.especies[s.id]; return `| ${s.id} | *${s.nombre_cientifico}* | ${r.registrosNI?.gbif ?? '—'} | ${r.registrosNI?.inat ?? '—'} | ${s.uicn || ''} | ${r.inat?.iucn || '—'} |`; }).join('\n');
  md += '\n';
  await writeFile(path.join(RAIZ, 'reportes/validacion.md'), md);

  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [['id', 'nombre_cientifico', 'nombre_comun', 'grupo', 'uicn_ficha', 'uicn_inat', 'gbif_key', 'inat_id', 'registros_gbif_NI', 'obs_inat_NI', 'estado', 'alertas', 'notas'].map(q).join(',')]
    .concat(especies.map((s) => { const r = rep.especies[s.id]; return [s.id, s.nombre_cientifico, s.nombres_comunes?.[0], s.grupo, s.uicn, r.inat?.iucn, s.ids?.gbif, s.ids?.inat, r.registrosNI?.gbif, r.registrosNI?.inat, s.verificacion?.estado, r.alertas.join(' | '), s.verificacion?.notas].map(q).join(','); }));
  await writeFile(path.join(RAIZ, 'reportes/validacion-especies.csv'), `﻿${csv.join('\n')}\n`);

  console.log(`\nListo. Especies con alertas: ${conAlertasE.length}/${especies.length}. Áreas con alertas: ${conAlertasA.length}/${areas.length}. Avisos generales: ${rep.generales.length}.`);
  console.log('Ver reportes/validacion.md');
}

main().catch((e) => { console.error(e); process.exit(1); });
