/**
 * XCLIP: recortar lo que enseña una inserción (o un xref).
 *
 * ## Qué recorta, exactamente
 *
 * Un contorno de recorte —rectangular o poligonal, y opcionalmente INVERTIDO—
 * asociado a un INSERT. Lo consume `resolveCadInsert`, que es por donde pasan
 * el render, la designación, los límites y la exportación: recortar en un solo
 * sitio es lo que impide que el dibujo y lo que se puede seleccionar digan
 * cosas distintas.
 *
 * ## Dónde vive el contorno
 *
 * En `insert.context.metadata["cad:xclip"]`, como JSON. `CadEntity` no tiene
 * campo de recorte y `cad-document.ts` es de otra sesión en esta ronda; los
 * metadatos son el bolsillo que el esquema ya ofrece para exactamente esto, y
 * se escriben por la ruta canónica de mutación con la orden `metadata`.
 *
 * ## El recorte de la geometría
 *
 * Las líneas y polilíneas se recortan DE VERDAD: cada tramo se corta por sus
 * intersecciones con el contorno y se conservan los trozos cuyo punto medio
 * queda dentro (o fuera, si está invertido). Funciona con contornos cóncavos,
 * no sólo convexos, porque el criterio es «¿está dentro este punto?» y no un
 * recorte por semiplanos.
 *
 * El resto de entidades —círculos, arcos, textos, sombreados— se recorta por
 * PERTENENCIA: se conservan enteras si su punto representativo cae del lado
 * bueno, y se descartan si no. Es una aproximación, está dicha aquí y en el
 * PR, y es honesta: lo alternativo era recortar sólo rectángulos convexos y
 * fingir que el caso general funciona.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";

/** Clave de metadatos donde vive el recorte. */
export const CAD_XCLIP_METADATA_KEY = "cad:xclip";

export interface CadXclip {
  /** Contorno cerrado, en coordenadas de MUNDO. Al menos tres vértices. */
  boundary: CadPoint2[];
  /** `true` deja ver lo de FUERA y oculta lo de dentro. */
  inverted?: boolean;
  /** `false` desactiva el recorte sin perder el contorno (XCLIP Off). */
  enabled?: boolean;
}

const isPoint = (value: unknown): value is CadPoint2 =>
  !!value &&
  typeof value === "object" &&
  Number.isFinite((value as CadPoint2).x) &&
  Number.isFinite((value as CadPoint2).y);

/** El recorte de una inserción, o `null` si no tiene o está mal escrito. */
export function cadXclipOf(entity: Pick<CadEntity, "context">): CadXclip | null {
  const raw = entity.context?.metadata?.[CAD_XCLIP_METADATA_KEY];
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as CadXclip;
    if (!Array.isArray(parsed.boundary) || parsed.boundary.length < 3) return null;
    if (!parsed.boundary.every(isPoint)) return null;
    return {
      boundary: parsed.boundary.map((point) => ({ x: point.x, y: point.y })),
      ...(parsed.inverted ? { inverted: true } : {}),
      enabled: parsed.enabled !== false,
    };
  } catch {
    // Un recorte ilegible NO puede ocultar el dibujo: se ignora y se ve todo.
    // Al revés —tratarlo como «recorta todo»— haría desaparecer geometría por
    // un JSON corrupto, que es la peor forma de fallar que tiene esta orden.
    return null;
  }
}

/** Rectángulo por dos esquinas opuestas, en orden antihorario. */
export function cadXclipRectangle(a: CadPoint2, b: CadPoint2): CadPoint2[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

const writeClip = (entityId: string, clip: CadXclip | null): CadEntityCommand => ({
  type: "metadata",
  entityId,
  patch: {
    [CAD_XCLIP_METADATA_KEY]: clip
      ? JSON.stringify({
          boundary: clip.boundary.map((point) => ({ x: point.x, y: point.y })),
          ...(clip.inverted ? { inverted: true } : {}),
          ...(clip.enabled === false ? { enabled: false } : {}),
        })
      : null,
  },
});

export function cadSetXclipCommands(entityId: string, clip: CadXclip): CadEntityCommand[] {
  if (clip.boundary.length < 3)
    throw new Error("Un contorno de recorte necesita al menos tres vértices.");
  if (Math.abs(polygonArea(clip.boundary)) < 1e-9)
    throw new Error("El contorno de recorte es degenerado: encierra área cero.");
  return [writeClip(entityId, clip)];
}

/** XCLIP Delete: quita el recorte y vuelve a enseñarlo todo. */
export function cadDeleteXclipCommands(entityId: string): CadEntityCommand[] {
  return [writeClip(entityId, null)];
}

/** XCLIP On/Off: conserva el contorno y sólo cambia si actúa. */
export function cadToggleXclipCommands(entityId: string, clip: CadXclip, enabled: boolean): CadEntityCommand[] {
  return [writeClip(entityId, { ...clip, enabled })];
}

function polygonArea(polygon: readonly CadPoint2[]): number {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

/** Cruce de rayos. El borde cuenta como DENTRO, que es lo que espera XCLIP. */
export function cadPointInsideBoundary(point: CadPoint2, polygon: readonly CadPoint2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const onEdge =
      Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) <= 1e-9 &&
      point.x >= Math.min(a.x, b.x) - 1e-9 &&
      point.x <= Math.max(a.x, b.x) + 1e-9 &&
      point.y >= Math.min(a.y, b.y) - 1e-9 &&
      point.y <= Math.max(a.y, b.y) + 1e-9;
    if (onEdge) return true;
    if (a.y > point.y !== b.y > point.y) {
      const crossing = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < crossing) inside = !inside;
    }
  }
  return inside;
}

