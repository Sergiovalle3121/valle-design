import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import { cadClipboardContent, createCadClipboard } from "../../clipboard";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult, CadCommandStep } from "../command-types";

/**
 * COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP y PASTEORIG como máquinas de estado
 * (Ola D, 2026-09-02). Copiar y cortar EMITEN una petición al anfitrión —qué
 * ids, qué punto base, copiar o cortar—; pegar LEE `context.clipboard` y
 * devuelve el lote. Ni una ni otra tocan nada por su cuenta.
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

const SCENE: CadEntity[] = [
  { id: "l1", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 2_000, y: 1_500, z: 0 }, layer: "MUROS" },
  { id: "c1", type: "circle", center: { x: 4_000, y: 4_000, z: 0 }, radius: 500, layer: "0" },
];

function drive(
  name: string,
  inputs: readonly CadCommandInput[],
  options: { selection?: readonly string[]; clipboard?: ReturnType<typeof createCadClipboard>; cursor?: { x: number; y: number } } = {},
): { result: CadCommandResult | undefined; steps: CadCommandStep<unknown>[] } {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  let ids = 0;
  const context: CadCommandContext = {
    entityIds: SCENE.map((entity) => entity.id),
    entity: (entityId) => SCENE.find((entity) => entity.id === entityId),
    blocks: () => [],
    selection: options.selection ?? [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `pegado${++ids}`,
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    ...(options.cursor ? { cursor: options.cursor } : {}),
  };
  let step = descriptor.begin(context);
  const steps = [step];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
    steps.push(step);
  }
  return { result: step.result, steps };
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const select = (...entityIds: string[]): CadCommandInput => ({ kind: "selection", entityIds });
const pick = (entityId: string): CadCommandInput => ({ kind: "entityPick", entityId, point: { x: 0, y: 0 } });
const enter: CadCommandInput = { kind: "enter" };

function hostRequest(result: CadCommandResult | undefined, what: string) {
  assert.ok(result?.kind === "host", `${what}: debía pedir al anfitrión; dio ${result?.kind}`);
  assert.ok(result.request.kind === "clipboard", `${what}: petición de portapapeles`);
  checks += 2;
  return result.request;
}

/* ── COPYCLIP ────────────────────────────────────────────────────────────── */
{
  for (const name of ["COPYCLIP", "CUTCLIP", "COPYBASE", "PASTECLIP", "PASTEORIG"])
    ok(!!CAD_COMMAND_REGISTRY_V2.get(name), `${name} está en el registro`);

  // Con selección previa (Ctrl+C sobre lo designado) no pregunta nada.
  const preselected = drive("COPYCLIP", [], { selection: ["l1", "c1"] });
  const request = hostRequest(preselected.result, "COPYCLIP con selección");
  eq(request.op, "copy", "copiar");
  eq([...request.entityIds], ["l1", "c1"], "los designados");
  eq(request.basePoint, null, "sin punto base tecleado: la envolvente decide");

  // Sin selección: designa, Intro.
  const asked = drive("COPYCLIP", [pick("l1"), select("c1", "l1"), enter]);
  ok(asked.steps[0].prompt.message.includes("Designe los objetos a copiar"), "pide designar");
  eq([...hostRequest(asked.result, "COPYCLIP designando").entityIds], ["l1", "c1"], "sin repetidos, en orden de designación");

  const nothing = drive("COPYCLIP", [enter]);
  ok(nothing.result?.kind === "message" && nothing.result.text.includes("no se designó nada"), "Intro sin designar lo dice");
  ok(drive("COPYCLIP", [{ kind: "cancel" }]).result?.kind === "none", "Esc cancela");
}

