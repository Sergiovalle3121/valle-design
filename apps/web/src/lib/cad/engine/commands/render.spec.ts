/**
 * RENDER, luces y materiales: AÚN NO DISPONIBLES, y lo dicen.
 *
 * Este spec afirmaba que cada orden emitía su petición al anfitrión
 * (`render-capture`, `light-create`, `material-attach`…). Lo hacían, y nadie la
 * atendía: la cadena de anfitriones acababa en el de trazado, que contestaba
 * «la atiende el anfitrión del motor», y ése no la atendía. Probar que se
 * emitía una petición huérfana era probar el agujero.
 *
 * Ahora se comprueba lo contrario, con las MISMAS entradas que antes llevaban
 * a cada orden hasta su petición: la orden termina al invocarse con el renglón
 * de `command-availability.ts`, no emite ninguna petición y nunca devuelve un
 * documento. Que el documento quede idéntico y que no tengan botón lo mide
 * `command-availability.spec.ts` con el reductor real.
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import { cadMensajeAunNoDisponible } from "../command-availability";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

import "@/lib/cad/engine/all-commands";

const registry = CAD_COMMAND_REGISTRY_V2;

let idCounter = 0;

function context(): CadCommandContext {
  return {
    entityIds: ["e1", "e2"],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `r${++idCounter}`,
  };
}

/** Invoca y alimenta las entradas mientras la orden siga abierta. */
function run(name: string, inputs: readonly CadCommandInput[]): { result: CadCommandResult | undefined; pasos: number } {
  const descriptor = registry.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro`);
  const ctx = context();
  let step = descriptor.begin(ctx);
  let pasos = 0;
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, ctx);
    pasos += 1;
  }
  return { result: step.result, pasos };
}

const keyword = (v: string): CadCommandInput => ({ kind: "keyword", keyword: v });
const distance = (v: number): CadCommandInput => ({ kind: "distance", value: v });
const text = (v: string): CadCommandInput => ({ kind: "text", value: v });
const selection = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });
const enter: CadCommandInput = { kind: "enter" };

/** Las entradas con las que el spec anterior sacaba la petición de cada orden. */
const CASOS: readonly [string, readonly CadCommandInput[]][] = [
  ["RENDER", [keyword("JPEG")]],
  ["RENDER", [enter]],
  ["RENDERPRESETS", [keyword("Alta")]],
  ["RENDEREXPOSURE", [distance(1.5)]],
  ["RENDERENVIRONMENT", [keyword("Imagen")]],
  ["MATERIALS", [enter]],
  ["MATERIALATTACH", [selection("e1", "e2"), text("Acero")]],
  ["POINTLIGHT", [enter]],
  ["SPOTLIGHT", [enter]],
  ["DISTANTLIGHT", [enter]],
  ["SUNPROPERTIES", [distance(60)]],
  ["RENDERCROP", [enter]],
  ["RENDERWIN", [enter]],
  ["MATERIALMAP", [selection("e1"), text("Madera"), keyword("Cilindro")]],
];

let comprobaciones = 0;
const familia = new Set<string>();
for (const [name, inputs] of CASOS) {
  familia.add(name);
  const { result, pasos } = run(name, inputs);
  assert.equal(pasos, 0, `${name} termina al invocarse: no pide formato, calidad, luz ni material que luego no usa`);
  assert.notEqual(result?.kind, "host", `${name} ya no emite una petición que ningún anfitrión atiende`);
  assert.notEqual(result?.kind, "document", `${name} no toca el documento`);
  assert.ok(
    result?.kind === "message" && result.text === cadMensajeAunNoDisponible(name),
    `${name} dice que aún no está disponible: ${result?.kind === "message" ? result.text : result?.kind}`,
  );
  assert.ok(result.text.includes("aún no está disponible"), `${name}: el renglón lo dice con esas palabras`);
  assert.ok(!/anfitri/i.test(result.text), `${name}: no culpa a otro anfitrión («${result.text}»)`);
  comprobaciones += 6;
}
assert.equal(familia.size, 13, "los trece de render, luces y materiales");
comprobaciones += 1;

console.log(`render.spec: ${familia.size} órdenes de render, luces y materiales se niegan con honestidad — ${comprobaciones} comprobaciones`);
