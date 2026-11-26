# Guía de verificación científica

Esta guía es para la persona (o equipo) que revisa y aprueba el contenido del **Atlas Vivo de Nicaragua**.

## 1. Qué hay que verificar

El sitio tiene dos tipos de información:

| Tipo | Dónde está | ¿Necesita revisión? |
|------|-----------|---------------------|
| **Contenido curado** (fichas de especies, áreas protegidas, regiones, enciclopedia infantil) | `data/especies.json`, `data/areas.json`, `data/regiones.json`, `data/ninos.json` | **Sí.** Redactado a partir de fuentes; debe revisarse antes de marcarse como verificado. |
| **Datos en vivo** (especies probables, conteos, fotos, mapas) | Se consultan en el momento a GBIF, iNaturalist, eBird y STRI | No se editan aquí: dependen de la calidad de esos repositorios. Revisa que el *método* explicado en `fuentes.html` sea correcto. |

Cada registro curado tiene un bloque:

```json
"verificacion": { "estado": "pendiente", "revisor": "", "fecha": "", "notas": "" }
```

- `pendiente` → aún no revisado (el sitio muestra "○ Pendiente de verificación").
- `revisar` → hay una duda concreta anotada en `notas` (el sitio muestra "! En revisión").
- `verificado` → aprobado (el sitio muestra "✓ Verificado" con tu nombre y la fecha).

## 2. Flujo de trabajo recomendado

1. **Corre la validación automática** (opcional pero útil):
   ```bash
   node scripts/validar.mjs
   ```
   Genera `reportes/validacion.md` con alertas por registro: nombres no reconocidos o sinónimos en GBIF, familias que no coinciden, categoría UICN distinta de la que reporta iNaturalist, especies sin registros en Nicaragua, coordenadas de áreas fuera del departamento declarado, vínculos rotos, campos faltantes, etc.
   También rellena `ids.gbif` e `ids.inat` en cada especie (esto acelera el sitio).

2. **Abre el panel de revisión** del sitio (`revision.html`). Filtra por estado o por "Solo con alertas automáticas". Cada fila tiene enlaces directos a GBIF, iNaturalist y la Lista Roja de la UICN. Puedes descargar la tabla en CSV para trabajar en una hoja de cálculo.

3. **Revisa cada ficha** comparando con fuentes primarias. Lista de comprobación sugerida para especies:
   - [ ] Nombre científico aceptado y autoría (autoridad taxonómica del grupo).
   - [ ] Nombres comunes usados en Nicaragua (y en lenguas originarias si aplica).
   - [ ] Categoría UICN global vigente (iucnredlist.org) y apéndice CITES (checklist.cites.org).
   - [ ] Endemismo (¿realmente exclusiva de Nicaragua?).
   - [ ] Regiones, hábitats y rango altitudinal en Nicaragua.
   - [ ] Descripción, identificación y ecología sin errores.
   - [ ] Amenazas actuales y estado de conservación local (vedas de MARENA).
   - [ ] El dato curioso es verificable.
   - [ ] Las fuentes existen y respaldan lo que se afirma.
   - [ ] Áreas protegidas donde está documentada (`areas`).

   Para áreas protegidas:
   - [ ] Nombre oficial y categoría de manejo según el SINAP / MARENA.
   - [ ] Año de declaratoria y norma (decreto o ley).
   - [ ] Superficie (anota la fuente en `nota_area` si las cifras varían).
   - [ ] Designaciones internacionales (Ramsar con su número de sitio, Reserva de Biosfera UNESCO).
   - [ ] Departamentos y punto central aproximado (`coordenadas`).
   - [ ] Especies emblemáticas con presencia documentada.

   Para la enciclopedia infantil: exactitud de cada dato *y* lenguaje adecuado para 6–12 años.

4. **Edita el JSON** (en GitHub puedes hacerlo desde el navegador con el ícono del lápiz):
   - Corrige el texto que haga falta.
   - Cambia `"estado"` a `"verificado"`, pon tu nombre en `"revisor"` y la fecha `AAAA-MM-DD` en `"fecha"`.
   - Si queda una duda, usa `"revisar"` y explica en `"notas"`.

5. **Guarda (commit)**. Si el sitio está en GitHub Pages, se actualiza en uno o dos minutos.

## 3. Consejos para editar JSON sin romperlo

- Las cadenas van entre comillas dobles `"..."`. Si necesitas comillas dentro del texto, usa comillas tipográficas « » o “ ”.
- No dejes una coma después del último elemento de una lista u objeto.
- Valida el archivo antes de guardar, por ejemplo con `python3 -m json.tool data/especies.json > /dev/null` o pegándolo en https://jsonlint.com.
- `node scripts/validar.mjs --sin-red` revisa estructura y vínculos sin conectarse a internet.

## 4. Agregar una especie nueva

1. Copia una ficha existente del mismo grupo en `data/especies.json` y cambia el `id` (minúsculas y guiones, único).
2. Completa todos los campos obligatorios (ver `docs/ESQUEMA-DATOS.md`) y deja `"estado": "pendiente"`.
3. Si quieres que aparezca como emblemática de una región o un área, agrega su `id` en `especies_emblematicas` de `data/regiones.json` o de `data/areas.json`.
4. Corre `node scripts/validar.mjs` para obtener sus identificadores de GBIF e iNaturalist.

## 5. Fuentes de referencia recomendadas

- Lista Roja de la UICN — https://www.iucnredlist.org
- CITES (apéndices) — https://checklist.cites.org
- GBIF — https://www.gbif.org · iNaturalist — https://www.inaturalist.org · eBird — https://ebird.org
- Aves: Clements/eBird Taxonomy; *Guía de campo de las aves de Nicaragua*.
- Anfibios: Amphibian Species of the World — https://amphibiansoftheworld.amnh.org
- Reptiles: The Reptile Database — https://reptile-database.reptarium.cz
- Peces: Eschmeyer's Catalog of Fishes; STRI Shorefishes (Caribe y Pacífico); FishBase.
- Plantas: Plants of the World Online (Kew); Tropicos / *Flora de Nicaragua* (Missouri Botanical Garden).
- Áreas protegidas: MARENA / SINAP; Servicio de Información sobre Sitios Ramsar — https://rsis.ramsar.org; UNESCO MAB; Protected Planet — https://www.protectedplanet.net/country/NIC
