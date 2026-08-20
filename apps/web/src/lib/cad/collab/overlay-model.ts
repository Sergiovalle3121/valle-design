/**
 * Dónde cae cada chincheta y cada cursor ajeno EN PÍXELES, dada la cámara de
 * ahora mismo.
 *
 * ## Por qué esto es un módulo puro y no código dentro del overlay
 *
 * Es la única parte de la colaboración que corre en cada cuadro mientras se
 * panea. Aislarla permite dos cosas que el DOM no deja: probarla en Node con
 * una `CadView` sintética —comprobando que una chincheta se queda pegada a su
 * coordenada al hacer zoom, que es LA propiedad del producto— y medir su coste
 * sin navegador. El overlay que hay encima sólo escribe `style.transform`.
 *
 * ## Las chinchetas de fuera de pantalla
 *
 * Una nota que queda fuera del encuadre no desaparece: se pega al borde por el
 * que se salió, marcada. El motivo es de producto, no estético. El cliente
 * escribe «la escalera no cumple» sobre la escalera; el arquitecto abre el
 * plano encuadrado en la fachada y, sin el marcador de borde, no hay ninguna
 * señal de que exista ese comentario ni hacia dónde ir. La alternativa —una
 * lista lateral— es justo lo que esta ola vino a sustituir.
 *
 * Se distingue con `offscreen` en vez de con una coordenada especial para que
 * el consumidor DECIDA: el marcador de borde no puede abrir la misma tarjeta
 * de detalle en la misma posición, porque no está sobre lo que comenta.
 */
import type { CadPoint2 } from "../cad-document";
import type { CadBounds } from "../entity-runtime";
import type { CadPresencePeer } from "./presence";

/** Margen desde el borde del lienzo al que se pegan los marcadores de fuera. */
export const CAD_COLLAB_EDGE_MARGIN_PX = 18;

export interface CadCollabViewportSize {
  widthPx: number;
  heightPx: number;
}

/** Proyección inyectada: `CadViewController.worldToScreen` en producción. */
export type CadCollabProject = (point: CadPoint2) => CadPoint2;

export interface CadCommentPin {
  id: string;
  world: CadPoint2;
  resolved: boolean;
  /** Orden de llegada dentro del hilo: es el número que se pinta. */
  ordinal: number;
}

export interface CadCommentPinPlacement extends CadCommentPin {
  x: number;
  y: number;
  /** true ⇒ está pegada al borde porque su punto quedó fuera del encuadre. */
  offscreen: boolean;
}

export interface CadPeerCursorPlacement {
  peerId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  offscreen: boolean;
}

/**
 * Coloca las chinchetas. Las que proyectan a un número no finito —cámara
 * degenerada, punto detrás del ojo en perspectiva— se DESCARTAN: pintarlas en
 * el (0,0) del lienzo sería inventarse una posición.
 */
export function placeCadCommentPins(
  project: CadCollabProject,
  size: CadCollabViewportSize,
  pins: readonly CadCommentPin[],
  margin = CAD_COLLAB_EDGE_MARGIN_PX,
): CadCommentPinPlacement[] {
  const placements: CadCommentPinPlacement[] = [];
  for (const pin of pins) {
    const placed = placePoint(project, size, pin.world, margin);
    if (placed) placements.push({ ...pin, ...placed });
  }
  return placements;
}

/** Lo mismo para los cursores ajenos. Un compañero sin cursor no se coloca. */
export function placeCadPeerCursors(
  project: CadCollabProject,
  size: CadCollabViewportSize,
  peers: readonly CadPresencePeer[],
  margin = CAD_COLLAB_EDGE_MARGIN_PX,
): CadPeerCursorPlacement[] {
  const placements: CadPeerCursorPlacement[] = [];
  for (const peer of peers) {
    if (!peer.cursor) continue;
    const placed = placePoint(project, size, peer.cursor, margin);
    if (!placed) continue;
    placements.push({
      peerId: peer.peerId,
      name: peer.name,
      color: peer.color,
      ...placed,
    });
  }
  return placements;
}

/**
 * Rectángulo de dibujo que ocupa el encuadre actual.
 *
 * Es lo que viaja en el latido de presencia para responder «qué está mirando».
 * Se deriva proyectando las dos esquinas HACIA ATRÁS en vez de leerlo de la
 * vista para que valga igual en 2D ortográfico y en 3D en perspectiva, donde
 * la huella visible no es el rectángulo de la vista.
 */
export function cadViewportWorldBounds(
  unproject: (x: number, y: number) => CadPoint2 | null,
  size: CadCollabViewportSize,
): CadBounds | null {
  const corners = [
    unproject(0, 0),
    unproject(size.widthPx, 0),
    unproject(0, size.heightPx),
    unproject(size.widthPx, size.heightPx),
  ].filter((corner): corner is CadPoint2 => !!corner && isFinitePoint(corner));
  if (corners.length < 2) return null;
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}

function placePoint(
  project: CadCollabProject,
  size: CadCollabViewportSize,
  world: CadPoint2,
  margin: number,
): { x: number; y: number; offscreen: boolean } | null {
  const screen = project(world);
  if (!screen || !isFinitePoint(screen)) return null;
  // Un lienzo de tamaño cero (aún sin medir) no puede colocar nada: sin él no
  // hay borde al que pegarse y todo caería en la misma esquina.
  if (!(size.widthPx > 0) || !(size.heightPx > 0)) return null;
  const maxX = Math.max(margin, size.widthPx - margin);
  const maxY = Math.max(margin, size.heightPx - margin);
  const x = clamp(screen.x, margin, maxX);
  const y = clamp(screen.y, margin, maxY);
  return { x, y, offscreen: x !== screen.x || y !== screen.y };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function isFinitePoint(point: CadPoint2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
