/**
 * Origen flotante de escena: el ancla que mantiene pequeño lo que se empaqueta
 * a `Float32Array`, sea cual sea la magnitud absoluta del documento.
 *
 * ## El problema que resuelve
 *
 * `Float32Array` tiene 24 bits de mantisa. A magnitud de dibujo ~2·10⁶ (UTM
 * mexicano típico) el espaciado de representación (ulp) ya son 4 cm; a 10⁷,
 * 37,5 cm — medido en `docs/cad/evidence/large-coordinate-precision.json` y
 * reproducible con `scripts/large-coordinate-precision-probe.mts`. Una planta
 * local (mm, magnitud de cientos a miles) nunca lo sufre: el problema aparece
 * sólo con coordenadas absolutas grandes (topografía, DWG/DXF georreferenciado).
 *
 * ## Por qué CENTROIDE y por qué REDONDEADO
 *
 * El origen tiene que caer CERCA de donde está el documento —si no, restarlo
 * no ayuda: se cambia una magnitud grande por otra— así que se ancla al
 * centroide de sus límites, no a un punto fijo como (0,0). Y tiene que ser
 * ESTABLE frente a ediciones ordinarias: si el origen se recalculara con cada
 * `invalidate()`, cada edición desplazaría el origen y dejaría teselados
 * cacheados con un origen distinto al vigente, sin que la caché supiera que
 * tiene que invalidarlos (la caché de `tessellation-cache.ts` sólo sabe
 * invalidar por entidad, no por cambio de origen). Redondear a una rejilla
 * gruesa (`CAD_RENDER_ORIGIN_GRID`) resuelve las dos cosas a la vez: el
 * origen sólo se mueve cuando el documento se aleja lo bastante como para que
 * uno nuevo importe, así que una edición ordinaria —mover un muro, añadir una
 * puerta— nunca lo toca.
 *
 * ## Por qué 100 km no hacen falta
 *
 * Con la rejilla de 100 m, el peor caso (centroide justo en el borde de una
 * celda) deja un residuo de hasta 50 m antes de sumar el propio radio del
 * dibujo alrededor de su centroide. Aun a 100 m de magnitud total, el ulp de
 * float32 es del orden de 6 micras — muy por debajo de cualquier tolerancia
 * de dibujo de este producto. No hace falta apurar la rejilla más fina que
 * eso; hacerlo sólo aumentaría cuántas ediciones mueven el origen.
 *
 * Puro: sin THREE y sin DOM, igual que `tessellation-cache.ts`.
 */
import type { CadBounds } from "../entity-runtime";

export interface CadRenderOrigin {
  readonly x: number;
  readonly y: number;
}

export const CAD_RENDER_ORIGIN_ZERO: CadRenderOrigin = { x: 0, y: 0 };

/** Rejilla de redondeo, en unidades de dibujo (mm). Ver cabecera del módulo. */
export const CAD_RENDER_ORIGIN_GRID = 100_000;

/**
 * Origen flotante para los límites dados: el centroide, redondeado a la
 * rejilla. `null` o límites no finitos (documento vacío) dan el origen CERO
 * — un documento sin entidades no tiene nada que anclar, y cero es el
 * comportamiento de hoy, sin origen flotante.
 */
export function cadRenderOriginFromBounds(
  bounds: CadBounds | null,
): CadRenderOrigin {
  if (!bounds) return CAD_RENDER_ORIGIN_ZERO;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy))
    return CAD_RENDER_ORIGIN_ZERO;
  return {
    x: Math.round(cx / CAD_RENDER_ORIGIN_GRID) * CAD_RENDER_ORIGIN_GRID,
    y: Math.round(cy / CAD_RENDER_ORIGIN_GRID) * CAD_RENDER_ORIGIN_GRID,
  };
}

/** Unión de dos cajas; la izquierda puede faltar (primer elemento). */
export function unionCadBounds(
  into: CadBounds | null,
  next: CadBounds,
): CadBounds {
  if (!into) return { ...next };
  return {
    minX: Math.min(into.minX, next.minX),
    minY: Math.min(into.minY, next.minY),
    maxX: Math.max(into.maxX, next.maxX),
    maxY: Math.max(into.maxY, next.maxY),
  };
}

/**
 * Los ids que viven en un ESPACIO PAPEL, que son los que NO deben anclar el
 * origen flotante.
 *
 * ─── Por qué esto importa tanto ────────────────────────────────────────────
 *
 * El anfitrión del render entrega al pipeline TODAS las entidades del
 * documento y limita a espacio modelo únicamente el ORDEN DE DIBUJO. Una
 * lámina de papel vive en coordenadas de hoja (0…297 mm) y un documento
 * georreferenciado en UTM (~2·10⁶): juntarlas en unos mismos límites pone el
 * centroide a medio camino, en torno a 10⁶, y el origen flotante deja de estar
 * cerca de lo que se dibuja.
 *
 * No es una degradación teórica. Medido con la sonda de precisión
 * (`docs/cad/evidence/large-coordinate-precision.json`, fila «UTM con lámina
 * de papel») y con el gate de regresión
 * (`lib/cad/verification/large-coordinates.spec.ts`): el error de empaquetado
 * a `Float32Array` pasaba de 2.9 µm a 2.1 cm de unidad de dibujo — 7243 veces
 * peor— por el solo hecho de que el documento tuviera una hoja. Es exactamente
 * el caso de un topógrafo que abre su levantamiento y le añade una lámina para
 * imprimirlo.
 *
 * Los límites de CULLING siguen incluyéndolo todo: ahí el papel no molesta, y
 * recortarlos sería cambiar QUÉ se dibuja, que es otro asunto.
 */
export function cadPaperSpaceEntityIds(
  document: { paperSpaces?: ReadonlyArray<{ entityIds: readonly string[] }> } | null | undefined,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const paperSpace of document?.paperSpaces ?? [])
    for (const id of paperSpace.entityIds) ids.add(id);
  return ids;
}
