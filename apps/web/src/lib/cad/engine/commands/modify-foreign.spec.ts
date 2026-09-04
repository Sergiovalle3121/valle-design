import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../../cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import { cadChpropCommands, cadNestedEntityAt, cadXplodeCommands } from "./modify-foreign";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

/**
 * XPLODE, SETBYLAYER, CHPROP y NCOPY (Ola D, 2026-09-02): el trabajo ajeno.
 *
 *   - XPLODE descompone con las MISMAS piezas que EXPLODE y les fija capa,
 *     color o tipo de línea; Heredar está por el vocabulario y da lo mismo
 *     que Explotar, porque la resolución del bloque ya coloca la capa 0 y lo
 *     PorBloque con lo de la inserción (medido, y dicho en la etiqueta).
 *   - SETBYLAYER quita el aspecto explícito y cuenta lo que ya estaba PorCapa.
 *   - CHPROP acumula cambios en bucle y los aplica en UN lote, sin tocar lo
 *     que no se pidió; una capa que no existe se rechaza con su nombre.
 *   - NCOPY copia la pieza de dentro de un bloque que el clic toca, en el
 *     sitio o desplazada, sin explotar la inserción.
 */
let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const BLOCKS: CadBlockDefinition[] = [
  {
    id: "silla",
    name: "Silla",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: [
      // Capa 0 y PorBloque: lo que un bloque bien hecho trae para heredar.
      { id: "asiento", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 200, layer: "0", context: { presentation: { color: { source: "byBlock" } } } },
      { id: "respaldo", type: "line", start: { x: -200, y: 250, z: 0 }, end: { x: 200, y: 250, z: 0 }, layer: "DETALLE" },
    ],
  },
];

const SCENE: CadEntity[] = [
  { id: "silla1", type: "insert", block: "silla", insertion: { x: 5_000, y: 5_000, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "MOBILIARIO", context: { presentation: { color: { source: "explicit", value: "#00ff00" } } } },
  { id: "contorno", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }], closed: false, layer: "MUROS" },
  { id: "rojo", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0", context: { presentation: { color: { source: "explicit", value: "1" }, lineweight: { source: "explicit", value: 50 } } } },
  { id: "plano", type: "line", start: { x: 0, y: 10, z: 0 }, end: { x: 100, y: 10, z: 0 }, layer: "0" },
];

function context(selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: SCENE.map((entity) => entity.id),
    entity: (id) => SCENE.find((entity) => entity.id === id),
    blocks: () => BLOCKS,
    layers: () => [
      { id: "0", name: "0", color: "#fff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#fff", visible: true, locked: false },
      { id: "MOBILIARIO", name: "MOBILIARIO", color: "#fff", visible: true, locked: false },
      { id: "DETALLE", name: "DETALLE", color: "#fff", visible: true, locked: false },
    ],
    selection,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `n${++ids}`,
  };
}

function drive(name: string, inputs: readonly CadCommandInput[], selection: readonly string[] = []) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const ctx = context(selection);
  let step = descriptor.begin(ctx);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
    prompts.push(step.prompt.message);
  }
  return { result: step.result as CadCommandResult | undefined, prompts };
}

const pick = (entityId: string, x = 0, y = 0): CadCommandInput => ({ kind: "entityPick", entityId, point: { x, y } });
const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };

function written(result: CadCommandResult | undefined, what: string) {
  assert.ok(result?.kind === "document", `${what}: debía escribir; dio ${result?.kind}${result?.kind === "message" ? ` «${result.text}»` : ""}`);
  checks += 1;
  return result.commands;
}

