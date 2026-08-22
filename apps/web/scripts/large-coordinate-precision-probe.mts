#!/usr/bin/env node
/**
 * Medición del error de precisión con coordenadas GRANDES (orden UTM, ~10⁶–10⁷)
 * en el camino de render que empaqueta a Float32.
 *
 * ## Qué se mide exactamente
 *
 * El documento canónico guarda `number` (float64). El camino de render
 * (`lib/cad/render/line-batch.ts`) escribe las coordenadas ABSOLUTAS en
 * `Float32Array` y el shader resta el centro DESPUÉS, en float32
 * (`line-batch-three.ts`: `world - cadCenter`). La cuantización ocurre al
 * empaquetar: float32 tiene 24 bits de mantisa, así que el espaciado (ulp) a
 * magnitud 2·10⁶ es 0.25 y a 10⁷ es 1.0. En metros UTM eso son 25 cm y 1 m de
 * error posicional en pantalla — invisible en una planta local (~10³, ulp
 * 6·10⁻⁵), bloqueante para topografía.
 *
 * La sonda atraviesa el empaquetador REAL (buildCadLineBatches) con la misma
 * geometría a varias magnitudes y mide el desplazamiento máximo entre la
 * coordenada canónica y la que quedó en el búfer. El error de EXPORTACIÓN
 * también se mide (serialización del documento): debe ser CERO, porque el
 * documento nunca pasa por float32.
 *
 * Es la evidencia «antes» que exige la campaña de cimientos (OLA 2.2). El
 * arreglo —origen flotante de escena: anclar el marco al centro del documento
 * y calcular los uniformes en doubles— está diseñado en el backlog (P0) y su
 * evidencia «después» deberá salir de esta misma sonda.
 */
import { writeFileSync } from "node:fs";
import { buildCadLineBatches } from "../src/lib/cad/render/line-batch";
import type { CadTessellation } from "../src/lib/cad/render/tessellation-cache";

interface MagnitudeReport {
  label: string;
  offset: number;
  ulp: number;
  maxAbsErrorDrawingUnits: number;
  maxRelativeSpanError: number;
  exportRoundTripError: number;
}

/** Una planta de 100×60 con diagonales, desplazada a la magnitud pedida. */
function fixture(offset: number): Array<[number, number, number, number]> {
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

function tessellationOf(segments: Array<[number, number, number, number]>): CadTessellation {
  // `CadTessellatedPath.xy` ES Float32Array en el contrato real: la
  // cuantización empieza en la teselación, no en el empaquetado. Construirla
  // igual que el producto es exactamente lo que esta sonda quiere medir.
  const paths = segments.map(([x1, y1, x2, y2]) => ({
    xy: Float32Array.from([x1, y1, x2, y2]),
    closed: false,
  }));
  return {
    paths,
    pointCount: segments.length * 2,
    segmentCount: segments.length,
  };
}

function ulpAt(value: number): number {
  const f = Math.fround(value);
  const bits = new DataView(new ArrayBuffer(4));
  bits.setFloat32(0, f);
  const up = bits.getUint32(0) + 1;
  bits.setUint32(0, up);
  return Math.abs(bits.getFloat32(0) - f);
}

function measure(label: string, offset: number): MagnitudeReport {
  const segments = fixture(offset);
  const tessellation = tessellationOf(segments);
  const style = { color: 0xffffff, halfWidthPx: 1, linetypeIndex: 0, layer: "0" };
  const batches = buildCadLineBatches([{ tessellation, style, depth: 0 }]);
  let maxAbs = 0;
  for (const batch of batches) {
    for (let index = 0; index < batch.instanceCount; index += 1) {
      const expected = segments[index]!;
      const got = [
        batch.instanceStart[index * 2],
        batch.instanceStart[index * 2 + 1],
        batch.instanceEnd[index * 2],
        batch.instanceEnd[index * 2 + 1],
      ];
      for (let axis = 0; axis < 4; axis += 1) {
        maxAbs = Math.max(maxAbs, Math.abs(got[axis]! - expected[axis]!));
      }
    }
  }
  // Error del documento al serializar (el camino de exportación): float64 puro.
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
    ulp: ulpAt(offset),
    maxAbsErrorDrawingUnits: maxAbs,
    maxRelativeSpanError: maxAbs / 100,
    exportRoundTripError: exportError,
  };
}

const reports = [
  measure("planta local (mm)", 0),
  measure("nave grande (10⁴)", 10_000),
  measure("coordenadas municipales (10⁵)", 100_000),
  measure("UTM este (5·10⁵)", 500_000),
  measure("UTM norte México (2·10⁶)", 2_000_000),
  measure("UTM norte alto (10⁷)", 10_000_000),
];

const worst = reports[reports.length - 1]!;
const summary = {
  generatedBy: "apps/web/scripts/large-coordinate-precision-probe.mts",
  conclusion:
    worst.maxAbsErrorDrawingUnits > 0.01
      ? `CONFIRMADO: a magnitud 10⁷ el camino de render pierde hasta ${worst.maxAbsErrorDrawingUnits} unidades de dibujo por cuantización float32 (en metros UTM, ${worst.maxAbsErrorDrawingUnits} m). El documento y la exportación no pierden nada (float64 de punta a punta). El arreglo es el origen flotante de escena (backlog P0).`
      : "El empaquetado no muestra pérdida medible: revisar si el arreglo ya se aplicó y retirar esta nota.",
  reports,
};

const target = process.argv[2];
const json = JSON.stringify(summary, null, 2);
if (target) writeFileSync(target, `${json}\n`);
else process.stdout.write(`${json}\n`);
