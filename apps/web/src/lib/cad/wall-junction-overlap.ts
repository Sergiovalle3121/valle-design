/**
 * El volumen que dos muros COMPARTEN en su unión — para no cobrarlo dos veces.
 *
 * Las cantidades de fábrica se calculaban muro a muro (eje × altura × grosor)
 * y cada esquina en L, T o X sumaba DOS veces el prisma donde ambos muros se
 * solapan: en una vivienda de 4 esquinas con muro de 250 mm y 2,4 m de alto
 * son ~0,6 m³ de fábrica facturados de más. La campaña COMMERCIAL-RC1 lo
 * prohíbe («sin volumen doble para cantidades»), y la corrección honesta no es
 * ingletear la malla — es descontar el solape MEDIDO.
 *
 * La huella de un muro es un cuadrilátero CONVEXO (`wallFootprint`), así que
 * la intersección de dos huellas es un recorte convexo exacto
 * (Sutherland–Hodgman) y su área sale por la fórmula del cordón. El volumen
 * compartido es esa área por el SOLAPE VERTICAL real de los dos muros
 * (`start.z` incluido: un pretil sobre una losa intermedia no solapa con la
 * planta baja aunque sus huellas se crucen en planta).
 */
import type { CadWallEntity } from "./cad-entities-v6";
import { wallFootprint } from "./wall-geometry";

interface Point2 {
  x: number;
  y: number;
}

/** Recorte convexo Sutherland–Hodgman: `subject` contra el convexo `clip`. */
function clipConvex(subject: Point2[], clip: Point2[]): Point2[] {
  let output = subject;
  for (let index = 0; index < clip.length && output.length > 0; index += 1) {
    const a = clip[index];
    const b = clip[(index + 1) % clip.length];
    // El cuadrilátero de `wallFootprint` recorre en un sentido fijo; el signo
    // del área lo confirma abajo (se normaliza antes de recortar).
    const input = output;
    output = [];
    const side = (p: Point2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      const currentSide = side(current);
      const previousSide = side(previous);
      if (currentSide >= -1e-9) {
        if (previousSide < -1e-9) {
          const t = previousSide / (previousSide - currentSide);
          output.push({
            x: previous.x + (current.x - previous.x) * t,
            y: previous.y + (current.y - previous.y) * t,
          });
        }
        output.push(current);
      } else if (previousSide >= -1e-9) {
        const t = previousSide / (previousSide - currentSide);
        output.push({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
        });
      }
    }
  }
  return output;
}

/** Área con signo (cordón); positiva si el polígono es antihorario. */
function signedArea(polygon: readonly Point2[]): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function counterClockwise(polygon: Point2[]): Point2[] {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : polygon;
}

export interface CadWallJunctionOverlap {
  aId: string;
  bId: string;
  /** Área de planta compartida, en unidades² del dibujo. */
  area: number;
  /** Volumen compartido: área × solape vertical real. */
  volume: number;
}

/**
 * Solapes de huella entre pares de muros, con su volumen compartido.
 * O(n²) con filtro por caja: la lista de muros de un plano es de decenas,
 * no de miles — y el filtro corta los pares lejanos sin recortar nada.
 */
export function cadWallJunctionOverlaps(
  walls: readonly CadWallEntity[],
): CadWallJunctionOverlap[] {
  const prepared = walls
    .map((wall) => {
      const footprint = wallFootprint(wall);
      if (!footprint || !(wall.height > 0)) return null;
      const polygon = counterClockwise(footprint);
      const xs = polygon.map((point) => point.x);
      const ys = polygon.map((point) => point.y);
      const bottom = wall.start.z;
      return {
        id: wall.id,
        polygon,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        bottom,
        top: bottom + wall.height,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const overlaps: CadWallJunctionOverlap[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const a = prepared[i];
      const b = prepared[j];
      if (
        a.maxX < b.minX ||
        b.maxX < a.minX ||
        a.maxY < b.minY ||
        b.maxY < a.minY
      )
        continue;
      const verticalOverlap =
        Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
      if (!(verticalOverlap > 0)) continue;
      const intersection = clipConvex(a.polygon, b.polygon);
      if (intersection.length < 3) continue;
      const area = Math.abs(signedArea(intersection));
      if (!(area > 1e-9)) continue;
      overlaps.push({
        aId: a.id,
        bId: b.id,
        area,
        volume: area * verticalOverlap,
      });
    }
  }
  return overlaps;
}
