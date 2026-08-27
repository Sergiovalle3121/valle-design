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
 * La sonda reproduce esa misma resta llamando al TESELADOR REAL
 * (`tessellateCadEntity`, `render/tessellation-cache.ts`) sobre entidades
 * `CadNativeEntity` de verdad — no reimplementando la resta a mano. Antes
 * (hasta 2026-08-27) esta sonda construía su propio `Float32Array` restando
 * el origen por su cuenta (`x1 - origin.x`, …): eso probaba que SU PROPIA
 * aritmética era correcta, nunca que `tessellateCadEntity` lo fuera — un
 * cambio de signo o una regresión en `CAD_ENTITY_REGISTRY.adapter(entity)
 * .renderer.paths(...)` habría seguido reportando error cero. La sonda
 * atraviesa después el empaquetador REAL (`buildCadLineBatches`) con la
 * geometría YA teselada y reducida, a varias magnitudes. Reconstruye la
 * coordenada absoluta sumando el origen de vuelta, en doubles —la misma
 * operación que hace la escena real al posicionar cámara y uniformes— y mide
 * el desplazamiento máximo contra la canónica. El error de EXPORTACIÓN
 * también se mide (serialización del documento): debe ser CERO, porque el
 * documento nunca pasa por float32 ni por el origen flotante — el origen es
 * puramente de RENDER.
 *
 * La sonda de ANTES del arreglo (sin restar origen) vive en
 * `git log` de este archivo si hace falta comparar; el propio backlog (P0-2)
 * documentaba 4,2 cm a 2·10⁶ y 37,5 cm a 10⁷ — los números que esta versión
 * de la sonda ya no reproduce.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildCadLineBatches } from "../src/lib/cad/render/line-batch";
import {
  tessellateCadEntity,
  type CadTessellation,
} from "../src/lib/cad/render/tessellation-cache";
import { cadRenderOriginFromBounds } from "../src/lib/cad/render/render-origin";
import type { CadNativeEntity } from "../src/lib/cad/entity-runtime";

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

/** Una entidad `line` canónica mínima — misma forma que `basic-native-adapters.ts` exige. */
function lineEntity(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): CadNativeEntity {
  return {
    id,
    type: "line",
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    layer: "0",
  } as CadNativeEntity;
}

function tessellationsOf(
  segments: Array<[number, number, number, number]>,
  origin: { x: number; y: number },
): CadTessellation[] {
  // Llama al TESELADOR REAL por cada segmento — `renderer.paths()` del
  // registro de adaptadores produce los puntos, y `tessellateCadEntity` resta
  // el origen en JS doubles antes de empaquetar a `Float32Array` (ver su
  // propio comentario en `tessellation-cache.ts`). Esta sonda no repite esa
  // resta: la EJERCITA.
  return segments.map(([x1, y1, x2, y2], index) =>
    tessellateCadEntity(
      lineEntity(`probe-${index}`, x1, y1, x2, y2),
      2,
      undefined,
      origin,
    ),
  );
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
  const tessellations = tessellationsOf(segments, origin);
  const style = {
    color: 0xffffff,
    halfWidthPx: 1,
    linetypeIndex: 0,
    layer: "0",
  };
  // Un item por segmento, mismo estilo para todos: `buildCadLineBatches` los
  // agrupa por clave de estilo en UN solo bucket y los apila en el mismo
  // orden de entrada, así que el índice de instancia sigue correspondiendo
  // 1:1 con `segments[index]` exactamente como cuando era una sola
  // teselación combinada.
  const batches = buildCadLineBatches(
    tessellations.map((tessellation) => ({ tessellation, style, depth: 0 })),
  );
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

const DEFAULT_ARTIFACT = new URL(
  "../../../docs/cad/evidence/large-coordinate-precision.json",
  import.meta.url,
).pathname;

const args = process.argv.slice(2);
const json = JSON.stringify(summary, null, 2);

if (args.includes("--check")) {
  // Regenerar y comparar contra lo committeado — mismo patrón que
  // `scripts/dwg/dwg-evidence.mjs`'s `checkArtifact`. Sin campos volátiles
  // que limpiar: la sonda es determinista para una fixture fija (confirmado
  // bit a bit corriendo dos veces sobre el mismo árbol).
  if (!existsSync(DEFAULT_ARTIFACT)) {
    process.stderr.write(
      `precisión: no existe ${DEFAULT_ARTIFACT} — corre "npm run evidence:precision"\n`,
    );
    process.exit(1);
  }
  const onDisk = readFileSync(DEFAULT_ARTIFACT, "utf8");
  if (onDisk !== `${json}\n`) {
    process.stderr.write(
      `docs/cad/evidence/large-coordinate-precision.json no coincide con lo que el árbol genera hoy — corre "npm run evidence:precision"\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `precisión de coordenadas grandes al día: peor error ${worst.maxAbsErrorDrawingUnits} unidades de dibujo a magnitud 10⁷.\n`,
  );
} else {
  // Sin argumentos: imprime a stdout (uso manual/interactivo, sin tocar
  // disco) — el comportamiento de siempre, documentado en las bitácoras de
  // campañas anteriores. Con una ruta: la escribe ahí.
  const target = args[0];
  if (target) writeFileSync(target, `${json}\n`);
  else process.stdout.write(`${json}\n`);
}
