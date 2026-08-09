/**
 * ARRAY y ARRAYEDIT.
 *
 * Las cinco cosas que se afirman, y por qué cada una:
 *
 *   1. UN LOTE. Una matriz de 50 elementos emite 50 copias en un solo
 *      `CadEntityCommand[]`. Si emitiera uno por copia, Ctrl+Z desharía la
 *      última y quien pulsó una vez creería haberlas deshecho todas.
 *   2. Las COLOCACIONES son las correctas, con anclas absolutas. Una matriz
 *      polar que ponga las copias donde no toca se ve, pero una que las ponga
 *      casi bien —el reparto de un ángulo parcial, por ejemplo— no.
 *   3. La ASOCIACIÓN se ESCRIBE. Sin `arrayId` y sin los parámetros, «matriz
 *      asociativa» no significa nada: sería un copiar-pegar con nombre bonito.
 *   4. ARRAYEDIT REGENERA de verdad: borra las copias viejas y crea las nuevas,
 *      sin tocar los originales — que es lo que conserva las cotas asociativas
 *      y los sombreados que los apuntan.
 *   5. Los RECHAZOS explican. Una matriz de un elemento no multiplica nada, y
 *      hay que decirlo en vez de emitir un lote vacío.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import {
  CAD_ARRAY_META,
  cadArrayPlacements,
  parseCadArraySpec,
  serializeCadArraySpec,
} from "../../cad-array-placement";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_ARRAY_COMMANDS } from "./modify-array";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const commands = new Map(CAD_MODIFY_ARRAY_COMMANDS.map((command) => [command.name, command]));

const SCENE: CadEntity[] = [
  { id: "seat", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: "0" },
  { id: "far", type: "line", start: { x: 100, y: 0, z: 0 }, end: { x: 101, y: 0, z: 0 }, layer: "0" },
  {
    id: "path",
    type: "line",
    start: { x: 0, y: 50, z: 0 },
    end: { x: 100, y: 50, z: 0 },
    layer: "0",
  },
  { id: "note", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "x", layer: "0" },
];

function makeContext(extra: CadEntity[] = []): CadCommandContext {
  const entities = new Map([...SCENE, ...extra].map((entity) => [entity.id, entity]));
  let ids = 0;
  return {
    entityIds: [...entities.keys()],
    entity: (id) => entities.get(id),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[], context = makeContext()) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe existir`);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

const enter: CadCommandInput = { kind: "enter" };
const pick = (entityId: string): CadCommandInput => ({
  kind: "entityPick",
  entityId,
  point: { x: 0, y: 0 },
});
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const keyword = (word: string): CadCommandInput => ({ kind: "keyword", keyword: word });

// --- las colocaciones, con anclas absolutas ---------------------------------------
{
  // Rejilla 2×3, filas cada 10, columnas cada 4. Orden fila-mayor.
  const grid = cadArrayPlacements({
    kind: "rectangular",
    rows: 2,
    cols: 3,
    rowSpacing: 10,
    colSpacing: 4,
  });
  assert.equal(grid.length, 6, "2×3 son seis colocaciones");
  near(grid[0].translation!.x, 0, 1e-9, "la primera es la identidad");
  near(grid[0].translation!.y, 0, 1e-9, "");
  near(grid[2].translation!.x, 8, 1e-9, "tercera columna de la primera fila");
  near(grid[3].translation!.x, 0, 1e-9, "y la segunda fila vuelve a x=0");
  near(grid[3].translation!.y, 10, 1e-9, "una fila más arriba");

  // Polar de 4 en 360°: pasos de 90° alrededor de (10, 0). La copia 1 gira 90°
  // y su traslación es la que lleva el origen a su sitio: (10,0) − R90·(10,0)
  // = (10, 0) − (0, 10) = (10, −10).
  const polar = cadArrayPlacements({ kind: "polar", center: { x: 10, y: 0 }, count: 4 });
  assert.equal(polar.length, 4);
  near(polar[1].rotationDeg ?? 0, 90, 1e-9, "cada copia gira un cuarto");
  near(polar[1].translation!.x, 10, 1e-9, "y se traslada para girar alrededor del centro");
  near(polar[1].translation!.y, -10, 1e-9, "");

  // Ángulo PARCIAL: con 3 copias en 90°, el paso es 45° (copias en los dos
  // extremos), no 30°. Es la diferencia que no se ve a ojo.
  const partial = cadArrayPlacements({
    kind: "polar",
    center: { x: 0, y: 0 },
    count: 3,
    totalAngle: 90,
  });
  near(partial[1].rotationDeg ?? 0, 45, 1e-9, "un ángulo parcial reparte en count−1 pasos");
  near(partial[2].rotationDeg ?? 0, 90, 1e-9, "y llega justo al extremo");

  // Camino recto de 100 con 5 copias: una cada 25, sin girar.
  const path = cadArrayPlacements({
    kind: "path",
    path: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    count: 5,
    base: { x: 0, y: 0 },
  });
  assert.equal(path.length, 5);
  near(path[2].translation!.x, 50, 1e-9, "la copia del medio cae a la mitad");
  near(path[4].translation!.x, 100, 1e-9, "y la última en el extremo");
}

// --- ARRAY rectangular: un lote, y la asociación escrita ----------------------------
{
  const result = run("ARRAY", [
    pick("seat"),
    keyword("Rectangular"),
    distance(2),
    distance(3),
    distance(10),
    distance(4),
  ]);
  assert.ok(result && result.kind === "document", "la matriz se emite");
  // 1 metadata del original + 5 copias × (copy + transform + metadata).
  assert.equal(result.commands.length, 1 + 5 * 3, "UN lote con todo dentro");
  assert.equal(
    result.commands.filter((command) => command.type === "copy").length,
    5,
    "cinco copias nuevas: la primera colocación ES el original",
  );

  const originalMark = result.commands[0];
  assert.ok(originalMark.type === "metadata");
  assert.equal(originalMark.entityId, "seat");
  assert.equal(originalMark.patch[CAD_ARRAY_META.index], 0, "el original es el índice 0");
  assert.equal(originalMark.patch[CAD_ARRAY_META.kind], "rectangular");
  const params = originalMark.patch[CAD_ARRAY_META.params];
  assert.ok(
    typeof params === "string" && params.includes('"rows":2'),
    "los PARÁMETROS viajan con cada miembro: sin ellos no hay nada que regenerar",
  );

  const transforms = result.commands.filter((command) => command.type === "transform");
  assert.equal(transforms.length, 5);
  assert.ok(transforms[0].type === "transform");
  near(transforms[0].transform.translation!.x, 4, 1e-9, "la primera copia va una columna a la derecha");
}

// --- ARRAY polar de 50: SIGUE siendo un lote -----------------------------------------
{
  const result = run("ARRAY", [
    pick("seat"),
    keyword("PolaR"),
    point(0, 0),
    distance(50),
    enter,
  ]);
  assert.ok(result && result.kind === "document");
  assert.equal(
    result.commands.filter((command) => command.type === "copy").length,
    49,
    "cincuenta elementos son cuarenta y nueve copias",
  );
  assert.equal(
    new Set(
      result.commands
        .filter((command) => command.type === "metadata")
        .map((command) => command.patch[CAD_ARRAY_META.id]),
    ).size,
    1,
    "todas comparten un único identificador de matriz",
  );
}

// --- ARRAY de camino: el camino tiene que serlo ----------------------------------------
{
  const ok = run("ARRAY", [pick("seat"), keyword("Camino"), pick("path"), point(0, 0), distance(4)]);
  assert.ok(ok && ok.kind === "document", "una línea sirve de camino");

  const refused = run("ARRAY", [pick("seat"), keyword("Camino"), pick("note")]);
  assert.equal(refused?.kind, "message", "un MTEXT no es un camino");
  assert.ok(refused.kind === "message" && refused.text.includes("camino"));
}

// --- los rechazos explican --------------------------------------------------------------
{
  const single = run("ARRAY", [
    pick("seat"),
    keyword("Rectangular"),
    distance(1),
    distance(1),
    distance(10),
    distance(10),
  ]);
  assert.equal(single?.kind, "message", "una matriz de un elemento no multiplica nada");
  assert.ok(single.kind === "message" && single.text.includes("no multiplica"));

  const empty = run("ARRAY", [enter]);
  assert.equal(empty?.kind, "message");
  assert.ok(empty.kind === "message" && empty.text.includes("designado"));
}

// --- ARRAYEDIT regenera desde los parámetros guardados ------------------------------------
{
  const params = JSON.stringify({ kind: "polar", center: { x: 0, y: 0 }, count: 4, totalAngle: 360 });
  const member = (id: string, index: number): CadEntity => ({
    id,
    type: "line",
    start: { x: 10, y: 0, z: 0 },
    end: { x: 11, y: 0, z: 0 },
    layer: "0",
    context: {
      metadata: {
        [CAD_ARRAY_META.id]: "A1",
        [CAD_ARRAY_META.kind]: "polar",
        [CAD_ARRAY_META.index]: index,
        [CAD_ARRAY_META.params]: params,
      },
    },
  });
  const context = makeContext([member("m0", 0), member("m1", 1), member("m2", 2), member("m3", 3)]);
  const result = run("ARRAYEDIT", [pick("m2"), distance(6)], context);
  assert.ok(result && result.kind === "document", "la matriz se regenera");

  const deletions = result.commands.filter((command) => command.type === "delete");
  assert.equal(deletions.length, 3, "se borran las tres copias viejas");
  assert.ok(
    !deletions.some((command) => command.type === "delete" && command.entityId === "m0"),
    "el ORIGINAL no se borra: lo que lo apunte seguiría apuntando a un hueco",
  );
  assert.equal(
    result.commands.filter((command) => command.type === "copy").length,
    5,
    "y se crean cinco copias nuevas para llegar a seis elementos",
  );
  const marks = result.commands.filter((command) => command.type === "metadata");
  assert.ok(
    marks.every((command) => command.type === "metadata" && command.patch[CAD_ARRAY_META.id] === "A1"),
    "conservando el identificador de la matriz, que es lo que la mantiene viva",
  );
}

// --- ARRAYEDIT sobre algo que no es matriz, y sobre parámetros perdidos ---------------------
{
  const loose = run("ARRAYEDIT", [pick("seat")]);
  assert.equal(loose?.kind, "message");
  assert.ok(loose.kind === "message" && loose.text.includes("no pertenece"));

  const broken: CadEntity = {
    id: "b",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1, y: 0, z: 0 },
    layer: "0",
    context: { metadata: { [CAD_ARRAY_META.id]: "B1", [CAD_ARRAY_META.index]: 0 } },
  };
  const result = run("ARRAYEDIT", [pick("b")], makeContext([broken]));
  assert.equal(result?.kind, "message");
  assert.ok(
    result.kind === "message" && result.text.includes("inventárselos"),
    "sin parámetros no se regenera: adivinarlos daría una matriz distinta de la que se ve",
  );
}

// --- unos parámetros que no caben se OMITEN, no se truncan ---------------------------------
{
  // Los parámetros viajan en el `metadata` de CADA miembro. Un camino teselado
  // largo, guardado cincuenta veces, engordaría el documento más que el dibujo
  // entero. Pasado el tope se omite la clave y ARRAYEDIT dice que no puede
  // regenerar — que es lo honesto — en vez de guardar medio JSON.
  const huge = {
    kind: "path" as const,
    path: Array.from({ length: 400 }, (_unused, index) => ({ x: index * 1.123456789, y: index })),
    count: 5,
    base: { x: 0, y: 0 },
  };
  assert.equal(serializeCadArraySpec(huge), "", "un camino enorme no cabe");
  assert.equal(parseCadArraySpec(""), null, "y lo que no cabe no se puede releer");

  const small = { kind: "path" as const, path: [{ x: 0, y: 0 }, { x: 10, y: 0 }], count: 3, base: { x: 0, y: 0 } };
  assert.ok(serializeCadArraySpec(small).length > 0, "uno normal sí cabe");
  assert.deepEqual(parseCadArraySpec(serializeCadArraySpec(small))?.kind, "path", "y vuelve entero");

  // Y el comando lo refleja: sin parámetros que quepan, la pertenencia se
  // guarda igual pero la promesa de regenerar no.
  const commands = run("ARRAY", [
    pick("seat"),
    keyword("Rectangular"),
    distance(1),
    distance(2),
    distance(0),
    distance(10),
  ]);
  assert.ok(commands && commands.kind === "document");
  const mark = commands.commands.find((command) => command.type === "metadata");
  assert.ok(mark && mark.type === "metadata");
  assert.ok(
    typeof mark.patch[CAD_ARRAY_META.params] === "string",
    "una rectangular normal SÍ guarda sus parámetros",
  );
}

console.log(
  `ARRAY: rectangular, polar y de camino con ${checks} anclas de colocación, ` +
    `asociación escrita en cada miembro y ARRAYEDIT regenerando sin tocar los originales`,
);
