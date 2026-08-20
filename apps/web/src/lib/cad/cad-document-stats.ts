/**
 * Recuento de entidades por tipo — lo que consumen paneles y telemetría.
 *
 * Sale de `cad-document.ts` por el trinquete de tamaño: aquel archivo está a
 * cuatro líneas de su techo y el esquema 9 necesita ese sitio para declarar
 * `frozen` y `layerStates`. Es aritmética pura sobre el documento; se reexporta
 * desde `cad-document.ts` para que ningún consumidor cambie de import.
 */
import type { CadDocument, CadEntity } from "./cad-document";

export function cadDocumentStats(doc: CadDocument): Record<CadEntity["type"], number> {
  const stats = {
    box: 0, station: 0, text: 0, dimension: 0, connector: 0, line: 0,
    polyline: 0, circle: 0, arc: 0, ellipse: 0, spline: 0, mtext: 0,
    hatch: 0, mleader: 0, insert: 0,
    point: 0, xline: 0, ray: 0, solid: 0, wipeout: 0, image: 0,
    attdef: 0, table: 0,
    solid3d: 0, region: 0,
    wall: 0,
    opening: 0,
  } satisfies Record<CadEntity["type"], number>;
  for (const e of doc.entities) stats[e.type]++;
  return stats;
}
