/**
 * ANNOSCALE, OBJECTSCALE y ANNORESET, contra el registro del PRODUCTO.
 *
 * Cada orden se pide al mismo `CAD_COMMAND_REGISTRY_V2` que lee la línea de
 * comandos, y su lote se aplica por la ÚNICA ruta de mutación
 * (`executeCadEntityCommandBatch`). Lo que se mide es la GEOMETRÍA/estado
 * resultante, nunca sólo «no hubo error»:
 *
 * - ANNOSCALE: la ALTURA de modelo de un texto anotativo cambia con la
 *   escala, y su altura de PAPEL (la que de verdad importa) se mantiene.
 * - OBJECTSCALE: agregar deja el objeto con la altura/escala correcta para
 *   la escala pedida; quitar borra la marca y no toca la geometría.
 * - ANNORESET: una cota anotativa con el texto movido a mano vuelve a la
 *   posición que calcula su propia geometría.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch, type CadEntityCommand } from "../../entity-commands";
import {
  cadAnnotativeHeightMm,
  cadAnnotativeModelHeight,
  cadAnnotativePaperHeight,
} from "../../layout/annotative-scale";
import { buildCadDimensionGeometry } from "../../associative-dimension";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

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
    layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

function makeContext(doc: CadDocument, selection: readonly string[] = []): CadCommandContext {
  let ids = 0;
  return {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    document: () => doc,
    selection,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `nuevo${++ids}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  doc: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del PRODUCTO`);
  const context = makeContext(doc, selection);
  let step = descriptor!.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor!.step(step.state, input, context);
  }
  return step.result;
}

function commandsOf(result: CadCommandResult | undefined, name: string): readonly CadEntityCommand[] {
  assert.ok(result?.kind === "document", `${name} debía escribir; dio ${result?.kind} (${(result as { text?: string })?.text ?? ""})`);
  checks += 1;
  return result!.kind === "document" ? result.commands : [];
}

// ---------------------------------------------------------------------------
// ANNOSCALE
// ---------------------------------------------------------------------------

{
  const text = {
    id: "t1",
    type: "mtext",
    insertion: { x: 0, y: 0, z: 0 },
    text: "COTA",
    height: 999,
    layer,
    context: { metadata: { annotativeHeightMm: 2.5 } },
  } as CadEntity;
  let doc = document([text]);

  const result1 = run("ANNOSCALE", [{ kind: "distance", value: 100 }], doc);
  const commands1 = commandsOf(result1, "ANNOSCALE 1:100");
  doc = executeCadEntityCommandBatch(doc, commands1, "ANNOSCALE").document;
  const after100 = doc.entities.find((entity) => entity.id === "t1") as Extract<CadEntity, { type: "mtext" }>;
  close(after100.height!, cadAnnotativeModelHeight(2.5, 100, "mm"), "altura de modelo correcta a 1:100");
  close(cadAnnotativePaperHeight(after100.height!, 100, "mm"), 2.5, "altura de PAPEL se mantiene en 2,5 mm a 1:100");

  const result2 = run("ANNOSCALE", [{ kind: "distance", value: 50 }], doc);
  const commands2 = commandsOf(result2, "ANNOSCALE 1:50");
  doc = executeCadEntityCommandBatch(doc, commands2, "ANNOSCALE").document;
  const after50 = doc.entities.find((entity) => entity.id === "t1") as Extract<CadEntity, { type: "mtext" }>;
  ok(Math.abs(after50.height! - after100.height!) > 1e-6, "la altura de MODELO sí cambió al cambiar la escala");
  close(cadAnnotativePaperHeight(after50.height!, 50, "mm"), 2.5, "altura de PAPEL se mantiene en 2,5 mm también a 1:50");

  // Sin anotativas que ajustar: se niega diciéndolo, no finge éxito.
  const docSinAnotativas = document([{ ...text, context: undefined } as CadEntity]);
  const resultVacio = run("ANNOSCALE", [{ kind: "distance", value: 100 }], docSinAnotativas);
  ok(resultVacio?.kind === "message", "sin anotativas, ANNOSCALE se niega con un mensaje en vez de fingir un lote");
}

// ---------------------------------------------------------------------------
// OBJECTSCALE
// ---------------------------------------------------------------------------

{
  const hatch = {
    id: "h1",
    type: "hatch",
    pattern: "ANSI31",
    solid: false,
    boundaries: [
      [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 100, z: 0 },
        { x: 0, y: 100, z: 0 },
      ],
    ],
    layer,
  } as CadEntity;
  let doc = document([hatch]);

  // Agregar: pide el objeto, «Agregar», tamaño de papel y escala.
  const added = run(
    "OBJECTSCALE",
    [
      { kind: "selection", entityIds: ["h1"] },
      { kind: "keyword", keyword: "Agregar" },
      { kind: "distance", value: 1 },
      { kind: "distance", value: 10 },
    ],
    doc,
  );
  const addCommands = commandsOf(added, "OBJECTSCALE agregar");
  doc = executeCadEntityCommandBatch(doc, addCommands, "OBJECTSCALE").document;
  const hatchAdded = doc.entities.find((entity) => entity.id === "h1") as Extract<CadEntity, { type: "hatch" }>;
  // ANSI31 a scale=1 separa 1 unidad; a denominador 10 con 1 mm de papel:
  // modelSpacing = 1 mm · 10 / 1 mm-por-unidad = 10 unidades = scale 10.
  close(hatchAdded.scale!, 10, "OBJECTSCALE agregar dimensiona el HATCH para la escala pedida");
  ok(
    (hatchAdded.context?.metadata as Record<string, unknown> | undefined)?.annotativeHatchSpacingMm === 1,
    "OBJECTSCALE agregar deja la marca de sombreado anotativo",
  );

  // Quitar: la marca desaparece y el scale actual NO se toca.
  const removed = run("OBJECTSCALE", [{ kind: "selection", entityIds: ["h1"] }, { kind: "keyword", keyword: "Quitar" }], doc);
  const removeCommands = commandsOf(removed, "OBJECTSCALE quitar");
  doc = executeCadEntityCommandBatch(doc, removeCommands, "OBJECTSCALE").document;
  const hatchRemoved = doc.entities.find((entity) => entity.id === "h1") as Extract<CadEntity, { type: "hatch" }>;
  ok(
    (hatchRemoved.context?.metadata as Record<string, unknown> | undefined)?.annotativeHatchSpacingMm === undefined,
    "OBJECTSCALE quitar borra la marca de sombreado anotativo",
  );
  close(hatchRemoved.scale!, 10, "OBJECTSCALE quitar no toca la geometría/escala actual");

  // Quitar de nuevo: ya no tiene marca, se niega en vez de fingir.
  const removedAgain = run("OBJECTSCALE", [{ kind: "selection", entityIds: ["h1"] }, { kind: "keyword", keyword: "Quitar" }], doc);
  ok(removedAgain?.kind === "message", "quitar una escala que ya no está se niega con un mensaje");
}

// ---------------------------------------------------------------------------
// ANNORESET
// ---------------------------------------------------------------------------

{
  const dim = {
    id: "d1",
    type: "dimension",
    dimensionKind: "aligned",
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    offset: 20,
    textPosition: { x: 999, y: 999 },
    layer,
    context: { metadata: { annotativeHeightMm: 2.5 } },
  } as CadEntity;
  const doc = document([dim]);

  const geometryBefore = buildCadDimensionGeometry(dim as Extract<CadEntity, { type: "dimension" }>);
  ok(geometryBefore !== null, "la cota tiene geometría calculable");
  ok(
    geometryBefore!.textAnchor.x === 999 && geometryBefore!.textAnchor.y === 999,
    "antes de ANNORESET, el ancla de texto es la posición manual",
  );

  const result = run("ANNORESET", [{ kind: "selection", entityIds: ["d1"] }], doc);
  const commands = commandsOf(result, "ANNORESET");
  const after = executeCadEntityCommandBatch(doc, commands, "ANNORESET").document;
  const dimAfter = after.entities.find((entity) => entity.id === "d1") as Extract<CadEntity, { type: "dimension" }>;
  ok(dimAfter.textPosition === undefined, "ANNORESET quita la posición manual del texto");
  ok(cadAnnotativeHeightMm(dimAfter) !== null, "ANNORESET no le quita la condición anotativa a la cota");
  const geometryAfter = buildCadDimensionGeometry(dimAfter);
  ok(geometryAfter !== null, "sigue teniendo geometría calculable tras el reinicio");
  ok(
    !(geometryAfter!.textAnchor.x === 999 && geometryAfter!.textAnchor.y === 999),
    "el ancla de texto YA NO es la posición manual: volvió a la calculada",
  );
  close(geometryAfter!.textAnchor.x, 50, "el ancla calculada está sobre el punto medio de la cota (x)");

  // Una cota SIN anulación manual: se niega, no finge un reinicio.
  const dimSinOverride = { ...dim, id: "d2", textPosition: undefined } as CadEntity;
  const docSinOverride = document([dimSinOverride]);
  const resultSinOverride = run("ANNORESET", [{ kind: "selection", entityIds: ["d2"] }], docSinOverride);
  ok(resultSinOverride?.kind === "message", "sin anulación manual, ANNORESET se niega con un mensaje");
}

console.log(`annotative-scale-commands: ${checks} comprobaciones OK`);
