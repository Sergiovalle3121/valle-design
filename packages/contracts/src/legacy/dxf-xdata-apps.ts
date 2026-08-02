/**
 * NOMBRES DE APLICACIÓN XDATA DEL DXF — identificadores de FORMATO DE ARCHIVO.
 *
 * El DXF que exporta Valle Design conserva la semántica que AutoCAD no
 * modela (cotas asociativas, directrices, bloques con atributos) en XDATA
 * registrada bajo un nombre de aplicación (tabla `APPID` + código de grupo
 * 1001). Estos tres nombres viajan DENTRO de cada archivo exportado.
 *
 * Consecuencia: no viven en el repositorio, viven en los discos de los
 * clientes y en los archivos que ya intercambiaron con terceros. Renombrarlos
 * a la vez en exportador e importador se ve verde en cualquier round-trip
 * generado y, aun así, deja ilegible todo lo exportado hasta hoy.
 *
 * El golden `apps/web/src/lib/cad/dxf-xdata-golden.spec.ts` congela un
 * archivo real con estos nombres y exige que el importador lo siga leyendo.
 * Ver `README.md` de esta carpeta para la condición de retiro.
 */

/** XDATA de cotas semánticas (DIMENSION). Valor de formato: NO renombrar. */
export const LEGACY_DXF_XDATA_APP_DIMENSION = "AXOS_DIM" as const;

/** XDATA de directrices múltiples (MLEADER). Valor de formato: NO renombrar. */
export const LEGACY_DXF_XDATA_APP_MLEADER = "AXOS_MLEADER" as const;

/** XDATA de bloques y sus atributos (BLOCK/INSERT). Valor de formato: NO renombrar. */
export const LEGACY_DXF_XDATA_APP_BLOCK = "AXOS_BLOCK" as const;

/**
 * Los tres nombres, en el orden en que se registran en la tabla `APPID` del
 * DXF exportado. El orden también es formato: cambiarlo altera los bytes.
 */
export const LEGACY_DXF_XDATA_APPS = [
  LEGACY_DXF_XDATA_APP_DIMENSION,
  LEGACY_DXF_XDATA_APP_MLEADER,
  LEGACY_DXF_XDATA_APP_BLOCK,
] as const;

export type LegacyDxfXdataApp = (typeof LEGACY_DXF_XDATA_APPS)[number];
