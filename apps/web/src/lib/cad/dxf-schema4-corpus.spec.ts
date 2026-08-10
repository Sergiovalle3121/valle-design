import assert from "node:assert/strict";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";
import {
  cadDocumentDxfExportLosses,
  cadDocumentNativeDxfPrimitives,
  cadDxfPrimitivesToCanonicalEntities,
} from "./dxf-cad-document";
import type { CadDocument, CadEntity } from "./cad-document";

/**
 * Corpus de ida y vuelta DXF a escala, y la diferencia entre POSIBLE y ESTABLE.
 *
 * `docs/competitive/autocad-2027-gap-matrix.md` marca P0 la fila de import/export
 * DXF con dos brechas: falta corpus diverso y el round-trip masivo no está
 * demostrado. Los specs existentes recorren pocas entidades hechas a mano; lo
 * que ninguno cubría es el dibujo grande y heterogéneo.
 *
 * Lo que se demuestra aquí no es que la ida y vuelta funcione una vez, sino que
 * CONVERGE: a partir de la primera vuelta el fichero es un PUNTO FIJO byte a
 * byte, y el documento reconstruido no cambia más. Es la única forma de
 * descartar la degradación acumulativa —el dibujo que pierde un poco en cada
 * intercambio con el cliente y en el que ninguna vuelta suelta parece
 * incorrecta.
 *
 * La primera vuelta NO es byte-idéntica, y el motivo está medido y es uno solo:
 * los ángulos. El importador los devuelve en `(−180, 180]` vía `projectedAngle`
 * —un arco que iba a 300° vuelve a −60°, que es el MISMO ángulo— y el runtime
 * normaliza a `[0, 360)`. Por eso la comparación byte a byte se hace entre la
 * segunda y la tercera pasada, y entre la primera y la segunda se comparan
 * conteos, orden de dibujo y coordenadas.
 *
 * Todos los documentos se generan aquí de forma determinista: no se incorpora
 * ningún fichero de terceros ni se depende de ningún corpus externo.
 */

const TOLERANCE = 1e-6;

/**
 * Normaliza un documento para compararlo: ids y contexto fuera, y los números a
 * las seis cifras que guarda el fichero.
 *
 * Comparar dobles crudos exigiría que dos `atan2` sucesivos dieran EXACTAMENTE
 * el mismo bit, y no lo dan: −59,99999999999997 y −59,99999999999992 son el
 * mismo ángulo y el mismo byte en el DXF. La estabilidad que importa es la del
 * FICHERO, y esa se comprueba aparte byte a byte.
 */
function comparable(entities: CadEntity[]): unknown {
  const round = (value: unknown): unknown => {
    if (typeof value === "number") return Number(value.toFixed(6));
    if (Array.isArray(value)) return value.map(round);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
          key,
          round(nested),
        ]),
      );
    return value;
  };
  return entities.map((entity) => round({ ...entity, id: "", context: undefined }));
}
const p = (x: number, y: number, z = 0) => ({ x, y, z });

/** Generador determinista: mismo corpus en cada corrida, sin `Math.random`. */
function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const LAYERS = ["MUROS", "ZONAS", "DETALLE", "REF", "MASCARA", "FONDO", "CUADRO"];

const IMAGE_DEFINITIONS = [
  {
    id: "img-planta",
    name: "planta",
    uri: "asset://tenant/planos/planta.png",
    pixelWidth: 2_048,
    pixelHeight: 1_536,
  },
  {
    id: "img-detalle",
    name: "detalle",
    uri: "asset://tenant/planos/detalle.png",
    pixelWidth: 512,
    pixelHeight: 512,
  },
];

/**
 * Planta densa: la geometría clásica que ya existía, a escala. Sirve de control
 * — si la fidelidad se rompiera aquí, no sería culpa del esquema 4.
 */
