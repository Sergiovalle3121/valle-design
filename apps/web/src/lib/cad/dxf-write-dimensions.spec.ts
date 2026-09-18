import { strict as assert } from "node:assert";
import { exportCadDxf } from "./dxf-export";

function dimGroup(content: string, code: number): string | null {
  const lines = content.split(/\r?\n/);
  let inDim = false;
  for (let i = 0; i < lines.length - 1; i += 2) {
    const groupCode = lines[i].trim();
    const value = lines[i + 1]?.trim() ?? "";
    if (groupCode === "0" && value === "DIMENSION") { inDim = true; continue; }
    if (inDim && groupCode === "0") break;
    if (inDim && groupCode === String(code)) return value;
  }
  return null;
}

async function main() {
  let checks = 0;
  {
    const { content } = exportCadDxf({ semanticDimensions: [
      { dimensionKind: "aligned", a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, layer: "0" },
    ] }, { units: "mm" });
    console.log("has DIMENSION:", content.includes("DIMENSION"), "lines:", content.split(/\r?\n/).length);
    const g1 = dimGroup(content, 1);
    assert.equal(g1, "", "T10: sin override, grupo 1 vacío");
    const g42 = dimGroup(content, 42);
    assert.ok(g42 && parseFloat(g42) > 5999, "T10: grupo 42 lleva la medición");
    checks += 2;
  }
  {
    const { content } = exportCadDxf({ semanticDimensions: [
      { dimensionKind: "aligned", a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, text: "VAR.", layer: "0" },
    ] }, { units: "mm" });
    const g1 = dimGroup(content, 1);
    assert.equal(g1, "VAR.", "T10: con override, grupo 1 = texto del usuario");
    checks += 1;
  }
  {
    const { content } = exportCadDxf({ semanticDimensions: [
      { dimensionKind: "aligned", a: { x: 0, y: 0 }, b: { x: 3450, y: 0 }, text: "ver nota", layer: "0" },
    ] }, { units: "mm" });
    const g42 = dimGroup(content, 42);
    assert.ok(g42 && parseFloat(g42) > 3449, "T10: grupo 42 lleva 3450");
    checks += 1;
  }
  console.log(`dxf-write-dimensions.spec: OK — ${checks} comprobaciones`);
}

main().catch((error) => { console.error(error); process.exit(1); });
