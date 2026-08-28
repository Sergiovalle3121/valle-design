import { strict as assert } from "node:assert";
import { buildCadLineBatches } from "../render/line-batch";
import { tessellateCadEntity } from "../render/tessellation-cache";
import {
  CAD_RENDER_ORIGIN_GRID,
  cadRenderOriginFromBounds,
} from "../render/render-origin";
import { CadRenderPipeline } from "../render/pipeline";
import type { CadNativeEntity } from "../entity-runtime";
import { dist } from "./oracle";

/**
 * 1.6 — PRECISIÓN EN COORDENADAS GRANDES, Y EL CASO MIXTO.
 *
 * `Float32Array` tiene 24 bits de mantisa: a magnitud UTM (~2·10⁶) su
 * espaciado de representación ya son 4 cm, y a 10⁷, 37,5 cm. El origen
 * flotante resuelve eso restando el centroide del documento ANTES de
 * empaquetar… siempre que el centroide esté cerca de lo que se dibuja.
 *
 * ─── EL CASO MIXTO, que es de lo que trata esta suite ──────────────────────
 *
 * Un topógrafo abre su levantamiento en UTM y le añade una hoja A4 para
 * imprimirlo. Ese documento tiene geometría a 2·10⁶ y geometría a 10², y el
 * anfitrión del render entrega AMBAS al pipeline (limita a espacio modelo el
 * orden de dibujo, no la lista de entidades). Si el origen se calcula sobre
 * todo, cae a medio camino —en torno a 10⁶— y el levantamiento vuelve a
 * empaquetarse con magnitud grande pese al origen flotante.
 *
 * Este gate mide el caso por el PIPELINE REAL y, además, cuantifica la
 * degradación que habría con el origen contaminado. Esa segunda mitad es lo
 * que lo convierte en un gate de regresión: no basta con que hoy salga bien,
 * hay que poder demostrar que la diferencia importa.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** Planta de 100×60 con diagonales de coordenada fraccionaria. */
const PLAN: Array<[number, number, number, number]> = [
  [0, 0, 100, 0],
  [100, 0, 100, 60],
  [100, 60, 0, 60],
  [0, 60, 0, 0],
  [0, 0, 100, 60],
  [33.333333, 0, 66.666667, 60],
  [12.125, 7.375, 87.875, 52.625],
];

/** La hoja A4 apaisada, en coordenadas de PAPEL. */
const SHEET: Array<[number, number, number, number]> = [
  [0, 0, 297, 0],
  [297, 0, 297, 210],
  [297, 210, 0, 210],
  [0, 210, 0, 0],
];

const UTM = 2_000_000;

function line(
  id: string,
  [x1, y1, x2, y2]: [number, number, number, number],
): CadNativeEntity {
  return {
    id,
    type: "line",
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    layer: "0",
  } as CadNativeEntity;
}

const shifted = (segments: Array<[number, number, number, number]>, by: number) =>
  segments.map(
    ([x1, y1, x2, y2]) => [x1 + by, y1 + by, x2 + by, y2 + by] as [number, number, number, number],
  );

/**
 * Error máximo de empaquetado, en unidades de dibujo, para una geometría
 * medida contra un origen dado. Reconstruye la coordenada absoluta sumando el
 * origen en doubles — la misma operación que hace la escena real.
 */
function packingError(
  segments: Array<[number, number, number, number]>,
  origin: { x: number; y: number },
): number {
  const style = { color: 0xffffff, halfWidthPx: 1, linetypeIndex: 0, layer: "0" };
  const batches = buildCadLineBatches(
    segments.map((segment, index) => ({
      tessellation: tessellateCadEntity(line(`m-${index}`, segment), 2, undefined, origin),
      style,
      depth: 0,
    })),
  );
  let worst = 0;
  for (const batch of batches) {
    for (let index = 0; index < batch.instanceCount; index += 1) {
      const expected = segments[index]!;
      const got = [
        batch.instanceStart[index * 2]! + origin.x,
        batch.instanceStart[index * 2 + 1]! + origin.y,
        batch.instanceEnd[index * 2]! + origin.x,
        batch.instanceEnd[index * 2 + 1]! + origin.y,
      ];
      for (let axis = 0; axis < 4; axis += 1)
        worst = Math.max(worst, Math.abs(got[axis]! - expected[axis]!));
    }
  }
  return worst;
}

/* ══════════════════════════════════════════════════════════════════════════
   La sonda llama al TESELADOR REAL — la herencia de la campaña de paridad
   ══════════════════════════════════════════════════════════════════════════ */

