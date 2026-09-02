import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadBlockDefinition, type CadEntity } from "./cad-document";
import {
  cadClipboardBasePoint,
  cadClipboardContent,
  cadDetachForPaste,
  cadPasteCommands,
  cadPasteDetachedCount,
  cadPastePreview,
  createCadClipboard,
} from "./clipboard";

/**
 * Portapapeles de geometría canónica (Ola D, 2026-09-02): las reglas puras.
 *
 *   1. El punto base implícito es la esquina inferior izquierda de la
 *      envolvente de TODO lo copiado, como en AutoCAD.
 *   2. El contenido es una COPIA: mover el original después no mueve lo que
 *      hay en el portapapeles.
 *   3. Pegar traslada por (destino − base) con el mismo `transform` que MOVE,
 *      da ids nuevos y desliga lo asociativo (y lo cuenta).
 *   4. Un INSERT viaja con su bloque; el pegado lo define sólo si falta.
 *   5. La silueta de previsualización es la geometría trasladada.
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

const line: CadEntity = {
  id: "l1",
  type: "line",
  start: { x: 1_000, y: 2_000, z: 0 },
  end: { x: 3_000, y: 2_500, z: 0 },
  layer: "MUROS",
};
const circle: CadEntity = { id: "c1", type: "circle", center: { x: 500, y: 4_000, z: 0 }, radius: 300, layer: "0" };
const hatch: CadEntity = {
  id: "h1",
  type: "hatch",
  pattern: "ANSI31",
  solid: false,
  boundaries: [[{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }]],
  associative: true,
  associationStatus: "associated",
  boundaryRefs: ["l1"],
  layer: "0",
};
const block: CadBlockDefinition = {
  id: "silla",
  name: "Silla",
  basePoint: { x: 0, y: 0, z: 0 },
  entities: [{ id: "silla-c", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 200, layer: "0" }],
};
const insert: CadEntity = {
  id: "i1",
  type: "insert",
  block: "silla",
  insertion: { x: 6_000, y: 6_000, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  layer: "MOBILIARIO",
};

/* ── 1. El punto base implícito ──────────────────────────────────────────── */
{
  eq(cadClipboardBasePoint([line, circle]), { x: 200, y: 2_000 }, "esquina inferior izquierda de la envolvente conjunta: el círculo da la x (500 − 300), la línea la y");
  eq(cadClipboardBasePoint([]), null, "sin entidades no hay punto base");
}

/* ── 2. Copia, no referencia ─────────────────────────────────────────────── */
{
  const source = structuredClone(line);
  const content = cadClipboardContent([source], [], null, "copy");
  assert.ok(typeof content !== "string", "hay contenido");
  checks += 1;
  eq(content.basePoint, { x: 1_000, y: 2_000 }, "punto base implícito de una línea sola");
  eq(content.origin, "copy", "y sabe cómo llegó");
  if (source.type === "line") source.start.x = 99_999;
  ok(content.entities[0].type === "line" && content.entities[0].start.x === 1_000, "mover el original después no toca el portapapeles");

  const nothing = cadClipboardContent([{ id: "b", type: "box", kind: "x", x: 0, y: 0, w: 1, h: 1, rotation: 0, layer: "0", shape: "rect" } as CadEntity], [], null, "copy");
  ok(typeof nothing === "string" && nothing.includes("canónica"), "un activo heredado no es geometría canónica, y se dice");

  const typed = cadClipboardContent([line], [], { x: 3_000, y: 2_500 }, "cut");
  assert.ok(typeof typed !== "string");
  eq(typed.basePoint, { x: 3_000, y: 2_500 }, "COPYBASE: gana el punto tecleado");
  eq(typed.origin, "cut", "cortado");
}

