import { strict as assert } from "node:assert";
import {
  CAD_SYMBOL_LIBRARY,
  createCadSymbolPlacement,
  searchCadSymbols,
} from "./symbols";

assert.equal(
  CAD_SYMBOL_LIBRARY.length,
  12,
  "ships the requested industrial symbols",
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
const placement = createCadSymbolPlacement("smt-line", 100, 200, "p1");
assert.equal(
  placement?.width,
  12000,
  "placement uses default symbol dimensions",
);
assert.equal(placement?.layer, "Equipment", "placement carries default layer");
console.log("cad symbols specs passed");
