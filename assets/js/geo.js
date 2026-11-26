// Geometría ligera: ubicar un punto en municipio/departamento/región, lagos y mar, sin servicios externos.
import { loadData } from './common.js';

export function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Punto desplazado `km` hacia el rumbo `deg` (aproximación esférica). */
export function offset([lat, lon], km, deg) {
  const R = 6371;
  const br = (deg * Math.PI) / 180;
  const d = km / R;
  const la1 = (lat * Math.PI) / 180;
  const lo1 = (lon * Math.PI) / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI];
}

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyContains(poly, x, y) {
  if (!ringContains(poly[0], x, y)) return false;
  for (let k = 1; k < poly.length; k++) if (ringContains(poly[k], x, y)) return false;
  return true;
}
function bbox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
export function geomContains(geom, lat, lon) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((p) => polyContains(p, lon, lat));
}

function prepare(fc) {
  for (const f of fc.features) f._bbox = bbox(f.geometry);
  return fc;
}
function findFeature(fc, lat, lon) {
  return fc.features.find((f) => {
    const [a, b, c, d] = f._bbox;
    return lon >= a && lon <= c && lat >= b && lat <= d && geomContains(f.geometry, lat, lon);
  });
}

let capas;
export async function capasGeo() {
  if (!capas) {
    capas = Promise.all([
      loadData('geo/municipios.geojson'), loadData('geo/lagos.geojson'), loadData('geo/vecinos.geojson'),
    ]).then(([m, l, v]) => ({ municipios: prepare(m), lagos: prepare(l), vecinos: prepare(v) }));
  }
  return capas;
}

function nearestMunicipio(fc, lat, lon) {
  let best = null;
  let bestD = Infinity;
  for (const f of fc.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) {
      const ring = p[0];
      const step = Math.max(1, Math.floor(ring.length / 80));
      for (let i = 0; i < ring.length; i += step) {
        const d = haversine([lat, lon], [ring[i][1], ring[i][0]]);
        if (d < bestD) { bestD = d; best = f; }
      }
    }
  }
  return { feature: best, km: bestD };
}

/**
 * Describe un punto: municipio, departamento, región, si está en un lago, en el mar o fuera del país,
 * y qué regiones de especies aplican (p. ej. ['pacifico', 'lagos', 'marino-pacifico']).
 */
export async function ubicar(lat, lon) {
  const { municipios, lagos, vecinos } = await capasGeo();
  const res = { lat, lon, municipio: null, departamento: null, region: null, lago: null, mar: null, fuera: false, pais: null, regiones: [] };

  const lago = findFeature(lagos, lat, lon);
  if (lago) res.lago = lago.properties.nombre;

  const mun = findFeature(municipios, lat, lon);
  if (mun) {
    Object.assign(res, { municipio: mun.properties.municipio, departamento: mun.properties.departamento, region: mun.properties.region });
  } else {
    const vecino = findFeature(vecinos, lat, lon);
    if (vecino) {
      res.fuera = true;
      res.pais = vecino.properties.pais;
      return res;
    }
    const { feature, km } = nearestMunicipio(municipios, lat, lon);
    if (!feature || km > 120) { res.fuera = true; return res; }
    const reg = feature.properties.region;
    res.mar = reg === 'caribe' ? 'caribe' : reg === 'pacifico' ? 'pacifico' : lon < -85.5 ? 'pacifico' : 'caribe';
    res.departamento = feature.properties.departamento;
    res.municipio = feature.properties.municipio;
    res.distanciaCosta = km;
  }

  const regs = new Set();
  if (res.region) regs.add(res.region);
  if (res.lago) regs.add('lagos');
  if (res.mar) regs.add(res.mar === 'caribe' ? 'marino-caribe' : 'marino-pacifico');

  // ¿Costero o ribereño? Se prueban 8 puntos alrededor.
  if (!res.mar) {
    for (let deg = 0; deg < 360; deg += 45) {
      const [la, lo] = offset([lat, lon], 6, deg);
      if (findFeature(lagos, la, lo)) regs.add('lagos');
      if (!findFeature(municipios, la, lo) && !findFeature(vecinos, la, lo)) {
        regs.add(res.region === 'caribe' ? 'marino-caribe' : res.region === 'pacifico' ? 'marino-pacifico' : (lon < -85.5 ? 'marino-pacifico' : 'marino-caribe'));
        res.costero = true;
      }
    }
  }
  res.regiones = [...regs];
  return res;
}