/* ── XPLODE ──────────────────────────────────────────────────────────────── */
{
  for (const name of ["XPLODE", "SETBYLAYER", "CHPROP", "NCOPY"]) ok(!!CAD_COMMAND_REGISTRY_V2.get(name), `${name} está en el registro`);
  eq(CAD_COMMAND_REGISTRY_V2.get("XP")?.name, "XPLODE", "XP es XPLODE");

  const plain = written(drive("XPLODE", [enter], ["contorno"]).result, "XPLODE Intro");
  eq(plain.map((command) => command.type), ["insert", "insert", "delete"], "Explotar a secas: dos tramos y el borrado, como EXPLODE");
  ok(plain.every((command) => command.type !== "insert" || command.entity.layer === "MUROS"), "las piezas conservan la capa de la polilínea");

  const layered = drive("XPLODE", [keyword("CApa"), text("DETALLE")], ["contorno"]);
  ok(layered.prompts[1].includes("Capa de las piezas"), "CApa pide la capa");
  ok(written(layered.result, "XPLODE CApa").every((command) => command.type !== "insert" || command.entity.layer === "DETALLE"), "y las piezas salen en ella");
  ok(drive("XPLODE", [keyword("CApa"), text("NOEXISTE")], ["contorno"]).result?.kind === "message", "una capa que no existe se rechaza");

  const colored = written(drive("XPLODE", [keyword("Color"), text("3")], ["contorno"]).result, "XPLODE Color");
  ok(colored.every((command) => command.type !== "insert" || command.entity.context?.presentation?.color?.value === "3"), "Color 3 en todas las piezas");
  ok(drive("XPLODE", [keyword("Color"), text("verde")], ["contorno"]).result?.kind === "message", "un color que no es color se rechaza");

  const all = drive("XPLODE", [keyword("Todo"), text("BYBLOCK"), text("MUROS"), text("DASHED")], ["contorno"]);
  const pieces = written(all.result, "XPLODE Todo").filter((command) => command.type === "insert");
  ok(pieces.every((command) => command.type === "insert" && command.entity.layer === "MUROS" && command.entity.context?.presentation?.color?.source === "byBlock" && command.entity.context?.presentation?.linetype?.value === "DASHED"), "Todo pide color, capa y tipo de línea seguidos y los aplica");

  // Heredar sobre la silla. MEDIDO: `resolveCadInsert` ya coloca el asiento
  // (capa 0, PorBloque) en la capa de la inserción y con su color, así que
  // Heredar y Explotar dan las mismas piezas; la etiqueta del lote lo dice.
  const inherited = cadXplodeCommands(SCENE[0], { color: null, layer: null, linetype: null, inherit: true }, context());
  assert.ok(typeof inherited !== "string", "la silla se descompone");
  checks += 1;
  const seat = inherited.find((command) => command.type === "insert" && command.entity.type === "circle");
  const back = inherited.find((command) => command.type === "insert" && command.entity.type === "line");
  ok(seat?.type === "insert" && seat.entity.layer === "MOBILIARIO" && seat.entity.context?.presentation?.color?.value === "#00ff00", "el asiento sale con la capa y el color de la inserción");
  ok(back?.type === "insert" && back.entity.layer === "DETALLE" && !back.entity.context?.presentation?.color, "y el respaldo, que tenía lo suyo, no cambia");
  const plainSilla = cadXplodeCommands(SCENE[0], { color: null, layer: null, linetype: null, inherit: false }, context());
  eq(plainSilla, inherited, "Explotar da EXACTAMENTE las mismas piezas: Heredar no inventa una segunda descomposición");
  const labelled = drive("XPLODE", [keyword("Heredar")], ["silla1"]).result;
  ok(labelled?.kind === "document" && labelled.label.includes("lo que EXPLODE ya hace"), `y la etiqueta lo dice: «${labelled?.kind === "document" ? labelled.label : ""}»`);

  ok(drive("XPLODE", [enter], ["rojo"]).result?.kind === "message", "una LINE no se descompone y se dice");
}

/* ── SETBYLAYER ──────────────────────────────────────────────────────────── */
{
  const result = drive("SETBYLAYER", [], ["rojo", "plano"]).result;
  const commands = written(result, "SETBYLAYER");
  eq(commands, [{ type: "presentation", entityId: "rojo", presentation: null }], "sólo el que tenía aspecto propio cambia, y a null (todo PorCapa)");
  ok(result?.kind === "document" && result.label.includes("1 a PorCapa") && result.label.includes("1 ya lo estaban"), `la etiqueta cuenta: «${result?.kind === "document" ? result.label : ""}»`);
  ok(drive("SETBYLAYER", [], ["plano"]).result?.kind === "message", "si todo estaba PorCapa se dice en vez de escribir un lote vacío");
  const asked = drive("SETBYLAYER", [pick("rojo"), enter]);
  ok(asked.prompts[0].includes("PorCapa"), "sin selección pide designar");
  eq(written(asked.result, "SETBYLAYER designando").length, 1, "y aplica");
}

