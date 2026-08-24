/**
 * Medición del error de precisión con coordenadas GRANDES (orden UTM, ~10⁶–10⁷)
 * a través del camino REAL de render: `tessellateCadEntity` (que resta el
 * origen flotante) seguido de `buildCadLineBatches` (que empaqueta a
 * `Float32Array`).
 *
 * ## Qué mide exactamente
 *
 * float32 tiene 24 bits de mantisa: sin origen flotante, el ulp a magnitud
 * 2·10⁶ es 0,25 y a 10⁷ es 1,0 — 25 cm y 1 m de error posicional en pantalla.
 * Con el origen flotante (el centroide redondeado del documento, restado ANTES
 * de teselar), lo que llega al `Float32Array` es siempre una magnitud pequeña,
 * cualquiera que sea la magnitud absoluta del documento.
 *
 * La reconstrucción («+ origin», en JS doubles) no es un capricho de la
 * prueba: es exactamente lo que el lado THREE hace en pantalla. El shader
 * calcula `mundo_en_búfer - cadCenter`, y `cadCenter` se computa como
 * `centroVista - origen` en JS doubles (ver `entity-three.ts`,
 * `cadViewportCenter`). Sumar el origen de vuelta aquí, también en JS
 * doubles, mide el mismo error que ese resultado final: el que introduce
 * cuantizar a float32 un valor YA pequeño, no el que introducía cuantizar el
 * valor absoluto.
 *
 * Es la sonda usada como evidencia «antes» y «después» de P0-2 (float32 con
 * coordenadas grandes). Puro: sin THREE, corre en Node.
 */
import type { CadNativeEntity } from "../entity-runtime";
import { cadDocumentBounds } from "../benchmark/scenario";
import { buildCadLineBatches } from "./line-batch";
import { cadRenderOriginFromBounds, tessellateCadEntity } from "./tessellation-cache";

export interface CadLargeCoordinateReport {
  label: string;
  offset: number;
  /** Espaciado (ulp) de float32 en la magnitud absoluta del documento. */
  ulp: number;
  maxAbsErrorDrawingUnits: number;
  maxRelativeSpanError: number;
  /** Serialización del documento (nunca pasa por float32): siempre 0. */
  exportRoundTripError: number;
}

/** Una planta de 100×60 con diagonales, desplazada a la magnitud pedida. */
function cadLargeCoordinateFixture(
  offset: number,
): Array<[number, number, number, number]> {
  const base: Array<[number, number, number, number]> = [
    [0, 0, 100, 0],
    [100, 0, 100, 60],
    [100, 60, 0, 60],
    [0, 60, 0, 0],
    [0, 0, 100, 60],
    [33.333333, 0, 66.666667, 60],
    [12.125, 7.375, 87.875, 52.625],
  ];
  return base.map(([x1, y1, x2, y2]) => [x1 + offset, y1 + offset, x2 + offset, y2 + offset]);
}

function cadFloat32Ulp(value: number): number {
  const f = Math.fround(value);
  const bits = new DataView(new ArrayBuffer(4));
  bits.setFloat32(0, f);
  const up = bits.getUint32(0) + 1;
  bits.setUint32(0, up);
  return Math.abs(bits.getFloat32(0) - f);
}

export function measureCadLargeCoordinatePrecision(
  label: string,
  offset: number,
): CadLargeCoordinateReport {
  const segments = cadLargeCoordinateFixture(offset);
  const entities: CadNativeEntity[] = segments.map(([x1, y1, x2, y2], index) => ({
    id: `seg-${index}`,
    type: "line",
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    layer: "0",
  }));
  const bounds = cadDocumentBounds(entities);
  const origin = cadRenderOriginFromBounds(bounds);
  const style = { color: 0xffffff, halfWidthPx: 1, linetypeIndex: 0, layer: "0" };
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
      const expected = segments[index]!;
      // La reconstrucción es la MISMA resta que hace `cadViewportCenter` en el
      // lado THREE, en JS doubles: sumar el origen de vuelta es exacto y deja
      // al descubierto sólo el error que introdujo el `Float32Array`.
      const got = [
        batch.instanceStart[index * 2] + origin.x,
        batch.instanceStart[index * 2 + 1] + origin.y,
        batch.instanceEnd[index * 2] + origin.x,
        batch.instanceEnd[index * 2 + 1] + origin.y,
      ];
      for (let axis = 0; axis < 4; axis += 1) {
        maxAbs = Math.max(maxAbs, Math.abs(got[axis]! - expected[axis]!));
      }
    }
  }
  const serialized = JSON.parse(JSON.stringify(segments)) as typeof segments;
  let exportError = 0;
  serialized.forEach((segment, index) =>
    segment.forEach((value, axis) => {
      exportError = Math.max(exportError, Math.abs(value - segments[index]![axis]!));
    }),
  );
  return {
    label,
    offset,
    ulp: cadFloat32Ulp(offset),
    maxAbsErrorDrawingUnits: maxAbs,
    maxRelativeSpanError: maxAbs / 100,
    exportRoundTripError: exportError,
  };
}

export const CAD_LARGE_COORDINATE_MAGNITUDES: ReadonlyArray<{ label: string; offset: number }> = [
  { label: "planta local (mm)", offset: 0 },
  { label: "nave grande (10⁴)", offset: 10_000 },
  { label: "coordenadas municipales (10⁵)", offset: 100_000 },
  { label: "UTM este (5·10⁵)", offset: 500_000 },
  { label: "UTM norte México (2·10⁶)", offset: 2_000_000 },
  { label: "UTM norte alto (10⁷)", offset: 10_000_000 },
];

export function measureCadLargeCoordinatePrecisionSuite(): CadLargeCoordinateReport[] {
  return CAD_LARGE_COORDINATE_MAGNITUDES.map(({ label, offset }) =>
    measureCadLargeCoordinatePrecision(label, offset),
  );
}

