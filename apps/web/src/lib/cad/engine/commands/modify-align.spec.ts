/**
 * ALIGN y MATCHPROP.
 *
 * Lo que se afirma:
 *
 *   1. ALIGN emite UNA transformada por objeto, no un MOVE seguido de un
 *      ROTATE. Dos operaciones darían el mismo dibujo con dos pasos de deshacer
 *      y dos redondeos.
 *   2. `Escalar` cambia el resultado. Sin esta aserción, la opción podría no
 *      estar implementada y la spec seguiría verde: el giro y la traslación son
 *      los mismos con y sin ella.
 *   3. MATCHPROP copia SÓLO lo marcado. Un cuadro de propiedades que no filtra
 *      nada es un adorno.
 *   4. Copiar «sin color explícito» BORRA el color del destino. Es la única
 *      forma de devolver algo a PorCapa con MATCHPROP, y la que se olvida.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_MODIFY_ALIGN_COMMANDS } from "./modify-align";

let checks = 0;
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

const commands = new Map(CAD_MODIFY_ALIGN_COMMANDS.map((command) => [command.name, command]));

const SCENE: CadEntity[] = [
  { id: "part", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: "0" },
  { id: "other", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 6, y: 5, z: 0 }, layer: "0" },
  {
    id: "styled",
    type: "line",
    start: { x: 0, y: 9, z: 0 },
    end: { x: 1, y: 9, z: 0 },
    layer: "muros",
    context: {
      presentation: {
        color: { source: "explicit", value: "#ff0000" },
        lineweight: { source: "explicit", value: 50 },
      },
    },
  },
  {
    id: "plain",
    type: "line",
    start: { x: 0, y: 8, z: 0 },
    end: { x: 1, y: 8, z: 0 },
    layer: "0",
    context: { presentation: { color: { source: "explicit", value: "#00ff00" } } },
  },
];

function makeContext(): CadCommandContext {
  const entities = new Map(SCENE.map((entity) => [entity.id, entity]));
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

function run(name: string, inputs: readonly CadCommandInput[]) {
  const descriptor = commands.get(name);
  assert.ok(descriptor, `${name} debe existir`);
  const context = makeContext();
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
const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const keyword = (word: string): CadCommandInput => ({ kind: "keyword", keyword: word });

// --- ALIGN con UNA pareja: traslación pura ----------------------------------------
{
  const result = run("ALIGN", [pick("part"), point(0, 0), point(10, 5), enter]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 1, "un objeto, UNA transformada");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  near(command.transform.translation!.x, 10, 1e-12, "traslación en x");
  near(command.transform.translation!.y, 5, 1e-12, "traslación en y");
  assert.equal(command.transform.rotationDeg, undefined, "una sola pareja no gira nada");
  assert.equal(command.transform.scale, undefined, "ni escala");
}

// --- ALIGN con DOS parejas: gira, y se cierra sola ----------------------------------
{
  // La pieza va de (0,0) a (1,0) —dirección 0°— y debe quedar de (10,10) a
  // (10,12), dirección 90°.
  const result = run("ALIGN", [
    pick("part"),
    pick("other"),
    point(0, 0),
    point(10, 10),
    point(1, 0),
    point(10, 12),
  ]);
  assert.ok(result && result.kind === "document", "con dos parejas se cierra sin pulsar Enter");
  assert.equal(result.commands.length, 2, "una transformada por objeto designado");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  near(command.transform.rotationDeg!, 90, 1e-9, "gira un cuarto de vuelta");
  near(command.transform.origin!.x, 0, 1e-12, "alrededor del primer punto de ORIGEN");
  near(command.transform.translation!.x, 10, 1e-12, "y lo lleva a su destino");
  near(command.transform.translation!.y, 10, 1e-12, "");
  assert.equal(command.transform.scale, undefined, "sin `Escalar` no cambia de tamaño…");
}

// --- …y CON `Escalar`, sí -----------------------------------------------------------
{
  const result = run("ALIGN", [
    pick("part"),
    keyword("Escalar"),
    point(0, 0),
    point(10, 10),
    point(1, 0),
    point(10, 12),
  ]);
  assert.ok(result && result.kind === "document");
  const command = result.commands[0];
  assert.ok(command.type === "transform");
  near(
    command.transform.scale!,
    2,
    1e-9,
    "la referencia mide 1 y el destino 2: la pieza se duplica",
  );
  near(command.transform.rotationDeg!, 90, 1e-9, "y el giro es el mismo");
}

// --- ALIGN rechaza lo que no define nada ---------------------------------------------
{
  const degenerate = run("ALIGN", [
    pick("part"),
    point(0, 0),
    point(10, 10),
    point(0, 0),
    point(10, 12),
  ]);
  assert.equal(degenerate?.kind, "message", "dos orígenes iguales no definen dirección");
  assert.ok(degenerate.kind === "message" && degenerate.text.includes("coinciden"));

  // El primer Enter cierra la designación; el segundo intenta terminar sin
  // ninguna pareja, y es ahí donde ALIGN tiene que explicarse.
  const nothing = run("ALIGN", [pick("part"), enter, enter]);
  assert.equal(nothing?.kind, "message");
  assert.ok(nothing.kind === "message" && nothing.text.includes("pareja"));
}

// --- MATCHPROP copia capa y presentación ----------------------------------------------
{
  const result = run("MATCHPROP", [pick("styled"), pick("part"), enter]);
  assert.ok(result && result.kind === "document");
  const layerPatch = result.commands.find((command) => command.type === "properties");
  assert.ok(layerPatch && layerPatch.type === "properties");
  assert.equal(layerPatch.patch.layer, "muros", "la capa viaja por `properties`");
  const presentation = result.commands.find((command) => command.type === "presentation");
  assert.ok(presentation && presentation.type === "presentation");
  assert.equal(presentation.presentation?.color?.value, "#ff0000", "el color explícito, por contexto");
  assert.equal(presentation.presentation?.lineweight?.value, 50, "y el grosor con él");
}

// --- MATCHPROP copia SÓLO lo marcado ---------------------------------------------------
{
  // Se apagan color, tipo de línea y grosor: sólo debe viajar la capa.
  const result = run("MATCHPROP", [
    pick("styled"),
    keyword("Color"),
    keyword("TipoLínea"),
    keyword("Grosor"),
    pick("part"),
    enter,
  ]);
  assert.ok(result && result.kind === "document");
  assert.equal(result.commands.length, 1, "un solo cambio");
  assert.equal(result.commands[0].type, "properties", "y es la capa");

  // Y al revés: apagando la capa, sólo viaja la presentación.
  const onlyLooks = run("MATCHPROP", [pick("styled"), keyword("Capa"), pick("part"), enter]);
  assert.ok(onlyLooks && onlyLooks.kind === "document");
  assert.equal(onlyLooks.commands.length, 1);
  assert.equal(onlyLooks.commands[0].type, "presentation");
}

// --- copiar «sin color explícito» DEVUELVE el destino a PorCapa ---------------------------
{
  // `part` no tiene presentación; `plain` sí. Copiando de `part` a `plain`, el
  // verde de `plain` tiene que DESAPARECER. Si sólo se fusionara lo presente,
  // MATCHPROP nunca podría devolver nada a PorCapa.
  const result = run("MATCHPROP", [pick("part"), pick("plain"), enter]);
  assert.ok(result && result.kind === "document");
  const presentation = result.commands.find((command) => command.type === "presentation");
  assert.ok(presentation && presentation.type === "presentation");
  assert.equal(
    presentation.presentation,
    null,
    "sin nada explícito que copiar, la presentación del destino se borra entera",
  );
}

// --- MATCHPROP es repetitivo y acumula en UN lote -------------------------------------------
{
  const descriptor = commands.get("MATCHPROP");
  assert.ok(descriptor);
  const context = makeContext();
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, pick("styled"), context);
  step = descriptor.step(step.state, pick("part"), context);
  assert.ok(!step.result, "la orden sigue viva tras el primer destino");
  step = descriptor.step(step.state, pick("other"), context);
  step = descriptor.step(step.state, enter, context);
  assert.ok(step.result && step.result.kind === "document");
  assert.equal(step.result.commands.length, 4, "dos destinos × (capa + presentación), UN lote");
}

console.log(
  `ALIGN y MATCHPROP: ${checks} anclas de alineación (traslación, giro y escala por referencia) ` +
    `y filtrado de propiedades verificados`,
);
