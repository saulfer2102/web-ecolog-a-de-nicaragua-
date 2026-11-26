# Esquema de datos

Todo el contenido curado del sitio vive en `data/` como archivos JSON. Así se puede revisar,
corregir y versionar sin tocar el código. Este documento describe cada campo.

> **Regla de oro:** ningún dato se considera verificado hasta que una persona revisora lo marque
> como tal en `verificacion.estado`. El sitio muestra una etiqueta "Pendiente de verificación"
> en todo registro que no esté en estado `verificado`.

## Identificadores compartidos

### Regiones (`regiones`)

| id               | Significado                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `pacifico`       | Región del Pacífico (Chinandega, León, Managua, Masaya, Carazo, Granada, Rivas) |
| `centro-norte`   | Región Central y Norte (Nueva Segovia, Madriz, Estelí, Jinotega, Matagalpa, Boaco, Chontales) |
| `caribe`         | Región del Caribe (RACCN, RACCS, Río San Juan)                              |
| `lagos`          | Grandes lagos, lagunas cratéricas y ríos (agua dulce)                       |
| `marino-pacifico`| Océano Pacífico y costa pacífica (incluye manglares y esteros)              |
| `marino-caribe`  | Mar Caribe, cayos, arrecifes y costa caribeña                               |

### Grupos (`grupo`)

`aves`, `mamiferos`, `reptiles`, `anfibios`, `peces`, `invertebrados`, `plantas`, `hongos`

### Categorías UICN (`uicn`)

`EX`, `EW`, `CR`, `EN`, `VU`, `NT`, `LC`, `DD`, `NE` (categoría **global** de la Lista Roja de la UICN).

### Estado de verificación (`verificacion.estado`)

| estado       | Significado                                                        |
|--------------|--------------------------------------------------------------------|
| `pendiente`  | Redactado, aún sin revisión humana experta                         |
| `revisar`    | Hay una duda concreta anotada en `notas`                           |
| `verificado` | Revisado y aprobado por la persona revisora (anotar nombre y fecha)|

```json
"verificacion": { "estado": "pendiente", "revisor": "", "fecha": "", "notas": "" }
```

## `data/especies.json`

```json
{
  "meta": { "version": "0.1.0", "actualizado": "AAAA-MM-DD" },
  "especies": [ { ...especie... } ]
}
```

| Campo                    | Tipo            | Obligatorio | Descripción |
|--------------------------|-----------------|-------------|-------------|
| `id`                     | texto (slug)    | sí          | Identificador único, minúsculas y guiones. Ej. `guardabarranco` |
| `nombre_cientifico`      | texto           | sí          | Binomio aceptado (sin autor). Ej. `Eumomota superciliosa` |
| `autoria`                | texto           | no          | Autor y año. Ej. `(Sandbach, 1837)` |
| `nombres_comunes`        | lista de texto  | sí          | Primero el más usado en Nicaragua |
| `nombre_ingles`          | texto           | no          | Nombre común en inglés |
| `grupo`                  | texto           | sí          | Ver tabla de grupos |
| `clase`, `orden`, `familia` | texto        | sí          | Taxonomía superior |
| `simbolo_nacional`       | texto           | no          | Ej. `Ave nacional de Nicaragua` |
| `endemica`               | booleano        | sí          | `true` solo si es endémica **de Nicaragua** |
| `nota_endemismo`         | texto           | no          | Ej. `Endémica del Volcán Mombacho` o `Endémica regional de Mesoamérica` |
| `uicn`                   | texto           | sí          | Categoría global UICN |
| `cites`                  | texto           | no          | `I`, `II`, `III` o vacío |
| `migratoria`             | booleano        | no          | `true` si es visitante estacional |
| `regiones`               | lista           | sí          | Ids de región donde está presente |
| `habitats`               | lista de texto  | sí          | Ej. `bosque seco tropical`, `manglar` |
| `altitud_m`              | [min, max]      | no          | Rango altitudinal en Nicaragua (m s. n. m.) |
| `descripcion`            | texto           | sí          | 80–150 palabras. Qué es, aspecto, por qué importa |
| `identificacion`         | texto           | sí          | Rasgos para reconocerla en el campo |
| `ecologia`               | texto           | sí          | Alimentación, comportamiento, reproducción, rol ecológico |
| `distribucion_nicaragua` | texto           | sí          | Dónde se encuentra en el país |
| `amenazas`               | texto           | sí          | Principales amenazas y estado de conservación local |
| `dato_curioso`           | texto           | sí          | Un dato llamativo y verificable |
| `areas`                  | lista           | no          | Ids de `data/areas.json` donde está documentada |
| `fuentes`                | lista           | sí          | `[{ "cita": "...", "url": "..." }]` (mínimo 2) |
| `ids`                    | objeto          | auto        | `{ "gbif": 123, "inat": 456 }` (lo rellena `scripts/validar.mjs`) |
| `verificacion`           | objeto          | sí          | Ver arriba |

