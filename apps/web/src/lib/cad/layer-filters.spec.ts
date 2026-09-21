/**
 * Filtros de capa: la medida real es «con 120 capas, un filtro "A-*" devuelve
 * EXACTAMENTE las que tocan» — no "algunas", no "no hubo error". Cada
 * aserción compara el resultado contra el conjunto esperado, calculado por un
 * camino distinto al del código bajo prueba (un `.filter` de JS de control),
 * para que un motor de coincidencia con el mismo bug que su prueba no pase.
 */
import { strict as assert } from "node:assert";
import type { CadEntity, CadLayerDef } from "./cad-document";
import {
  applyCadLayerFilter,
  applyCadLayerGroupFilter,
  CadLayerFilterCatalog,
  CadLayerFilterPatternError,
  cadLayerNamesInUse,
  compileCadLayerNamePattern,
  matchesCadLayerFilter,
} from "./layer-filters";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function sameNames(actual: readonly CadLayerDef[], expectedNames: readonly string[], what: string) {
  checks += 1;
  assert.deepEqual(
    [...actual.map((layer) => layer.name)].sort(),
    [...expectedNames].sort(),
    what,
  );
}

// ---------------------------------------------------------------------------
// La medida del encargo: 120 capas, "A-*" devuelve EXACTAMENTE las que tocan
// ---------------------------------------------------------------------------

function layer(name: string, overrides: Partial<CadLayerDef> = {}): CadLayerDef {
  return { id: name.toLowerCase(), name, color: "#ffffff", visible: true, locked: false, ...overrides };
}

const PREFIXES = ["A-MURO", "A-PUERTA", "A-VENTANA", "M-TUBERIA", "E-CIRCUITO", "S-COLUMNA"];
const CENTO_VEINTE: CadLayerDef[] = Array.from({ length: 120 }, (_, index) =>
  layer(`${PREFIXES[index % PREFIXES.length]}-${index}`),
);

{
  const expected = CENTO_VEINTE.filter((entry) => entry.name.startsWith("A-"));
  ok(expected.length > 0 && expected.length < 120, "el corpus de control trae capas A- y no-A-");
  const result = applyCadLayerFilter(CENTO_VEINTE, { namePattern: "A-*" });
  sameNames(result, expected.map((entry) => entry.name), '"A-*" sobre 120 capas devuelve exactamente las 3 familias A-');
  equal(result.length, expected.length, "mismo recuento que el control");
}

// ---------------------------------------------------------------------------
// El comodín: `*`, `?`, `~` inicial — y el resto se RECHAZA, no se aproxima
// ---------------------------------------------------------------------------

{
  const layers = [layer("A-1"), layer("A-12"), layer("A-A"), layer("B-1")];
  equal(
    applyCadLayerFilter(layers, { namePattern: "A-?" }).map((l) => l.name).sort().join(","),
    "A-1,A-A",
    '"A-?" exige EXACTAMENTE un carácter tras el guión',
  );
  equal(
    applyCadLayerFilter(layers, { namePattern: "A-*" }).length,
    3,
    '"A-*" acepta cualquier longitud, incluida cero',
  );
  equal(
    applyCadLayerFilter(layers, { namePattern: "~A-*" }).map((l) => l.name).sort().join(","),
    "B-1",
    '"~" inicial niega el patrón entero',
  );
  equal(
    compileCadLayerNamePattern("a-1")("A-1"),
    true,
    "el patrón no distingue mayúsculas, como los nombres de capa",
  );

  for (const bad of ["A-[12]", "A-#", "A-@", "A-.1"]) {
    let threw = false;
    try {
      compileCadLayerNamePattern(bad);
    } catch (error) {
      threw = error instanceof CadLayerFilterPatternError;
    }
    ok(threw, `"${bad}" se RECHAZA (comodín no soportado), no se trata como texto literal`);
  }
}

// ---------------------------------------------------------------------------
// Color, estado y combinaciones (Y, no O)
// ---------------------------------------------------------------------------

{
  const layers = [
    layer("ROJA", { color: "#ff0000" }),
    layer("ROJA-2", { color: "#FF0000" }), // mismo color, otra mayúscula
    layer("AZUL", { color: "#0000ff" }),
  ];
  sameNames(
    applyCadLayerFilter(layers, { color: "#ff0000" }),
    ["ROJA", "ROJA-2"],
    "el color no distingue mayúsculas del código hex",
  );
}

