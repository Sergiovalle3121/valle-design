/**
 * SOLIDEDIT: lo que hace, medido sobre el árbol; lo que no hace, dicho.
 * (Ola C, 2026-09-02 · tres ramas más, 2026-09-04)
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
  ok(face.options.join(",") === "Extruir,Desfasar,Copiar,Salir", "la rama Cara ofrece las tres que existen");
  ok(/Mover, Girar, Inclinar, Borrar y Color todavía no/.test(face.prompts[1]), "y nombra una por una las cinco de Cara que no");
  const body = drive([keyword("cUerpo")]);
  ok(body.options.join(",") === "Separar,Comprobar,Salir", "la rama Cuerpo anuncia Separar y Comprobar");
  ok(/Estampar, Vaciar y Limpiar todavía no/.test(body.prompts[1]), "y nombra las tres de Cuerpo que no");
  const edge = drive([keyword("Arista")]);
  ok(edge.options.join(",") === "Copiar,Salir", "la rama Arista ya es una rama: ofrece Copiar");
  ok(/Color todavía no/.test(edge.prompts[1]), "y nombra la de Arista que no");
  // Las ausentes se NOMBRAN en el renglón del prompt, nunca como opción: una
  // palabra clave que responde «todavía no» es una opción que no hace nada.
  const ausentes = ["Mover", "Girar", "Inclinar", "Borrar", "Color", "Estampar", "Vaciar", "Limpiar"];
  const ofrecidas = [...face.options, ...edge.options, ...body.options];
  ok(ausentes.every((nombre) => !ofrecidas.includes(nombre)), "ninguna ausente se ofrece como palabra clave");
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

/* ── Cara · Desfasar: el mismo nodo push, con el signo de AutoCAD ────────── */
{
  const caja = box("caja");
  ok(near(volumeOf(caja), 100 * 100 * 50), "la caja de partida mide 500 000");
  const driven = drive([keyword("Cara"), keyword("Desfasar"), topFacePick(caja), distance(20)], [caja]);
  ok(driven.result?.kind === "document", `Cara Desfasar escribe: ${driven.result?.kind === "message" ? driven.result.text : ""}`);
  if (driven.result?.kind === "document") {
    ok(driven.result.commands.some((entry) => entry.type === "delete" && entry.entityId === "caja"), "sustituye la caja por su versión desfasada");
    const insert = driven.result.commands.find((entry) => entry.type === "insert");
    if (insert && insert.type === "insert" && insert.entity.type === "solid3d") {
      const pushed = insert.entity as CadSolid3dEntity;
      const empujes = pushed.nodes.filter((node) => node.op === "push");
      ok(empujes.length === 1, "añade UN nodo push, no dos");
      ok(pushed.root === empujes[0].id, "y ése es la raíz: el desfase es reeditable");
      ok(pushed.nodes.some((node) => node.id === "caja-caja" && node.op === "box"), "el árbol sigue teniendo la caja debajo (no se hornea)");
      ok(near(volumeOf(pushed), 700_000), `positivo hacia fuera: 500 000 → 700 000 (dio ${volumeOf(pushed)})`);
    }
    ok(typeof driven.result.notice === "string" && /volumen pasa de/.test(driven.result.notice ?? ""), "y la orden dice cuánto creció el sólido");
  }
  const dentro = drive([keyword("Cara"), keyword("Desfasar"), topFacePick(caja), distance(-20)], [caja]);
  if (dentro.result?.kind === "document") {
    const insert = dentro.result.commands.find((entry) => entry.type === "insert");
    if (insert && insert.type === "insert" && insert.entity.type === "solid3d")
      ok(near(volumeOf(insert.entity as CadSolid3dEntity), 300_000), "negativo hacia dentro: 500 000 → 300 000");
  } else ok(false, "un desfase negativo que cabe en el sólido debería escribir");
  const sinCara = drive([keyword("Cara"), keyword("Desfasar"), enter], [caja]);
  ok(sinCara.result?.kind === "message" && /Desfasar necesita una cara designada/.test(sinCara.result.text), "sin cara designada, Desfasar responde con su motivo y no escribe");
  const cero = drive([keyword("Cara"), keyword("Desfasar"), topFacePick(caja), distance(0)], [caja]);
  ok(cero.result?.kind === "message" && /distancia cero/.test(cero.result.text), "un desfase de cero no toca el documento y lo dice");
}

