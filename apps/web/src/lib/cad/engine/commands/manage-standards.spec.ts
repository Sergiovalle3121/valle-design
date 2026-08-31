import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { cadMexicanDimensionStyle, cadMexicanDimensionStyleName, cadMexicanScale, cadMexicanTextStyles } from "../../standards/mexican-annotation";
import { cadMexicanLayerDefs } from "../../standards/mexican-layers";
import type { CadCommandContext } from "../command-types";
import { CAD_CHECKSTANDARDS_COMMANDS } from "./manage-standards";

let checks = 0;
const checkStandardsCommand = CAD_CHECKSTANDARDS_COMMANDS[0];

function contextFor(document: CadDocument | undefined): CadCommandContext {
  return {
    entityIds: [],
    entity: () => undefined,
    blocks: () => [],
    ...(document ? { document: () => document } : {}),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "new-1",
  };
}

// --- se niega en voz alta cuando el anfitrión no expone el documento ----------
{
  const result = checkStandardsCommand.begin(contextFor(undefined)).result;
  assert.ok(result && result.kind === "message" && /no expone el documento/.test(result.text));
  checks += 1;
}

// --- dice que el dibujo sigue el estándar cuando no hay desviaciones ----------
{
  const scale = cadMexicanScale(50);
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: cadMexicanLayerDefs(["MURO"]),
    styles: {
      text: cadMexicanTextStyles(50, "mm", "Helvetica"),
      dimension: { [cadMexicanDimensionStyleName(scale)]: cadMexicanDimensionStyle(scale, "mm") },
    },
  });
  const result = checkStandardsCommand.begin(contextFor(document)).result;
  assert.ok(result && result.kind === "message" && /sigue el estándar/.test(result.text));
  checks += 1;
}

// --- lista las desviaciones cuando el dibujo no declara los estilos -----------
{
  const document = migrateCadDocument({ meta: { version: 1, schema: 4, unit: "mm" } });
  const result = checkStandardsCommand.begin(contextFor(document)).result;
  assert.ok(result && result.kind === "message" && /encontró \d+ desviación/.test(result.text));
  checks += 1;
}

// --- no muta el documento: es sólo informe -------------------------------------
{
  assert.equal(checkStandardsCommand.mutates, false);
  checks += 1;
}

console.log(`engine/commands/manage-standards.spec: ${checks} comprobaciones OK`);