/* ── CUTCLIP y COPYBASE ──────────────────────────────────────────────────── */
{
  const cut = hostRequest(drive("CUTCLIP", [], { selection: ["l1"] }).result, "CUTCLIP");
  eq(cut.op, "cut", "cortar");
  ok(CAD_COMMAND_REGISTRY_V2.get("CUTCLIP")?.mutates === true, "CUTCLIP muta (borra)");
  ok(CAD_COMMAND_REGISTRY_V2.get("COPYCLIP")?.mutates === false, "COPYCLIP no");

  const base = drive("COPYBASE", [point(1_000, 1_000)], { selection: ["l1"] });
  ok(base.steps[0].prompt.message.includes("punto base"), "COPYBASE pide el punto base ANTES");
  const typed = hostRequest(base.result, "COPYBASE con selección");
  eq(typed.basePoint, { x: 1_000, y: 1_000 }, "y lo manda");
  eq(typed.op, "copy", "es una copia");

  const baseThenPick = drive("COPYBASE", [point(0, 0), pick("c1"), enter]);
  ok(baseThenPick.steps[1].prompt.message.includes("Designe"), "sin selección, tras el punto base designa");
  eq([...hostRequest(baseThenPick.result, "COPYBASE designando").entityIds], ["c1"], "lo designado");
}

/* ── PASTECLIP ───────────────────────────────────────────────────────────── */
{
  const empty = drive("PASTECLIP", [], { clipboard: createCadClipboard() });
  ok(empty.result?.kind === "message" && empty.result.text.includes("vacío") && empty.result.text.includes("Ctrl+C"), "vacío: se dice y se dice qué tecla lo llena");
  ok(drive("PASTECLIP", []).result?.kind === "message", "sin portapapeles en el contexto, igual");

  const clipboard = createCadClipboard();
  const content = cadClipboardContent(SCENE, [], null, "copy");
  assert.ok(typeof content !== "string");
  clipboard.write(content);

  const pasted = drive("PASTECLIP", [point(10_000, 10_000)], { clipboard, cursor: { x: 7_000, y: 7_000 } });
  ok(pasted.steps[0].prompt.message.includes("punto de inserción") && pasted.steps[0].prompt.message.includes("2 objeto(s)"), `el prompt cuenta lo que se pega: «${pasted.steps[0].prompt.message}»`);
  ok((pasted.steps[0].preview?.length ?? 0) > 0, "y enseña la silueta bajo el cursor");
  ok(pasted.steps[0].preview?.[0].points[0].x === 7_000, "la silueta arranca en el cursor (punto base = 1000,1000 → 7000)");
  assert.ok(pasted.result?.kind === "document", "pega");
  checks += 1;
  eq(pasted.result.label, "PASTECLIP", "con su etiqueta de deshacer");
  eq(pasted.result.commands.map((command) => command.type), ["insert", "insert"], "dos inserciones");
  const [first] = pasted.result.commands;
  assert.ok(first.type === "insert" && first.entity.type === "line");
  checks += 1;
  eq(first.entity.id, "pegado1", "id nuevo del contexto");
  eq(first.entity.start, { x: 10_000, y: 10_000, z: 0 }, "la base (1000,1000) cae en el destino");
  eq(first.entity.layer, "MUROS", "y conserva su capa");
  ok(SCENE[0].type === "line" && SCENE[0].start.x === 1_000, "el original no se movió");
}

/* ── PASTEORIG ───────────────────────────────────────────────────────────── */
{
  const clipboard = createCadClipboard();
  const content = cadClipboardContent([SCENE[1]], [], { x: 123, y: 456 }, "cut");
  assert.ok(typeof content !== "string");
  clipboard.write(content);
  const pasted = drive("PASTEORIG", [], { clipboard });
  assert.ok(pasted.result?.kind === "document", "PASTEORIG pega sin preguntar");
  checks += 1;
  const [only] = pasted.result.commands;
  assert.ok(only.type === "insert" && only.entity.type === "circle");
  checks += 1;
  eq(only.entity.center, { x: 4_000, y: 4_000, z: 0 }, "en sus coordenadas originales, sea cual sea el punto base");
  eq(only.entity.id, "pegado1", "con id nuevo");
  ok(drive("PASTEORIG", [], { clipboard: createCadClipboard() }).result?.kind === "message", "vacío: se dice");
}

console.log(`clipboard commands: ${checks} comprobaciones · COPYCLIP/CUTCLIP/COPYBASE piden al anfitrión con ids y punto base, PASTECLIP pega en el punto con silueta y cuenta, PASTEORIG pega donde estaba, y el portapapeles vacío se dice`);
