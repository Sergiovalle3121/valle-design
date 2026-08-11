/**
 * El diálogo de ADCENTER: navegar y copiar, sin escribir en el origen.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { cadTenantLayoutUri } from "../../xref/xref-projection";
import type { CadAnyCommandDescriptor, CadCommandContext, CadCommandInput } from "../command-types";
import { CAD_DESIGN_CENTER_COMMANDS } from "./design-center";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const [adcenter] = CAD_DESIGN_CENTER_COMMANDS as readonly CadAnyCommandDescriptor[];

function documentWithSource(withXref = true): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [],
    blocks: withXref
      ? [
          {
            id: "xref:planta:block:0:mueble",
            name: "PLANTA|MUEBLE",
            basePoint: { x: 0, y: 0, z: 0 },
            entities: [
              {
                id: "xref:planta:block:0:mueble:entity:0",
                type: "line",
                start: { x: 0, y: 0, z: 0 },
                end: { x: 100, y: 0, z: 0 },
                layer: "0",
              },
            ],
          },
        ]
      : [],
    externalReferences: withXref
      ? [
          {
            id: "planta",
            name: "PLANTA",
            uri: cadTenantLayoutUri("asset-planta", "rev-1"),
            loaded: true,
            mode: "attachment",
            assetId: "asset-planta",
            blockId: "xref:planta:root",
          },
        ]
      : [],
  });
}

function contextFor(document: CadDocument, withDocument = true): CadCommandContext {
  let ids = 0;
  return {
    entityIds: [],
    entity: () => undefined,
    blocks: () => document.blocks,
    ...(withDocument ? { document: () => document } : {}),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `new-${++ids}`,
  };
}

function run(inputs: readonly CadCommandInput[], context: CadCommandContext) {
  let step = adcenter.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = adcenter.step(step.state as never, input, context);
  }
  return step;
}

const text = (value: string): CadCommandInput => ({ kind: "text", value });

// --- 1. Sin orígenes, lo dice y explica cómo tenerlos ------------------------
{
  const result = adcenter.begin(contextFor(documentWithSource(false))).result;
  assert.ok(result && result.kind === "message" && /referencia externa/.test(result.text));
  checks += 1;
}

// --- 2. Navegar: orígenes → contenido → copia --------------------------------
{
  const context = contextFor(documentWithSource());
  const first = adcenter.begin(context);
  ok(!first.result, "arranca preguntando el origen");
  assert.match(first.prompt.message, /PLANTA/);
  checks += 1;

  const browsing = run([text("PLANTA")], context);
  ok(!browsing.result, "elegido el origen, enseña su contenido y pide qué copiar");
  assert.match(browsing.prompt.message, /MUEBLE/);
  checks += 1;

  const copied = run([text("PLANTA"), text("MUEBLE")], context).result;
  assert.ok(copied && copied.kind === "document");
  assert.deepEqual(copied.commands.map((entry) => entry.type), ["block"], "sólo define: es un LECTOR");
  const entry = copied.commands[0];
  assert.ok(entry.type === "block" && entry.op === "define");
  assert.equal(entry.definition.name, "MUEBLE");
  ok(!entry.definition.id.startsWith("xref:"), "la copia deja de pertenecer a la referencia");
  checks += 4;
}

// --- 3. Copiar algo que no está, y sin documento ------------------------------
{
  const context = contextFor(documentWithSource());
  const missing = run([text("PLANTA"), text("FANTASMA")], context).result;
  assert.ok(missing && missing.kind === "message" && /ningún elemento/.test(missing.text));
  const noSource = run([text("OTRO")], context).result;
  assert.ok(noSource && noSource.kind === "message" && /ningún origen/.test(noSource.text));
  const blind = adcenter.begin(contextFor(documentWithSource(), false)).result;
  assert.ok(blind && blind.kind === "message" && /no expone el documento/.test(blind.text));
  checks += 3;
}

console.log(`engine/commands/design-center.spec: ${checks} comprobaciones OK`);