{
  const layers = [
    layer("CONGELADA", { frozen: true, locked: true, visible: false }),
    layer("SOLO-BLOQUEADA", { locked: true }),
    layer("NORMAL"),
    layer("APAGADA", { visible: false }),
    layer("SIN-TRAZA", { plot: false }),
  ];
  sameNames(
    applyCadLayerFilter(layers, { states: ["frozen"] }),
    ["CONGELADA"],
    "frozen exige la clave `frozen: true`",
  );
  sameNames(
    applyCadLayerFilter(layers, { states: ["thawed"] }),
    ["SOLO-BLOQUEADA", "NORMAL", "APAGADA", "SIN-TRAZA"],
    "thawed es la ausencia de `frozen`, no `frozen: false`",
  );
  sameNames(
    applyCadLayerFilter(layers, { states: ["locked", "frozen"] }),
    ["CONGELADA"],
    "dos estados son Y: bloqueada+congelada excluye a la que sólo está bloqueada",
  );
  sameNames(
    applyCadLayerFilter(layers, { states: ["off"] }),
    ["APAGADA", "CONGELADA"],
    "off es visible=false (CONGELADA también está apagada, son ejes distintos)",
  );
  sameNames(
    applyCadLayerFilter(layers, { states: ["noplot"] }),
    ["SIN-TRAZA"],
    "noplot exige `plot: false` explícito",
  );
  sameNames(
    applyCadLayerFilter(layers, { states: ["plot"] }),
    ["CONGELADA", "SOLO-BLOQUEADA", "NORMAL", "APAGADA"],
    "plot es la ausencia de `plot: false` (traza por defecto)",
  );
}

// ---------------------------------------------------------------------------
// Uso: necesita la lista de entidades, y se NIEGA sin ella
// ---------------------------------------------------------------------------

{
  const layers = [layer("MUROS"), layer("MEP"), layer("VACIA")];
  const entities = [
    { id: "e1", type: "line", layer: "MUROS" },
    { id: "e2", type: "line", layer: "MUROS" },
    { id: "e3", type: "line", layer: "mep" }, // minúscula: cuenta igual
  ] as unknown as CadEntity[];
  const used = cadLayerNamesInUse(entities);
  ok(used.has("MUROS") && used.has("MEP") && !used.has("VACIA"), "cadLayerNamesInUse suma en mayúsculas");
  sameNames(applyCadLayerFilter(layers, { usage: "used" }, used), ["MUROS", "MEP"], "usage:used");
  sameNames(applyCadLayerFilter(layers, { usage: "unused" }, used), ["VACIA"], "usage:unused");

  let threw = false;
  try {
    matchesCadLayerFilter(layers[0], { usage: "used" });
  } catch {
    threw = true;
  }
  ok(threw, "pedir uso sin la lista de entidades se NIEGA en vez de asumir que nada está en uso");
}

// ---------------------------------------------------------------------------
// Filtro por GRUPO: pertenencia explícita, no patrón
// ---------------------------------------------------------------------------

{
  const layers = [layer("MUROS"), layer("MEP"), layer("EJES")];
  const group = { name: "Estructura", layerNames: ["muros", " EJES "] };
  sameNames(
    applyCadLayerGroupFilter(layers, group),
    ["MUROS", "EJES"],
    "el grupo empareja sin distinguir mayúsculas y con espacios sueltos",
  );
}

// ---------------------------------------------------------------------------
// Catálogo de filtros GUARDADOS
// ---------------------------------------------------------------------------

{
  const catalog = new CadLayerFilterCatalog();
  equal(catalog.list().length, 0, "empieza vacío");

  catalog.save({ name: "Arquitectura", kind: "criteria", criteria: { namePattern: "A-*" } });
  catalog.save({ name: "Estructura", kind: "group", layerNames: ["MUROS", "COLUMNAS"] });
  equal(catalog.list().length, 2, "guarda los dos");

  const layers = [layer("A-MURO"), layer("M-TUBO"), layer("MUROS"), layer("COLUMNAS")];
  sameNames(catalog.apply("arquitectura", layers)!, ["A-MURO"], "aplica el de criterio, sin distinguir mayúsculas del nombre");
  sameNames(catalog.apply("Estructura", layers)!, ["MUROS", "COLUMNAS"], "y el de grupo");
  equal(catalog.apply("NoExiste", layers), undefined, "aplicar uno inexistente no finge: devuelve undefined");

  // Guardar con el MISMO nombre sustituye, no duplica.
  catalog.save({ name: "Arquitectura", kind: "criteria", criteria: { namePattern: "M-*" } });
  equal(catalog.list().length, 2, "sustituir no duplica");
  sameNames(catalog.apply("Arquitectura", layers)!, ["M-TUBO"], "y el criterio nuevo manda");

  ok(catalog.remove("Estructura"), "borrar uno existente devuelve true");
  ok(!catalog.remove("Estructura"), "borrarlo dos veces devuelve false, no lanza");
  equal(catalog.list().length, 1, "queda uno solo");
}

console.log(`layer-filters: ${checks} comprobaciones verdes.`);