/* ── CHPROP ──────────────────────────────────────────────────────────────── */
{
  const layered = drive("CHPROP", [keyword("CApa"), text("MUROS"), enter], ["rojo", "plano"]);
  ok(layered.prompts[0].includes("Precise la propiedad"), "con selección previa va directo a la propiedad");
  ok(layered.prompts[2].includes("Cambios: capa MUROS"), `tras la capa vuelve al menú con el cambio anotado: «${layered.prompts[2]}»`);
  eq(
    written(layered.result, "CHPROP CApa"),
    [
      { type: "properties", entityId: "rojo", patch: { layer: "MUROS" } },
      { type: "properties", entityId: "plano", patch: { layer: "MUROS" } },
    ],
    "una capa para todos, en un lote",
  );
  ok(drive("CHPROP", [keyword("CApa"), text("NOEXISTE")], ["rojo"]).result?.kind === "message", "una capa que no existe se rechaza con su nombre");

  const several = drive("CHPROP", [keyword("Color"), text("BYLAYER"), keyword("Grosor"), distance(25), keyword("EScala"), distance(2), enter], ["rojo", "plano"]);
  const commands = written(several.result, "CHPROP Color+Grosor+EScala");
  eq(commands.length, 2, "un cambio de aspecto por objeto");
  const rojo = commands.find((command) => command.type === "presentation" && command.entityId === "rojo");
  ok(rojo?.type === "presentation" && rojo.presentation?.color === undefined && rojo.presentation?.lineweight?.value === 25 && rojo.presentation?.linetype?.scale === 2, "rojo: color a PorCapa, grosor 0,25 y escala 2, todo en una presentación");
  const plano = commands.find((command) => command.type === "presentation" && command.entityId === "plano");
  ok(plano?.type === "presentation" && plano.presentation?.lineweight?.value === 25 && plano.presentation?.linetype?.source === "byLayer" && plano.presentation?.linetype?.scale === 2, "plano: la escala va sobre un tipo de línea PorCapa, que es lo que tenía");

  eq(cadChpropCommands([SCENE[3]], { layer: null, presentation: { color: "BYLAYER" } }), [], "poner PorCapa lo que ya lo está no escribe nada");
  ok(drive("CHPROP", [enter], ["rojo"]).result?.kind === "message", "Intro sin pedir nada lo dice");
  ok(drive("CHPROP", [keyword("Color"), text("morado")], ["rojo"]).result?.kind === "message", "un color que no es color se rechaza");
  ok(drive("CHPROP", [keyword("Grosor"), text("PORCAPA"), enter], ["rojo"]).result?.kind === "document", "Grosor acepta PORCAPA como -1");
}

/* ── NCOPY ───────────────────────────────────────────────────────────────── */
{
  // Pinchando sobre el respaldo (a y = 5250 del mundo) sale el respaldo.
  const hit = cadNestedEntityAt(SCENE[0] as Extract<CadEntity, { type: "insert" }>, { x: 5_000, y: 5_250 }, context());
  ok(typeof hit !== "string" && hit.type === "line", "la pieza que el clic toca: el respaldo");
  // Pinchando lejos de todo sale la más cercana: el asiento a (5000, 4800).
  const nearest = cadNestedEntityAt(SCENE[0] as Extract<CadEntity, { type: "insert" }>, { x: 5_000, y: 4_600 }, context());
  ok(typeof nearest !== "string" && nearest.type === "circle", "sin contacto, la más cercana: el asiento");

  const inPlace = drive("NCOPY", [pick("silla1", 5_000, 5_250), keyword("Insertar")]);
  ok(inPlace.prompts[0].includes("anidado"), "pide la pieza anidada");
  ok(inPlace.prompts[1].includes("Pieza: LINE") && inPlace.prompts[1].includes("punto base"), `dice qué pieza tomó y pide el punto base: «${inPlace.prompts[1]}»`);
  const placed = written(inPlace.result, "NCOPY Insertar");
  eq(placed.length, 1, "una inserción");
  ok(placed[0].type === "insert" && placed[0].entity.type === "line" && placed[0].entity.id === "n1" && placed[0].entity.start.y === 5_250 && placed[0].entity.layer === "DETALLE", "el respaldo copiado en el sitio, con id nuevo y su capa de dentro del bloque");

  const moved = written(drive("NCOPY", [pick("silla1", 5_000, 5_250), point(5_000, 5_000), point(7_000, 5_000)]).result, "NCOPY desplazado");
  ok(moved[0].type === "insert" && moved[0].entity.type === "line" && moved[0].entity.start.x === 1_800 + 5_000 && moved[0].entity.start.y === 5_250, "desplazado 2.000 en x por los dos puntos");

  ok(drive("NCOPY", [pick("rojo")]).result?.kind === "message", "una LINE suelta no es una inserción: NCOPY lo dice y manda a COPY");
  ok(drive("NCOPY", [{ kind: "cancel" }]).result?.kind === "none", "Esc cancela");
}

console.log(`modify-foreign: ${checks} comprobaciones · XPLODE con capa/color/tipo de línea/Heredar sobre las piezas de EXPLODE, SETBYLAYER que cuenta, CHPROP en bucle y en un lote, NCOPY de la pieza que el clic toca`);
