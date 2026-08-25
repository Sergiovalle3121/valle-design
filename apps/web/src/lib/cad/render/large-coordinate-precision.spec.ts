/**
 * El origen flotante (P0-2 del backlog) es correcto SI Y SÓLO SI el error de
 * precisión no crece con la magnitud absoluta del documento. Esta es la
 * comprobación con UMBRAL que el backlog exige — no basta con "el número bajó
 * en la sonda una vez": tiene que quedar como regresión permanente.
 *
 * Atraviesa el camino REAL: `tessellateCadEntity` (que resta el origen) →
 * `buildCadLineBatches` (que empaqueta a Float32Array) → reconstrucción en JS
 * doubles (la misma suma que hace la escena real al posicionar cámara y
 * uniformes). El criterio del backlog es ≤1e-3 unidades de dibujo a magnitud
 * 10⁷; se pide 100× más estricto porque lo que se mide hoy es del orden de
 * micras, y un umbral holgado dejaría pasar una regresión real de milímetros.
 */
import assert from "node:assert/strict";
import type { CadNativeEntity } from "../entity-runtime";
import { tessellateCadEntity } from "./tessellation-cache";
import { buildCadLineBatches } from "./line-batch";
import { cadRenderOriginFromBounds } from "./render-origin";

type CadLineEntity = Extract<CadNativeEntity, { type: "line" }>;

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Una planta de 100×60 con diagonales, desplazada a la magnitud pedida — la misma fixture que la sonda. */
function fixtureAt(offset: number): CadLineEntity[] {
  const segments: Array<[number, number, number, number]> = [
    [0, 0, 100, 0],
    [100, 0, 100, 60],
    [100, 60, 0, 60],
    [0, 60, 0, 0],
    [0, 0, 100, 60],
    [33.333333, 0, 66.666667, 60],
    [12.125, 7.375, 87.875, 52.625],
  ];
  return segments.map(([x1, y1, x2, y2], index) => ({
    id: `seg-${index}`,
    type: "line",
    start: { x: x1 + offset, y: y1 + offset, z: 0 },
    end: { x: x2 + offset, y: y2 + offset, z: 0 },
    layer: "0",
  }));
}

/** Peor error absoluto (unidades de dibujo) tras teselar+empaquetar+reconstruir. */
function worstError(entities: readonly CadLineEntity[]): number {
  const bounds = entities.reduce(
    (acc, entity) => ({
      minX: Math.min(acc.minX, entity.start.x, entity.end.x),
      minY: Math.min(acc.minY, entity.start.y, entity.end.y),
      maxX: Math.max(acc.maxX, entity.start.x, entity.end.x),
      maxY: Math.max(acc.maxY, entity.start.y, entity.end.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const origin = cadRenderOriginFromBounds(bounds);
  const style = {
    color: 0xffffff,
    halfWidthPx: 1,
    linetypeIndex: 0,
    layer: "0",
  };
  const batches = buildCadLineBatches(
    entities.map((entity) => ({
      tessellation: tessellateCadEntity(entity, 2, undefined, origin),
      style,
      depth: 0,
    })),
  );
  let maxAbs = 0;
  for (const batch of batches) {
    for (let index = 0; index < batch.instanceCount; index += 1) {
      const entity = entities[index]!;
      const got = [
        batch.instanceStart[index * 2]! + origin.x,
        batch.instanceStart[index * 2 + 1]! + origin.y,
        batch.instanceEnd[index * 2]! + origin.x,
        batch.instanceEnd[index * 2 + 1]! + origin.y,
      ];
      const expected = [
        entity.start.x,
        entity.start.y,
        entity.end.x,
        entity.end.y,
      ];
      for (let axis = 0; axis < 4; axis += 1)
        maxAbs = Math.max(maxAbs, Math.abs(got[axis]! - expected[axis]!));
    }
  }
  return maxAbs;
}

/**
 * El criterio EXACTO del backlog (P0-2): ≤1e-3 unidades de dibujo a magnitud
 * 10⁷. Se aplica a TODAS las magnitudes, no sólo la peor — la propiedad que
 * de verdad importa es que el error NO CREZCA con la magnitud absoluta, y
 * magnitudes por debajo de la rejilla de redondeo (`CAD_RENDER_ORIGIN_GRID`)
 * conservan la precisión float32 natural de su propia magnitud, que ya es
 * sobradamente mejor que este presupuesto sin necesitar origen.
 */
const CAD_LARGE_COORDINATE_ERROR_BUDGET = 1e-3;

// --- 1. el error NO crece con la magnitud absoluta, en TODA la escala -------
{
  const magnitudes = [0, 10_000, 100_000, 500_000, 2_000_000, 10_000_000];
  for (const offset of magnitudes) {
    const error = worstError(fixtureAt(offset));
    ok(
      error <= CAD_LARGE_COORDINATE_ERROR_BUDGET,
      `a magnitud ${offset}, error ${error} supera el presupuesto ${CAD_LARGE_COORDINATE_ERROR_BUDGET}`,
    );
  }
}

// --- 2. a magnitud UTM (10⁷) el error medido hoy es del orden de MICRAS, no
//        de milímetros — umbral cien veces más estricto que el del backlog,
//        para que una regresión real (no sólo "se salió del criterio
//        mínimo") también quede atrapada -----------------------------------
{
  const error = worstError(fixtureAt(10_000_000));
  ok(
    error <= 1e-5,
    `a magnitud 10⁷, error ${error} — se esperaba del orden de micras (≤1e-5)`,
  );
}

// --- 3. sin origen (llamada antigua, sin 4º argumento) sigue funcionando,
//        y a magnitud UTM el error ES el viejo, grande — la prueba de que el
//        origen flotante es lo que de verdad marca la diferencia, no un
//        efecto de la fixture o del redondeo de por sí ------------------------
{
  const entities = fixtureAt(10_000_000);
  const style = {
    color: 0xffffff,
    halfWidthPx: 1,
    linetypeIndex: 0,
    layer: "0",
  };
  const batches = buildCadLineBatches(
    entities.map((entity) => ({
      tessellation: tessellateCadEntity(entity, 2), // SIN origen: comportamiento de antes
      style,
      depth: 0,
    })),
  );
  let maxAbs = 0;
  for (const batch of batches) {
    for (let index = 0; index < batch.instanceCount; index += 1) {
      const entity = entities[index]!;
      const got = [
        batch.instanceStart[index * 2]!,
        batch.instanceStart[index * 2 + 1]!,
        batch.instanceEnd[index * 2]!,
        batch.instanceEnd[index * 2 + 1]!,
      ];
      const expected = [
        entity.start.x,
        entity.start.y,
        entity.end.x,
        entity.end.y,
      ];
      for (let axis = 0; axis < 4; axis += 1)
        maxAbs = Math.max(maxAbs, Math.abs(got[axis]! - expected[axis]!));
    }
  }
  ok(
    maxAbs > 0.1,
    `sin origen, a magnitud 10⁷ el error debería seguir siendo grande (comparación): fue ${maxAbs}`,
  );
}

console.log(
  `large-coordinate-precision: ${checks} comprobaciones verdes — el origen flotante mantiene el error de render por debajo del criterio del backlog (≤1e-3) en TODAS las magnitudes probadas (0 a 10⁷, ninguna crece con la magnitud absoluta), y a 10⁷ en particular por debajo de 1e-5 — cien veces más estricto que el mínimo exigido.`,
);
