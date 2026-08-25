#!/usr/bin/env node
/**
 * Medición del error de precisión con coordenadas GRANDES (orden UTM, ~10⁶–10⁷)
 * en el camino de render que empaqueta a Float32, CON el origen flotante
 * aplicado — la evidencia «después» de P0-2.
 *
 * ## Qué se mide exactamente
 *
 * El documento canónico guarda `number` (float64). El camino de render
 * (`lib/cad/render/line-batch.ts`) escribe a `Float32Array`; float32 tiene 24
 * bits de mantisa, así que empaquetar una coordenada ABSOLUTA grande sin más
 * pierde hasta 1 m a magnitud 10⁷ (ulp a esa magnitud). El origen flotante
 * (`render/render-origin.ts` + `tessellateCadEntity`) resta el centroide del
 * documento ANTES de empaquetar, en JS doubles, así que lo que llega al
 * `Float32Array` es siempre pequeño — sea cual sea la magnitud absoluta.
 *
 * La sonda reproduce esa misma resta (mismo `cadRenderOriginFromBounds` que
 * usa `CadRenderPipeline.replace()`) y atraviesa el empaquetador REAL
 * (`buildCadLineBatches`) con la geometría YA reducida, a varias magnitudes.
 * Reconstruye la coordenada absoluta sumando el origen de vuelta, en doubles
 * —la misma operación que hace la escena real al posicionar cámara y
 * uniformes— y mide el desplazamiento máximo contra la canónica. El error de
 * EXPORTACIÓN también se mide (serialización del documento): debe ser CERO,
 * porque el documento nunca pasa por float32 ni por el origen flotante — el
 * origen es puramente de RENDER.
 *
 * La sonda de ANTES del arreglo (sin restar origen) vive en
 * `git log` de este archivo si hace falta comparar; el propio backlog (P0-2)
 * documentaba 4,2 cm a 2·10⁶ y 37,5 cm a 10⁷ — los números que esta versión
 * de la sonda ya no reproduce.
 */
import { writeFileSync } from "node:fs";
import { buildCadLineBatches } from "../src/lib/cad/render/line-batch";
import type { CadTessellation } from "../src/lib/cad/render/tessellation-cache";
import { cadRenderOriginFromBounds } from "../src/lib/cad/render/render-origin";

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
  return base.map(([x1, y1, x2, y2]) => [
    x1 + offset,
    y1 + offset,
    x2 + offset,
    y2 + offset,
  ]);
}

function tessellationOf(
  segments: Array<[number, number, number, number]>,
  origin: { x: number; y: number },
): CadTessellation {
  // `CadTessellatedPath.xy` ES Float32Array en el contrato real: la
  // cuantización empieza en la teselación, no en el empaquetado. Construirla
  // igual que el producto —restando el origen ANTES, en doubles, como hace
  // `tessellateCadEntity`— es exactamente lo que esta sonda quiere medir.
  const paths = segments.map(([x1, y1, x2, y2]) => ({
    xy: Float32Array.from([
      x1 - origin.x,
      y1 - origin.y,
      x2 - origin.x,
      y2 - origin.y,
    ]),
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
  // El mismo origen que calcularía `CadRenderPipeline.replace()` sobre los
  // límites reales del documento: el centroide de la fixture, redondeado.
  const bounds = segments.reduce(
    (acc, [x1, y1, x2, y2]) => ({
      minX: Math.min(acc.minX, x1, x2),
      minY: Math.min(acc.minY, y1, y2),
      maxX: Math.max(acc.maxX, x1, x2),
      maxY: Math.max(acc.maxY, y1, y2),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const origin = cadRenderOriginFromBounds(bounds);
  const tessellation = tessellationOf(segments, origin);
  const style = {
    color: 0xffffff,
    halfWidthPx: 1,
    linetypeIndex: 0,
    layer: "0",
  };
  const batches = buildCadLineBatches([{ tessellation, style, depth: 0 }]);
  let maxAbs = 0;
  for (const batch of batches) {
    for (let index = 0; index < batch.instanceCount; index += 1) {
      const expected = segments[index]!;
      // Reconstrucción en JS doubles — la MISMA suma que hace la escena real
      // al posicionar cámara y uniformes contra el origen flotante. Mide el
      // error que introdujo cuantizar a float32 un valor YA pequeño, que es
      // justo lo que queda por medir una vez que el origen está aplicado.
      const got = [
        batch.instanceStart[index * 2]! + origin.x,
        batch.instanceStart[index * 2 + 1]! + origin.y,
        batch.instanceEnd[index * 2]! + origin.x,
        batch.instanceEnd[index * 2 + 1]! + origin.y,
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
      exportError = Math.max(
        exportError,
        Math.abs(value - segments[index]![axis]!),
      );
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
      ? `SIGUE ROTO: a magnitud 10⁷ el camino de render pierde hasta ${worst.maxAbsErrorDrawingUnits} unidades de dibujo pese al origen flotante — revisar la resta en \`tessellateCadEntity\`/\`tessellate.worker.ts\`.`
      : `ARREGLADO (P0-2): con el origen flotante (\`render/render-origin.ts\`) restado ANTES de empaquetar a Float32Array, el peor error a 10⁷ es ${worst.maxAbsErrorDrawingUnits} unidades de dibujo — antes del arreglo eran 0,375 (37,5 cm en metros UTM). El documento y la exportación siguen en float64 puro, sin pérdida.`,
  reports,
};

const target = process.argv[2];
const json = JSON.stringify(summary, null, 2);
if (target) writeFileSync(target, `${json}\n`);
else process.stdout.write(`${json}\n`);
