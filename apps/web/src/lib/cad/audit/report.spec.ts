import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { buildCadAuditReport, cadAuditRepairCommands } from "./report";

let checks = 0;

function baseDoc(entities: CadEntity[]): Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences"> {
  return {
    entities,
    blocks: [],
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    externalReferences: [],
  };
}

// --- un documento sano no reporta nada ----------------------------------------
{
  const document = baseDoc([
    { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
  ]);
  assert.deepEqual(buildCadAuditReport(document).findings, []);
  checks += 1;
}

// --- junta geometría, referencias, huérfanos y duplicados en un solo informe ---
{
  const document: Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences"> = {
    entities: [
      { id: "zero", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 5, y: 5, z: 0 }, layer: "0" },
      { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
      { id: "b", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
      { id: "insert-huerfano", type: "insert", block: "no-existe", insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0" },
    ],
    blocks: [],
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "vacia", name: "VACIA", color: "#ff0000", visible: true, locked: false },
    ],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    externalReferences: [],
  };
  const report = buildCadAuditReport(document);
  const categories = report.findings.map((finding) => finding.category).sort();
  assert.deepEqual(categories, ["duplicate", "geometry", "orphan", "reference"]);
  assert.equal(report.duplicatesRemoved, 1);
  checks += 2;
}

// --- cadAuditRepairCommands no borra dos veces la misma entidad ----------------
{
  const document: Pick<CadDocument, "entities" | "blocks" | "layers" | "styles" | "externalReferences"> = {
    entities: [
      { id: "zero1", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 5, y: 5, z: 0 }, layer: "0" },
      { id: "zero2", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 5, y: 5, z: 0 }, layer: "0" },
    ],
    blocks: [],
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    externalReferences: [],
  };
  const report = buildCadAuditReport(document);
  const commands = cadAuditRepairCommands(document, report, document.layers);
  const deleteIds = commands.filter((command) => command.type === "delete").map((command) => command.entityId);
  assert.deepEqual(deleteIds.sort(), ["zero1", "zero2"]);
  assert.equal(new Set(deleteIds).size, deleteIds.length);
  checks += 2;
}

console.log(`audit/report.spec: ${checks} comprobaciones OK`);
