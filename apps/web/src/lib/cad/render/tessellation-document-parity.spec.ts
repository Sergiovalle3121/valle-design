/**
 * PARIDAD del teselado con y sin documento — el barrido que impide que la
 * marca `renderer.needsDocument` se quede atrás de la realidad.
 *
 * El carril fuera de hilo NO manda el documento al worker: clonarlo en cada
 * `postMessage` se comería la ganancia entera. A cambio, sólo puede despachar
 * lo que sin él sale IGUAL, y la cabecera de `pipeline-offthread.ts` lo promete
 * palabra por palabra: «la MISMA geometría que la reserva síncrona».
 *
 * Esa promesa se rompió sola. La función que decidía qué viajaba llevaba
 * escrita una lista de tipos —«todo menos INSERT»— y la ola de uniones de muro
 * hizo que WALL empezara a leer el documento para derivar sus ingletes. Nadie
 * tocó la lista, los muros siguieron viajando al worker y el navegador dibujó
 * muros con los testeros crudos que la reserva síncrona ya no dibujaba. Ni un
 * error, ni un aviso: sólo un plano mal dibujado.
 *
 * Por eso este spec no comprueba dos tipos: recorre TODOS los adaptadores del
 * REGISTRO —si alguien registra uno nuevo, aquí falta su ejemplo y el spec lo
 * dice— y exige la equivalencia en los dos sentidos:
 *
 *   · quien tesela distinto con documento TIENE que estar marcado, o el worker
 *     lo dibujará mal;
 *   · quien está marcado TIENE que teselar distinto con este ejemplo, o la
 *     marca es decorativa y aparta del worker trabajo que podía viajar.
 *
 * Y cierra con el caso concreto que se coló: dos muros en L a través del
 * pipeline con el worker encendido.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../cad-document";
import {
  CAD_ENTITY_REGISTRY,
  type CadNativeEntity,
  type CadNativeEntityType,
} from "../entity-runtime";
import { CadRenderPipeline, type CadOffThreadTessellator } from "./pipeline";
import { cadEntityTessellatesWithoutDocument } from "./pipeline-offthread";
import { tessellateCadEntityBatch } from "./tessellate.worker";
import {
  CadTessellationCache,
  cadRenderSegmentBudget,
  tessellateCadEntity,
  type CadRenderLodTier,
  type CadTessellation,
} from "./tessellation-cache";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const layer = "0";
const p = (x: number, y: number) => ({ x, y, z: 0 });

/**
 * Un ejemplar de CADA tipo registrado, montado para que su geometría se pueda
 * mirar: los que se derivan del documento (INSERT, WALL y OPENING) traen su
 * escenario —una definición de bloque, un muro vecino en L— porque un ejemplo
 * que no ejerce la dependencia haría pasar el barrido de forma vacía.
 */
