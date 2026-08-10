/**
 * Lo que la sesión recuerda: tipos de línea, estados de capa, paletas de
 * herramientas, SCU y la codificación de `OSMODE`.
 *
 * Cinco módulos pequeños en una spec porque comparten una propiedad y conviene
 * verla junta: **ninguno se traga lo que no entiende**. Un `.lin` con una
 * definición compleja la cuenta; un estado de capa que menciona capas borradas
 * las nombra; unas paletas corruptas caen a las de fábrica en vez de dejar el
 * editor sin herramientas.
 */
import { strict as assert } from "node:assert";
import type { CadLayerDef } from "./cad-document";
import {
  captureCadLayerState,
  CadLayerStateCatalog,
  planCadLayerStateRestore,
} from "./layer-states";
import {
  CAD_BUILTIN_LINETYPES,
  CadLinetypeCatalog,
  cadLinetypeCycleLength,
  parseCadLinetypeLibrary,
} from "./linetype-lin";
import {
  CAD_OSNAP_BITS,
  CAD_OSNAP_NONE_BIT,
  cadOsmodeToSnaps,
  cadSnapsToOsmode,
  describeCadOsmode,
} from "./osnap-bits";
import {
  CAD_DEFAULT_TOOL_PALETTES,
  cadToolCommandLine,
  cadToolPaletteStorageKey,
  CadToolPaletteCatalog,
  loadCadToolPalettes,
  normalizeCadToolPalettes,
  saveCadToolPalettes,
} from "./tool-palettes";
import { CAD_WORLD_UCS, isCadWorldUcs, ucsToWorld, worldToUcs } from "./ucs";

