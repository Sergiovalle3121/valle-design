/**
 * Modelo de dibujo CAD compartido (WP2a) — interfaces puras del documento de
 * dibujo que necesita el kernel CAD (cad-documents). Viven aquí para que la
 * dirección de dependencia sea siempre line-engineering→cad-documents:
 * `sf-line-layout.entity.ts` (industrial) las importa y RE-exporta, de modo que
 * sus consumidores existentes no notan el traslado. En Fase 3 este archivo se
 * extrae junto con el resto del módulo al producto Design.
 *
 * Solo se mueven las formas que los archivos CAD-puros necesitan (hoy:
 * LayoutAsset, usada por sf-cad-block.entity y CadBlocksService). Connectors,
 * annotations, layers, cells y snapshots siguen siendo vocabulario del layout
 * industrial y permanecen en line-engineering.
 */

/** A non-station equipment/asset dropped on the plan (Fase 5). */
export interface LayoutAsset {
  id: string; // client-generated id
  kind: string; // workbench | conveyor | rack | robot | aoi | oven | printer | wall | zone | label
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  layer?: string; // CAD layer id this asset belongs to (Fase 66)
  group?: string; // CAD group id (Ctrl+G, ADR §223) — members move/copy as one
  shape?: 'rect' | 'circle'; // geometría real: 'circle' se dibuja/exporta redondo (CAD-NEXT-020). Ausente = caja.
  tags?: string[];
}