const SAMPLES: Record<CadNativeEntityType, CadNativeEntity> = {
  line: { id: "line", type: "line", start: p(0, 0), end: p(1_000, 0), layer },
  polyline: {
    id: "polyline",
    type: "polyline",
    vertices: [p(0, 0), p(500, 300), p(900, 0)],
    closed: false,
    layer,
  },
  circle: { id: "circle", type: "circle", center: p(2_000, 0), radius: 400, layer },
  arc: {
    id: "arc",
    type: "arc",
    center: p(3_000, 0),
    radius: 300,
    startAngle: 0,
    endAngle: 90,
    layer,
  },
  ellipse: {
    id: "ellipse",
    type: "ellipse",
    center: p(4_000, 0),
    majorAxis: p(400, 0),
    ratio: 0.5,
    startParameter: 0,
    endParameter: Math.PI * 2,
    layer,
  },
  spline: {
    id: "spline",
    type: "spline",
    degree: 3,
    controlPoints: [p(5_000, 0), p(5_100, 200), p(5_300, 200), p(5_400, 0)],
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    layer,
  },
  mtext: {
    id: "mtext",
    type: "mtext",
    insertion: p(6_000, 0),
    text: "PARIDAD",
    height: 120,
    layer,
  },
  hatch: {
    id: "hatch",
    type: "hatch",
    pattern: "ANSI31",
    solid: false,
    boundaries: [[p(7_000, 0), p(7_400, 0), p(7_400, 400), p(7_000, 400)]],
    layer,
  },
  dimension: {
    id: "dimension",
    type: "dimension",
    a: { x: 8_000, y: 0 },
    b: { x: 8_600, y: 0 },
    dimensionKind: "linear",
    axis: "x",
    offset: 200,
    layer,
  },
  mleader: {
    id: "mleader",
    type: "mleader",
    vertices: [p(9_000, 0), p(9_300, 300)],
    text: "nota",
    textPosition: p(9_400, 300),
    layer,
  },
  insert: {
    id: "insert",
    type: "insert",
    block: "MARCO",
    insertion: p(10_000, 0),
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer,
  },
  point: { id: "point", type: "point", position: p(11_000, 0), style: 2, layer },
  xline: {
    id: "xline",
    type: "xline",
    basePoint: p(12_000, 0),
    direction: p(1, 1),
    layer,
  },
  ray: { id: "ray", type: "ray", basePoint: p(13_000, 0), direction: p(1, 0), layer },
  solid: {
    id: "solid",
    type: "solid",
    points: [p(14_000, 0), p(14_400, 0), p(14_400, 300), p(14_000, 300)],
    layer,
  },
  wipeout: {
    id: "wipeout",
    type: "wipeout",
    boundary: [p(15_000, 0), p(15_400, 0), p(15_400, 300)],
    frame: true,
    layer,
  },
  image: {
    id: "image",
    type: "image",
    definition: "logo",
    insertion: p(16_000, 0),
    uVector: p(1, 0),
    vVector: p(0, 1),
    size: { width: 200, height: 100 },
    layer,
  },
  attdef: {
    id: "attdef",
    type: "attdef",
    tag: "CODIGO",
    defaultValue: "P-01",
    insertion: p(17_000, 0),
    height: 120,
    rotation: 0,
    layer,
  },
  table: {
    id: "table",
    type: "table",
    insertion: p(18_000, 0),
    rows: 2,
    columns: 2,
    rowHeights: [200, 200],
    columnWidths: [400, 400],
    cells: [{ row: 0, column: 0, text: "A" }],
    layer,
  },
  solid3d: {
    id: "solid3d",
    type: "solid3d",
    nodes: [{ id: "caja", op: "box", min: p(19_000, 0), max: { x: 19_400, y: 400, z: 300 } }],
    root: "caja",
    layer,
  },
  region: {
    id: "region",
    type: "region",
    outer: [p(20_000, 0), p(20_400, 0), p(20_400, 400), p(20_000, 400)],
    layer,
  },
  // El muro bajo prueba y su vecino: se tocan en (21.000, 0) formando una L,
  // así que con documento salen con inglete y sin documento con testero.
  wall: {
    id: "wall",
    type: "wall",
    start: p(21_000, 0),
    end: p(22_000, 0),
    thickness: 250,
    height: 2_400,
    layer,
  },
  // El hueco alojado en ese mismo muro: sin documento no tiene anfitrión y no
  // dibuja nada, con documento dibuja jambas y hoja. Es el caso extremo de la
  // marca `needsDocument` y por eso entra en el barrido.
  opening: {
    id: "opening",
    type: "opening",
    kind: "door",
    hostId: "wall",
    position: 500,
    width: 900,
    height: 2_100,
    sill: 0,
    swing: "left",
    hinge: "start",
    layer,
  },
};

/** El vecino del muro: no se barre, existe para que la L exista. */
const WALL_NEIGHBOUR: CadNativeEntity = {
  id: "wall-vecino",
  type: "wall",
  start: p(21_000, 0),
  end: p(21_000, 1_000),
  thickness: 250,
  height: 2_400,
  layer,
};

const SAMPLE_ENTITIES = Object.values(SAMPLES);

