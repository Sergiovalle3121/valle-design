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
// CAD universal (AXOS-CAD-UNIVERSAL-001): el catálogo sirve a cualquiera
// diseñando cualquier cosa — búsquedas en español de casa/oficina/comercio.
assert.ok(
  searchCadSymbols("puerta").some((symbol) => symbol.id === "door-90"),
  "search finds puertas (arquitectura)",
);
assert.ok(
  searchCadSymbols("cama").some((symbol) => symbol.id === "bed-queen"),
  "search finds camas (mobiliario)",
);
assert.ok(
  searchCadSymbols("escritorio").some((symbol) => symbol.id === "desk"),
  "search finds escritorios (oficina)",
);
assert.ok(
  searchCadSymbols("restaurante").some(
    (symbol) => symbol.id === "restaurant-table-4",
  ),
  "search finds mesas de restaurante (comercio)",
);
assert.ok(
  CAD_SYMBOL_LIBRARY.filter((symbol) =>
    ["architecture", "furniture", "office", "commerce"].includes(
      symbol.category,
    ),
  ).length >= 20,
  "ships a universal (non-EMS) symbol set",
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

// Segunda tanda universal (AXOS-CAD-UNIVERSAL-004): escuela, gimnasio,
// exterior y baño público con búsqueda en español.
assert.ok(
  searchCadSymbols("caminadora").some((symbol) => symbol.id === "treadmill"),
  "search finds caminadora (gimnasio)",
);
assert.ok(
  searchCadSymbols("pupitre").some((symbol) => symbol.id === "school-desk"),
  "search finds pupitre (escuela)",
);
assert.ok(
  searchCadSymbols("estacionamiento").some(
    (symbol) => symbol.id === "parking-spot",
  ),
  "search finds cajón de estacionamiento (exterior)",
);
assert.equal(
  getCadSymbol("parking-spot")?.defaultWidth,
  2500,
  "cajón de estacionamiento a medida real (2.5 m)",
);

// Tercera tanda universal (AXOS-CAD-UNIVERSAL-009): taller mecánico con
// búsqueda en español y medidas reales.
assert.ok(
  searchCadSymbols("elevador").some((symbol) => symbol.id === "car-lift"),
  "search finds elevador de auto (taller)",
);
assert.ok(
  searchCadSymbols("banco de trabajo").some(
    (symbol) => symbol.id === "workbench",
  ),
  "search finds banco de trabajo (taller)",
);
assert.ok(
  searchCadSymbols("llantas").some((symbol) => symbol.id === "tire-rack"),
  "search finds estante de llantas (taller)",
);
assert.equal(
  getCadSymbol("car")?.defaultHeight,
  4500,
  "auto a medida real (4.5 m de largo)",
);

// Cuarta tanda universal (AXOS-CAD-UNIVERSAL-012): salón de belleza.
assert.ok(
  searchCadSymbols("estilista").some((symbol) => symbol.id === "styling-chair"),
  "search finds silla de estilista (salón)",
);
assert.ok(
  searchCadSymbols("lavacabezas").some(
    (symbol) => symbol.id === "wash-station",
  ),
  "search finds lavacabezas (salón)",
);
assert.ok(
  searchCadSymbols("tocador").some((symbol) => symbol.id === "styling-mirror"),
  "search finds tocador con espejo (salón)",
);
