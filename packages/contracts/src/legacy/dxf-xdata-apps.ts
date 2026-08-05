/**
 * NOMBRES DE APLICACIÓN XDATA DEL DXF — SÓLO LECTURA.
 *
 * Estos tres nombres corresponden al nombre de producto ANTERIOR y ya no se
 * escriben: el exportador emite los de `../dxf-xdata-apps.ts`. Siguen aquí
 * porque viajan DENTRO de cada archivo exportado hasta hoy, y esos archivos no
 * viven en el repositorio: viven en los discos de los clientes y en lo que ya
 * intercambiaron con terceros.
 *
 * Retirarlos del IMPORTADOR —no del exportador, eso ya está hecho— dejaría
 * ilegible todo ese material. Un round-trip generado no lo detectaría, porque
 * sólo produce archivos nuevos.
 *
 * El golden `apps/web/src/lib/cad/dxf-xdata-golden.spec.ts` congela un
 * archivo real con estos nombres y exige que el importador lo siga leyendo.
 * Ver `README.md` de esta carpeta para la condición de retiro.
 */

/** XDATA de cotas semánticas (DIMENSION). Histórico: sólo lectura. */
export const LEGACY_DXF_XDATA_APP_DIMENSION = "AXOS_DIM" as const;

/** XDATA de directrices múltiples (MLEADER). Histórico: sólo lectura. */
export const LEGACY_DXF_XDATA_APP_MLEADER = "AXOS_MLEADER" as const;

/** XDATA de bloques y sus atributos (BLOCK/INSERT). Histórico: sólo lectura. */
export const LEGACY_DXF_XDATA_APP_BLOCK = "AXOS_BLOCK" as const;

/**
 * Los tres nombres históricos, en el orden en que aparecían en la tabla
 * `APPID` de los archivos que los llevan.
 */
export const LEGACY_DXF_XDATA_APPS = [
  LEGACY_DXF_XDATA_APP_DIMENSION,
  LEGACY_DXF_XDATA_APP_MLEADER,
  LEGACY_DXF_XDATA_APP_BLOCK,
] as const;

export type LegacyDxfXdataApp = (typeof LEGACY_DXF_XDATA_APPS)[number];