/* ── 3. Pegar: traslación, ids nuevos, desligado ─────────────────────────── */
{
  const content = cadClipboardContent([line, hatch], [], null, "copy");
  assert.ok(typeof content !== "string");
  eq(cadPasteDetachedCount(content), 1, "el sombreado asociativo se cuenta como desligado");
  let ids = 0;
  const commands = cadPasteCommands(content, { x: 5_000, y: 5_000 }, () => `p${++ids}`);
  eq(commands.length, 2, "dos inserciones");
  const [first, second] = commands;
  assert.ok(first.type === "insert" && first.entity.type === "line");
  checks += 1;
  eq(first.entity.id, "p1", "id nuevo");
  // base implícita = (min x, min y) de línea + sombreado = (0, 0); destino (5000, 5000).
  eq(first.entity.start, { x: 6_000, y: 7_000, z: 0 }, "la línea se traslada por (destino − base)");
  eq(first.entity.end, { x: 8_000, y: 7_500, z: 0 }, "entera");
  assert.ok(second.type === "insert" && second.entity.type === "hatch");
  checks += 1;
  eq(second.entity.associative, undefined, "el sombreado pegado no es asociativo");
  eq(second.entity.boundaryRefs, undefined, "y no apunta a la línea del dibujo de origen");
  eq(second.entity.associationStatus, undefined, "ni dice que lo está");
  const corner = second.entity.boundaries[0][0];
  eq({ x: corner.x, y: corner.y }, { x: 5_000, y: 5_000 }, "pero su contorno viaja trasladado");

  const kept = cadDetachForPaste(structuredClone(line as Extract<CadEntity, { type: "line" }>));
  eq(kept, line, "una línea no tiene nada que desligar");
}

/* ── 4. INSERT: el bloque viaja y se define sólo si falta ────────────────── */
{
  const blocks = [block, { ...block, id: "mesa", name: "Mesa" }];
  const origin = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities: [insert],
    modelSpace: { entityIds: ["i1"] },
    blocks,
  });
  const content = cadClipboardContent([insert], blocks, null, "copy", origin);
  assert.ok(typeof content !== "string");
  eq(content.blocks.map((item) => item.id), ["silla"], "sólo viaja el bloque que la inserción referencia");
  // Con el documento de origen la envolvente es la del bloque COLOCADO:
  // silla de radio 200 en (6000, 6000) → (5800, 5800). Sin él el adaptador
  // sólo ve el punto de inserción (medido: 5950, un cuadro de relleno).
  eq(content.basePoint, { x: 5_800, y: 5_800 }, "punto base = envolvente del bloque colocado");
  let ids = 0;
  const missing = cadPasteCommands(content, { x: 0, y: 0 }, () => `p${++ids}`, new Set());
  eq(missing.map((command) => command.type), ["block", "insert"], "en un dibujo sin el bloque, primero se define");
  ok(missing[0].type === "block" && missing[0].op === "define" && missing[0].definition.id === "silla", "con la definición que viajó");
  const present = cadPasteCommands(content, { x: 0, y: 0 }, () => `p${++ids}`, new Set(["silla"]));
  eq(present.map((command) => command.type), ["insert"], "si el destino ya tiene el bloque, gana el suyo: no se redefine");
  ok(present[0].type === "insert" && present[0].entity.type === "insert" && present[0].entity.insertion.x === 200 && present[0].entity.insertion.y === 200, "pegar en (0,0) deja la inserción en (200, 200): la envolvente cae en el destino");
}

/* ── 5. La silueta ───────────────────────────────────────────────────────── */
{
  const content = cadClipboardContent([line], [], null, "copy");
  assert.ok(typeof content !== "string");
  const preview = cadPastePreview(content, { x: 0, y: 0 });
  ok(preview.length >= 1, "hay silueta");
  eq(preview[0].points[0], { x: 0, y: 0 }, "la silueta arranca donde va el punto base");
  const far = cadPastePreview(content, { x: 10_000, y: 0 });
  eq(far[0].points[0], { x: 10_000, y: 0 }, "y sigue al cursor");
}

/* ── El almacén ──────────────────────────────────────────────────────────── */
{
  const clipboard = createCadClipboard();
  eq(clipboard.read(), null, "nace vacío");
  const content = cadClipboardContent([circle], [], null, "copy");
  assert.ok(typeof content !== "string");
  clipboard.write(content);
  ok(clipboard.read() === content, "guarda lo último");
  clipboard.clear();
  eq(clipboard.read(), null, "y se vacía");
}

console.log(`clipboard: ${checks} comprobaciones · punto base por envolvente, copia y no referencia, pegado trasladado con ids nuevos y asociatividad desligada, bloque que viaja y se define sólo si falta, silueta que sigue al cursor`);
