/**
 * CHAMFER sobre dos LINE canónicas: cortar la esquina con un tramo recto.
 *
 * Es la gemela de FILLET (`cad-fillet.ts`), que redondea la misma esquina con un
 * ARC tangente. Sobre entidades nativas sólo existía el redondeo; el chaflán
 * únicamente estaba para MUROS legacy (`chamferWallsPreview`), que trabaja sobre
 * otro modelo de datos y no toca el documento canónico.
 *
 * La esquina se resuelve con la MISMA regla que FILLET —extremo cercano al cruce
 * de las prolongaciones— reutilizando sus helpers, para que las dos órdenes no
 * puedan dar respuestas distintas a la misma pareja de líneas.
 */
import { commitChange, type CadDocument, type CadEntity, type CadPoint3 } from './cad-document';
import { executeCadEntityCommand } from './entity-commands';
import { intersectInfiniteLines, retainedRay } from './cad-fillet';

type CadLine = Extract<CadEntity, { type: 'line' }>;

export interface CadLineChamferGeometry {
  lineA: CadLine;
  lineB: CadLine;
  chamfer: CadLine;
  intersection: CadPoint3;
}

const EPS = 1e-9;
const point3 = (x: number, y: number, z = 0): CadPoint3 => ({ x, y, z });

/**
 * Chaflán determinista de dos LINE: recorta cada una a su distancia desde el
 * vértice y devuelve el segmento que une los dos cortes.
 *
 * `distanceA` se mide sobre `lineA` y `distanceB` sobre `lineB`; con las dos
 * iguales el chaflán es simétrico, y distintas dan el chaflán asimétrico que se
 * pide en un despiece. No se admite 0: en AutoCAD equivale a LIMPIAR LA ESQUINA
 * —unir las dos líneas en el vértice sin crear nada— y ésa es otra operación,
 * con otro resultado (no aparece entidad nueva). Fingirla aquí devolvería un
 * segmento degenerado de longitud cero dentro del documento.
 */
export function computeCadLineChamfer(
  lineA: CadLine,
  lineB: CadLine,
  distanceA: number,
  distanceB: number,
  chamferId: string,
): CadLineChamferGeometry {
  if (lineA.id === lineB.id) throw new Error('CHAMFER requires two different LINE entities.');
  if (!Number.isFinite(distanceA) || !Number.isFinite(distanceB) || distanceA <= 0 || distanceB <= 0)
    throw new Error('CHAMFER distances must be greater than zero.');
  if (!chamferId.trim()) throw new Error('CHAMFER entity id is required.');

  const intersection = intersectInfiniteLines(lineA, lineB, 'CHAMFER');
  const rayA = retainedRay(lineA, intersection, 'CHAMFER');
  const rayB = retainedRay(lineB, intersection, 'CHAMFER');
  if (distanceA > rayA.available + EPS || distanceB > rayB.available + EPS)
    throw new Error('CHAMFER distance is too large for the retained LINE segments.');

  const cornerA = point3(
    intersection.x + rayA.direction.x * distanceA,
    intersection.y + rayA.direction.y * distanceA,
    lineA.start.z,
  );
  const cornerB = point3(
    intersection.x + rayB.direction.x * distanceB,
    intersection.y + rayB.direction.y * distanceB,
    lineB.start.z,
  );

  const trim = (line: CadLine, near: 'start' | 'end', corner: CadPoint3): CadLine => near === 'start'
    ? { ...line, start: corner }
    : { ...line, end: corner };
  return {
    lineA: trim(lineA, rayA.near, cornerA),
    lineB: trim(lineB, rayB.near, cornerB),
    chamfer: {
      id: chamferId,
      type: 'line',
      start: cornerA,
      end: cornerB,
      layer: lineA.layer,
      context: {
        provenance: { provider: 'cad-editor' },
        metadata: {
          sourceType: 'CHAMFER',
          sourceIds: `${lineA.id},${lineB.id}`,
          distanceA,
          distanceB,
        },
      },
    },
    intersection,
  };
}

/** Aplica los dos recortes más el tramo del chaflán como UNA entrada de historial. */
export function applyCadLineChamfer(
  document: CadDocument,
  input: { lineAId: string; lineBId: string; distanceA: number; distanceB: number; chamferId: string },
): CadDocument {
  if (document.entities.some((entity) => entity.id === input.chamferId))
    throw new Error(`CHAMFER entity ${input.chamferId} already exists.`);
  const lineA = document.entities.find((entity): entity is CadLine => entity.id === input.lineAId && entity.type === 'line');
  const lineB = document.entities.find((entity): entity is CadLine => entity.id === input.lineBId && entity.type === 'line');
  if (!lineA || !lineB) throw new Error('CHAMFER requires exactly two existing LINE entities.');
  const geometry = computeCadLineChamfer(lineA, lineB, input.distanceA, input.distanceB, input.chamferId);

  let changed = executeCadEntityCommand(document, {
    type: 'properties', entityId: lineA.id,
    patch: { startX: geometry.lineA.start.x, startY: geometry.lineA.start.y, endX: geometry.lineA.end.x, endY: geometry.lineA.end.y },
  }).document;
  changed = executeCadEntityCommand(changed, {
    type: 'properties', entityId: lineB.id,
    patch: { startX: geometry.lineB.start.x, startY: geometry.lineB.start.y, endX: geometry.lineB.end.x, endY: geometry.lineB.end.y },
  }).document;

  return commitChange({
    ...changed,
    meta: { ...changed.meta, version: document.meta.version },
    history: [...document.history],
    entities: [...changed.entities, geometry.chamfer],
    // `entityIds` es el ORDEN DE DIBUJO: el chaflán va AL FRENTE y no reordena
    // lo que ya había.
    modelSpace: { entityIds: [...new Set([...changed.modelSpace.entityIds, geometry.chamfer.id])] },
  }, `chamfer:${lineA.id}:${lineB.id}:d${input.distanceA}x${input.distanceB}`);
}
