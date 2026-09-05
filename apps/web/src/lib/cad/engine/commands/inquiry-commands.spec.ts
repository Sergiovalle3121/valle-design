/**
 * DIST, ID, AREA, LIST, MASSPROP y REGION a través del motor.
 *
 * El foco son los RECHAZOS tanto como los aciertos, y en particular el que el
 * enunciado exige: **un AREA sobre una polilínea abierta tiene que decir que la
 * va a cerrar**, no dar un número en silencio. Un área correcta para una figura
 * que el usuario no dibujó es peor que una negativa, porque nadie la revisa.
 *
 * También se afirma que las consultas PUBLICAN sus resultados en `DISTANCE`,
 * `AREA` y `PERIMETER`. Es lo que permite que una macro o un `.scr` lean la
 * medición, y es lo que separa un CAD de una calculadora que imprime.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { createCadVariableAccess } from "../../system-variables";
// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandStep,
} from "../command-types";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const SCENE: CadEntity[] = [
  {
    id: "rect",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 40, y: 0, z: 0 },
      { x: 40, y: 30, z: 0 },
      { x: 0, y: 30, z: 0 },
    ],
    closed: true,
    layer: "MUROS",
  },
  {
    id: "abierta",
    type: "polyline",
    vertices: [
      { x: 100, y: 0, z: 0 },
      { x: 140, y: 0, z: 0 },
      { x: 140, y: 30, z: 0 },
    ],
    closed: false,
    layer: "MUROS",
  },
  { id: "circ", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 10, layer: "EJES" },
  { id: "linea", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "EJES" },
  { id: "arcoA", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 5, startAngle: 0, endAngle: 90, layer: "0" },
];

let nextId = 0;
function context(overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  const byId = new Map(SCENE.map((entity) => [entity.id, entity]));
  return {
    entityIds: SCENE.map((entity) => entity.id),
    entity: (entityId) => byId.get(entityId),
    layers: () => [
      { id: "muros", name: "MUROS", color: "#fff", visible: true, locked: false },
      { id: "ejes", name: "EJES", color: "#0ff", visible: true, locked: false },
    ],
    selection: [],
    activeLayer: "0",
    variables: createCadVariableAccess(),
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo-${(nextId += 1)}`,
    ...overrides,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  ctx: CadCommandContext = context(),
): CadCommandStep<unknown> {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `el registro conoce ${name}`);
  let step = descriptor.begin(ctx) as CadCommandStep<unknown>;
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, ctx) as CadCommandStep<unknown>;
  }
  return step;
}

const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});

// ---------------------------------------------------------------------------
// DIST
// ---------------------------------------------------------------------------

{
  const step = run("DIST", [point(0, 0), point(30, 40)]);
  ok(step.result?.kind === "variables", "DIST termina publicando variables");
  if (step.result?.kind === "variables") {
    near(Number(step.result.patch.DISTANCE), 50, 1e-9, "DISTANCE queda publicada");
    equal(step.result.system, true, "y como escritura del SISTEMA, porque DISTANCE es de sólo lectura");
    ok(step.result.text!.includes("Distancia = 50.0000"), `el volcado da la distancia: ${step.result.text}`);
    ok(step.result.text!.includes("Delta Y = 40.0000"), "y los deltas");
    ok(step.result.text!.includes("\n"), "DIST son DOS renglones, como en AutoCAD");
  }
}

// Con unidades arquitectónicas, el MISMO comando escribe pies y pulgadas.
{
  const step = run("DIST", [point(0, 0), point(42, 0)], context({
    variables: createCadVariableAccess({ LUNITS: 4, LUPREC: 4 }),
  }));
  ok(
    step.result?.kind === "variables" && step.result.text!.includes(`3'-6"`),
    `42 unidades en arquitectónico son 3'-6": ${step.result?.kind === "variables" ? step.result.text : ""}`,
  );
}

// El SCU activo cambia los deltas, no la distancia.
{
  const step = run("DIST", [point(0, 0), point(10, 0)], context({
    variables: createCadVariableAccess({ UCSNAME: "GIRADO", UCSANGLE: 90 }),
  }));
  if (step.result?.kind === "variables") {
    near(Number(step.result.patch.DISTANCE), 10, 1e-9, "la distancia no depende del SCU");
    ok(
      step.result.text!.includes("Delta Y = -10.0000"),
      `pero los deltas sí: ${step.result.text}`,
    );
  }
}

equal(run("DIST", [{ kind: "cancel" }]).result?.kind, "none", "Esc cancela DIST sin publicar nada");

// ---------------------------------------------------------------------------
// ID
// ---------------------------------------------------------------------------

{
  const step = run("ID", [point(12.5, -3)]);
  ok(step.result?.kind === "variables", "ID termina");
  if (step.result?.kind === "variables")
    ok(
      step.result.text === "X = 12.5000  Y = -3.0000  Z = 0.0000",
      `ID escribe las tres coordenadas: ${step.result.text}`,
    );
}
{
  const step = run("ID", [point(110, 60)], context({
    variables: createCadVariableAccess({ UCSNAME: "PLANTA", UCSORGX: 100, UCSORGY: 50 }),
  }));
  ok(
    step.result?.kind === "variables" && step.result.text!.startsWith("X = 10.0000  Y = 10.0000"),
    `ID informa en el SCU activo: ${step.result?.kind === "variables" ? step.result.text : ""}`,
  );
  ok(
    step.result?.kind === "variables" && step.result.text!.includes(`SCU "PLANTA"`),
    "y dice en cuál, para que nadie confunda las coordenadas",
  );
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// Por puntos: cuatro esquinas y Enter.
{
  const step = run("AREA", [point(0, 0), point(40, 0), point(40, 30), point(0, 30), { kind: "enter" }]);
  ok(step.result?.kind === "variables", "AREA por puntos termina");
  if (step.result?.kind === "variables") {
    near(Number(step.result.patch.AREA), 1200, 1e-9, "AREA queda publicada");
    near(Number(step.result.patch.PERIMETER), 140, 1e-9, "y PERIMETER también");
  }
}

// Menos de tres puntos no es una superficie, y se dice.
{
  const step = run("AREA", [point(0, 0), point(10, 0), { kind: "enter" }]);
  ok(
    !step.result && step.prompt.message.includes("menos de tres puntos"),
    `dos puntos no cierran nada y AREA lo explica: "${step.prompt.message}"`,
  );
}

// Por objeto, sobre un contorno CERRADO: no hay aviso.
{
  const step = run("AREA", [
    { kind: "keyword", keyword: "Objeto" },
    { kind: "entityPick", entityId: "rect", point: { x: 1, y: 1 } },
  ]);
  ok(step.result?.kind === "variables", "AREA por objeto termina");
  if (step.result?.kind === "variables") {
    near(Number(step.result.patch.AREA), 1200, 1e-9, "el rectángulo mide 1200");
    ok(!step.result.text!.includes("abierto"), "y no avisa de nada, porque estaba cerrado");
  }
}

// EL ANCLA DEL ENUNCIADO: una polilínea ABIERTA avisa antes de dar el número.
{
  const step = run("AREA", [
    { kind: "keyword", keyword: "Objeto" },
    { kind: "entityPick", entityId: "abierta", point: { x: 101, y: 1 } },
  ]);
  ok(step.result?.kind === "variables", "AREA sobre una abierta también termina");
  if (step.result?.kind === "variables") {
    ok(
      step.result.text!.includes("está abierto") && step.result.text!.includes("se cierra"),
      `AREA DICE que cierra el contorno para medir: ${step.result.text}`,
    );
    near(Number(step.result.patch.AREA), 600, 1e-9, "y el número es el del triángulo resultante");
  }
}

// Un objeto que no encierra nada no da número: pide otro.
{
  const step = run("AREA", [
    { kind: "keyword", keyword: "Objeto" },
    { kind: "entityPick", entityId: "linea", point: { x: 1, y: 0 } },
  ]);
  ok(
    !step.result && step.prompt.message.includes("no encierra un área"),
    `una LINE no encierra área y AREA lo dice: "${step.prompt.message}"`,
  );
}

// Suma y resta acumulativas: losa menos hueco.
{
  const step = run("AREA", [
    { kind: "keyword", keyword: "Añadir" },
    { kind: "keyword", keyword: "Objeto" },
    { kind: "entityPick", entityId: "rect", point: { x: 1, y: 1 } },
    { kind: "keyword", keyword: "Restar" },
    { kind: "keyword", keyword: "Objeto" },
    { kind: "entityPick", entityId: "circ", point: { x: 1, y: 1 } },
    { kind: "keyword", keyword: "salir" },
  ]);
  ok(step.result?.kind === "variables", "AREA acumulativa termina con salir");
  if (step.result?.kind === "variables") {
    near(Number(step.result.patch.AREA), 1200 - Math.PI * 100, 1e-9, "1200 menos el círculo");
    ok(step.result.text!.includes("1 sumada(s), 1 restada(s)"), "y el desglose sale escrito");
  }
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

{
  const step = run("LIST", [], context({ selection: ["circ"] }));
  ok(step.result?.kind === "message", "LIST con selección previa vuelca de inmediato");
  if (step.result?.kind === "message") {
    ok(step.result.text.includes("CIRCLE"), "nombra el tipo");
    ok(step.result.text.includes("radius: 10.0000"), "y vuelca la propiedad del adaptador");
    ok(step.result.text.includes(`Capa: "EJES"`), "y la capa");
  }
}
{
  const step = run("LIST", [{ kind: "selection", entityIds: [] }]);
  ok(
    step.result?.kind === "message" && step.result.text.includes("no hay ningún objeto designado"),
    "LIST sin nada designado lo dice",
  );
}

// ---------------------------------------------------------------------------
// MASSPROP
// ---------------------------------------------------------------------------

{
  const step = run("MASSPROP", [], context({ selection: ["rect"] }));
  ok(step.result?.kind === "variables", "MASSPROP sobre una región termina publicando");
  if (step.result?.kind === "variables") {
    near(Number(step.result.patch.AREA), 1200, 1e-9, "publica el área");
    ok(step.result.text!.includes("Centroide"), "y vuelca el centroide");
    ok(step.result.text!.includes("REGIONES"), "con el encabezado de regiones");
  }
}

// Sobre algo que no es una región, MASSPROP se NIEGA y explica.
{
  const step = run("MASSPROP", [], context({ selection: ["linea", "abierta"] }));
  ok(step.result?.kind === "message", "MASSPROP sobre contornos abiertos no publica nada");
  if (step.result?.kind === "message") {
    ok(step.result.text.includes("sólo mide regiones"), `y dice por qué: ${step.result.text}`);
    ok(step.result.text.includes("REGION"), "y a qué comando ir");
  }
}

// ---------------------------------------------------------------------------
// REGION
// ---------------------------------------------------------------------------

// Cuatro líneas que cierran un rectángulo se funden en UNA región.
{
  const edges: CadEntity[] = [
    { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
    { id: "e2", type: "line", start: { x: 10, y: 0, z: 0 }, end: { x: 10, y: 10, z: 0 }, layer: "0" },
    // Dibujada al REVÉS a propósito: encadenar tiene que resolverlo.
    { id: "e3", type: "line", start: { x: 0, y: 10, z: 0 }, end: { x: 10, y: 10, z: 0 }, layer: "0" },
    { id: "e4", type: "line", start: { x: 0, y: 10, z: 0 }, end: { x: 0, y: 0, z: 0 }, layer: "0" },
  ];
  const byId = new Map(edges.map((entity) => [entity.id, entity]));
  const ctx = context({
    entityIds: edges.map((entity) => entity.id),
    entity: (entityId) => byId.get(entityId),
    selection: edges.map((entity) => entity.id),
  });
  const step = run("REGION", [], ctx);
  ok(step.result?.kind === "document", "REGION emite un lote");
  if (step.result?.kind === "document") {
    const inserts = step.result.commands.filter((command) => command.type === "insert");
    const deletes = step.result.commands.filter((command) => command.type === "delete");
    equal(inserts.length, 1, "una sola región para las cuatro líneas");
    equal(deletes.length, 4, "y las cuatro originales desaparecen");
    const created = inserts[0];
    ok(
      created.type === "insert" && created.entity.type === "polyline" && created.entity.closed,
      "la región es una polilínea CERRADA",
    );
    ok(
      created.type === "insert" &&
        created.entity.type === "polyline" &&
        created.entity.context?.metadata?.region === true,
      "y va marcada como región",
    );
  }
}

// Una cadena que NO cierra se rechaza diciéndolo, y no toca nada.
{
  const edges: CadEntity[] = [
    { id: "a1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
    { id: "a2", type: "line", start: { x: 10, y: 0, z: 0 }, end: { x: 10, y: 10, z: 0 }, layer: "0" },
  ];
  const byId = new Map(edges.map((entity) => [entity.id, entity]));
  const step = run("REGION", [], context({
    entityIds: edges.map((entity) => entity.id),
    entity: (entityId) => byId.get(entityId),
    selection: edges.map((entity) => entity.id),
  }));
  ok(step.result?.kind === "message", "una cadena abierta no produce documento");
  if (step.result?.kind === "message")
    ok(step.result.text.includes("cadena ABIERTA"), `y se explica: ${step.result.text}`);
}

// Un círculo YA es una región: se marca sin tocar su geometría.
{
  const step = run("REGION", [], context({ selection: ["circ"] }));
  ok(step.result?.kind === "document", "el círculo produce un cambio");
  if (step.result?.kind === "document") {
    equal(step.result.commands.length, 1, "una sola orden");
    equal(step.result.commands[0].type, "metadata", "y es una MARCA, no un reemplazo de geometría");
  }
}

console.log(`inquiry-commands.spec: ${checks} comprobaciones verdes.`);
