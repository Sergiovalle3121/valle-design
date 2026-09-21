/**
 * CHSPACE — el cálculo puro detrás de «cambiar de espacio conservando el
 * tamaño aparente».
 *
 * ## El problema que resuelve
 *
 * Una lámina de ejecución enseña la MISMA planta en varias ventanas —una sin
 * ejes, otra con ellos— y ADEMÁS lleva anotaciones que viven SÓLO en el papel:
 * un sello, una nube de revisión, una nota que no debe escalar con ninguna
 * ventana. Sin CHSPACE, mover un objeto de un mundo al otro es borrarlo y
 * volver a dibujarlo a mano a la escala nueva — border ese doble dibujo es
 * exactamente para lo que existe un CAD.
 *
 * ## Qué significa «tamaño aparente»
 *
 * Un objeto de 8 m dibujado en el modelo, visto por una ventana a 1:50, mide
 * 160 mm en el papel. CHSPACE hacia el papel multiplica su geometría por ese
 * mismo factor —así que el trazo sigue midiendo 160 mm, ahora como geometría
 * de PAPEL en vez de una proyección de ventana— y CHSPACE hacia el modelo
 * aplica el factor inverso. `cadChspaceScaleFactor` es el número que hay que
 * MEDIR para saber que esto es verdad y no una intención.
 *
 * ## Por qué no reutiliza `viewportTransform` de `paper-space-render.ts`
 *
 * Esa afín es para PINTAR: lleva el eje Y invertido (`d: -factor`), la
 * convención de SVG/PDF, que crecen hacia abajo. La geometría que CHSPACE
 * escribe vuelve a vivir en el documento canónico, donde el eje Y crece hacia
 * ARRIBA en los dos espacios — invertirlo aquí dejaría cada objeto trasladado
 * boca abajo la primera vez que alguien lo editara a mano en papel.
 *
 * ## La esquina que se conserva
 *
 * La transformada hace coincidir la esquina inferior izquierda de
 * `modelBounds` con la de `paperBounds` de la MISMA ventana: es el mismo par
 * de rectángulos que ya declara la ventana para saber qué trozo de modelo
 * dibuja y dónde, así que no hay una segunda fuente de verdad sobre el
 * encuadre. Un objeto que hoy aparece pegado a la esquina de su ventana sigue
 * pegado a la esquina del papel tras CHSPACE.
 */
import type { CadPaperSpace, CadPaperViewport } from "./cad-document";
import type { CadAffine2 } from "./transform2d";
import { unitToMm } from "./paper-space-style";

/** Hacia dónde viaja el objeto. */
export type CadChspaceDirection = "toPaper" | "toModel";

/**
 * `true` si `entityId` ya vive en el PAPEL de esta presentación —está en
 * `space.entityIds`—, que es exactamente el mismo criterio que usa
 * `buildCadPublishPlan` para excluirlo de toda ventana de modelo.
 */
export function cadChspaceCurrentlyInPaper(space: CadPaperSpace, entityId: string): boolean {
  return (space.entityIds ?? []).includes(entityId);
}

/** La dirección que le toca a un objeto: al otro espacio de donde está HOY. */
export function cadChspaceDirectionFor(space: CadPaperSpace, entityId: string): CadChspaceDirection {
  return cadChspaceCurrentlyInPaper(space, entityId) ? "toModel" : "toPaper";
}

/**
 * El factor de escala PURO —sin traslación— que CHSPACE aplica. Es lo que una
 * spec mide para demostrar que la orden hace lo que dice, y no sólo que «no
 * hubo error».
 */
export function cadChspaceScaleFactor(
  viewport: Pick<CadPaperViewport, "scale">,
  unit: string,
  direction: CadChspaceDirection,
): number {
  // mm de papel por unidad de modelo, la MISMA relación que dibuja la ventana.
  const modelToPaper = unitToMm(unit) / Math.max(viewport.scale, 1e-9);
  return direction === "toPaper" ? modelToPaper : 1 / modelToPaper;
}

/**
 * La afín 2×3 completa: escala por `cadChspaceScaleFactor` y traslada para
 * que la esquina `(modelBounds.x, modelBounds.y)` caiga en
 * `(paperBounds.x, paperBounds.y)` — o su inversa exacta hacia el modelo.
 */
export function cadChspaceAffine(
  viewport: CadPaperViewport,
  unit: string,
  direction: CadChspaceDirection,
): CadAffine2 {
  const factor = cadChspaceScaleFactor(viewport, unit, direction);
  const [from, to] =
    direction === "toPaper"
      ? [viewport.modelBounds, viewport.paperBounds]
      : [viewport.paperBounds, viewport.modelBounds];
  return {
    a: factor,
    b: 0,
    c: 0,
    d: factor,
    e: to.x - from.x * factor,
    f: to.y - from.y * factor,
  };
}

/** Añade o retira `entityId` de `space.entityIds`, según hacia dónde viaje. */
export function cadChspaceMembership(
  space: CadPaperSpace,
  entityId: string,
  direction: CadChspaceDirection,
): CadPaperSpace {
  const current = space.entityIds ?? [];
  if (direction === "toPaper")
    return current.includes(entityId) ? space : { ...space, entityIds: [...current, entityId] };
  return current.includes(entityId)
    ? { ...space, entityIds: current.filter((id) => id !== entityId) }
    : space;
}
