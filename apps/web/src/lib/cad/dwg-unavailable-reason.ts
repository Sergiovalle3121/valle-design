/**
 * LA RAZÓN por la que un `.dwg` no entra cuando ninguna puerta está abierta.
 *
 * Vive en un módulo de una sola constante, sin dependencias, porque la leen
 * DOS módulos que no pueden verse entre sí: `interop-provider.ts` (el
 * proveedor DWG sin licencia, que arrastra el importador DXF entero) y
 * `document-import-validation.ts` (la puerta ligera del tablero, que existe
 * precisamente para no descargar ese importador antes de que haga falta).
 * Importar la razón desde el proveedor habría metido 539 KB de fuente en el
 * tablero para poder decir una frase.
 *
 * Describe esta vía cerrada sin negar el lector propio: la beta limitada
 * entra por `document-import-client` sólo con sus banderas de build.
 */
export const DWG_UNAVAILABLE_REASON =
  "DWG no está habilitado en esta vía. Exporta tu dibujo a DXF desde tu CAD " +
  "para importarlo aquí y revisa el informe de pérdidas. La lectura DWG propia " +
  "es una beta limitada que depende de la configuración del despliegue; " +
  "la exportación DWG no está disponible.";
