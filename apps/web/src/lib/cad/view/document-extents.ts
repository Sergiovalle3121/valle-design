/**
 * Envolvente de un documento — lo que `ZOOM Extensión` y el trazado por
 * extensión necesitan saber.
 *
 * Vive aparte de `view-navigation.ts` a propósito: la navegación es aritmética
 * sobre una vista y no debe arrastrar el registro de entidades entero, que es
 * lo que hay que importar para preguntar por la envolvente de un HATCH o de un
 * INSERT anidado. Separándolo, quien sólo hace zoom no paga el registro.
 *
 * La envolvente sale del REGISTRO de adaptadores, no de una función que mire
 * `entity.start` y `entity.end`: una elipse girada, un arco y un texto con
 * ajuste tienen envolventes que sólo su adaptador sabe calcular, y una versión
 * paralela se quedaría atrás en cuanto llegase un tipo nuevo.
 */
import type { CadDocument } from "../cad-document";
import {
  CAD_ENTITY_REGISTRY,
  type CadBounds,
  type CadEntityRegistry,
} from "../entity-runtime";

function merge(into: CadBounds | null, next: CadBounds): CadBounds {
  if (!into) return { ...next };
  return {
    minX: Math.min(into.minX, next.minX),
    minY: Math.min(into.minY, next.minY),
    maxX: Math.max(into.maxX, next.maxX),
    maxY: Math.max(into.maxY, next.maxY),
  };
}

function usable(bounds: CadBounds | null | undefined): bounds is CadBounds {
  return (
    !!bounds &&
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY)
  );
}

/**
 * Envolvente de una entidad concreta. `null` cuando el tipo no está soportado
 * por el registro —una entidad opaca importada— o su envolvente no es finita.
 */
export function cadEntityExtents(
  document: CadDocument,
  entityId: string,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
): CadBounds | null {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (!entity || !registry.supports(entity)) return null;
  const bounds = registry.adapter(entity).bounds.bounds(entity, document);
  return usable(bounds) ? bounds : null;
}

export interface CadDocumentExtentsOptions {
  /** Capas invisibles cuya geometría NO entra en la envolvente. */
  hiddenLayerIds?: ReadonlySet<string>;
  registry?: CadEntityRegistry;
}

/**
 * Envolvente de todo lo dibujado en el espacio modelo.
 *
 * Las capas apagadas quedan fuera, igual que en AutoCAD: encuadrar «todo»
 * incluyendo lo que no se ve dejaría el dibujo visible en una esquina, y es un
 * comportamiento que la gente nota inmediatamente.
 */
export function cadDocumentExtents(
  document: CadDocument,
  options: CadDocumentExtentsOptions = {},
): CadBounds | null {
  const registry = options.registry ?? CAD_ENTITY_REGISTRY;
  const hidden =
    options.hiddenLayerIds ??
    new Set(document.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
  let bounds: CadBounds | null = null;
  for (const entity of document.entities) {
    if (entity.layer && hidden.has(entity.layer)) continue;
    if (!registry.supports(entity)) continue;
    const single = registry.adapter(entity).bounds.bounds(entity, document);
    if (usable(single)) bounds = merge(bounds, single);
  }
  return bounds;
}