function densePlan(count: number): CadEntity[] {
  const random = pseudoRandom(20_260_809);
  const entities: CadEntity[] = [];
  for (let index = 0; index < count; index += 1) {
    const layer = LAYERS[index % 3];
    const x = Math.round(random() * 100_000) / 10;
    const y = Math.round(random() * 100_000) / 10;
    const kind = index % 5;
    if (kind === 0)
      entities.push({
        id: `d-line-${index}`,
        type: "line",
        start: p(x, y),
        end: p(x + 1_250, y + 375),
        layer,
      } as CadEntity);
    else if (kind === 1)
      entities.push({
        id: `d-poly-${index}`,
        type: "polyline",
        vertices: [p(x, y), p(x + 800, y), p(x + 800, y + 600, 0), p(x, y + 600)],
        closed: index % 2 === 0,
        layer,
      } as CadEntity);
    else if (kind === 2)
      entities.push({
        id: `d-arc-${index}`,
        type: "arc",
        center: p(x, y),
        radius: 120 + (index % 40),
        startAngle: 30,
        endAngle: 300,
        layer,
      } as CadEntity);
    else if (kind === 3)
      entities.push({
        id: `d-circle-${index}`,
        type: "circle",
        center: p(x, y),
        radius: 45 + (index % 25),
        layer,
      } as CadEntity);
    else
      entities.push({
        id: `d-bulge-${index}`,
        type: "polyline",
        vertices: [
          { ...p(x, y), bulge: 0.75 },
          p(x + 500, y),
          { ...p(x + 500, y + 400), bulge: -0.4 },
        ],
        closed: true,
        layer,
      } as CadEntity);
  }
  return entities;
}

/** Los ocho tipos del esquema 4, a cientos y entremezclados. */
function schema4Bulk(count: number): CadEntity[] {
  const random = pseudoRandom(4_040_404);
  const entities: CadEntity[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = Math.round(random() * 40_000) / 10;
    const y = Math.round(random() * 40_000) / 10;
    switch (index % 7) {
      case 0:
        entities.push({
          id: `s-point-${index}`,
          type: "point",
          position: p(x, y),
          style: 34,
          size: 15,
          layer: "REF",
        } as CadEntity);
        break;
      case 1:
        entities.push({
          id: `s-xline-${index}`,
          type: "xline",
          basePoint: p(x, y),
          direction: p(3, 4),
          layer: "REF",
        } as CadEntity);
        break;
      case 2:
        entities.push({
          id: `s-ray-${index}`,
          type: "ray",
          basePoint: p(x, y),
          direction: p(-1, 2),
          layer: "REF",
        } as CadEntity);
        break;
      case 3:
        entities.push({
          id: `s-solid-${index}`,
          type: "solid",
          points:
            index % 2 === 0
              ? [p(x, y), p(x + 200, y), p(x + 200, y + 150), p(x, y + 150)]
              : [p(x, y), p(x + 180, y), p(x + 90, y + 160)],
          layer: "ZONAS",
        } as CadEntity);
        break;
      case 4:
        entities.push({
          id: `s-wipeout-${index}`,
          type: "wipeout",
          boundary: [p(x, y), p(x + 300, y), p(x + 300, y + 120), p(x, y + 120)],
          frame: true,
          layer: "MASCARA",
        } as CadEntity);
        break;
      case 5:
        entities.push({
          id: `s-image-${index}`,
          type: "image",
          definition: IMAGE_DEFINITIONS[index % 2].id,
          insertion: p(x, y),
          uVector: p(0.5, 0),
          vVector: p(0, 0.5),
          size: {
            width: IMAGE_DEFINITIONS[index % 2].pixelWidth,
            height: IMAGE_DEFINITIONS[index % 2].pixelHeight,
          },
          brightness: 55,
          contrast: 45,
          fade: 5,
          layer: "FONDO",
        } as CadEntity);
        break;
      default:
        entities.push({
          id: `s-attdef-${index}`,
          type: "attdef",
          tag: `TAG${index}`,
          prompt: `Etiqueta ${index}`,
          defaultValue: `V-${index}`,
          insertion: p(x, y),
          height: 90,
          rotation: (index * 37) % 360,
          alignment: index % 3 === 0 ? "middle-center" : "bottom-left",
          invisible: index % 4 === 0,
          constant: index % 5 === 0,
          layer: "ATRIB",
        } as CadEntity);
    }
  }
  return entities;
}

/**
 * Degenerados y extremos: lo que un corpus honesto tiene que llevar dentro.
 * Ninguno debe reventar la exportación ni inventar geometría al volver.
 */
