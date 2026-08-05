/**
 * NOMBRES DE APLICACIÓN XDATA DEL DXF — los que se ESCRIBEN hoy.
 *
 * Valle Design es un sistema de diseño arquitectónico 2D: compite con AutoCAD
 * de Autodesk y, como él, intercambia dibujos en DXF. El formato DXF no modela
 * cotas asociativas, directrices ni bloques con atributos con toda la semántica
 * que el editor necesita, así que esa información viaja en XDATA registrada
 * bajo un nombre de aplicación (tabla `APPID` + código de grupo 1001).
 *
 * Estos son los nombres que emite el exportador. Los archivos ya exportados con
 * el nombre de producto anterior siguen siendo legibles: ver
 * `legacy/dxf-xdata-apps.ts` y `dxfXdataAppsFor()` más abajo — el importador
 * acepta AMBOS, el exportador escribe SÓLO estos.
 */

import {
  LEGACY_DXF_XDATA_APP_BLOCK,
  LEGACY_DXF_XDATA_APP_DIMENSION,
  LEGACY_DXF_XDATA_APP_MLEADER,
} from "./legacy/dxf-xdata-apps";

/** XDATA de cotas semánticas (DIMENSION). */
export const DXF_XDATA_APP_DIMENSION = "VALLE_DIM" as const;

/** XDATA de directrices múltiples (MLEADER). */
export const DXF_XDATA_APP_MLEADER = "VALLE_MLEADER" as const;

/** XDATA de bloques y sus atributos (BLOCK/INSERT). */
export const DXF_XDATA_APP_BLOCK = "VALLE_BLOCK" as const;

/**
 * Los tres nombres, en el orden en que se registran en la tabla `APPID` del
 * DXF exportado. El orden es formato: cambiarlo altera los bytes del archivo.
 */
export const DXF_XDATA_APPS = [
  DXF_XDATA_APP_DIMENSION,
  DXF_XDATA_APP_MLEADER,
  DXF_XDATA_APP_BLOCK,
] as const;

export type DxfXdataApp = (typeof DXF_XDATA_APPS)[number];

/** Rol semántico de una marca XDATA, con independencia del nombre escrito. */
export type DxfXdataRole = "dimension" | "mleader" | "block";

/**
 * Nombres ACEPTADOS por el importador para un rol: el vigente primero, después
 * el histórico. Un archivo exportado antes del cambio de nombre de producto
 * debe seguir abriéndose con la misma semántica que el día que se guardó.
 */
export const DXF_XDATA_APPS_BY_ROLE: Record<DxfXdataRole, readonly string[]> = {
  dimension: [DXF_XDATA_APP_DIMENSION, LEGACY_DXF_XDATA_APP_DIMENSION],
  mleader: [DXF_XDATA_APP_MLEADER, LEGACY_DXF_XDATA_APP_MLEADER],
  block: [DXF_XDATA_APP_BLOCK, LEGACY_DXF_XDATA_APP_BLOCK],
};

/** ¿Es `value` una marca XDATA (código 1001) legible para ese rol? */
export function isDxfXdataApp(role: DxfXdataRole, value: string): boolean {
  return DXF_XDATA_APPS_BY_ROLE[role].includes(value);
}