const document: CadDocument = migrateCadDocument({
  meta: { version: 1, schema: 7, unit: "mm" },
  layers: [{ id: layer, name: "Cero", color: "#ffffff", visible: true, locked: false }],
  entities: [...SAMPLE_ENTITIES, WALL_NEIGHBOUR],
  modelSpace: { entityIds: [...SAMPLE_ENTITIES.map((entity) => entity.id), WALL_NEIGHBOUR.id] },
  blocks: [
    {
      id: "MARCO",
      name: "MARCO",
      basePoint: p(0, 0),
      entities: [
        { id: "marco-a", type: "line", start: p(-200, -200), end: p(200, -200), layer },
        { id: "marco-b", type: "line", start: p(200, -200), end: p(200, 200), layer },
      ],
    },
  ],
  imageDefinitions: [
    { id: "logo", name: "logo", uri: "cas://logo.png", pixelWidth: 200, pixelHeight: 100 },
  ],
}) as CadDocument;

const SEGMENTS = 64;

function sameGeometry(left: CadTessellation, right: CadTessellation): boolean {
  if (left.paths.length !== right.paths.length) return false;
  if (left.pointCount !== right.pointCount) return false;
  return left.paths.every((path, index) => {
    const other = right.paths[index];
    if (path.closed !== other.closed || path.xy.length !== other.xy.length) return false;
    return path.xy.every((value, position) => value === other.xy[position]);
  });
}

// ---------------------------------------------------------------------------
// EL BARRIDO. Ningún tipo registrado se queda fuera, y la marca tiene que
// coincidir con la realidad medida en los DOS sentidos.
// ---------------------------------------------------------------------------
const registeredTypes = CAD_ENTITY_REGISTRY.types();
assert.ok(registeredTypes.length >= 20, `el registro debe estar cargado: ${registeredTypes.length}`);

const marked: CadNativeEntityType[] = [];
const differing: CadNativeEntityType[] = [];
for (const type of registeredTypes) {
  const sample = SAMPLES[type];
  assert.ok(
    sample,
    `el tipo «${type}» está registrado y no tiene ejemplo en este spec. Añádelo: sin él, ` +
      `nadie comprueba si su teselado depende del documento y el worker podría dibujarlo mal.`,
  );
  assert.equal(sample.type, type, `el ejemplo de «${type}» tiene que ser de ese tipo`);

  const alone = tessellateCadEntity(sample, SEGMENTS);
  const withDocument = tessellateCadEntity(sample, SEGMENTS, document);
  const differs = !sameGeometry(alone, withDocument);
  const needsDocument =
    CAD_ENTITY_REGISTRY.adapter(sample).renderer.needsDocument === true;

  if (needsDocument) marked.push(type);
  if (differs) differing.push(type);

  assert.equal(
    differs,
    needsDocument,
    differs
      ? `«${type}» tesela DISTINTO con el documento y no declara renderer.needsDocument. ` +
        `Tal como está, viaja al worker —que tesela sin documento— y el navegador dibuja ` +
        `una geometría distinta de la de la reserva síncrona, sin error y sin aviso.`
      : `«${type}» declara renderer.needsDocument pero su ejemplo tesela IGUAL con y sin ` +
        `documento. O la marca sobra —y aparta del worker trabajo que podía viajar—, o el ` +
        `ejemplo de este spec no ejerce la dependencia y hay que arreglarlo.`,
  );

  // La consecuencia operativa de la marca, comprobada aquí y no deducida: lo
  // que se despacha al worker es EXACTAMENTE lo que no depende del documento.
  assert.equal(
    cadEntityTessellatesWithoutDocument(sample),
    !differs,
    `el carril fuera de hilo debe despachar «${type}» si y sólo si tesela igual sin documento`,
  );
}
ok(
  true,
  `barridos los ${registeredTypes.length} adaptadores del registro: ${differing.length} teselan ` +
    `distinto con documento (${differing.join(", ")}) y son exactamente los marcados ` +
    `needsDocument (${marked.join(", ")})`,
);
// El hueco alojado se suma a la lista con el esquema 7: sin documento no tiene
// anfitrión, así que no tiene NI UN punto — es el caso más extremo de los tres.
assert.deepEqual(
  marked,
  ["insert", "wall", "opening"],
  "hoy son INSERT, WALL y OPENING, y el barrido lo confirma",
);
assert.deepEqual(differing, marked);

