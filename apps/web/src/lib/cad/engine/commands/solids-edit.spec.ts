/**
 * SOLIDEDIT: lo que hace, medido sobre el árbol; lo que no hace, dicho.
 * (Ola C, 2026-09-02)
 */
import { strict as assert } from "node:assert";
import { planarBodyVolume } from "../../../brep";
import { cadFaceRefFromBody } from "../../pick3d/solid-face-ref";
import { solid3dBody } from "../../solid3d-build";
import type { CadEntity } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_SOLIDEDIT_COMMANDS, __testables } from "./solids-edit";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, relative = 1e-9) => Math.abs(a - b) <= Math.max(1, Math.abs(b)) * relative;

const descriptor = CAD_SOLIDEDIT_COMMANDS[0];

function box(id: string, x = 0, size = 100, height = 50): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    layer: "0",
    root: `${id}-caja`,
    nodes: [{ id: `${id}-caja`, op: "box", min: { x, y: 0, z: 0 }, max: { x: x + size, y: size, z: height } }],
  };
}

/** Unión de dos cajas: separadas (x = 0 y x = 500) o en contacto (x = 0 y x = 50). */
function union(id: string, second: number): CadSolid3dEntity {
  const a = box("a");
  const b = box("b", second);
  return {
    id,
    type: "solid3d",
    layer: "0",
    root: "union",
    nodes: [...a.nodes, ...b.nodes, { id: "union", op: "union", operands: [a.root, b.root] }],
  };
}

