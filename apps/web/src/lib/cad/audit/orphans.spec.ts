import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { cadAuditOrphanRepairCommands, detectCadAuditOrphanDefects } from "./orphans";

let checks = 0;

function doc(): Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences"> {
  return {
    entities: [{ id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" }],
    blocks: [{ id: "blk-1", name: "SILLA", basePoint: { x: 0, y: 0, z: 0 }, entities: [] }],
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "vacia", name: "VACIA", color: "#ff0000", visible: true, locked: false },
    ],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    externalReferences: [],
  };
}

// --- reporta la capa vacía y el bloque sin insertar, con la etiqueta de PURGE -
{
  const defects = detectCadAuditOrphanDefects(doc());
  assert.ok(defects.some((defect) => defect.kind === "orphan-layer" && defect.entityId === "vacia"));
  assert.ok(defects.some((defect) => defect.kind === "unused-block" && defect.entityId === "blk-1"));
  checks += 2;
}

// --- la capa activa no se reporta aunque esté vacía ---------------------------
{
  const defects = detectCadAuditOrphanDefects(doc(), { activeLayer: "vacia" });
  assert.ok(!defects.some((defect) => defect.entityId === "vacia"));
  checks += 1;
}

// --- cadAuditOrphanRepairCommands delega en cadPurgeCommands ------------------
{
  const document = doc();
  const commands = cadAuditOrphanRepairCommands(document, document.layers);
  assert.ok(commands.some((command) => command.type === "block" && command.op === "delete" && command.blockId === "blk-1"));
  assert.ok(commands.some((command) => command.type === "layer" && command.op === "delete" && command.name === "VACIA"));
  checks += 2;
}

console.log(`audit/orphans.spec: ${checks} comprobaciones OK`);