/* ── Cara · Copiar: los lazos de la cara, como una REGION del mundo ──────── */
{
  const caja = box("caja");
  const driven = drive([keyword("Cara"), keyword("Copiar"), topFacePick(caja)], [caja]);
  ok(driven.result?.kind === "document", `Cara Copiar escribe: ${driven.result?.kind === "message" ? driven.result.text : ""}`);
  if (driven.result?.kind === "document") {
    const inserts = driven.result.commands.filter((entry) => entry.type === "insert");
    ok(inserts.length === 1 && driven.result.commands.length === 1, "exactamente una entidad, y ninguna orden más");
    const region = inserts[0].type === "insert" ? inserts[0].entity : null;
    ok(region?.type === "region", "y es una REGION");
    if (region && region.type === "region") {
      ok(region.outer.length === 4, `el contorno de la tapa tiene 4 puntos (dio ${region.outer.length})`);
      ok(region.outer.every((point) => near(point.z, 50)), "en coordenadas del MUNDO, con su z real (50)");
      ok(region.inners === undefined, "una tapa sin agujeros no lleva contornos interiores");
      ok(region.layer === "0", "hereda la capa del sólido");
      const xs = region.outer.map((point) => point.x).sort((a, b) => a - b);
      const ys = region.outer.map((point) => point.y).sort((a, b) => a - b);
      ok(near(xs[0], 0) && near(xs[3], 100) && near(ys[0], 0) && near(ys[3], 100), "y cubre los 100 × 100 de la cara");
    }
    ok(!driven.result.commands.some((entry) => entry.type === "delete"), "copiar NO borra el sólido");
    ok(/no se toca/.test(driven.result.notice ?? ""), "y la orden lo dice");
  }
  const sinCara = drive([keyword("Cara"), keyword("Copiar"), enter], [caja]);
  ok(sinCara.result?.kind === "message" && /Copiar necesita una cara designada/.test(sinCara.result.text), "sin cara designada, Copiar responde con su motivo y no escribe");
}

/* ── Arista · Copiar: las doce aristas de la caja, como líneas ───────────── */
{
  const caja = box("caja");
  const driven = drive([keyword("Arista"), keyword("Copiar"), { kind: "selection", entityIds: ["caja"] }, enter], [caja]);
  ok(driven.result?.kind === "document", `Arista Copiar escribe: ${driven.result?.kind === "message" ? driven.result.text : ""}`);
  if (driven.result?.kind === "document") {
    const lines = driven.result.commands
      .map((entry) => (entry.type === "insert" ? entry.entity : null))
      .filter((entity): entity is Extract<CadEntity, { type: "line" }> => entity?.type === "line");
    ok(lines.length === 12 && lines.length === driven.result.commands.length, `la caja da 12 líneas y nada más (dio ${lines.length})`);
    // El par de vértices se normaliza: la misma arista al revés es la misma.
    const claves = new Set(
      lines.map((line) => {
        const tag = (p: { x: number; y: number; z: number }) => `${p.x},${p.y},${p.z}`;
        return [tag(line.start), tag(line.end)].sort().join("|");
      }),
    );
    ok(claves.size === 12, `ninguna arista repetida (${claves.size} distintas de 12)`);
    ok(lines.every((line) => line.layer === "0"), "todas en la capa del sólido");
    const longitudes = lines.map((line) => Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y, line.end.z - line.start.z));
    ok(longitudes.filter((value) => near(value, 100)).length === 8, "ocho aristas de 100 (el contorno en planta)");
    ok(longitudes.filter((value) => near(value, 50)).length === 4, "y cuatro montantes de 50");
    ok(/12 arista\(s\) copiadas/.test(driven.result.notice ?? ""), "y la orden dice cuántas salieron");
    ok(!driven.result.commands.some((entry) => entry.type === "delete"), "copiar aristas NO borra el sólido");
  }
  const preseleccion = drive([keyword("Arista"), keyword("Copiar")], [caja], ["caja"]);
  ok(preseleccion.result?.kind === "document", "con designación previa responde al teclear la opción (PICKFIRST)");
  const line = { id: "l", type: "line", layer: "0", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as CadEntity;
  const nada = drive([keyword("Arista"), keyword("Copiar"), { kind: "selection", entityIds: ["l"] }, enter], [line]);
  ok(nada.result?.kind === "message" && /no hay ningún SOLID3D/.test(nada.result.text), "sin sólido en lo designado, Arista Copiar responde con su motivo y no escribe");
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

console.log(`solids-edit: ${checks} comprobaciones sobre SOLIDEDIT (seis ramas construidas, ocho declaradas ausentes)`);