## `data/areas.json`

```json
{ "meta": {...}, "areas": [ { ...area... } ] }
```

| Campo                    | Tipo           | Obligatorio | Descripción |
|--------------------------|----------------|-------------|-------------|
| `id`                     | slug           | sí          | Ej. `bosawas` |
| `nombre`                 | texto          | sí          | Nombre oficial |
| `tipo`                   | texto          | sí          | `area_protegida` o `sitio_ecologico` |
| `categoria`              | texto          | sí          | Categoría de manejo del SINAP (ej. `Reserva Natural`) o tipo de sitio (ej. `Lago`) |
| `designaciones`          | lista de texto | no          | Ej. `Reserva de Biosfera (UNESCO, 1997)`, `Sitio Ramsar (2001)` |
| `departamentos`          | lista de texto | sí          | Departamentos o regiones autónomas |
| `region`                 | texto          | sí          | Id de región principal |
| `coordenadas`            | [lat, lon]     | sí          | Punto aproximado central (WGS84, 4 decimales) |
| `area_ha`                | número o null  | no          | Superficie aproximada en hectáreas |
| `nota_area`              | texto          | no          | Aclaración sobre la cifra (fuentes discrepan, etc.) |
| `anio_declaracion`       | número o null  | no          | Año de la primera declaratoria |
| `ecosistemas`            | lista de texto | sí          | |
| `descripcion`            | texto          | sí          | 80–150 palabras |
| `importancia`            | texto          | sí          | Por qué es ecológicamente importante |
| `especies_emblematicas`  | lista          | sí          | Ids de `data/especies.json` |
| `otras_especies`         | lista de texto | no          | Nombres científicos relevantes que no están en el catálogo |
| `visitar`                | texto          | no          | Información práctica general (sin precios ni horarios que caduquen) |
| `fuentes`                | lista          | sí          | `[{ "cita": "...", "url": "..." }]` |
| `verificacion`           | objeto         | sí          | |

## `data/regiones.json`

```json
{
  "regiones": [ { "id": "pacifico", "nombre": "...", "descripcion": "...", "ecosistemas": [...],
                  "clima": "...", "especies_emblematicas": [...], "color": "#hex" } ],
  "lugares": [ { "nombre": "Granada", "departamento": "Granada", "coordenadas": [11.93, -85.956] } ]
}
```

## `data/ninos.json`

Contenido de *Mi Primera Enciclopedia de la Naturaleza*. Lenguaje para primaria (6–12 años).

```json
{
  "temas":     [ { "id", "titulo", "emoji", "color", "resumen", "secciones": [{ "titulo", "texto" }],
                   "sabias_que": [..], "actividad": "...", "verificacion": {...} } ],
  "fichas":    [ { "id", "especie_id", "nombre", "emoji", "tipo", "texto", "donde_vive", "que_come",
                   "sabias_que", "como_ayudar", "verificacion": {...} } ],
  "glosario":  [ { "palabra", "definicion" } ],
  "quiz":      [ { "pregunta", "opciones": [..], "correcta": 0, "explicacion" } ],
  "adivinanzas": [ { "pistas": [..], "respuesta": "especie_id" } ],
  "promesas":  [ "texto" ]
}
```

## Datos generados automáticamente

| Archivo                          | Origen                                             |
|----------------------------------|----------------------------------------------------|
| `data/stri-peces.json`           | Listas sistemáticas de *Shorefishes of the Greater Caribbean* y *Shorefishes of the Tropical Eastern Pacific* (STRI) |
| `data/geo/departamentos.geojson` | geoBoundaries (OSM, ODbL) — municipios disueltos por departamento |
| `data/geo/municipios.geojson`    | geoBoundaries (OSM, ODbL), simplificado            |