let checks = 0;
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function near(actual: number, expected: number, tolerance: number, what: string) {
  checks += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: se esperaba ${expected} ±${tolerance}, salió ${actual}`,
  );
}

// ---------------------------------------------------------------------------
// Tipos de línea: leer un .lin de verdad
// ---------------------------------------------------------------------------

const LIN = `;; Biblioteca de ejemplo
*DASHED,Trazos __ __ __ __
A,.5,-.25
*CENTER,Ejes ____ _ ____ _
A,1.25,-.25,.25,-.25
*DOT,Puntos . . . . .
A,0,-.25

; Ésta lleva texto incrustado y este lector no sabe dibujarla:
*GAS_LINE,Gas ----GAS----GAS----
A,.5,-.2,["GAS",STANDARD,S=.1,U=0.0,X=-0.1,Y=-.05],-.25
; Y ésta no tiene renglón de patrón:
*ROTA,Sin patrón
*SOLO_HUECOS,Invisible
A,-.5,-.25
`;

{
  const library = parseCadLinetypeLibrary(LIN);
  equal(library.definitions.length, 3, "entran las tres que son trazos y huecos");
  equal(library.definitions[0].name, "DASHED", "el nombre sale sin el asterisco");
  equal(library.definitions[0].description, "Trazos __ __ __ __", "y la descripción entera");
  assert.deepEqual(library.definitions[0].pattern, [0.5, -0.25], "el patrón, con sus signos");
  checks += 1;
  near(cadLinetypeCycleLength(library.definitions[1]), 2, 1e-9, "el ciclo de CENTER mide 2");

  equal(library.skipped.length, 3, "y las tres problemáticas se CUENTAN, no se ignoran");
  ok(
    library.skipped.some((line) => line.includes("GAS_LINE") && line.includes("texto")),
    `la de texto incrustado dice por qué: ${library.skipped.join(" | ")}`,
  );
  ok(
    library.skipped.some((line) => line.includes("ROTA")),
    "la que no tiene patrón, también",
  );
  ok(
    library.skipped.some((line) => line.includes("SOLO_HUECOS") && line.includes("invisible")),
    "y la que sería invisible: es casi siempre un signo puesto al revés",
  );
}

{
  // Un archivo que no es un `.lin` produce un informe vacío, no una excepción.
  const library = parseCadLinetypeLibrary("esto no es un lin\n{ \"json\": true }");
  equal(library.definitions.length, 0, "nada que cargar");
  equal(library.skipped.length, 0, "y nada que reprochar: no había definiciones");
}

{
  const catalog = new CadLinetypeCatalog();
  equal(catalog.list().length, CAD_BUILTIN_LINETYPES.length, "arranca con los de fábrica");
  const report = catalog.load(parseCadLinetypeLibrary(LIN));
  equal(report.loaded, 3, "carga las tres");
  equal(report.skipped.length, 3, "y arrastra el informe de lo que no");
  ok(catalog.get("dashed") !== undefined, "el nombre no distingue mayúsculas");
  equal(catalog.remove("Continuous"), false, "la continua no se puede borrar: es el suelo");
  equal(catalog.remove("DASHED"), true, "las demás sí");
}

// ---------------------------------------------------------------------------
// Estados de capa
// ---------------------------------------------------------------------------

const LAYERS: CadLayerDef[] = [
  { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
  { id: "muros", name: "MUROS", color: "#ff0000", visible: true, locked: false, lineweight: 50 },
  { id: "ejes", name: "EJES", color: "#00ffff", visible: true, locked: false },
];

{
  const state = captureCadLayerState("Estructura", LAYERS);
  equal(state.entries.length, 3, "fotografía las tres capas");
  equal(state.entries[1].lineweight, 50, "y el grosor cuando lo hay");

  // Restaurar sobre el mismo estado NO produce órdenes: cero órdenes es cero
  // pasos de deshacer vacíos.
  equal(planCadLayerStateRestore(state, LAYERS).commands.length, 0, "restaurar lo mismo no cambia nada");

  const changed = LAYERS.map((layer) =>
    layer.name === "EJES" ? { ...layer, visible: false, color: "#000000" } : layer,
  );
  const plan = planCadLayerStateRestore(state, changed);
  equal(plan.commands.length, 1, "sólo se emite la capa que cambió");
  const command = plan.commands[0];
  ok(command.type === "layer" && command.op === "upsert", "y es un parche de capa");
  ok(
    command.type === "layer" && command.op === "upsert" && command.layer.visible === true,
    "que devuelve EJES a visible",
  );

  // Una capa del estado que ya no existe se NOMBRA.
  const fewer = LAYERS.filter((layer) => layer.name !== "EJES");
  const missing = planCadLayerStateRestore(state, fewer);
  assert.deepEqual([...missing.missing], ["EJES"], "las que faltan se nombran");
  checks += 1;

  // Una capa que el estado no menciona se deja como está y se dice.
  const more = [...LAYERS, { id: "nueva", name: "NUEVA", color: "#0f0", visible: false, locked: true }];
  const untouched = planCadLayerStateRestore(state, more);
  assert.deepEqual([...untouched.untouched], ["NUEVA"], "y las no mencionadas también");
  checks += 1;

  // Restaurar SÓLO la visibilidad deja el color en paz.
  const recoloured = LAYERS.map((layer) =>
    layer.name === "MUROS" ? { ...layer, color: "#123456", visible: false } : layer,
  );
  const partial = planCadLayerStateRestore(state, recoloured, {
    visibility: true,
    locking: false,
    color: false,
    linetype: false,
    lineweight: false,
    plot: false,
  });
  const patched = partial.commands[0];
  ok(
    patched?.type === "layer" && patched.op === "upsert" && patched.layer.color === "#123456",
    "el color no se toca cuando el alcance no lo incluye",
  );
  ok(
    patched?.type === "layer" && patched.op === "upsert" && patched.layer.visible === true,
    "pero la visibilidad sí se restaura",
  );
}

{
  const catalog = new CadLayerStateCatalog();
  catalog.save(captureCadLayerState("A", LAYERS));
  catalog.save(captureCadLayerState("a", LAYERS.slice(0, 1)));
  equal(catalog.list().length, 1, "el nombre no distingue mayúsculas");
  equal(catalog.get("A")?.entries.length, 1, "y gana el último guardado");
}

// ---------------------------------------------------------------------------
// OSMODE
// ---------------------------------------------------------------------------

// Los bits son los de AutoCAD: 35 = 1 + 2 + 32 = final, medio e intersección.
{
  const snaps = cadOsmodeToSnaps(35);
  assert.deepEqual([...snaps].sort(), ["endpoint", "intersection", "midpoint"], "OSMODE 35");
  checks += 1;
  equal(cadSnapsToOsmode(snaps), 35, "y la vuelta da el mismo número");
  ok(describeCadOsmode(35).includes("PUNfin"), `y se describe en castellano: ${describeCadOsmode(35)}`);
  equal(cadOsmodeToSnaps(0).length, 0, "OSMODE 0 no captura nada");
  equal(
    cadOsmodeToSnaps(CAD_OSNAP_NONE_BIT | 35).length,
    0,
    "el bit 1024 APAGA los demás en vez de sumarse",
  );
  equal(describeCadOsmode(0), "ninguno", "y se dice");
}
for (const bit of CAD_OSNAP_BITS) {
  checks += 1;
  assert.ok(
    Number.isInteger(Math.log2(bit.bit)),
    `${bit.keyword} tiene que ser una potencia de dos: es ${bit.bit}`,
  );
}

// ---------------------------------------------------------------------------
// SCU
// ---------------------------------------------------------------------------

{
  ok(isCadWorldUcs(CAD_WORLD_UCS), "el universal es el universal");
  const ucs = { name: "PLANTA", origin: { x: 100, y: 50 }, rotationDeg: 90 };
  ok(!isCadWorldUcs(ucs), "y uno girado no lo es");
  const local = worldToUcs({ x: 110, y: 50 }, ucs);
  near(local.x, 0, 1e-9, "10 al este del origen, con el SCU girado 90°, es 0 en X");
  near(local.y, -10, 1e-9, "y −10 en Y");
  const back = ucsToWorld(local, ucs);
  near(back.x, 110, 1e-9, "la vuelta devuelve el punto del mundo");
  near(back.y, 50, 1e-9, "en las dos coordenadas");
}

// ---------------------------------------------------------------------------
// Paletas de herramientas
// ---------------------------------------------------------------------------

equal(
  cadToolCommandLine({ id: "t", label: "Pilar", kind: "block", payload: "HEB200" }),
  "INSERT HEB200",
  "una herramienta de bloque se ejecuta por la MISMA puerta que las demás",
);
equal(
  cadToolCommandLine({ id: "t", label: "Línea", kind: "command", payload: "LINE" }),
  "LINE",
  "y una de comando, tal cual",
);
equal(
  cadToolPaletteStorageKey({ tenantId: "acme", userId: "u1" }),
  "valle_cad_toolpalettes:acme:u1",
  "la clave está acotada por inquilino y usuario, como las preferencias",
);

{
  equal(normalizeCadToolPalettes(null).length, CAD_DEFAULT_TOOL_PALETTES.length, "null cae a fábrica");
  equal(normalizeCadToolPalettes([{ name: "" }]).length, CAD_DEFAULT_TOOL_PALETTES.length, "y basura también");
  const cleaned = normalizeCadToolPalettes([
    { name: "Mía", tools: [{ id: "a", label: "A", kind: "command", payload: "LINE" }, { roto: true }] },
  ]);
  equal(cleaned.length, 1, "una paleta válida sobrevive");
  equal(cleaned[0].tools.length, 1, "y la herramienta rota se cae sola");
}

{
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const scope = { tenantId: "acme", userId: "u1" };
  equal(
    loadCadToolPalettes(storage, scope).length,
    CAD_DEFAULT_TOOL_PALETTES.length,
    "sin nada guardado salen las de fábrica",
  );

  const catalog = new CadToolPaletteCatalog(loadCadToolPalettes(storage, scope), (palettes) => {
    saveCadToolPalettes(storage, scope, palettes);
  });
  catalog.save({
    name: "Estudio",
    tools: [{ id: "pilar", label: "Pilar HEB-200", kind: "block", payload: "HEB200" }],
  });
  ok(memory.has(cadToolPaletteStorageKey(scope)), "guardar persiste");
  equal(
    loadCadToolPalettes(storage, scope).some((palette) => palette.name === "Estudio"),
    true,
    "y se vuelve a leer: la configuración del despacho viaja",
  );
  equal(catalog.remove("Estudio"), true, "y se puede quitar");
  equal(
    loadCadToolPalettes(storage, scope).some((palette) => palette.name === "Estudio"),
    false,
    "y el borrado también persiste",
  );

  // Un almacén lleno no puede tirar el editor.
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceeded");
    },
  };
  equal(saveCadToolPalettes(broken, scope, []), false, "un almacén que falla se informa con false");
}

console.log(`session-catalogs.spec: ${checks} comprobaciones verdes.`);
