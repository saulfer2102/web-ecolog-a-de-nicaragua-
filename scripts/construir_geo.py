#!/usr/bin/env python3
"""
Construye los límites de departamentos y municipios de Nicaragua usados por el sitio.

Fuente: geoBoundaries (gbOpen, NIC ADM1 y ADM2), derivados de OpenStreetMap — licencia ODbL 1.0.
  https://www.geoboundaries.org/
La capa ADM1 de geoBoundaries está incompleta (12 de 17 unidades), por eso se usan los 153
municipios (ADM2): se asignan a su departamento por inclusión espacial en ADM1 y, para los
5 departamentos que faltan en ADM1, mediante la lista oficial de municipios (abajo).

Uso:
    pip install shapely
    python3 scripts/construir_geo.py RUTA_ADM1.geojson RUTA_ADM2.geojson

Salida:
    data/geo/departamentos.geojson
    data/geo/municipios.geojson
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

RAIZ = Path(__file__).resolve().parent.parent

REGION_POR_DEPTO = {
    "Chinandega": "pacifico", "León": "pacifico", "Managua": "pacifico", "Masaya": "pacifico",
    "Carazo": "pacifico", "Granada": "pacifico", "Rivas": "pacifico",
    "Nueva Segovia": "centro-norte", "Madriz": "centro-norte", "Estelí": "centro-norte",
    "Jinotega": "centro-norte", "Matagalpa": "centro-norte", "Boaco": "centro-norte",
    "Chontales": "centro-norte",
    "Costa Caribe Norte": "caribe", "Costa Caribe Sur": "caribe", "Río San Juan": "caribe",
}

ADM1_A_DEPTO = {
    "Managua": "Managua", "Leon": "León", "Chinandega": "Chinandega", "Madriz": "Madriz",
    "Estelí": "Estelí", "Nueva Segovia": "Nueva Segovia",
    "North Carribean Coast Autonomous Region": "Costa Caribe Norte",
    "South Atlantic Autonomous Region": "Costa Caribe Sur",
    "Jinotega (Departamento)": "Jinotega", "Carazo": "Carazo", "Granada": "Granada",
    "Masaya": "Masaya",
}

# Municipios asignados explícitamente: los 5 departamentos ausentes en la capa ADM1 y las dos
# regiones autónomas, cuyos polígonos ADM1 en la fuente están mal formados (cubren otros departamentos).
FALTANTES = {
    "Costa Caribe Norte": ["Puerto Cabezas", "Waspán", "Rosita", "Siuna", "Bonanza", "Prinzapolka",
                           "Mulukukú", "Waslala"],
    "Costa Caribe Sur": ["Bluefields", "Corn Island", "Desembocadura de Cruz Río Grande", "El Ayote",
                         "El Rama", "El Tortuguero", "Kukra Hill", "La Cruz de Río Grande",
                         "Laguna de Perlas", "Muelle de los Bueyes", "Nueva Guinea", "Paiwas"],
    "Rivas": ["Altagracia", "Belén", "Buenos Aires", "Cárdenas", "Moyogalpa", "Potosí", "Rivas",
              "San Jorge", "San Juan del Sur", "Tola"],
    "Río San Juan": ["El Almendro", "El Castillo", "Morrito", "San Carlos", "San Juan de Nicaragua",
                     "San Miguelito"],
    "Boaco": ["Boaco", "Camoapa", "San José de los Remates", "San Lorenzo", "Santa Lucía", "Teustepe"],
    "Chontales": ["Acoyapa", "Comalapa", "San Francisco de Cuapa", "El Coral", "Juigalpa", "La Libertad",
                  "San Pedro de Lóvago", "Santo Domingo", "Santo Tomás", "Villa Sandino"],
    "Matagalpa": ["Ciudad Darío", "El Tuma - La Dalia", "Esquipulas", "Matagalpa", "Matiguás", "Muy Muy",
                  "Rancho Grande", "Río Blanco", "San Dionisio", "San Isidro", "San Ramón", "Sébaco",
                  "Terrabona"],
}

# Correcciones de nombres con errores tipográficos en la fuente.
CORRECCIONES = {
    "Ciudad Darco": "Ciudad Darío", "Dipilito": "Dipilto", "Moyagalpa": "Moyogalpa",
    "San Ramon": "San Ramón", "Sebaco": "Sébaco", "El Jacaro": "El Jícaro",
    "San Nicolas": "San Nicolás", "San José de Los Remates": "San José de los Remates",
    "Paiwas": "Paiwas", "El Tortugero": "El Tortuguero",
}


def limpiar(nombre: str) -> str:
    n = re.sub(r"\((Municipio|Muncipio)\)", "", nombre)
    n = re.sub(r"^(Municipio de|Municipio|Muncipio)\s+", "", n).strip()
    return CORRECCIONES.get(n, n)


def clave(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def redondear(geom, dec=4):
    def r(coords):
        if isinstance(coords[0], (float, int)):
            return [round(coords[0], dec), round(coords[1], dec)]
        return [r(c) for c in coords]
    g = mapping(geom)
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def main(adm1_path, adm2_path):
    adm1 = json.load(open(adm1_path, encoding="utf-8"))
    adm2 = json.load(open(adm2_path, encoding="utf-8"))
    deptos_adm1 = [(ADM1_A_DEPTO[f["properties"]["shapeName"]], shape(f["geometry"]).buffer(0))
                   for f in adm1["features"]]
    # Se descartan los polígonos defectuosos de las regiones autónomas; se usa el más pequeño que contenga.
    deptos_adm1 = sorted([(d, g) for d, g in deptos_adm1 if REGION_POR_DEPTO[d] != "caribe"],
                         key=lambda x: x[1].area)
    faltantes = {clave(m): d for d, ms in FALTANTES.items() for m in ms}

    municipios = []
    sin_asignar = []
    for f in adm2["features"]:
        nombre = limpiar(f["properties"]["shapeName"])
        geom = shape(f["geometry"]).buffer(0)
        punto = geom.representative_point()
        depto = faltantes.pop(clave(nombre), None)
        if depto is None:
            depto = next((d for d, g in deptos_adm1 if g.contains(punto)), None)
        if depto is None:
            sin_asignar.append(nombre)
            continue
        municipios.append((nombre, depto, geom))

    if sin_asignar or faltantes:
        print("Sin asignar:", sin_asignar, "| Faltantes no encontrados:", list(faltantes))
        sys.exit(1)

    salida = RAIZ / "data" / "geo"
    salida.mkdir(parents=True, exist_ok=True)

    feats_mun = []
    for nombre, depto, geom in sorted(municipios, key=lambda x: (x[1], x[0])):
        g = geom.simplify(0.002, preserve_topology=True)
        feats_mun.append({"type": "Feature",
                          "properties": {"municipio": nombre, "departamento": depto,
                                         "region": REGION_POR_DEPTO[depto]},
                          "geometry": redondear(g)})
    json.dump({"type": "FeatureCollection",
               "fuente": "geoBoundaries gbOpen NIC ADM2 (OpenStreetMap, ODbL 1.0), simplificado",
               "features": feats_mun},
              open(salida / "municipios.geojson", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    feats_dep = []
    for depto in sorted(REGION_POR_DEPTO):
        geoms = [g for _, d, g in municipios if d == depto]
        union = unary_union([g.buffer(0.0005) for g in geoms]).buffer(-0.0005)
        union = union.simplify(0.004, preserve_topology=True)
        feats_dep.append({"type": "Feature",
                          "properties": {"departamento": depto, "region": REGION_POR_DEPTO[depto],
                                         "municipios": len(geoms)},
                          "geometry": redondear(union)})
    json.dump({"type": "FeatureCollection",
               "fuente": "Derivado de geoBoundaries gbOpen NIC ADM2 (OpenStreetMap, ODbL 1.0)",
               "features": feats_dep},
              open(salida / "departamentos.geojson", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    oficiales = {"Boaco": 6, "Carazo": 8, "Chinandega": 13, "Chontales": 10, "Estelí": 6, "Granada": 4,
                 "Jinotega": 8, "León": 10, "Madriz": 9, "Managua": 9, "Masaya": 9, "Matagalpa": 13,
                 "Nueva Segovia": 12, "Río San Juan": 6, "Rivas": 10, "Costa Caribe Norte": 8,
                 "Costa Caribe Sur": 12}
    for depto in sorted(REGION_POR_DEPTO):
        n = sum(1 for _, d, _ in municipios if d == depto)
        marca = "" if n == oficiales[depto] else f"  <-- se esperaban {oficiales[depto]}"
        print(f"{depto:20s} {n:3d} municipios{marca}")
    print("Total municipios:", len(municipios))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
