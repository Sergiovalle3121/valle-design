/**
 * CENTERMARK y CENTERLINE asociativos, contra el registro del PRODUCTO.
 *
 * Ejecuta CENTERMARK por el motor de comandos real (`CAD_COMMAND_REGISTRY_V2`),
 * aplica el lote resultante por la ÚNICA ruta de mutación
 * (`executeCadEntityCommandBatch`) y mide la GEOMETRÍA: mover o escalar el
 * círculo desplaza la cruz de centro, y borrarlo la deja declarada huérfana en
 * vez de borrarla con él o dejarla congelada donde nació.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "./entity-commands";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "./engine/command-types";

// `.spec.ts` se carga como CommonJS: las 294 implementaciones llegan de golpe.
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const close = (actual: number, expected: number, message: string, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);
  checks += 1;
};

const layer = "0";

function document(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: layer, name: "0", color: "#fff", visible: true, locked: false },
      { id: "CENTER", name: "CENTER", color: "#fff", visible: true, locked: false },
    ],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function makeContext(doc: CadDocument, selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${++ids}`,
  };
}

function run(name: string, inputs: readonly CadCommandInput[], doc: CadDocument): CadEntityCommand[] {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(doc);
  let step = descriptor!.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
  }
  const result: CadCommandResult | undefined = step.result;
  assert.ok(result?.kind === "document", `${name} debía escribir; dio ${result?.kind}`);
  checks += 1;
  return result!.kind === "document" ? [...result.commands] : [];
}

function circle(id: string, x: number, y: number, radius: number): CadEntity {
  return { id, type: "circle", center: { x, y, z: 0 }, radius, layer } as CadEntity;
}
function line(id: string, ax: number, ay: number, bx: number, by: number): CadEntity {
  return { id, type: "line", start: { x: ax, y: ay, z: 0 }, end: { x: bx, y: by, z: 0 }, layer } as CadEntity;
}

function linesOf(doc: CadDocument, layer_: string): Extract<CadEntity, { type: "line" }>[] {
  return doc.entities.filter(
    (entity): entity is Extract<CadEntity, { type: "line" }> => entity.type === "line" && entity.layer === layer_,
  );
}

// ---------------------------------------------------------------------------
// CENTERMARK: nace, sigue al círculo cuando se mueve, y se declara huérfano
// ---------------------------------------------------------------------------

{
  const target = circle("c1", 100, 100, 20);
  let doc = document([target]);

  const created = run(
    "CENTERMARK",
    [{ kind: "entityPick", entityId: "c1", point: { x: 100, y: 100 } }],
    doc,
  );
  ok(created.length === 2, "CENTERMARK crea dos líneas (horizontal y vertical)");
  doc = executeCadEntityCommandBatch(doc, created, "CENTERMARK").document;

  const marksBefore = linesOf(doc, "CENTER");
  ok(marksBefore.length === 2, "las dos líneas de la cruz quedan en la capa CENTER");
  // Extensión esperada: radio (20) + sobresaliente por defecto (3) = 23.
  for (const mark of marksBefore) {
    if (Math.abs(mark.start.y - mark.end.y) < 1e-9) {
      close(Math.min(mark.start.x, mark.end.x), 100 - 23, "horizontal antes de mover: extremo izquierdo");
      close(Math.max(mark.start.x, mark.end.x), 100 + 23, "horizontal antes de mover: extremo derecho");
      close(mark.start.y, 100, "horizontal antes de mover: en y=cy");
    } else {
      close(Math.min(mark.start.y, mark.end.y), 100 - 23, "vertical antes de mover: extremo inferior");
      close(Math.max(mark.start.y, mark.end.y), 100 + 23, "vertical antes de mover: extremo superior");
      close(mark.start.x, 100, "vertical antes de mover: en x=cx");
    }
  }

  // Mover el círculo 50 a la derecha y 30 arriba: la marca de centro tiene que
  // SEGUIRLO, no quedarse en (100,100).
  const moved = executeCadEntityCommandBatch(
    doc,
    [
      {
        type: "transform",
        entityId: "c1",
        transform: { translation: { x: 50, y: 30 } },
      } as CadEntityCommand,
    ],
    "MOVE",
  ).document;

  const movedCircle = moved.entities.find((entity) => entity.id === "c1") as Extract<CadEntity, { type: "circle" }>;
  close(movedCircle.center.x, 150, "el círculo sí se movió (x)");
  close(movedCircle.center.y, 130, "el círculo sí se movió (y)");

  const marksAfter = linesOf(moved, "CENTER");
  ok(marksAfter.length === 2, "las dos líneas de la cruz siguen existiendo tras mover");
  for (const mark of marksAfter) {
    if (Math.abs(mark.start.y - mark.end.y) < 1e-9) {
      close(Math.min(mark.start.x, mark.end.x), 150 - 23, "horizontal tras mover: sigue al nuevo centro (x izq)");
      close(Math.max(mark.start.x, mark.end.x), 150 + 23, "horizontal tras mover: sigue al nuevo centro (x der)");
      close(mark.start.y, 130, "horizontal tras mover: en la nueva y=cy");
    } else {
      close(Math.min(mark.start.y, mark.end.y), 130 - 23, "vertical tras mover: sigue al nuevo centro (y inf)");
      close(Math.max(mark.start.y, mark.end.y), 130 + 23, "vertical tras mover: sigue al nuevo centro (y sup)");
      close(mark.start.x, 150, "vertical tras mover: en la nueva x=cx");
    }
  }
  ok(
    !marksAfter.some((mark) => Math.abs(mark.start.x - marksBefore[0].start.x) < 1e-9 && Math.abs(mark.start.y - marksBefore[0].start.y) < 1e-9),
    "la cruz ya NO está en su posición original: de verdad se movió, no es casualidad geométrica",
  );

  // Escalar el círculo (radio 20 → 40): la extensión de la cruz tiene que
  // crecer con él (40 + 3 = 43), no quedarse en 23.
  const scaled = executeCadEntityCommandBatch(
    moved,
    [{ type: "properties", entityId: "c1", patch: { radius: 40 } } as CadEntityCommand],
    "PROPERTIES",
  ).document;
  const marksScaled = linesOf(scaled, "CENTER");
  const horizontalScaled = marksScaled.find((mark) => Math.abs(mark.start.y - mark.end.y) < 1e-9)!;
  close(Math.max(horizontalScaled.start.x, horizontalScaled.end.x) - 150, 43, "la extensión creció con el radio nuevo");

  // Borrar el círculo: la marca NO desaparece con él y queda declarada huérfana.
  const afterDelete = executeCadEntityCommandBatch(
    scaled,
    [{ type: "delete", entityId: "c1" } as CadEntityCommand],
    "ERASE",
  ).document;
  ok(
    afterDelete.entities.every((entity) => entity.id !== "c1"),
    "el círculo sí se borró del documento",
  );
  const marksOrphaned = linesOf(afterDelete, "CENTER");
  ok(marksOrphaned.length === 2, "las dos líneas de la cruz SIGUEN en el documento tras borrar su objetivo");
  for (const mark of marksOrphaned) {
    ok(
      (mark.context?.metadata as Record<string, unknown> | undefined)?.centerOrphaned === true,
      "cada línea de la cruz queda declarada huérfana en su propio metadata",
    );
  }
  // Y conserva la ÚLTIMA geometría conocida (la del radio 40), no la original.
  const horizontalOrphaned = marksOrphaned.find((mark) => Math.abs(mark.start.y - mark.end.y) < 1e-9)!;
  close(
    Math.max(horizontalOrphaned.start.x, horizontalOrphaned.end.x),
    193,
    "la huérfana conserva su última geometría conocida, no se congela en el origen",
  );
}

// ---------------------------------------------------------------------------
// CENTERLINE: el eje entre dos círculos sigue a AMBOS objetivos
// ---------------------------------------------------------------------------

{
  const a = circle("ca", 0, 0, 5);
  const b = circle("cb", 100, 0, 5);
  let doc = document([a, b]);

  const created = run(
    "CENTERLINE",
    [
      { kind: "entityPick", entityId: "ca", point: { x: 0, y: 0 } },
      { kind: "entityPick", entityId: "cb", point: { x: 100, y: 0 } },
    ],
    doc,
  );
  ok(created.length === 1, "CENTERLINE crea una sola línea de eje");
  doc = executeCadEntityCommandBatch(doc, created, "CENTERLINE").document;

  const axisBefore = linesOf(doc, "CENTER")[0];
  close(axisBefore.start.x, -3, "el eje arranca 3 unidades antes del primer centro (overshoot)");
  close(axisBefore.end.x, 103, "el eje termina 3 unidades después del segundo centro (overshoot)");

  // Mover el SEGUNDO círculo: el eje tiene que seguirlo también a él, no sólo
  // al primero (que es el que guarda `centerTarget`, no `centerTarget2`).
  const moved = executeCadEntityCommandBatch(
    doc,
    [
      {
        type: "transform",
        entityId: "cb",
        transform: { translation: { x: 0, y: 80 } },
      } as CadEntityCommand,
    ],
    "MOVE",
  ).document;
  const axisAfter = linesOf(moved, "CENTER")[0];
  const dx = 100 - 0;
  const dy = 80 - 0;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  close(axisAfter.start.x, 0 - ux * 3, "el eje sigue al centro A en su extremo (x)");
  close(axisAfter.start.y, 0 - uy * 3, "el eje sigue al centro A en su extremo (y)");
  close(axisAfter.end.x, 100 + ux * 3, "el eje sigue al centro B MOVIDO en su extremo (x)");
  close(axisAfter.end.y, 80 + uy * 3, "el eje sigue al centro B MOVIDO en su extremo (y)");
}

console.log(`associative-center-mark: ${checks} comprobaciones OK`);