function hostile(): CadEntity[] {
  return [
    { id: "h-xline-nula", type: "xline", basePoint: p(0, 0), direction: p(0, 0), layer: "REF" },
    { id: "h-solid-corto", type: "solid", points: [p(0, 0), p(10, 0)], layer: "ZONAS" },
    { id: "h-wipeout-corto", type: "wipeout", boundary: [p(0, 0), p(5, 5)], layer: "MASCARA" },
    {
      id: "h-solid-colineal",
      type: "solid",
      points: [p(0, 0), p(100, 0), p(200, 0)],
      layer: "ZONAS",
    },
    {
      id: "h-image-huerfana",
      type: "image",
      definition: "no-existe",
      insertion: p(10, 10),
      uVector: p(1, 0),
      vVector: p(0, 1),
      size: { width: 10, height: 10 },
      layer: "FONDO",
    },
    {
      id: "h-point-lejano",
      type: "point",
      position: p(9_999_999.5, -9_999_999.25),
      style: 34,
      size: 15,
      layer: "REF",
    },
    {
      id: "h-table-vacia",
      type: "table",
      insertion: p(0, 0),
      rows: 0,
      columns: 0,
      rowHeights: [],
      columnWidths: [],
      cells: [],
      layer: "CUADRO",
    },
  ] as unknown as CadEntity[];
}

/** Entrelaza dos listas alternando de una y otra hasta agotarlas. */
function interleave(a: CadEntity[], b: CadEntity[]): CadEntity[] {
  const out: CadEntity[] = [];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index]) out.push(a[index]);
    if (b[index]) out.push(b[index]);
  }
  return out;
}

function documentOf(entities: CadEntity[]): CadDocument {
  return {
    entities,
    layers: LAYERS.map((name) => ({
      id: name,
      name,
      color: "#ffffff",
      visible: true,
      locked: false,
    })),
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    unsupportedEntities: [],
    imageDefinitions: IMAGE_DEFINITIONS,
  } as unknown as CadDocument;
}

interface CorpusCase {
  name: string;
  entities: CadEntity[];
  /** Tipos que DEBEN sobrevivir la ida y vuelta con su conteo exacto. */
  expectStableTypes: boolean;
}

const CORPUS: CorpusCase[] = [
  { name: "planta densa (1.000)", entities: densePlan(1_000), expectStableTypes: true },
  { name: "esquema 4 a granel (700)", entities: schema4Bulk(700), expectStableTypes: true },
  {
    // ENTRELAZADO a propósito: si las primitivas del esquema 4 se amontonaran
    // al principio o al final al importar, la comprobación de orden de dibujo
    // de más abajo fallaría aquí y sólo aquí.
    name: "mixto grande entrelazado (1.700)",
    entities: interleave(densePlan(1_000), schema4Bulk(700)),
    expectStableTypes: true,
  },
  { name: "degenerados y extremos", entities: hostile(), expectStableTypes: false },
];

let totalEntities = 0;
let totalBytes = 0;

