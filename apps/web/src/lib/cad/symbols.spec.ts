import { strict as assert } from "node:assert";
import {
  CAD_SYMBOL_LIBRARY,
  createCadSymbolPlacement,
  getCadSymbol,
  searchCadSymbols,
} from "./symbols";

assert.ok(
  CAD_SYMBOL_LIBRARY.length >= 25,
  "ships a manufacturing-grade industrial symbol set",
);
assert.equal(
  new Set(CAD_SYMBOL_LIBRARY.map((symbol) => symbol.id)).size,
  CAD_SYMBOL_LIBRARY.length,
  "symbol ids are unique",
);
assert.ok(
  searchCadSymbols("aoi").some((symbol) => symbol.id === "aoi"),
  "search finds AOI",
);
assert.ok(
  searchCadSymbols("pick").some((symbol) => symbol.id === "pick-and-place"),
  "search finds pick-and-place equipment",
);
for (const id of [
  "solder-paste-printer",
  "spi",
  "pick-and-place",
  "reflow-oven",
  "ict-tester",
  "functional-test-bench",
  "quality-gate",
]) {
  const symbol = getCadSymbol(id);
  assert.ok(symbol, `${id} is available`);
  assert.equal(symbol?.layer, "Equipment", `${id} uses the Equipment layer`);
  assert.ok(symbol?.ports.length, `${id} exposes flow ports`);
}
for (const symbol of CAD_SYMBOL_LIBRARY) {
  for (const port of symbol.ports) {
    assert.ok(
      port.x >= -0.5 && port.x <= 0.5 && port.y >= -0.5 && port.y <= 0.5,
      `${symbol.id}.${port.id} port stays inside the normalized footprint`,
    );
  }
}
const placement = createCadSymbolPlacement("smt-line", 100, 200, "p1");
assert.equal(
  placement?.width,
  12000,
  "placement uses default symbol dimensions",
);
assert.equal(placement?.layer, "Equipment", "placement carries default layer");
const reflow = createCadSymbolPlacement("reflow-oven", 400, 800, "reflow-1");
assert.equal(reflow?.height, 1800, "new symbols keep their default footprint");
assert.ok(
  reflow?.tags.includes("thermal"),
  "symbol placement preserves manufacturing tags",
);
console.log("cad symbols specs passed");
