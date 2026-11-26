# Atlas Vivo de Nicaragua

Sitio web de divulgación científica sobre la **flora, la fauna y las áreas protegidas de Nicaragua**.
Es para cualquier persona curiosa que quiera una visión integral de la biodiversidad del país, y
tiene una sección infantil, *Mi Primera Enciclopedia de la Naturaleza*, para primaria.

## Qué hace

- **Explorar el mapa** (`explorar.html`): eliges un punto (tocando el mapa, buscando un lugar o con tu
  ubicación) y un radio. El sitio muestra:
  - el municipio, el departamento, la región y la altitud aproximada;
  - las **áreas protegidas y los sitios de importancia ecológica** más cercanos;
  - las **especies emblemáticas de la zona**, sacadas del catálogo curado según la región, las áreas
    cercanas y la altitud;
  - las **especies probables de observar**, ordenadas por número de registros verificados en
    iNaturalist o GBIF (que incluye eBird y colecciones de museos). Con una clave gratuita también
    muestra los reportes de eBird de los últimos 30 días;
  - los **peces** del lugar enlazados a sus fichas del Smithsonian (STRI) cuando el punto está en la
    costa, en el mar o en un lago.
- **Especies** (`especies.html`): catálogo curado con filtros (grupo, región, amenazadas, endémicas,
  símbolos nacionales) y un **buscador universal** para cualquier especie de iNaturalist.
- **Ficha de especie** (`especie.html`): descripción, identificación, ecología, distribución en
  Nicaragua, amenazas, dato curioso y fuentes. También fotos con licencia abierta, mapa de registros
  de GBIF, observaciones por mes, observaciones recientes y enlaces a GBIF, iNaturalist, eBird, STRI y
  la UICN. Las especies que no están en el catálogo tienen una ficha automática con un resumen de
  Wikipedia.
- **Áreas protegidas** (`areas.html`, `area.html`): mapa y fichas de reservas de biosfera, parques
  nacionales, refugios, sitios Ramsar y lugares clave como el Cocibolca o el Golfo de Fonseca.
- **Mi Primera Enciclopedia** (`ninos/`): temas ilustrados, fichas de animales y plantas, trivia,
  adivinanzas "¿Quién soy?", diccionario, lectura en voz alta y un certificado imprimible de
  "Guardián de la Naturaleza".
- **Fuentes y método** (`fuentes.html`): de dónde sale cada dato, cómo se calcula "probable", sesgos,
  citas y privacidad.
- **Panel de revisión** (`revision.html`): estado de verificación de cada ficha y alertas de la
  validación automática, con descarga en CSV.

## Validez científica

Todo el contenido curado está en `data/*.json`, con fuentes y un estado de verificación
(`pendiente`, `revisar` o `verificado`). El sitio muestra ese estado en cada ficha.
`scripts/validar.mjs` compara los nombres con GBIF e iNaturalist, cuenta los registros en Nicaragua,
contrasta la categoría UICN, revisa los vínculos y las coordenadas, y genera `reportes/validacion.md`.

Para revisar y aprobar contenido, lee **[docs/GUIA-VERIFICACION.md](docs/GUIA-VERIFICACION.md)**.
El formato de cada archivo está en **[docs/ESQUEMA-DATOS.md](docs/ESQUEMA-DATOS.md)**.

## Sitio publicado

**https://saulfer2102.github.io/atlas-vivo-nicaragua/** (GitHub Pages)

## Ver el sitio en tu computadora

Es un sitio estático: no hay que compilar nada ni hace falta un servidor propio. Pero el navegador no
deja leer los archivos `data/*.json` si abres `index.html` con doble clic, así que hace falta un
servidor local:

```bash
cd atlas-vivo-nicaragua
python3 -m http.server 8000
# abre http://localhost:8000
```

## Publicarlo gratis con GitHub Pages

1. En GitHub, ve a **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, luego la rama (por ejemplo `main`) y la carpeta `/ (root)`.
3. Guarda. En uno o dos minutos el sitio estará en `https://<usuario>.github.io/atlas-vivo-nicaragua/`.

## Estructura

```
index.html, explorar.html, especies.html, especie.html, areas.html, area.html,
fuentes.html, revision.html, ninos/index.html
assets/css/      estilos (styles.css, ninos.css)
assets/js/       módulos: config, common, api (GBIF/iNat/eBird/STRI), geo, datos y uno por página
data/            contenido curado (JSON), índice de peces STRI y capas geográficas
scripts/         validar.mjs (validación) y construir_geo.py (límites municipales)
reportes/        resultados de la validación
docs/            esquema de datos y guía de verificación
```

## Configuración

`assets/js/config.js` tiene el nombre del sitio, la URL del repositorio (para "Reportar un error"),
los identificadores de Nicaragua en iNaturalist y GBIF, y el centro del mapa.
No pongas ahí una clave personal de eBird si el sitio es público: cada visitante puede guardar la
suya en su navegador desde *Explorar → eBird en vivo*.

## Fuentes de datos y créditos

- [GBIF](https://www.gbif.org): ocurrencias, taxonomía y mapas de densidad.
- [iNaturalist](https://www.inaturalist.org): observaciones de grado de investigación, fotos
  (licencias CC, con autoría en cada imagen) y resúmenes de Wikipedia.
- [eBird](https://ebird.org) (Cornell Lab of Ornithology): vía GBIF (*EOD – eBird Observation
  Dataset*) y API 2.0.
- [Smithsonian Tropical Research Institute](https://biogeodb.stri.si.edu/caribbean/es/pages):
  *Shorefishes of the Greater Caribbean* (Robertson y Van Tassell, 2019) y *Shorefishes of the
  Tropical Eastern Pacific* (Robertson y Allen, 2015).
- Mapas base: OpenStreetMap, Esri y OpenTopoMap. Límites: geoBoundaries (ODbL). Lagos y países
  vecinos: Natural Earth. Geocodificación: Nominatim. Altitud: Open-Meteo.

El código no usa dependencias aparte de [Leaflet](https://leafletjs.com) (desde CDN) y fuentes de
Google Fonts.
