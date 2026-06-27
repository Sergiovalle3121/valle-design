import { strict as assert } from "node:assert";
import { buildCadPaletteEntries, searchCadPalette } from "./command-palette";

const entries = buildCadPaletteEntries();
assert.ok(
  entries.some(
    (entry) => entry.kind === "command" && entry.id === "measure_distance",
  ),
  "includes command registry entries",
);
assert.ok(
  entries.some((entry) => entry.kind === "tool" && entry.id === "measure"),
  "includes toolbar entries",
);
assert.ok(
  entries.some((entry) => entry.kind === "symbol" && entry.id === "aoi"),
  "includes symbol entries",
);
assert.equal(
  searchCadPalette("aoi", entries)[0].id,
  "aoi",
  "search ranks exact symbol match",
);
console.log("cad command palette specs passed");
