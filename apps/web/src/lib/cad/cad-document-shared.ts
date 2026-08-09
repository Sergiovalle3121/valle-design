/**
 * Constantes y ayudas COMPARTIDAS entre el documento canónico y su adaptador
 * heredado.
 *
 * Existe por una razón mecánica y una arquitectónica.
 *
 * La mecánica: `cad-document.ts` está en el trinquete de tamaño y sólo puede
 * encoger, así que el adaptador heredado (`layoutToCadDocument` /
 * `cadDocumentToLayout`) se mudó a su propio módulo. Ese módulo necesita las
 * mismas constantes de capa y los mismos ayudantes de orden.
 *
 * La arquitectónica, que es la que manda: el adaptador NO puede importar
 * VALORES de `cad-document.ts`, porque `cad-document.ts` reexporta el adaptador
 * y eso cerraría un ciclo de imports. `tsc --noEmit` no ve esos ciclos —los
 * tipos se borran al compilar— y el producto revienta al cargar con «Cannot
 * access X before initialization». Este módulo es la hoja del grafo: no importa
 * nada del CAD **en tiempo de ejecución**, así que ambos lados pueden depender
 * de él sin cerrar nada. El único import que tiene es `import type`, y eso se
 * borra al compilar.
 */
import type { CadStyleTable } from "./cad-document";

/** Prefijo de capa por defecto cuando un objeto no declara ninguna. */
export const DEFAULT_LAYER_ID = "0";

/** v3: modelo profesional extensible con migración aditiva desde v1/v2. */
export const CAD_DOCUMENT_SCHEMA = 3;

/** Capa estable de las colocaciones de estación. */
export const STATIONS_LAYER = "Stations";

/** Prefijo estable del id de conector (from→to) para round-trip determinista. */
export const CONNECTOR_PREFIX = "conn:";

/**
 * Capa que el adaptador heredado impone a todo conector, porque el modelo
 * histórico no la modela. Verla en una proyección significa "no lo sé", no
 * "quiero esta capa" — de ahí que la reproyección conserve la del documento.
 */
export const CONNECTOR_LAYER = "Flow";

export function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function point3(x: number, y: number, z = 0): { x: number; y: number; z: number } {
  return { x, y, z };
}

export function emptyStyles(): CadStyleTable {
  return { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} };
}