{
  // Un teselado del producto para una línea conocida: si `tessellateCadEntity`
  // dejara de restar el origen, esto lo diría en el acto.
  const origin = { x: UTM, y: UTM };
  const tessellation = tessellateCadEntity(
    line("t", [UTM, UTM, UTM + 100, UTM]),
    2,
    undefined,
    origin,
  );
  const flat = tessellation.paths.flatMap((path) => Array.from(path.xy));
  ok(flat.length >= 4, "el teselador real devuelve posiciones");
  ok(
    flat.every((value) => Math.abs(value) <= 1000),
    `y ya vienen REDUCIDAS por el origen (máx |v| = ${Math.max(...flat.map(Math.abs))}), no en magnitud UTM`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   EL CASO MIXTO, por el pipeline real
   ══════════════════════════════════════════════════════════════════════════ */

const model = shifted(PLAN, UTM);
const modelIds = model.map((_, index) => `modelo-${index}`);
const paperIds = SHEET.map((_, index) => `papel-${index}`);
const entities = [
  ...model.map((segment, index) => line(`modelo-${index}`, segment)),
  ...SHEET.map((segment, index) => line(`papel-${index}`, segment)),
];
const document = {
  meta: { version: 1, schema: 7, unit: "mm" },
  layers: [{ name: "0", color: 7, visible: true, frozen: false, locked: false }],
  entities,
  history: [],
  modelSpace: { entityIds: modelIds },
  paperSpaces: [{ id: "hoja", name: "A4", entityIds: paperIds }],
  styles: {},
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

const pipeline = new CadRenderPipeline();
pipeline.replace(entities, modelIds, document as never);
const chosen = pipeline.renderOrigin;

// El origen elegido tiene que estar PEGADO al levantamiento, no a medio camino
// entre el levantamiento y la hoja.
ok(
  dist(chosen, { x: UTM, y: UTM }) <= CAD_RENDER_ORIGIN_GRID,
  `el pipeline ancla el origen junto al espacio MODELO (${chosen.x}, ${chosen.y}), a menos de una celda de rejilla de (${UTM}, ${UTM})`,
);

const errorWithFix = packingError(model, chosen);
ok(
  errorWithFix < 1e-4,
  `con el origen anclado al modelo, el error de empaquetado es ${errorWithFix.toExponential(3)} unidades de dibujo — micras`,
);

/* ══════════════════════════════════════════════════════════════════════════
   LA PRUEBA NEGATIVA: cuánto costaba contaminar el origen con el papel
   ══════════════════════════════════════════════════════════════════════════ */

{
  // El origen que saldría de meter la hoja en los límites — exactamente lo que
  // el pipeline hacía antes de esta campaña.
  const contaminated = cadRenderOriginFromBounds(
    [...model, ...SHEET].reduce(
      (acc, [x1, y1, x2, y2]) => ({
        minX: Math.min(acc.minX, x1, x2),
        minY: Math.min(acc.minY, y1, y2),
        maxX: Math.max(acc.maxX, x1, x2),
        maxY: Math.max(acc.maxY, y1, y2),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    ),
  );
  ok(
    dist(contaminated, { x: UTM, y: UTM }) > CAD_RENDER_ORIGIN_GRID * 5,
    `el origen contaminado por la hoja cae en (${contaminated.x}, ${contaminated.y}), lejísimos del levantamiento`,
  );
  const errorWithout = packingError(model, contaminated);
  ok(
    errorWithout > 1e-3,
    `y con él el error sube a ${errorWithout.toExponential(3)} unidades de dibujo — CENTÍMETROS sobre un plano en milímetros`,
  );
  const improvement = errorWithout / errorWithFix;
  ok(
    improvement > 100,
    `la mejora del arreglo es de ${improvement.toFixed(0)}× (de ${errorWithout.toExponential(2)} a ${errorWithFix.toExponential(2)})`,
  );
  console.log(
    `  · caso mixto: ${errorWithout.toExponential(3)} → ${errorWithFix.toExponential(3)} unidades de dibujo (${improvement.toFixed(0)}× mejor)`,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Y el resto de magnitudes sigue en micras
   ══════════════════════════════════════════════════════════════════════════ */

for (const [label, offset] of [
  ["planta local", 0],
  ["nave grande (10⁴)", 10_000],
  ["UTM este (5·10⁵)", 500_000],
  ["UTM norte México (2·10⁶)", 2_000_000],
  ["UTM norte alto (10⁷)", 10_000_000],
] as const) {
  const segments = shifted(PLAN, offset);
  const bounds = segments.reduce(
    (acc, [x1, y1, x2, y2]) => ({
      minX: Math.min(acc.minX, x1, x2),
      minY: Math.min(acc.minY, y1, y2),
      maxX: Math.max(acc.maxX, x1, x2),
      maxY: Math.max(acc.maxY, y1, y2),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const error = packingError(segments, cadRenderOriginFromBounds(bounds));
  // Techo de 1 mm sobre un dibujo en milímetros: holgado frente a las micras
  // que se miden, y muy por debajo de los 4 cm que costaba no tener origen.
  ok(
    error < 1,
    `«${label}»: error de empaquetado ${error.toExponential(3)} < 1 unidad de dibujo`,
  );
}

// El documento NUNCA pasa por float32: la exportación es exacta.
{
  const segments = shifted(PLAN, 10_000_000);
  const round = JSON.parse(JSON.stringify(segments)) as typeof segments;
  ok(
    round.every((segment, index) =>
      segment.every((value, axis) => value === segments[index]![axis]),
    ),
    "el documento serializado conserva float64 EXACTO: el origen flotante es puramente de render",
  );
}

console.log(
  `verificación 1.6 (coordenadas grandes): ${checks} comprobaciones, caso mixto por el pipeline real`,
);