/** Parámetros `t ∈ (0,1)` donde el segmento corta el contorno. */
function crossings(from: CadPoint2, to: CadPoint2, polygon: readonly CadPoint2[]): number[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const found: number[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / denominator;
    const u = ((a.x - from.x) * dy - (a.y - from.y) * dx) / denominator;
    if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) found.push(t);
  }
  return [...new Set(found)].sort((left, right) => left - right);
}

const lerp = (from: CadPoint3, to: CadPoint3, t: number): CadPoint3 => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  z: from.z + (to.z - from.z) * t,
});

/**
 * Recorta una polilínea abierta contra el contorno y devuelve los TROZOS que
 * quedan. Un tramo puede entrar y salir varias veces, así que un solo camino
 * de entrada puede producir varios de salida.
 */
export function cadClipPath(points: readonly CadPoint3[], clip: CadXclip): CadPoint3[][] {
  const keep = (point: CadPoint2) =>
    cadPointInsideBoundary(point, clip.boundary) !== (clip.inverted === true);
  const pieces: CadPoint3[][] = [];
  let current: CadPoint3[] = [];
  const push = (point: CadPoint3) => {
    const last = current[current.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 1e-9) current.push(point);
  };
  const cut = () => {
    if (current.length > 1) pieces.push(current);
    current = [];
  };
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const parameters = [0, ...crossings(from, to, clip.boundary), 1];
    for (let step = 0; step + 1 < parameters.length; step += 1) {
      const start = lerp(from, to, parameters[step]);
      const end = lerp(from, to, parameters[step + 1]);
      const middle = lerp(from, to, (parameters[step] + parameters[step + 1]) / 2);
      if (keep(middle)) {
        push(start);
        push(end);
      } else cut();
    }
  }
  cut();
  return pieces;
}

/** Punto representativo de una entidad que no se recorta tramo a tramo. */
function anchorOf(entity: CadEntity): CadPoint2 | null {
  if (entity.type === "circle" || entity.type === "arc") return entity.center;
  if (entity.type === "ellipse") return entity.center;
  if (entity.type === "mtext" || entity.type === "table" || entity.type === "attdef")
    return entity.insertion;
  if (entity.type === "text") return { x: entity.x, y: entity.y };
  if (entity.type === "hatch") return entity.boundaries[0]?.[0] ?? null;
  if (entity.type === "insert") return entity.insertion;
  if (entity.type === "point") return entity.position;
  return null;
}

/**
 * Aplica el recorte a la geometría YA RESUELTA de una inserción.
 *
 * Las líneas y polilíneas salen cortadas por el contorno; el resto se conserva
 * o se descarta entero. Los ids de los trozos llevan sufijo `:clip:<n>` para
 * que dos trozos de la misma línea no compartan id.
 */
export function cadApplyXclip(entities: readonly CadEntity[], clip: CadXclip): CadEntity[] {
  if (clip.enabled === false) return [...entities];
  const result: CadEntity[] = [];
  for (const entity of entities) {
    if (entity.type === "line") {
      const pieces = cadClipPath([entity.start, entity.end], clip);
      pieces.forEach((piece, index) => {
        result.push({
          ...entity,
          id: pieces.length === 1 && index === 0 ? entity.id : `${entity.id}:clip:${index}`,
          start: piece[0],
          end: piece[piece.length - 1],
        });
      });
      continue;
    }
    if (entity.type === "polyline") {
      // Una polilínea con ARCOS no se corta tramo a tramo: `bulge` codifica el
      // combado de cada tramo y recortarlo exigiría recalcularlo por trozo.
      // Cortarla sin más la dejaría RECTA, que es un dibujo plausible y falso;
      // así que se decide entera, por pertenencia, y se dice aquí.
      if (entity.vertices.some((vertex) => vertex.bulge !== undefined)) {
        if (cadPointInsideBoundary(entity.vertices[0], clip.boundary) !== (clip.inverted === true))
          result.push(entity);
        continue;
      }
      // Una polilínea CERRADA se recorre como cerrada antes de recortar; los
      // trozos que salgan son abiertos, porque un recorte los parte.
      const vertices = entity.closed ? [...entity.vertices, entity.vertices[0]] : entity.vertices;
      const pieces = cadClipPath(vertices, clip);
      pieces.forEach((piece, index) => {
        result.push({
          ...entity,
          id: pieces.length === 1 && index === 0 && !entity.closed ? entity.id : `${entity.id}:clip:${index}`,
          vertices: piece,
          closed: false,
        });
      });
      continue;
    }
    const anchor = anchorOf(entity);
    if (!anchor) {
      result.push(entity);
      continue;
    }
    if (cadPointInsideBoundary(anchor, clip.boundary) !== (clip.inverted === true))
      result.push(entity);
  }
  return result;
}
