// Configuración general del sitio. Edita estos valores según tu despliegue.
export const CONFIG = {
  nombreSitio: 'Atlas Vivo de Nicaragua',
  // Repositorio del proyecto (se usa para el enlace "Reportar un error").
  repoUrl: 'https://github.com/saulfer2102/atlas-vivo-nicaragua',

  // iNaturalist: identificador del lugar "Nicaragua".
  inatPlaceId: 6925,
  // GBIF: código de país ISO.
  gbifPais: 'NI',
  // GBIF: conjunto de datos "EOD – eBird Observation Dataset" (datos de eBird publicados en GBIF).
  gbifEbirdDataset: '4fa7b334-ce0d-4e88-aaae-2e0c138d049e',

  // eBird API 2.0: cada visitante puede guardar su propia clave en su navegador desde la página Explorar.
  // NO pongas aquí una clave personal si el sitio es público: quedaría expuesta.
  ebirdApiKey: '',

  // Centro y zoom inicial del mapa.
  centro: [12.75, -85.2],
  zoom: 7,
  limites: [[10.6, -87.8], [15.1, -82.5]],

  // Radio de búsqueda por defecto (km) en Explorar.
  radioPorDefecto: 10,
};
