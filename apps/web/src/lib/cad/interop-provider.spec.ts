/** Contrato CadInteroperabilityProvider — DXF funcional, DWG honesto (CAD-NEXT-061). */
import { strict as assert } from "node:assert";
import {
  CadInteropRegistry,
  createDefaultInteropRegistry,
  DWG_UNAVAILABLE_REASON,
  nativeDxfProvider,
  unlicensedDwgProvider,
  type CadInteroperabilityProvider,
} from "./interop-provider";

const registry = createDefaultInteropRegistry();

// --- DXF: el proveedor nativo funciona de verdad (round-trip) ---------------
const exported = nativeDxfProvider.exportDrawing({
  primitives: [
    { kind: "circle", layer: "0", points: [{ x: 10, y: 20 }], radius: 5 },
  ],
});
assert.ok(exported.ok && exported.content, "el proveedor DXF exporta");
const back = nativeDxfProvider.importDrawing(exported.content!);
assert.ok(back.ok, "el proveedor DXF reimporta");
assert.equal(back.primitives.find((p) => p.kind === "circle")?.radius, 5, "round-trip por el contrato conserva el radio");

// Basura no parseable → ok:false, sin primitivas, sin excepción.
const garbage = nativeDxfProvider.importDrawing("esto no es un dxf");
assert.equal(garbage.ok, false, "contenido inválido → ok:false");
assert.equal(garbage.primitives.length, 0, "sin primitivas fantasma");

// --- DWG: honestidad radical -------------------------------------------------
const dwgAvail = unlicensedDwgProvider.availability();
assert.equal(dwgAvail.available, false, "DWG no disponible sin licencia");
assert.ok(dwgAvail.reason?.includes("licencia"), "la razón menciona la licencia");
const dwgImport = unlicensedDwgProvider.importDrawing("cualquier cosa");
assert.equal(dwgImport.ok, false, "importar DWG falla explícitamente");
assert.equal(dwgImport.error, DWG_UNAVAILABLE_REASON, "con la razón exacta");
assert.equal(unlicensedDwgProvider.exportDrawing({}).ok, false, "exportar DWG también falla explícitamente");

// --- resolución por formato --------------------------------------------------
assert.equal(registry.resolve("dxf")?.id, "axos-dxf", "DXF resuelve al proveedor nativo");
assert.equal(registry.resolve("dwg"), null, "DWG no resuelve a nada (sin fingir)");

const support = registry.describeFormatSupport();
assert.deepEqual(
  support.map((s) => [s.format, s.available]),
  [["dxf", true], ["dwg", false]],
  "el resumen de soporte dice la verdad por formato",
);
assert.ok(
  support.find((s) => s.format === "dwg")?.reason?.includes("licencia"),
  "el resumen DWG incluye la razón accionable",
);

// --- el contrato es conectable: un proveedor DWG real sustituye al placeholder
const fakeLicensedDwg: CadInteroperabilityProvider = {
  id: "dwg-unlicensed", // mismo id ⇒ reemplaza al placeholder
  label: "ODA (licencia de prueba)",
  format: "dwg",
  availability: () => ({ available: true }),
  importDrawing: () => ({ ok: true, primitives: [], warnings: [], layers: [] }),
  exportDrawing: () => ({ ok: true, content: "", entityCount: 0 }),
};
const pluggable = new CadInteropRegistry();
pluggable.register(nativeDxfProvider);
assert.equal(pluggable.register(unlicensedDwgProvider).replaced, false, "primer registro DWG");
assert.equal(pluggable.register(fakeLicensedDwg).replaced, true, "el proveedor real reemplaza al placeholder");
assert.equal(pluggable.resolve("dwg")?.label, "ODA (licencia de prueba)", "con proveedor real, DWG resuelve");
assert.equal(
  pluggable.describeFormatSupport().find((s) => s.format === "dwg")?.available,
  true,
  "y el resumen refleja la disponibilidad real",
);

// --- formato sin ningún proveedor -------------------------------------------
const empty = new CadInteropRegistry();
assert.equal(empty.resolve("dxf"), null, "registro vacío no resuelve");
assert.ok(
  empty.describeFormatSupport().every((s) => !s.available && !!s.reason),
  "sin proveedores, cada formato explica su ausencia",
);

console.log("cad interop-provider specs passed");