for (const testCase of CORPUS) {
  const document = documentOf(testCase.entities);
  totalEntities += testCase.entities.length;

  // Ida.
  const first = exportCadDxf({ primitives: cadDocumentNativeDxfPrimitives(document) }).content;
  totalBytes += first.length;
  assert.ok(first.length > 0);
  const imported = importDxfPrimitives(first);
  assert.deepEqual(
    imported.warnings.filter((warning) => warning.code === "unsupported_entity"),
    [],
    `${testCase.name}: nada de lo que este exportador escribe puede volver como "no soportado"`,
  );
  const back = cadDxfPrimitivesToCanonicalEntities(imported.primitives, {
    idPrefix: "rt",
    provider: "native-dxf",
  });

  // Vuelta: el MISMO documento, reexportado, y una tercera pasada.
  const second = exportCadDxf({
    primitives: cadDocumentNativeDxfPrimitives(documentOf(back)),
  }).content;
  const backAgain = cadDxfPrimitivesToCanonicalEntities(
    importDxfPrimitives(second).primitives,
    { idPrefix: "rt", provider: "native-dxf" },
  );
  const third = exportCadDxf({
    primitives: cadDocumentNativeDxfPrimitives(documentOf(backAgain)),
  }).content;

  // ── La propiedad que importa: PUNTO FIJO ────────────────────────────────
  assert.equal(
    third,
    second,
    `${testCase.name}: a partir de la primera vuelta el fichero tiene que ser IDÉNTICO ` +
      "byte a byte; si sigue cambiando, cada intercambio con el cliente degrada el dibujo",
  );
  assert.deepEqual(
    comparable(backAgain),
    comparable(back),
    `${testCase.name}: el documento reconstruido tampoco puede seguir cambiando`,
  );
  totalBytes += second.length;

  if (!testCase.expectStableTypes) continue;

  // ── Conteos por tipo ────────────────────────────────────────────────────
  const census = (entities: CadEntity[]) => {
    const counts: Record<string, number> = {};
    for (const entity of entities) counts[entity.type] = (counts[entity.type] ?? 0) + 1;
    return counts;
  };
  const before = census(testCase.entities);
  const after = census(back);
  // `rect` es la forma canónica de una polilínea cerrada de cuatro esquinas
  // alineadas con los ejes: el importador la reconoce como tal y sigue siendo
  // una polilínea en el documento, así que los conteos se comparan por tipo
  // del DOCUMENTO, no por `kind` de primitiva.
  for (const [type, count] of Object.entries(before))
    assert.equal(
      after[type] ?? 0,
      count,
      `${testCase.name}: ${type} pierde entidades en la ida y vuelta (${count} → ${after[type] ?? 0})`,
    );

  // ── Anclas absolutas: no basta con que los conteos cuadren ─────────────
  const original = testCase.entities.find((entity) => entity.type === "solid");
  if (original?.type === "solid") {
    const returned = back.find(
      (entity) => entity.type === "solid" && entity.points.length === original.points.length,
    );
    assert.ok(returned?.type === "solid", `${testCase.name}: no volvió ningún SOLID comparable`);
    original.points.forEach((point, index) => {
      assert.ok(
        Math.abs(returned.points[index].x - point.x) <= TOLERANCE &&
          Math.abs(returned.points[index].y - point.y) <= TOLERANCE,
        `${testCase.name}: el vértice ${index} del SOLID cambió de sitio`,
      );
    });
  }

  // ── Orden de dibujo ────────────────────────────────────────────────────
  //
  // El orden de la sección ENTITIES ES el orden de dibujo. Para un WIPEOUT eso
  // no es cosmético: su sitio en la pila decide qué tapa. Si las primitivas del
  // esquema 4 se amontonaran al principio en vez de intercalarse, esta
  // comparación fallaría.
  assert.deepEqual(
    back.map((entity) => entity.type),
    testCase.entities.map((entity) => entity.type),
    `${testCase.name}: la ida y vuelta debe conservar el ORDEN DE DIBUJO`,
  );
}

// --- Los degenerados: ni revientan ni inventan geometría ------------------

const hostileDocument = documentOf(hostile());
const hostileLosses = cadDocumentDxfExportLosses(hostileDocument);
const hostileBack = cadDxfPrimitivesToCanonicalEntities(
  importDxfPrimitives(
    exportCadDxf({ primitives: cadDocumentNativeDxfPrimitives(hostileDocument) }).content,
  ).primitives,
  { idPrefix: "rt", provider: "native-dxf" },
);
for (const id of [
  "h-xline-nula",
  "h-solid-corto",
  "h-wipeout-corto",
  "h-image-huerfana",
  "h-table-vacia",
]) {
  assert.ok(
    hostileLosses.some((loss) => loss.entityId === id),
    `${id} no llega al fichero y tiene que declararse, no desaparecer`,
  );
}
assert.equal(
  hostileBack.filter((entity) => entity.type === "xline").length,
  0,
  "una XLINE sin dirección no define recta: no se inventa una",
);
const farPoint = hostileBack.find((entity) => entity.type === "point");
assert.ok(farPoint?.type === "point");
assert.equal(
  farPoint.position.x,
  9_999_999.5,
  "una coordenada de siete cifras con decimales sobrevive al formato del exportador",
);

console.log(
  `dxf-schema4-corpus.spec.ts OK — ${CORPUS.length} corpus, ${totalEntities} entidades, ` +
    `${Math.round(totalBytes / 1_024)} KiB de DXF, ida y vuelta estable (punto fijo)`,
);