function makeContext(entities: CadEntity[], selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: entities.map((entity) => entity.id),
    entity: (id) => entities.find((entity) => entity.id === id),
    selection,
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${++ids}`,
  };
}

function drive(inputs: readonly CadCommandInput[], entities: CadEntity[] = [], selection: readonly string[] = []) {
  const context = makeContext(entities, selection);
  let step = descriptor.begin(context);
  const prompts = [step.prompt.message];
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, context);
    prompts.push(step.prompt.message);
  }
  return { result: step.result, prompts, options: step.prompt.options.map((option) => option.keyword) };
}

const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const enter: CadCommandInput = { kind: "enter" };
const volumeOf = (solid: CadSolid3dEntity) => Math.abs(planarBodyVolume(solid3dBody(solid)));

/** La cara superior (normal +Z) de un sólido, designada como lo haría el rayo de cámara. */
function topFacePick(solid: CadSolid3dEntity): CadCommandInput {
  const body = solid3dBody(solid);
  // Por el centroide y no por la normal: el plano de la huella es CANÓNICO
  // (signo fijado), así que +Z y −Z se distinguen por dónde está la cara.
  const refs = Array.from({ length: body.faces.length }, (_, index) => cadFaceRefFromBody(body, index));
  const top = refs.reduce((best, ref) => (ref.centroid.z > best.centroid.z ? ref : best));
  return { kind: "facePick", entityId: solid.id, face: top, point: { ...top.centroid }, normal: { x: 0, y: 0, z: 1 } } as CadCommandInput;
}

/* ── El diálogo: ramas y límites declarados ───────────────────────────────── */
{
  const root = drive([]);
  ok(root.prompts[0] === "Introduzca una opción de edición de sólidos" && root.options.join(",") === "Cara,Arista,cUerpo,Salir", "las tres ramas y Salir");
  ok(drive([enter]).result?.kind === "none", "Intro toma Salir: no escribe nada");
  const face = drive([keyword("Cara")]);
  ok(face.options.join(",") === "Extruir,Salir", "la rama Cara sólo anuncia lo que existe: Extruir");
  const body = drive([keyword("cUerpo")]);
  ok(body.options.join(",") === "Separar,Comprobar,Salir", "la rama Cuerpo anuncia Separar y Comprobar");
  const edge = drive([keyword("Arista")]);
  ok(edge.result?.kind === "message" && /todavía no está disponible/.test(edge.result.text), "la rama Arista termina con su motivo");
  ok(descriptor.kind === "modify" && descriptor.mutates === true, "es una orden de modificación");
}

/* ── Cara · Extruir: un nodo push sobre el árbol ─────────────────────────── */
{
  const caja = box("caja");
  const before = volumeOf(caja);
  const driven = drive([keyword("Cara"), keyword("Extruir"), topFacePick(caja), distance(30)], [caja]);
  ok(driven.result?.kind === "document", `Cara Extruir escribe: ${driven.result?.kind === "message" ? driven.result.text : ""}`);
  if (driven.result?.kind === "document") {
    const insert = driven.result.commands.find((entry) => entry.type === "insert");
    ok(driven.result.commands.some((entry) => entry.type === "delete" && entry.entityId === "caja"), "sustituye la caja");
    if (insert && insert.type === "insert" && insert.entity.type === "solid3d") {
      const pushed = insert.entity as CadSolid3dEntity;
      ok(pushed.nodes.some((node) => node.op === "push") && pushed.root.startsWith("empuje"), "el árbol gana un nodo push y ése es la raíz (reeditable)");
      ok(near(volumeOf(pushed), before + 100 * 100 * 30), "la caja crece 100 × 100 × 30");
    }
  }
  const missing = drive([keyword("Cara"), keyword("Extruir"), enter], [caja]);
  ok(missing.result?.kind === "message" && /necesita una cara designada/.test(missing.result.text), "sin cara designada, lo dice");
  const zero = drive([keyword("Cara"), keyword("Extruir"), topFacePick(caja), distance(0)], [caja]);
  ok(zero.result?.kind === "message" && /distancia cero/.test(zero.result.text), "distancia cero: no toca el documento y lo dice");
}

/* ── Cuerpo · Comprobar: informa, no escribe ─────────────────────────────── */
{
  const caja = box("caja");
  const driven = drive([keyword("cUerpo"), keyword("Comprobar"), { kind: "selection", entityIds: ["caja"] }, enter], [caja]);
  ok(driven.result?.kind === "message" && /sólido válido, 6 caras, 12 aristas/.test(driven.result.text), `Comprobar cuenta caras y aristas: ${driven.result?.kind === "message" ? driven.result.text : ""}`);
  const preselected = drive([keyword("cUerpo"), keyword("Comprobar")], [caja], ["caja"]);
  ok(preselected.result?.kind === "message" && /sólido válido/.test(preselected.result.text), "con designación previa, Comprobar responde al teclear la opción (PICKFIRST)");
  const line = { id: "l", type: "line", layer: "0", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as CadEntity;
  const nothing = drive([keyword("cUerpo"), keyword("Comprobar"), { kind: "selection", entityIds: ["l"] }, enter], [line]);
  ok(nothing.result?.kind === "message" && /no hay ningún SOLID3D/.test(nothing.result.text), "sin sólidos entre lo designado, lo dice");
}

/* ── Cuerpo · Separar: una unión de cuerpos sueltos, en dos sólidos ──────── */
{
  const apart = union("union", 500);
  const driven = drive([keyword("cUerpo"), keyword("Separar"), { kind: "selection", entityIds: ["union"] }, enter], [apart]);
  ok(driven.result?.kind === "document", `Separar escribe: ${driven.result?.kind === "message" ? driven.result.text : ""}`);
  if (driven.result?.kind === "document") {
    const inserts = driven.result.commands.filter((entry) => entry.type === "insert");
    ok(inserts.length === 2, "dos sólidos nuevos");
    ok(driven.result.commands.some((entry) => entry.type === "delete" && entry.entityId === "union"), "y la unión se retira");
    const parts = inserts.map((entry) => (entry.type === "insert" ? (entry.entity as CadSolid3dEntity) : null)).filter(Boolean) as CadSolid3dEntity[];
    ok(parts.every((part) => part.nodes.length === 1 && part.nodes[0].op === "box"), "cada uno conserva SU subárbol, sin el nodo de unión");
    ok(parts.every((part) => near(volumeOf(part), 100 * 100 * 50)), "y su volumen");
    ok(parts.map((part) => part.id).join(",") === "union:1,union:2", "ids derivados del original");
  }
  const touching = union("union", 50);
  const kept = drive([keyword("cUerpo"), keyword("Separar"), { kind: "selection", entityIds: ["union"] }, enter], [touching]);
  ok(kept.result?.kind === "message" && /se tocan o se cruzan/.test(kept.result.text), "dos cuerpos que se cruzan son UN sólido: no se separa y se dice");
  const single = box("caja");
  const onePiece = drive([keyword("cUerpo"), keyword("Separar"), { kind: "selection", entityIds: ["caja"] }, enter], [single]);
  ok(onePiece.result?.kind === "message" && /una sola pieza/.test(onePiece.result.text), "un sólido sin unión en la raíz: nada que separar");
  ok(__testables.subtree(apart.nodes, "a-caja").map((node) => node.id).join(",") === "a-caja", "el subárbol de un operando es sólo su nodo");
}

console.log(`solids-edit: ${checks} comprobaciones sobre SOLIDEDIT`);