// ---------------------------------------------------------------------------
// EL CASO CONCRETO: dos muros en L a través del pipeline CON worker.
//
// O el muro no se despacha, o lo que sale del worker es idéntico a la reserva
// síncrona. Aquí ocurre lo primero, y se comprueba además que el worker SÍ
// está trabajando —la línea sí viaja—, para que la prueba no pase porque el
// carril esté apagado.
// ---------------------------------------------------------------------------
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function main(): Promise<void> {
  const wallA: CadNativeEntity = {
    id: "a", type: "wall", start: p(0, 0), end: p(3_000, 0), thickness: 250, height: 2_400, layer,
  };
  const wallB: CadNativeEntity = {
    id: "b", type: "wall", start: p(0, 0), end: p(0, 3_000), thickness: 250, height: 2_400, layer,
  };
  const line: CadNativeEntity = {
    id: "l", type: "line", start: p(0, 2_000), end: p(2_000, 2_000), layer,
  };
  const ele: CadDocument = migrateCadDocument({
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [{ id: layer, name: "Cero", color: "#ffffff", visible: true, locked: false }],
    entities: [wallA, wallB, line],
    modelSpace: { entityIds: ["a", "b", "l"] },
  }) as CadDocument;

  const dispatched: string[] = [];
  const offThread: CadOffThreadTessellator = (entities, segments) => {
    for (const entity of entities) dispatched.push(entity.id);
    // El MISMO núcleo que corre dentro del worker de verdad — y, como él, sin
    // documento: es justo esa ausencia la que este spec vigila.
    return Promise.resolve({
      results: tessellateCadEntityBatch(entities, segments).results,
      source: "worker" as const,
    });
  };

  const cache = new CadTessellationCache();
  const pipeline = new CadRenderPipeline({ offThread, cache });
  pipeline.replace([wallA, wallB, line], ["a", "b", "l"], ele);
  pipeline.setView({
    bounds: { minX: -500, minY: -500, maxX: 3_500, maxY: 3_500 },
    pixelsPerUnit: 0.2,
  });
  let guard = 0;
  while (!pipeline.settled) {
    if (++guard > 100_000) throw new Error("el pipeline no asienta");
    if (pipeline.runFrame().ran === 0) await flush();
  }

  assert.ok(dispatched.includes("l"), "el carril del worker está encendido: la línea sí viaja");
  assert.ok(
    !dispatched.includes("a") && !dispatched.includes("b"),
    `los muros NO viajan al worker, que tesela sin documento: despachados ${dispatched.join(", ")}`,
  );

  const cached = ([0, 1, 2] as CadRenderLodTier[])
    .map((tier) => ({ tier, tessellation: cache.peek("a", tier) }))
    .find((entry) => entry.tessellation !== null)!;
  assert.ok(cached, "el muro A tiene teselado en caché");
  const budget = cadRenderSegmentBudget(cached.tier);
  // El pipeline resta su origen flotante (el centroide redondeado del
  // documento) ANTES de teselar: la comparación tiene que pasarle el mismo
  // origen o compararía coordenadas absolutas contra coordenadas ya offset.
  assert.ok(
    sameGeometry(cached.tessellation!, tessellateCadEntity(wallA, budget, ele, pipeline.origin)),
    "el teselado servido es el de la reserva síncrona CON documento: el muro trae su inglete",
  );
  assert.ok(
    !sameGeometry(cached.tessellation!, tessellateCadEntity(wallA, budget, undefined, pipeline.origin)),
    "y no el que habría producido el worker sin documento, que es el contorno sin uniones",
  );
  ok(
    true,
    `dos muros en L: la línea viaja al worker y los muros no, y su geometría servida es la ` +
      `síncrona con documento (inglete incluido)`,
  );
  pipeline.dispose();

  console.log(
    `tessellation-document-parity: ${checks} comprobaciones verdes — los ${registeredTypes.length} ` +
      `adaptadores del registro barridos con y sin documento, la marca needsDocument coincide con ` +
      `la realidad en los dos sentidos (${marked.join(", ")}), y dos muros en L no llegan al worker.`,
  );
}

void main();
